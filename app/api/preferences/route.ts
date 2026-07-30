import {
  ensureAdvancedSchema,
  parseStoredJson,
} from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

type PreferenceRow = {
  value_json: string;
  version: number;
  device_id: string;
  updated_at: string;
};

const defaultPreferences = {
  smartSort: true,
  workspaceMode: "simple",
  scenePreset: "daily",
  mobileShortcut: "review",
};

function text(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as JsonObject;
  const patch: JsonObject = {};
  if (typeof input.smartSort === "boolean") {
    patch.smartSort = input.smartSort;
  }
  if (input.workspaceMode === "simple" || input.workspaceMode === "full") {
    patch.workspaceMode = input.workspaceMode;
  }
  if (
    input.scenePreset === "daily" ||
    input.scenePreset === "teacher" ||
    input.scenePreset === "research" ||
    input.scenePreset === "sideHustle" ||
    input.scenePreset === "health" ||
    input.scenePreset === "finance"
  ) {
    patch.scenePreset = input.scenePreset;
  }
  if (
    input.mobileShortcut === "review" ||
    input.mobileShortcut === "inbox" ||
    input.mobileShortcut === "gallery" ||
    input.mobileShortcut === "finance" ||
    input.mobileShortcut === "nutrition" ||
    input.mobileShortcut === "sideHustle"
  ) {
    patch.mobileShortcut = input.mobileShortcut;
  }
  return patch;
}

function payloadFromRow(row?: PreferenceRow) {
  const stored = row
    ? parseStoredJson<JsonObject>(row.value_json, {})
    : {};
  return {
    preferences: { ...defaultPreferences, ...stored },
    version: row?.version ?? 0,
    updatedAt: row?.updated_at ?? null,
    deviceId: row?.device_id ?? "",
    exists: Boolean(row),
  };
}

async function readPreferenceRow() {
  const { DB } = getLifeBindings();
  return DB.prepare(
    `SELECT value_json, version, device_id, updated_at
     FROM sync_preferences WHERE key = 'workspace'`,
  ).first<PreferenceRow>();
}

export async function GET() {
  try {
    await ensureAdvancedSchema();
    return Response.json(payloadFromRow((await readPreferenceRow()) ?? undefined));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "读取云端偏好失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as JsonObject;
    const patch = normalizePatch(body.patch);
    const deviceId = text(body.deviceId);
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return Response.json(
        { error: "缺少有效的偏好版本号。" },
        { status: 400 },
      );
    }

    const current = (await readPreferenceRow()) ?? undefined;
    const currentVersion = current?.version ?? 0;
    if (expectedVersion !== currentVersion) {
      return Response.json(payloadFromRow(current), { status: 409 });
    }

    const currentValue = current
      ? parseStoredJson<JsonObject>(current.value_json, {})
      : {};
    const valueJson = JSON.stringify({
      ...defaultPreferences,
      ...currentValue,
      ...patch,
    }).slice(0, 12000);

    if (!current) {
      const inserted = await DB.prepare(
        `INSERT OR IGNORE INTO sync_preferences
         (key, value_json, version, device_id)
         VALUES ('workspace', ?, 1, ?)`,
      )
        .bind(valueJson, deviceId)
        .run();
      if ((inserted.meta.changes ?? 0) === 0) {
        return Response.json(
          payloadFromRow((await readPreferenceRow()) ?? undefined),
          { status: 409 },
        );
      }
    } else {
      const updated = await DB.prepare(
        `UPDATE sync_preferences
         SET value_json = ?, version = version + 1, device_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE key = 'workspace' AND version = ?`,
      )
        .bind(valueJson, deviceId, currentVersion)
        .run();
      if ((updated.meta.changes ?? 0) === 0) {
        return Response.json(
          payloadFromRow((await readPreferenceRow()) ?? undefined),
          { status: 409 },
        );
      }
    }

    return Response.json(
      payloadFromRow((await readPreferenceRow()) ?? undefined),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "保存云端偏好失败。",
      },
      { status: 500 },
    );
  }
}
