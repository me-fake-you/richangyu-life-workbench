import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import {
  addAuditLog,
  addLifeEventVersion,
  eventSnapshot,
  readLifeEvent,
} from "../../../lib/event-history";
import { getLifeBindings, safeJson } from "../../../lib/life-store";
import { isPrivateVaultUnlocked } from "../../../lib/private-vault";

type JsonObject = Record<string, unknown>;

type ClientMutation = {
  id: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  action: string;
  baseRevision: number;
  payload: JsonObject;
  createdAt: string;
};

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function timestamp(value: unknown, fallback = new Date()) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime())
    ? fallback.toISOString()
    : parsed.toISOString();
}

function databaseIso(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw.replace(" ", "T")}Z`
      : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function tags(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[，,\s]+/);
  return raw
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeMutation(value: unknown): ClientMutation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as JsonObject;
  const id = text(row.id, 120);
  const action = text(row.action, 80);
  if (!id || !action) return null;
  return {
    id,
    deviceId: text(row.deviceId, 120),
    entityType: text(row.entityType, 80) || action.split(".")[0] || "unknown",
    entityId: text(row.entityId, 120),
    action,
    baseRevision: Math.max(0, Number(row.baseRevision) || 0),
    payload:
      row.payload &&
      typeof row.payload === "object" &&
      !Array.isArray(row.payload)
        ? (row.payload as JsonObject)
        : {},
    createdAt: timestamp(row.createdAt),
  };
}

async function saveReceipt(
  DB: D1Database,
  mutation: ClientMutation,
  status: "processed" | "conflict" | "failed",
  {
    entityId = mutation.entityId,
    resultRevision = 0,
    error = "",
  }: { entityId?: string; resultRevision?: number; error?: string } = {},
) {
  await DB.prepare(
    `INSERT INTO client_mutations
     (id, device_id, entity_type, entity_id, action, base_revision,
      payload_json, status, result_revision, error, created_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       result_revision = excluded.result_revision,
       error = excluded.error,
       processed_at = excluded.processed_at`,
  )
    .bind(
      mutation.id,
      mutation.deviceId,
      mutation.entityType,
      entityId,
      mutation.action,
      mutation.baseRevision,
      JSON.stringify(mutation.payload).slice(0, 30000),
      status,
      resultRevision,
      error.slice(0, 1000),
      mutation.createdAt,
    )
    .run();
}

async function existingReceipt(DB: D1Database, id: string) {
  return DB.prepare(
    `SELECT id, entity_id, status, result_revision, error, processed_at
     FROM client_mutations WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      entity_id: string;
      status: string;
      result_revision: number;
      error: string;
      processed_at: string | null;
    }>();
}

async function processEventCreate(DB: D1Database, mutation: ClientMutation) {
  const payload = mutation.payload;
  const id = mutation.entityId || crypto.randomUUID();
  const exists = await readLifeEvent(DB, id);
  if (exists) {
    return { entityId: id, revision: exists.revision, duplicate: true };
  }
  const title = text(payload.title, 200);
  const content = text(payload.content, 5000);
  if (!title && !content) throw new Error("离线记录没有标题或正文。");
  await DB.prepare(
    `INSERT INTO life_events
     (id, title, content, kind, mood, energy, tags, person, place, project,
      is_private, record_status, revision, happened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?)`,
  )
    .bind(
      id,
      title,
      content,
      text(payload.kind, 30) || "生活",
      text(payload.mood, 20) || "平静",
      Math.min(5, Math.max(1, Number(payload.energy) || 3)),
      JSON.stringify(tags(payload.tags)),
      text(payload.person, 200),
      text(payload.place, 200),
      text(payload.project, 200),
      payload.isPrivate === true ? 1 : 0,
      timestamp(payload.happenedAt),
    )
    .run();
  const created = await readLifeEvent(DB, id);
  if (!created) throw new Error("离线记录写入后无法读取。");
  await addLifeEventVersion(DB, created, {
    changeNote: "离线创建后同步",
    deviceId: mutation.deviceId,
  });
  await addAuditLog(DB, {
    action: "event.create.offline",
    entityType: "life_event",
    entityId: id,
    deviceId: mutation.deviceId,
    detail: { mutationId: mutation.id, revision: 1 },
  });
  return { entityId: id, revision: 1 };
}

