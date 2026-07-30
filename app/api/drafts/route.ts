import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { getLifeBindings, safeJson } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

type DraftRow = {
  id: string;
  event_id: string | null;
  draft_json: string;
  device_id: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

function payload(row: DraftRow) {
  return {
    id: row.id,
    eventId: row.event_id,
    draft: safeJson<JsonObject>(row.draft_json, {}),
    deviceId: row.device_id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const url = new URL(request.url);
    const id = text(url.searchParams.get("id"), 120);
    const deviceId = text(url.searchParams.get("deviceId"), 120);
    if (id) {
      const row = await DB.prepare(
        `SELECT id, event_id, draft_json, device_id, revision,
                created_at, updated_at
         FROM record_drafts WHERE id = ?`,
      )
        .bind(id)
        .first<DraftRow>();
      return Response.json({ draft: row ? payload(row) : null });
    }
    const rows = deviceId
      ? await DB.prepare(
          `SELECT id, event_id, draft_json, device_id, revision,
                  created_at, updated_at
           FROM record_drafts
           WHERE device_id = ?
           ORDER BY updated_at DESC LIMIT 50`,
        )
          .bind(deviceId)
          .all<DraftRow>()
      : await DB.prepare(
          `SELECT id, event_id, draft_json, device_id, revision,
                  created_at, updated_at
           FROM record_drafts
           ORDER BY updated_at DESC LIMIT 50`,
        ).all<DraftRow>();
    return Response.json({ drafts: rows.results.map(payload) });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "读取草稿失败。",
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
    const id = text(body.id, 120) || crypto.randomUUID();
    const eventId = text(body.eventId, 120) || null;
    const deviceId = text(body.deviceId, 120);
    const draft =
      body.draft && typeof body.draft === "object" && !Array.isArray(body.draft)
        ? body.draft
        : {};
    const draftJson = JSON.stringify(draft).slice(0, 30000);
    const current = await DB.prepare(
      `SELECT id, event_id, draft_json, device_id, revision,
              created_at, updated_at
       FROM record_drafts WHERE id = ?`,
    )
      .bind(id)
      .first<DraftRow>();
    const expectedRevision = Math.max(0, Number(body.expectedRevision) || 0);
    if (current && expectedRevision !== current.revision) {
      return Response.json(
        {
          error: "草稿已在另一台设备更新。",
          conflict: true,
          draft: payload(current),
        },
        { status: 409 },
      );
    }
    if (current) {
      await DB.prepare(
        `UPDATE record_drafts
         SET event_id = ?, draft_json = ?, device_id = ?,
             revision = revision + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND revision = ?`,
      )
        .bind(eventId, draftJson, deviceId, id, expectedRevision)
        .run();
    } else {
      await DB.prepare(
        `INSERT INTO record_drafts
         (id, event_id, draft_json, device_id, revision)
         VALUES (?, ?, ?, ?, 1)`,
      )
        .bind(id, eventId, draftJson, deviceId)
        .run();
    }
    const saved = await DB.prepare(
      `SELECT id, event_id, draft_json, device_id, revision,
              created_at, updated_at
       FROM record_drafts WHERE id = ?`,
    )
      .bind(id)
      .first<DraftRow>();
    return Response.json({ draft: saved ? payload(saved) : null });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "保存草稿失败。",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const id = text(new URL(request.url).searchParams.get("id"), 120);
    if (!id) {
      return Response.json({ error: "缺少草稿编号。" }, { status: 400 });
    }
    await DB.prepare("DELETE FROM record_drafts WHERE id = ?").bind(id).run();
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "删除草稿失败。",
      },
      { status: 500 },
    );
  }
}
