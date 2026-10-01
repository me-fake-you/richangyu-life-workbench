import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const deviceId = text(new URL(request.url).searchParams.get("deviceId"), 120);
    if (!deviceId) {
      return Response.json({ error: "缺少设备标识。" }, { status: 400 });
    }
    const result = await DB.prepare(
      `SELECT am.id, am.title, am.body, am.action_target, am.due_at
       FROM automation_messages am
       LEFT JOIN notification_deliveries nd
         ON nd.message_id = am.id AND nd.device_id = ?
       WHERE am.read_at IS NULL
         AND nd.id IS NULL
         AND datetime(am.due_at) <= datetime('now')
         AND datetime(am.created_at) >= datetime('now', '-7 days')
       ORDER BY datetime(am.due_at) ASC
       LIMIT 10`,
    )
      .bind(deviceId)
      .all<{
        id: string;
        title: string;
        body: string;
        action_target: string;
        due_at: string;
      }>();
    return Response.json({
      messages: result.results.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        actionTarget: row.action_target,
        dueAt: row.due_at,
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "提醒读取失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as JsonObject;
    const deviceId = text(body.deviceId, 120);
    if (!deviceId) {
      return Response.json({ error: "缺少设备标识。" }, { status: 400 });
    }
    const deliveredIds = (Array.isArray(body.deliveredIds)
      ? body.deliveredIds
      : []
    )
      .map((item) => text(item, 120))
      .filter(Boolean)
      .slice(0, 20);
    const openedId = text(body.openedId, 120);
    const statements = deliveredIds.map((messageId) =>
      DB.prepare(
        `INSERT INTO notification_deliveries
         (id, message_id, device_id, status, delivered_at)
         VALUES (?, ?, ?, 'delivered', CURRENT_TIMESTAMP)
         ON CONFLICT(message_id, device_id) DO UPDATE SET
           status = 'delivered',
           delivered_at = COALESCE(notification_deliveries.delivered_at, CURRENT_TIMESTAMP)`,
      ).bind(crypto.randomUUID(), messageId, deviceId),
    );
    if (openedId) {
      statements.push(
        DB.prepare(
          `INSERT INTO notification_deliveries
           (id, message_id, device_id, status, delivered_at, opened_at)
           VALUES (?, ?, ?, 'opened', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(message_id, device_id) DO UPDATE SET
             status = 'opened',
             opened_at = CURRENT_TIMESTAMP`,
        ).bind(crypto.randomUUID(), openedId, deviceId),
      );
    }
    if (statements.length) await DB.batch(statements);
    return Response.json({
      ok: true,
      delivered: deliveredIds.length,
      opened: Boolean(openedId),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "提醒回执保存失败。" },
      { status: 500 },
    );
  }
}