async function processEventUpdate(DB: D1Database, mutation: ClientMutation) {
  const current = await readLifeEvent(DB, mutation.entityId);
  if (!current) throw new Error("要同步的生活记录不存在。");
  if (current.revision !== mutation.baseRevision) {
    return {
      conflict: true as const,
      entityId: current.id,
      revision: current.revision,
      current: eventSnapshot(current),
    };
  }
  await addLifeEventVersion(DB, current, {
    changeNote: "离线编辑前版本",
    deviceId: mutation.deviceId,
  });
  const payload = mutation.payload;
  const nextRevision = current.revision + 1;
  const changed = await DB.prepare(
    `UPDATE life_events
     SET title = ?, content = ?, kind = ?, mood = ?, energy = ?, tags = ?,
         person = ?, place = ?, project = ?, is_private = ?, happened_at = ?,
         revision = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND revision = ?`,
  )
    .bind(
      text(payload.title, 200),
      text(payload.content, 5000),
      text(payload.kind, 30) || current.kind,
      text(payload.mood, 20) || current.mood,
      Math.min(5, Math.max(1, Number(payload.energy) || current.energy)),
      JSON.stringify(tags(payload.tags)),
      text(payload.person, 200),
      text(payload.place, 200),
      text(payload.project, 200),
      payload.isPrivate === true ? 1 : 0,
      timestamp(payload.happenedAt, new Date(current.happened_at)),
      nextRevision,
      current.id,
      current.revision,
    )
    .run();
  if ((changed.meta.changes ?? 0) === 0) {
    const latest = await readLifeEvent(DB, current.id);
    return {
      conflict: true as const,
      entityId: current.id,
      revision: latest?.revision ?? current.revision,
      current: latest ? eventSnapshot(latest) : null,
    };
  }
  const next = await readLifeEvent(DB, current.id);
  if (!next) throw new Error("同步更新后无法读取记录。");
  await addLifeEventVersion(DB, next, {
    changeNote: "离线编辑后同步",
    deviceId: mutation.deviceId,
  });
  await addAuditLog(DB, {
    action: "event.update.offline",
    entityType: "life_event",
    entityId: current.id,
    deviceId: mutation.deviceId,
    detail: { mutationId: mutation.id, revision: nextRevision },
  });
  return { entityId: current.id, revision: nextRevision };
}

async function processInboxCreate(DB: D1Database, mutation: ClientMutation) {
  const content = text(mutation.payload.content, 5000);
  if (!content) throw new Error("离线收件箱内容为空。");
  const id = mutation.entityId || crypto.randomUUID();
  await DB.prepare(
    `INSERT OR IGNORE INTO inbox_items
     (id, content, source_type, status, created_at)
     VALUES (?, ?, ?, '待整理', ?)`,
  )
    .bind(
      id,
      content,
      text(mutation.payload.sourceType, 30) || "文字",
      mutation.createdAt,
    )
    .run();
  await addAuditLog(DB, {
    action: "inbox.create.offline",
    entityType: "inbox_item",
    entityId: id,
    deviceId: mutation.deviceId,
    detail: { mutationId: mutation.id },
  });
  return { entityId: id, revision: 1 };
}

