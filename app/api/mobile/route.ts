import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { addAuditLog, addLifeEventVersion, readLifeEvent } from "../../../lib/event-history";
import { getLifeBindings } from "../../../lib/life-store";

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

async function requireMobileUser() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "需要重新授权手机 App。" }, { status: 401 });
  }
  return user;
}

function mapEvent(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    kind: row.kind,
    mood: row.mood,
    happenedAt: row.happened_at,
    recordStatus: row.record_status,
  };
}

export async function GET() {
  try {
    const user = await requireMobileUser();
    if (user instanceof Response) return user;
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const [
      records,
      schedules,
      todayRecords,
      totalRecords,
      inboxPending,
      activeCheckin,
      recentCheckins,
    ] = await DB.batch([
      DB.prepare(
        `SELECT id, title, content, kind, mood, happened_at, record_status
         FROM life_events
         WHERE deleted_at IS NULL AND is_private = 0
           AND record_status != 'checkin_running'
         ORDER BY happened_at DESC LIMIT 50`,
      ),
      DB.prepare(
        `SELECT id, title, category, start_at, end_at, place, note, status
         FROM schedule_events
         WHERE end_at >= datetime('now', '-1 day')
         ORDER BY start_at ASC LIMIT 80`,
      ),
      DB.prepare(
        `SELECT COUNT(*) AS count FROM life_events
         WHERE deleted_at IS NULL AND record_status != 'checkin_running'
           AND date(happened_at) = date('now')`,
      ),
      DB.prepare(
        `SELECT COUNT(*) AS count FROM life_events
         WHERE deleted_at IS NULL AND record_status != 'checkin_running'`,
      ),
      DB.prepare("SELECT COUNT(*) AS count FROM inbox_items WHERE status != '已归档'"),
      DB.prepare(
        `SELECT id, title, content, kind, mood, happened_at, record_status
         FROM life_events
         WHERE deleted_at IS NULL AND record_status = 'checkin_running'
         ORDER BY happened_at DESC LIMIT 1`,
      ),
      DB.prepare(
        `SELECT id, title, content, kind, mood, happened_at, record_status
         FROM life_events
         WHERE deleted_at IS NULL AND kind = '打卡'
           AND record_status != 'checkin_running'
         ORDER BY happened_at DESC LIMIT 20`,
      ),
    ]);
    const count = (result: D1Result<unknown>) =>
      Number((result.results[0] as { count?: number } | undefined)?.count ?? 0);
    const activeRow = activeCheckin.results[0] as Record<string, unknown> | undefined;

    return Response.json({
      user,
      summary: {
        todayRecords: count(todayRecords),
        totalRecords: count(totalRecords),
        inboxPending: count(inboxPending),
        upcomingSchedules: schedules.results.length,
      },
      activeCheckin: activeRow ? mapEvent(activeRow) : null,
      recentCheckins: recentCheckins.results.map((row) => mapEvent(row)),
      records: records.results.map((row) => mapEvent(row)),
      schedules: schedules.results.map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        startAt: row.start_at,
        endAt: row.end_at,
        place: row.place,
        note: row.note,
        status: row.status,
      })),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "同步失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireMobileUser();
    if (user instanceof Response) return user;
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as Record<string, unknown>;
    const action = text(body.action, 40);
    const deviceId = text(body.deviceId, 120);

    if (action === "checkin.start") {
      const running = await DB.prepare(
        `SELECT id FROM life_events
         WHERE deleted_at IS NULL AND record_status = 'checkin_running'
         ORDER BY happened_at DESC LIMIT 1`,
      ).first<{ id: string }>();
      if (running) return Response.json({ id: running.id, alreadyRunning: true });

      const id = crypto.randomUUID();
      const title = text(body.title, 120) || "专注打卡";
      const startedAt = new Date().toISOString();
      await DB.prepare(
        `INSERT INTO life_events
         (id, title, content, kind, mood, energy, tags, person, place, project,
          is_private, happened_at, record_status)
         VALUES (?, ?, '', '打卡', '进行中', 3, '["手机打卡"]', '', '', '', 0, ?, 'checkin_running')`,
      ).bind(id, title, startedAt).run();
      const created = await readLifeEvent(DB, id);
      if (created) {
        await addLifeEventVersion(DB, created, { changeNote: "手机 App 开始打卡", deviceId });
        await addAuditLog(DB, {
          action: "checkin.start",
          entityType: "life_event",
          entityId: id,
          deviceId,
          detail: { source: "android-native" },
        });
      }
      return Response.json({ id, startedAt }, { status: 201 });
    }

    if (action === "checkin.stop") {
      const requestedId = text(body.id, 100);
      const running = requestedId
        ? await DB.prepare(
            `SELECT id, title, happened_at FROM life_events
             WHERE id = ? AND deleted_at IS NULL AND record_status = 'checkin_running'`,
          ).bind(requestedId).first<{ id: string; title: string; happened_at: string }>()
        : await DB.prepare(
            `SELECT id, title, happened_at FROM life_events
             WHERE deleted_at IS NULL AND record_status = 'checkin_running'
             ORDER BY happened_at DESC LIMIT 1`,
          ).first<{ id: string; title: string; happened_at: string }>();
      if (!running) {
        return Response.json({ error: "当前没有正在进行的打卡。" }, { status: 404 });
      }
      const startedAt = new Date(running.happened_at);
      const duration = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000));
      const note = text(body.note, 1000);
      const content = `完成 ${duration} 分钟${note ? `。${note}` : "。"}`;
      await DB.prepare(
        `UPDATE life_events
         SET content = ?, mood = '完成', record_status = 'published', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(content, running.id).run();
      const updated = await readLifeEvent(DB, running.id);
      if (updated) {
        await addLifeEventVersion(DB, updated, { changeNote: "手机 App 结束打卡", deviceId });
        await addAuditLog(DB, {
          action: "checkin.stop",
          entityType: "life_event",
          entityId: running.id,
          deviceId,
          detail: { source: "android-native", duration },
        });
      }
      return Response.json({ id: running.id, duration });
    }

    if (action === "event.create") {
      const title = text(body.title, 200);
      const content = text(body.content, 5000);
      if (!title && !content) {
        return Response.json({ error: "请填写记录内容。" }, { status: 400 });
      }
      const id = crypto.randomUUID();
      const happenedAt = new Date(text(body.happenedAt) || Date.now()).toISOString();
      await DB.prepare(
        `INSERT INTO life_events
         (id, title, content, kind, mood, energy, tags, person, place, project,
          is_private, happened_at)
         VALUES (?, ?, ?, ?, ?, 3, '[]', '', ?, '', 0, ?)`,
      ).bind(
        id,
        title,
        content,
        text(body.kind, 30) || "生活",
        text(body.mood, 20) || "平静",
        text(body.place, 200),
        happenedAt,
      ).run();
      const created = await readLifeEvent(DB, id);
      if (created) {
        await addLifeEventVersion(DB, created, { changeNote: "手机 App 创建", deviceId });
        await addAuditLog(DB, {
          action: "event.create",
          entityType: "life_event",
          entityId: id,
          deviceId,
          detail: { source: "android-native" },
        });
      }
      return Response.json({ id }, { status: 201 });
    }

    if (action === "schedule.create") {
      const title = text(body.title, 200);
      const start = new Date(text(body.startAt));
      const end = new Date(text(body.endAt));
      if (!title || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return Response.json({ error: "请填写正确的日程名称和时间。" }, { status: 400 });
      }
      const id = crypto.randomUUID();
      const endAt = end > start ? end : new Date(start.getTime() + 3600000);
      await DB.batch([
        DB.prepare(
          `INSERT INTO schedule_events
           (id, title, category, start_at, end_at, place, person, project,
            note, repeat_rule, status, planned_minutes, actual_minutes)
           VALUES (?, ?, ?, ?, ?, ?, '', '', ?, '不重复', '计划中', ?, 0)`,
        ).bind(
          id,
          title,
          text(body.category, 30) || "日程",
          start.toISOString(),
          endAt.toISOString(),
          text(body.place, 200),
          text(body.note, 2000),
          Math.max(1, Math.round((endAt.getTime() - start.getTime()) / 60000)),
        ),
        DB.prepare(
          `INSERT INTO schedule_rule_settings
           (schedule_id, reminder_minutes, custom_interval, custom_unit, weekdays)
           VALUES (?, 10, 1, 'week', '[]')`,
        ).bind(id),
      ]);
      return Response.json({ id }, { status: 201 });
    }

    if (action === "inbox.create") {
      const content = text(body.content, 5000);
      if (!content) {
        return Response.json({ error: "请填写收件箱内容。" }, { status: 400 });
      }
      const id = crypto.randomUUID();
      await DB.prepare(
        "INSERT INTO inbox_items (id, content, source_type) VALUES (?, ?, '文字')",
      ).bind(id, content).run();
      return Response.json({ id }, { status: 201 });
    }

    return Response.json({ error: "不支持的手机操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "保存失败。" },
      { status: 500 },
    );
  }
}
