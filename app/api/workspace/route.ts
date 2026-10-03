import {
  getLifeBindings,
  safeJson,
} from "../../../lib/life-store";
import {
  ensureAdvancedSchema,
  materializeScheduleInstances,
} from "../../../lib/advanced-store";
import { isPrivateVaultUnlocked } from "../../../lib/private-vault";
import {
  addAuditLog,
  addLifeEventVersion,
  readLifeEvent,
} from "../../../lib/event-history";

type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function isoDate(value: unknown, fallback = new Date()) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime())
    ? fallback.toISOString()
    : parsed.toISOString();
}

function scheduleIsoDate(value: unknown, timezoneOffset: unknown) {
  const raw = text(value, 80);
  const local = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (local) {
    const offset = Math.max(
      -840,
      Math.min(840, Number(timezoneOffset) || 0),
    );
    return new Date(
      Date.UTC(
        Number(local[1]),
        Number(local[2]) - 1,
        Number(local[3]),
        Number(local[4]),
        Number(local[5]),
        Number(local[6] || 0),
      ) +
        offset * 60_000,
    ).toISOString();
  }
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.getTime())) {
    throw new Error("日程时间无效，请重新选择日期和时间。");
  }
  return parsed.toISOString();
}

function prepareScheduleInsert(
  DB: D1Database,
  payload: JsonObject,
  timezoneOffset: unknown,
) {
  const id = crypto.randomUUID();
  const startAt = scheduleIsoDate(payload.startAt, timezoneOffset);
  const endAt = scheduleIsoDate(payload.endAt, timezoneOffset);
  if (new Date(endAt) <= new Date(startAt)) {
    throw new Error("结束时间必须晚于开始时间。");
  }
  const plannedMinutes = Math.max(
    1,
    Number(payload.plannedMinutes) ||
      Math.round(
        (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
      ),
  );
  return {
    id,
    statements: [
      DB.prepare(
        `INSERT INTO schedule_events
         (id, title, category, start_at, end_at, place, person, project, note,
          repeat_rule, status, planned_minutes, actual_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        text(payload.title, 200) || "未命名日程",
        text(payload.category, 30) || "学习",
        startAt,
        endAt,
        text(payload.place, 200),
        text(payload.person, 200),
        text(payload.project, 200),
        text(payload.note, 2000),
        text(payload.repeatRule, 80) || "不重复",
        text(payload.status, 30) || "计划中",
        plannedMinutes,
        Math.max(0, Number(payload.actualMinutes) || 0),
      ),
      DB.prepare(
        `INSERT INTO schedule_rule_settings
         (schedule_id, repeat_until, reminder_minutes, custom_interval,
          custom_unit, weekdays)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        payload.repeatUntil ? isoDate(payload.repeatUntil) : null,
        Math.max(0, Math.min(1440, Number(payload.reminderMinutes) || 10)),
        Math.max(1, Math.min(365, Number(payload.customInterval) || 1)),
        text(payload.customUnit, 20) || "week",
        JSON.stringify(
          Array.isArray(payload.weekdays) ? payload.weekdays : [],
        ),
      ),
    ],
  };
}

export async function GET(request: Request) {
  try {
    await ensureAdvancedSchema();
    await materializeScheduleInstances();
    const { DB } = getLifeBindings();
    const privateUnlocked = await isPrivateVaultUnlocked(request, DB);
    const [eventsResult, mediaResult, scheduleResult, inboxResult, tablesResult, rowsResult, inboxMediaResult] =
      await DB.batch([
        DB.prepare(
          `SELECT id, title, content, kind, mood, energy, tags, person, place,
                  project, is_private, record_status, revision, happened_at,
                  created_at, updated_at, deleted_at
           FROM life_events
           WHERE is_private = 0 OR ? = 1
           ORDER BY happened_at DESC, created_at DESC
           LIMIT 1000`,
        ).bind(privateUnlocked ? 1 : 0),
        DB.prepare(
          `SELECT id, event_id, filename, content_type, size
           FROM media ORDER BY created_at ASC`,
        ),
        DB.prepare(
          `SELECT si.id, si.schedule_id, se.title, se.category,
                  si.occurrence_start AS start_at,
                  si.occurrence_end AS end_at,
                  se.place, se.person, se.project, se.note, se.repeat_rule,
                  si.status, se.planned_minutes, si.actual_minutes,
                  si.actual_start_at, si.actual_end_at,
                  si.interruption_reason, si.reflection,
                  srs.repeat_until, srs.reminder_minutes, srs.weekdays,
                  srs.custom_interval, srs.custom_unit,
                  tsl.task_id,
                  si.created_at
           FROM schedule_instances si
           JOIN schedule_events se ON se.id = si.schedule_id
           LEFT JOIN schedule_rule_settings srs ON srs.schedule_id = se.id
           LEFT JOIN task_schedule_links tsl ON tsl.schedule_id = se.id
           ORDER BY si.occurrence_start ASC LIMIT 2500`,
        ),
        DB.prepare(
          `SELECT id, content, source_type, status, created_at
           FROM inbox_items
           ORDER BY created_at DESC LIMIT 500`,
        ),
        DB.prepare(
          `SELECT id, name, icon, description, fields, created_at
           FROM collections ORDER BY created_at DESC`,
        ),
        DB.prepare(
          `SELECT id, collection_id, values_json, created_at, updated_at
           FROM collection_rows ORDER BY updated_at DESC LIMIT 2000`,
        ),
        DB.prepare(
          `SELECT id, inbox_id, filename, content_type, size
           FROM inbox_attachments ORDER BY created_at ASC`,
        ),
      ]);

    const photoGroups = new Map<string, JsonObject[]>();
    for (const row of mediaResult.results as JsonObject[]) {
      const eventId = String(row.event_id);
      const group = photoGroups.get(eventId) ?? [];
      group.push({
        id: row.id,
        filename: row.filename,
        contentType: row.content_type,
        size: row.size,
        url: `/api/media/${row.id}`,
      });
      photoGroups.set(eventId, group);
    }

    const events = (eventsResult.results as JsonObject[]).map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      kind: row.kind,
      mood: row.mood,
      energy: row.energy,
      tags: safeJson(String(row.tags), []),
      person: row.person,
      place: row.place,
      project: row.project,
      isPrivate: Boolean(row.is_private),
      recordStatus: row.record_status,
      revision: Number(row.revision) || 1,
      happenedAt: row.happened_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      photos: photoGroups.get(String(row.id)) ?? [],
    }));

    const schedules = (scheduleResult.results as JsonObject[]).map((row) => ({
      id: row.id,
      seriesId: row.schedule_id,
      title: row.title,
      category: row.category,
      startAt: row.start_at,
      endAt: row.end_at,
      place: row.place,
      person: row.person,
      project: row.project,
      note: row.note,
      repeatRule: row.repeat_rule,
      status: row.status,
      plannedMinutes: row.planned_minutes,
      actualMinutes: row.actual_minutes,
      taskId: row.task_id || null,
      actualStartAt: row.actual_start_at,
      actualEndAt: row.actual_end_at,
      interruptionReason: row.interruption_reason,
      reflection: row.reflection,
      repeatUntil: row.repeat_until,
      reminderMinutes: row.reminder_minutes,
      weekdays: safeJson(String(row.weekdays ?? "[]"), []),
      customInterval: row.custom_interval,
      customUnit: row.custom_unit,
      createdAt: row.created_at,
    }));

    const inboxAttachments = new Map<string, JsonObject[]>();
    for (const row of inboxMediaResult.results as JsonObject[]) {
      const inboxId = String(row.inbox_id);
      const group = inboxAttachments.get(inboxId) ?? [];
      group.push({
        id: row.id,
        filename: row.filename,
        contentType: row.content_type,
        size: row.size,
        url: `/api/inbox/media/${row.id}`,
      });
      inboxAttachments.set(inboxId, group);
    }
    const inbox = (inboxResult.results as JsonObject[]).map((row) => ({
      id: row.id,
      content: row.content,
      sourceType: row.source_type,
      status: row.status,
      createdAt: row.created_at,
      attachments: inboxAttachments.get(String(row.id)) ?? [],
    }));

    const collections = (tablesResult.results as JsonObject[]).map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      description: row.description,
      fields: safeJson(String(row.fields), []),
      createdAt: row.created_at,
    }));

    const rows = (rowsResult.results as JsonObject[]).map((row) => ({
      id: row.id,
      collectionId: row.collection_id,
      values: safeJson(String(row.values_json), {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return Response.json({ events, schedules, inbox, collections, rows });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "读取生活工作台失败了。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB, MEDIA } = getLifeBindings();
    const body = (await request.json()) as JsonObject;
    const action = text(body.action, 80);
    const payload = (body.payload ?? {}) as JsonObject;

    if (action === "schedule.create") {
      const prepared = prepareScheduleInsert(
        DB,
        payload,
        payload.timezoneOffset,
      );
      await DB.batch(prepared.statements);
      await materializeScheduleInstances();
      return Response.json({ id: prepared.id }, { status: 201 });
    }

    if (action === "schedule.batchCreate") {
      const items = Array.isArray(payload.items)
        ? payload.items.filter(
            (item): item is JsonObject =>
              Boolean(item) && typeof item === "object" && !Array.isArray(item),
          )
        : [];
      if (!items.length) {
        return Response.json(
          { error: "请至少填写一项安排。" },
          { status: 400 },
        );
      }
      if (items.length > 50) {
        return Response.json(
          { error: "一次最多批量添加 50 项安排。" },
          { status: 400 },
        );
      }
      const prepared = items.map((item) =>
        prepareScheduleInsert(DB, item, payload.timezoneOffset),
      );
      await DB.batch(prepared.flatMap((item) => item.statements));
      await materializeScheduleInstances();
      return Response.json(
        { ids: prepared.map((item) => item.id), count: prepared.length },
        { status: 201 },
      );
    }

    if (action === "schedule.edit") {
      const instanceId = text(payload.id, 80);
      const instance = await DB.prepare(
        "SELECT schedule_id FROM schedule_instances WHERE id = ?",
      )
        .bind(instanceId)
        .first<{ schedule_id: string }>();
      const seriesId =
        text(payload.seriesId, 80) || instance?.schedule_id || instanceId;
      if (!seriesId) {
        return Response.json({ error: "没有找到要编辑的日程。" }, { status: 404 });
      }
      const startAt = scheduleIsoDate(
        payload.startAt,
        payload.timezoneOffset,
      );
      const endAt = scheduleIsoDate(payload.endAt, payload.timezoneOffset);
      if (new Date(endAt) <= new Date(startAt)) {
        return Response.json(
          { error: "结束时间必须晚于开始时间。" },
          { status: 400 },
        );
      }
      const plannedMinutes = Math.max(
        1,
        Math.round(
          (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
        ),
      );
      await DB.batch([
        DB.prepare(
          `UPDATE schedule_events
           SET title = ?, category = ?, start_at = ?, end_at = ?,
               place = ?, person = ?, project = ?, note = ?,
               repeat_rule = ?, planned_minutes = ?
           WHERE id = ?`,
        ).bind(
          text(payload.title, 200) || "未命名日程",
          text(payload.category, 30) || "学习",
          startAt,
          endAt,
          text(payload.place, 200),
          text(payload.person, 200),
          text(payload.project, 200),
          text(payload.note, 2000),
          text(payload.repeatRule, 80) || "不重复",
          plannedMinutes,
          seriesId,
        ),
        DB.prepare(
          `INSERT INTO schedule_rule_settings
           (schedule_id, repeat_until, reminder_minutes, custom_interval,
            custom_unit, weekdays)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(schedule_id) DO UPDATE SET
             repeat_until = excluded.repeat_until,
             reminder_minutes = excluded.reminder_minutes,
             custom_interval = excluded.custom_interval,
             custom_unit = excluded.custom_unit,
             weekdays = excluded.weekdays,
             updated_at = CURRENT_TIMESTAMP`,
        ).bind(
          seriesId,
          payload.repeatUntil ? isoDate(payload.repeatUntil) : null,
          Math.max(0, Math.min(1440, Number(payload.reminderMinutes) || 10)),
          Math.max(1, Math.min(365, Number(payload.customInterval) || 1)),
          text(payload.customUnit, 20) || "week",
          JSON.stringify(
            Array.isArray(payload.weekdays) ? payload.weekdays : [],
          ),
        ),
        DB.prepare(
          `DELETE FROM schedule_instances
           WHERE schedule_id = ? AND status != '已完成'`,
        ).bind(seriesId),
      ]);
      await materializeScheduleInstances();
      return Response.json({ id: seriesId });
    }

    if (action === "schedule.update") {
      const id = text(payload.id, 80);
      const status = text(payload.status, 30) || "已完成";
      const actualMinutes = Math.max(0, Number(payload.actualMinutes) || 0);
      const note = text(payload.note, 2000);
      const schedule = await DB.prepare(
        `SELECT si.schedule_id, se.title, se.category,
                si.occurrence_start AS start_at,
                si.occurrence_end AS end_at,
                se.place, se.person, se.project, tsl.task_id
         FROM schedule_instances si
         JOIN schedule_events se ON se.id = si.schedule_id
         LEFT JOIN task_schedule_links tsl ON tsl.schedule_id = se.id
         WHERE si.id = ?`,
      )
        .bind(id)
        .first<{
          title: string;
          category: string;
          start_at: string;
          end_at: string;
          place: string;
          person: string;
          project: string;
          task_id: string | null;
        }>();
      const statements = [
        DB.prepare(
          `UPDATE schedule_instances
           SET status = ?, actual_minutes = ?, reflection = ?,
               actual_start_at = ?, actual_end_at = ?,
               interruption_reason = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).bind(
          status,
          actualMinutes,
          note,
          payload.actualStartAt ? isoDate(payload.actualStartAt) : null,
          payload.actualEndAt ? isoDate(payload.actualEndAt) : null,
          text(payload.interruptionReason, 500),
          id,
        ),
      ];
      if (
        payload.createLifeEvent === true &&
        status === "已完成" &&
        schedule
      ) {
        statements.push(
          DB.prepare(
            `INSERT INTO life_events
             (id, title, content, kind, mood, energy, tags, person, place,
              project, happened_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            `完成：${schedule.title}`,
            note ||
              `计划投入 ${
                Math.round(
                  (new Date(schedule.end_at).getTime() -
                    new Date(schedule.start_at).getTime()) /
                    60000,
                ) || 0
              } 分钟，实际投入 ${actualMinutes} 分钟。`,
            schedule.category === "课程" ? "教学" : schedule.category,
            "平静",
            3,
            JSON.stringify(["时间表完成"]),
            schedule.person,
            schedule.place,
            schedule.project,
            schedule.end_at,
          ),
        );
      }
      if (status === "已完成" && schedule?.task_id) {
        statements.push(
          DB.prepare(
            `UPDATE tasks SET actual_minutes = MAX(actual_minutes, ?),
               status = '已完成', completed_at = COALESCE(completed_at, ?),
               today_rank = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).bind(
            actualMinutes,
            payload.actualEndAt ? isoDate(payload.actualEndAt) : schedule.end_at,
            schedule.task_id,
          ),
        );
      }
      await DB.batch(statements);
      return Response.json({ id });
    }

    if (action === "schedule.delete") {
      const instanceId = text(payload.id, 80);
      if (text(payload.scope, 20) === "instance") {
        const instance = await DB.prepare(
          `SELECT schedule_id, occurrence_start
           FROM schedule_instances WHERE id = ?`,
        )
          .bind(instanceId)
          .first<{ schedule_id: string; occurrence_start: string }>();
        if (instance) {
          await DB.batch([
            DB.prepare(
              `INSERT OR IGNORE INTO schedule_exceptions
               (id, schedule_id, occurrence_start, reason)
               VALUES (?, ?, ?, '删除本次')`,
            ).bind(
              crypto.randomUUID(),
              instance.schedule_id,
              instance.occurrence_start,
            ),
            DB.prepare("DELETE FROM schedule_instances WHERE id = ?").bind(
              instanceId,
            ),
          ]);
        }
      } else {
        const instance = await DB.prepare(
          "SELECT schedule_id FROM schedule_instances WHERE id = ?",
        )
          .bind(instanceId)
          .first<{ schedule_id: string }>();
        const seriesId =
          text(payload.seriesId, 80) || instance?.schedule_id || instanceId;
        await DB.prepare("DELETE FROM schedule_events WHERE id = ?")
          .bind(seriesId)
          .run();
      }
      return new Response(null, { status: 204 });
    }

    if (action === "schedule.reschedule") {
      const instanceId = text(payload.id, 80);
      const startAt = isoDate(payload.startAt);
      const endAt = isoDate(payload.endAt);
      if (new Date(endAt) <= new Date(startAt)) {
        return Response.json(
          { error: "结束时间必须晚于开始时间。" },
          { status: 400 },
        );
      }
      const scope = text(payload.scope, 20) || "instance";
      if (scope === "series") {
        const instance = await DB.prepare(
          "SELECT schedule_id FROM schedule_instances WHERE id = ?",
        )
          .bind(instanceId)
          .first<{ schedule_id: string }>();
        const seriesId =
          text(payload.seriesId, 80) || instance?.schedule_id;
        if (!seriesId) {
          return Response.json({ error: "没有找到日程系列。" }, { status: 404 });
        }
        const plannedMinutes = Math.max(
          1,
          Math.round(
            (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
          ),
        );
        await DB.batch([
          DB.prepare(
            `UPDATE schedule_events
             SET start_at = ?, end_at = ?, planned_minutes = ?
             WHERE id = ?`,
          ).bind(startAt, endAt, plannedMinutes, seriesId),
          DB.prepare(
            `DELETE FROM schedule_instances
             WHERE schedule_id = ? AND status != '已完成'`,
          ).bind(seriesId),
        ]);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        await materializeScheduleInstances(todayStart);
      } else {
        const instance = await DB.prepare(
          `SELECT schedule_id, occurrence_start
           FROM schedule_instances WHERE id = ?`,
        )
          .bind(instanceId)
          .first<{ schedule_id: string; occurrence_start: string }>();
        if (!instance) {
          return Response.json({ error: "没有找到这次日程。" }, { status: 404 });
        }
        await DB.batch([
          DB.prepare(
            `INSERT OR IGNORE INTO schedule_exceptions
             (id, schedule_id, occurrence_start, reason)
             VALUES (?, ?, ?, '调整本次')`,
          ).bind(
            crypto.randomUUID(),
            instance.schedule_id,
            instance.occurrence_start,
          ),
          DB.prepare(
            `UPDATE schedule_instances
             SET occurrence_start = ?, occurrence_end = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).bind(startAt, endAt, instanceId),
        ]);
      }
      return Response.json({ id: instanceId });
    }

    if (action === "inbox.create") {
      const content = text(payload.content);
      if (!content) {
        return Response.json({ error: "收件箱内容不能为空。" }, { status: 400 });
      }
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO inbox_items (id, content, source_type)
         VALUES (?, ?, ?)`,
      )
        .bind(id, content, text(payload.sourceType, 30) || "文字")
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "inbox.organize") {
      const id = text(payload.id, 80);
      const row = await DB.prepare(
        "SELECT content FROM inbox_items WHERE id = ?",
      )
        .bind(id)
        .first<{ content: string }>();
      if (!row) return Response.json({ error: "内容不存在。" }, { status: 404 });
      const eventId = crypto.randomUUID();
      await DB.batch([
        DB.prepare(
          `INSERT INTO life_events
           (id, title, content, kind, mood, energy, tags, happened_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          eventId,
          text(payload.title, 200),
          row.content,
          text(payload.kind, 30) || "生活",
          text(payload.mood, 20) || "平静",
          3,
          "[]",
          isoDate(payload.happenedAt),
        ),
        DB.prepare(
          "UPDATE inbox_items SET status = '已整理' WHERE id = ?",
        ).bind(id),
      ]);
      return Response.json({ id: eventId });
    }

    if (action === "inbox.delete") {
      const attachments = await DB.prepare(
        "SELECT object_key FROM inbox_attachments WHERE inbox_id = ?",
      )
        .bind(text(payload.id, 80))
        .all<{ object_key: string }>();
      for (const attachment of attachments.results) {
        await MEDIA.delete(attachment.object_key);
      }
      await DB.prepare("DELETE FROM inbox_items WHERE id = ?")
        .bind(text(payload.id, 80))
        .run();
      return new Response(null, { status: 204 });
    }

    if (action === "collection.create") {
      const id = crypto.randomUUID();
      const fields = Array.isArray(payload.fields) ? payload.fields : [];
      await DB.prepare(
        `INSERT INTO collections (id, name, icon, description, fields)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.name, 100) || "未命名表格",
          text(payload.icon, 10) || "表",
          text(payload.description, 500),
          JSON.stringify(fields).slice(0, 20000),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "collection.update") {
      const id = text(payload.id, 80);
      const current = await DB.prepare(
        "SELECT name, icon, description FROM collections WHERE id = ?",
      )
        .bind(id)
        .first<{ name: string; icon: string; description: string }>();
      if (!current) {
        return Response.json({ error: "没有找到这张表格。" }, { status: 404 });
      }
      await DB.prepare(
        `UPDATE collections
         SET name = ?, icon = ?, description = ?
         WHERE id = ?`,
      )
        .bind(
          text(payload.name, 100) || current.name,
          text(payload.icon, 10) || current.icon,
          payload.description === undefined
            ? current.description
            : text(payload.description, 500),
          id,
        )
        .run();
      return Response.json({ id });
    }

    if (action === "collection.delete") {
      const id = text(payload.id, 80);
      await DB.batch([
        DB.prepare("DELETE FROM collection_rows WHERE collection_id = ?").bind(id),
        DB.prepare("DELETE FROM collections WHERE id = ?").bind(id),
      ]);
      return new Response(null, { status: 204 });
    }

    if (action === "collection.fields.update") {
      const id = text(payload.id, 80);
      const fields = Array.isArray(payload.fields)
        ? payload.fields.slice(0, 100)
        : [];
      await DB.prepare(
        "UPDATE collections SET fields = ? WHERE id = ?",
      )
        .bind(JSON.stringify(fields).slice(0, 30000), id)
        .run();
      return Response.json({ id });
    }

    if (action === "row.create") {
      const id = crypto.randomUUID();
      const collectionId = text(payload.collectionId, 80);
      const values =
        payload.values && typeof payload.values === "object"
          ? payload.values
          : {};
      await DB.prepare(
        `INSERT INTO collection_rows (id, collection_id, values_json)
         VALUES (?, ?, ?)`,
      )
        .bind(id, collectionId, JSON.stringify(values).slice(0, 50000))
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "row.update") {
      const id = text(payload.id, 80);
      const values =
        payload.values && typeof payload.values === "object"
          ? payload.values
          : {};
      await DB.prepare(
        `UPDATE collection_rows
         SET values_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(JSON.stringify(values).slice(0, 50000), id)
        .run();
      return Response.json({ id });
    }

    if (action === "row.delete") {
      await DB.prepare("DELETE FROM collection_rows WHERE id = ?")
        .bind(text(payload.id, 80))
        .run();
      return new Response(null, { status: 204 });
    }

    if (action === "event.restore") {
      const id = text(payload.id, 80);
      const current = await readLifeEvent(DB, id);
      if (!current) {
        return Response.json({ error: "没有找到这条记录。" }, { status: 404 });
      }
      if (
        current.is_private &&
        !(await isPrivateVaultUnlocked(request, DB))
      ) {
        return Response.json(
          { error: "请先解锁私密空间。" },
          { status: 403 },
        );
      }
      await addLifeEventVersion(DB, current, {
        changeNote: "恢复前的回收站版本",
      });
      await DB.prepare(
        `UPDATE life_events
         SET deleted_at = NULL, revision = revision + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(id)
        .run();
      const restored = await readLifeEvent(DB, id);
      if (restored) {
        await addLifeEventVersion(DB, restored, {
          changeNote: "从回收站恢复",
        });
        await addAuditLog(DB, {
          action: "event.restore",
          entityType: "life_event",
          entityId: id,
          detail: { revision: restored.revision },
        });
      }
      return Response.json({ id });
    }

    if (action === "event.purge") {
      const id = text(payload.id, 80);
      const current = await readLifeEvent(DB, id);
      if (!current) {
        return Response.json({ error: "没有找到这条记录。" }, { status: 404 });
      }
      if (!current.deleted_at) {
        return Response.json(
          { error: "只有回收站中的记录才能永久删除。" },
          { status: 409 },
        );
      }
      if (
        current.is_private &&
        !(await isPrivateVaultUnlocked(request, DB))
      ) {
        return Response.json(
          { error: "请先解锁私密空间。" },
          { status: 403 },
        );
      }
      const photos = await DB.prepare(
        "SELECT object_key FROM media WHERE event_id = ?",
      )
        .bind(id)
        .all<{ object_key: string }>();
      for (const photo of photos.results) {
        await MEDIA.delete(photo.object_key);
      }
      await addAuditLog(DB, {
        action: "event.purge",
        entityType: "life_event",
        entityId: id,
        detail: {
          title: current.title,
          happenedAt: current.happened_at,
          revision: current.revision,
        },
      });
      await DB.batch([
        DB.prepare("DELETE FROM record_drafts WHERE event_id = ?").bind(id),
        DB.prepare("DELETE FROM life_event_versions WHERE event_id = ?").bind(id),
        DB.prepare("DELETE FROM life_events WHERE id = ?").bind(id),
      ]);
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "不支持的操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "保存工作台内容失败了。",
      },
      { status: 500 },
    );
  }
}