export async function GET(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const url = new URL(request.url);
    const since = text(url.searchParams.get("since"), 80);
    const deviceId = text(url.searchParams.get("deviceId"), 120);
    const changes = since
      ? await DB.prepare(
          `SELECT id, action, entity_type, entity_id, device_id,
                  detail_json, created_at
           FROM audit_logs
           WHERE created_at > ?
           ORDER BY created_at ASC LIMIT 500`,
        )
          .bind(timestamp(since, new Date(0)))
          .all<{
            id: string;
            action: string;
            entity_type: string;
            entity_id: string;
            device_id: string;
            detail_json: string;
            created_at: string;
          }>()
      : { results: [] };
    const [latestAudit, failed, latestBackup, receiptStats] = await DB.batch([
      DB.prepare("SELECT MAX(created_at) AS value FROM audit_logs"),
      DB.prepare(
        `SELECT COUNT(*) AS value FROM client_mutations
         WHERE device_id = ? AND status IN ('failed', 'conflict')`,
      ).bind(deviceId),
      DB.prepare(
        `SELECT status, created_at, row_count, file_count
         FROM backup_operations
         WHERE operation_type IN ('export', 'automatic')
         ORDER BY created_at DESC LIMIT 1`,
      ),
      DB.prepare(
        `SELECT
           COUNT(*) AS total,
           COUNT(DISTINCT NULLIF(device_id, '')) AS devices,
           SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) AS processed,
           SUM(CASE WHEN status = 'conflict' THEN 1 ELSE 0 END) AS conflicts,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           MAX(processed_at) AS last_processed_at
         FROM client_mutations`,
      ),
    ]);
    const token = String(
      (latestAudit.results[0] as { value?: string } | undefined)?.value ?? "",
    );
    const failedCount = Number(
      (failed.results[0] as { value?: number } | undefined)?.value ?? 0,
    );
    const backup =
      (latestBackup.results[0] as JsonObject | undefined) ?? null;
    const receipts =
      (receiptStats.results[0] as JsonObject | undefined) ?? {};
    return Response.json({
      online: true,
      serverTime: new Date().toISOString(),
      syncToken: token,
      failedCount,
      latestBackup: backup
        ? {
            status: backup.status,
            createdAt: databaseIso(backup.created_at),
            rowCount: backup.row_count,
            fileCount: backup.file_count,
          }
        : null,
      diagnostics: {
        receipts: Number(receipts.total) || 0,
        devices: Number(receipts.devices) || 0,
        processed: Number(receipts.processed) || 0,
        conflicts: Number(receipts.conflicts) || 0,
        failed: Number(receipts.failed) || 0,
        lastProcessedAt: databaseIso(receipts.last_processed_at),
      },
      changes: changes.results.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        deviceId: row.device_id,
        detail: safeJson<JsonObject>(row.detail_json, {}),
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "同步状态读取失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const privateUnlocked = await isPrivateVaultUnlocked(request, DB);
    const body = (await request.json()) as JsonObject;
    const mutations = (Array.isArray(body.mutations) ? body.mutations : [])
      .map(normalizeMutation)
      .filter((item): item is ClientMutation => Boolean(item))
      .slice(0, 100);
    const results: JsonObject[] = [];
    for (const mutation of mutations) {
      const duplicate = await existingReceipt(DB, mutation.id);
      if (duplicate?.status === "processed") {
        results.push({
          id: mutation.id,
          status: "processed",
          entityId: duplicate.entity_id,
          revision: duplicate.result_revision,
          duplicate: true,
        });
        continue;
      }
      try {
        if (
          mutation.action === "event.create" &&
          mutation.payload.isPrivate === true &&
          !privateUnlocked
        ) {
          throw new Error("请先解锁私密空间再同步私密记录。");
        }
        if (mutation.action === "event.update" && !privateUnlocked) {
          const target = await readLifeEvent(DB, mutation.entityId);
          if (target?.is_private || mutation.payload.isPrivate === true) {
            throw new Error("请先解锁私密空间再同步私密记录。");
          }
        }
        const outcome =
          mutation.action === "event.create"
            ? await processEventCreate(DB, mutation)
            : mutation.action === "event.update"
              ? await processEventUpdate(DB, mutation)
              : mutation.action === "inbox.create"
                ? await processInboxCreate(DB, mutation)
                : null;
        if (!outcome) throw new Error(`暂不支持同步动作：${mutation.action}`);
        if ("conflict" in outcome && outcome.conflict) {
          await saveReceipt(DB, mutation, "conflict", {
            entityId: outcome.entityId,
            resultRevision: outcome.revision,
            error: "server_revision_changed",
          });
          results.push({ id: mutation.id, status: "conflict", ...outcome });
          continue;
        }
        await saveReceipt(DB, mutation, "processed", {
          entityId: outcome.entityId,
          resultRevision: outcome.revision,
        });
        results.push({ id: mutation.id, status: "processed", ...outcome });
      } catch (error) {
        const message = error instanceof Error ? error.message : "同步失败";
        await saveReceipt(DB, mutation, "failed", { error: message });
        results.push({ id: mutation.id, status: "failed", error: message });
      }
    }
    return Response.json({
      processed: results.filter((item) => item.status === "processed").length,
      conflicts: results.filter((item) => item.status === "conflict").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
      syncToken: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "同步失败。",
      },
      { status: 500 },
    );
  }
}
