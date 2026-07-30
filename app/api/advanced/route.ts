import {
  ensureAdvancedSchema,
  materializeScheduleInstances,
  parseStoredJson,
} from "../../../lib/advanced-store";
import { runAutomationEngine } from "../../../lib/automation-engine";
import { getLifeBindings } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function iso(value: unknown, fallback = new Date()) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime())
    ? fallback.toISOString()
    : parsed.toISOString();
}

function timezoneOffset(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-840, Math.min(840, Math.round(parsed)));
}

function legacyLocalDateToUtc(
  year: number,
  month: number,
  day: number,
  offsetMinutes: number,
) {
  return new Date(Date.UTC(year, month, day) + offsetMinutes * 60000);
}

function legacyParseStoredTimestamp(value: string | null) {
  if (!value) return null;
  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function legacySummaryWindow(
  now: Date,
  offsetMinutes: number,
  triggerType: string,
  triggerValue: string,
) {
  const local = new Date(now.getTime() - offsetMinutes * 60000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const weekday = local.getUTCDay();
  const minutesNow = local.getUTCHours() * 60 + local.getUTCMinutes();
  const [rule = "", clock = "00:00"] = triggerValue.split("@");
  const [hourValue, minuteValue] = clock.split(":").map(Number);
  const triggerMinutes =
    (Number.isFinite(hourValue) ? hourValue : 0) * 60 +
    (Number.isFinite(minuteValue) ? minuteValue : 0);

  if (triggerType === "weekly") {
    const triggerWeekday = Number.isInteger(Number(rule)) ? Number(rule) : 0;
    const mondayDelta = (weekday + 6) % 7;
    const startAt = legacyLocalDateToUtc(
      year,
      month,
      day - mondayDelta,
      offsetMinutes,
    );
    return {
      due: weekday === triggerWeekday && minutesNow >= triggerMinutes,
      startAt,
      endAt: new Date(startAt.getTime() + 7 * 86400000),
    };
  }

  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startAt = legacyLocalDateToUtc(year, month, 1, offsetMinutes);
  return {
    due:
      triggerType === "monthly" &&
      (rule === "last" ? day === lastDay : day === Number(rule)) &&
      minutesNow >= triggerMinutes,
    startAt,
    endAt: legacyLocalDateToUtc(year, month + 1, 1, offsetMinutes),
  };
}

async function createSummary(
  DB: D1Database,
  kind: string,
  periodStart: string,
  periodEnd: string,
  title = "",
  contentOverride = "",
  generatedBy = "local",
) {
  const [eventsResult, schedulesResult] = await DB.batch([
    DB.prepare(
      `SELECT id, title, content, kind, mood, energy, happened_at
       FROM life_events
       WHERE deleted_at IS NULL AND is_private = 0
         AND happened_at >= ? AND happened_at < ?
       ORDER BY happened_at ASC`,
    ).bind(periodStart, periodEnd),
    DB.prepare(
      `SELECT si.id, se.title, se.category, si.status, si.actual_minutes,
              si.occurrence_start
       FROM schedule_instances si
       JOIN schedule_events se ON se.id = si.schedule_id
       WHERE si.occurrence_start >= ? AND si.occurrence_start < ?
       ORDER BY si.occurrence_start ASC`,
    ).bind(periodStart, periodEnd),
  ]);

  const events = eventsResult.results as JsonObject[];
  const schedules = schedulesResult.results as JsonObject[];
  const completed = schedules.filter((item) => item.status === "已完成");
  const actualMinutes = completed.reduce(
    (sum, item) => sum + number(item.actual_minutes),
    0,
  );
  const kindCounts = new Map<string, number>();
  const moodCounts = new Map<string, number>();
  for (const event of events) {
    const eventKind = text(event.kind, 30) || "生活";
    const mood = text(event.mood, 20) || "平静";
    kindCounts.set(eventKind, (kindCounts.get(eventKind) ?? 0) + 1);
    moodCounts.set(mood, (moodCounts.get(mood) ?? 0) + 1);
  }
  const topKind = [...kindCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topMood = [...moodCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const highlights = events
    .filter((event) => event.title || event.content)
    .slice(-5)
    .map((event) => `• ${text(event.title || event.content, 80)}`)
    .join("\n");
  const completionRate = schedules.length
    ? Math.round((completed.length / schedules.length) * 100)
    : 0;
  const content =
    contentOverride ||
    [
      `这段时间记录了 ${events.length} 条生活事件，完成了 ${completed.length}/${schedules.length} 个安排，计划完成率 ${completionRate}%。`,
      `实际投入约 ${Math.round(actualMinutes / 60 * 10) / 10} 小时。${
        topKind ? `生活重心是“${topKind[0]}”（${topKind[1]} 条）。` : ""
      }${topMood ? `最常见的心情是“${topMood[0]}”。` : ""}`,
      highlights ? `\n值得记住：\n${highlights}` : "\n这段时间还没有足够的高光记录。",
      "\n下一步建议：保留最稳定的一项投入，同时给最常延期的安排预留 20% 缓冲时间。",
    ].join("\n");

  const id = crypto.randomUUID();
  await DB.prepare(
    `INSERT INTO generated_summaries
     (id, kind, period_start, period_end, title, content, source_ids, generated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, period_start, period_end) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       source_ids = excluded.source_ids,
       generated_by = excluded.generated_by,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      id,
      kind,
      periodStart,
      periodEnd,
      title || `${kind}总结`,
      content,
      JSON.stringify(events.map((event) => event.id)),
      generatedBy,
    )
    .run();
  const persisted = await DB.prepare(
    `SELECT id FROM generated_summaries
     WHERE kind = ? AND period_start = ? AND period_end = ?`,
  )
    .bind(kind, periodStart, periodEnd)
    .first<{ id: string }>();
  return { id: persisted?.id ?? id, content };
}

export async function GET() {
  try {
    await ensureAdvancedSchema();
    await materializeScheduleInstances();
    const { DB } = getLifeBindings();
    const [
      projects,
      milestones,
      automations,
      automationRuns,
      automationMessages,
      summaries,
      photoInsights,
      imports,
      dashboard,
      searches,
      collectionViews,
      relations,
    ] = await DB.batch([
      DB.prepare("SELECT * FROM projects ORDER BY updated_at DESC"),
      DB.prepare("SELECT * FROM milestones ORDER BY happened_at DESC"),
      DB.prepare("SELECT * FROM automations ORDER BY created_at ASC"),
      DB.prepare(
        "SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT 100",
      ),
      DB.prepare(
        `SELECT * FROM automation_messages
         ORDER BY CASE WHEN read_at IS NULL THEN 0 ELSE 1 END, due_at DESC
         LIMIT 100`,
      ),
      DB.prepare(
        "SELECT * FROM generated_summaries ORDER BY period_end DESC LIMIT 100",
      ),
      DB.prepare("SELECT * FROM photo_insights ORDER BY scanned_at DESC"),
      DB.prepare("SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 50"),
      DB.prepare(
        "SELECT layout_json, updated_at FROM dashboard_preferences WHERE id = 'default'",
      ),
      DB.prepare("SELECT * FROM saved_searches ORDER BY created_at DESC"),
      DB.prepare("SELECT * FROM collection_views ORDER BY created_at DESC"),
      DB.prepare("SELECT * FROM life_relations ORDER BY created_at DESC"),
    ]);

    return Response.json({
      projects: (projects.results as JsonObject[]).map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        status: row.status,
        progress: row.progress,
        description: row.description,
        color: row.color,
        startAt: row.start_at,
        targetAt: row.target_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      milestones: (milestones.results as JsonObject[]).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        happenedAt: row.happened_at,
        note: row.note,
        completed: Boolean(row.completed),
      })),
      automations: (automations.results as JsonObject[]).map((row) => ({
        id: row.id,
        name: row.name,
        triggerType: row.trigger_type,
        triggerValue: row.trigger_value,
        actionType: row.action_type,
        enabled: Boolean(row.enabled),
        lastRunAt: row.last_run_at,
        nextRunAt: row.next_run_at,
      })),
      automationRuns: (automationRuns.results as JsonObject[]).map((row) => ({
        id: row.id,
        automationId: row.automation_id,
        runKey: row.run_key,
        status: row.status,
        scheduledFor: row.scheduled_for,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        outcome: parseStoredJson(row.outcome_json, {}),
        error: row.error,
      })),
      automationMessages: (automationMessages.results as JsonObject[]).map(
        (row) => ({
          id: row.id,
          automationId: row.automation_id,
          runId: row.run_id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          actionTarget: row.action_target,
          dueAt: row.due_at,
          readAt: row.read_at,
          createdAt: row.created_at,
        }),
      ),
      summaries: (summaries.results as JsonObject[]).map((row) => ({
        id: row.id,
        kind: row.kind,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        title: row.title,
        content: row.content,
        sourceIds: parseStoredJson(row.source_ids, []),
        generatedBy: row.generated_by,
        createdAt: row.created_at,
      })),
      photoInsights: (photoInsights.results as JsonObject[]).map((row) => ({
        mediaId: row.media_id,
        sha256: row.sha256,
        perceptualHash: row.perceptual_hash,
        blurScore: row.blur_score,
        duplicateOf: row.duplicate_of,
        isScreenshot: Boolean(row.is_screenshot),
        note: row.note,
        exifRemoved: Boolean(row.exif_removed),
        scannedAt: row.scanned_at,
      })),
      imports: imports.results,
      dashboardLayout: dashboard.results[0]
        ? parseStoredJson(
            (dashboard.results[0] as JsonObject).layout_json,
            [],
          )
        : [],
      savedSearches: (searches.results as JsonObject[]).map((row) => ({
        id: row.id,
        name: row.name,
        query: parseStoredJson(row.query_json, {}),
      })),
      collectionViews: (collectionViews.results as JsonObject[]).map((row) => ({
        id: row.id,
        collectionId: row.collection_id,
        name: row.name,
        viewType: row.view_type,
        filter: parseStoredJson(row.filter_json, {}),
        sort: parseStoredJson(row.sort_json, {}),
        groupBy: row.group_by,
      })),
      relations: relations.results,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "读取扩展工作台失败。",
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
    const action = text(body.action, 80);
    const payload = (body.payload ?? {}) as JsonObject;

    if (action === "schedule.materialize") {
      const count = await materializeScheduleInstances(
        new Date(iso(payload.startAt, new Date(Date.now() - 120 * 86400000))),
        new Date(iso(payload.endAt, new Date(Date.now() + 400 * 86400000))),
      );
      return Response.json({ count });
    }

    if (action === "project.create") {
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO projects
         (id, title, kind, status, progress, description, color, start_at, target_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.title, 160) || "未命名目标",
          text(payload.kind, 40) || "个人目标",
          text(payload.status, 30) || "进行中",
          number(payload.progress, 0, 100),
          text(payload.description, 2000),
          text(payload.color, 20) || "#76528b",
          payload.startAt ? iso(payload.startAt) : null,
          payload.targetAt ? iso(payload.targetAt) : null,
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "project.update") {
      const id = text(payload.id, 80);
      await DB.prepare(
        `UPDATE projects SET
           title = ?, kind = ?, status = ?, progress = ?, description = ?,
           color = ?, target_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(
          text(payload.title, 160) || "未命名目标",
          text(payload.kind, 40) || "个人目标",
          text(payload.status, 30) || "进行中",
          number(payload.progress, 0, 100),
          text(payload.description, 2000),
          text(payload.color, 20) || "#76528b",
          payload.targetAt ? iso(payload.targetAt) : null,
          id,
        )
        .run();
      return Response.json({ id });
    }

    if (action === "project.delete") {
      await DB.prepare("DELETE FROM projects WHERE id = ?")
        .bind(text(payload.id, 80))
        .run();
      return new Response(null, { status: 204 });
    }

    if (action === "milestone.create") {
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO milestones
         (id, project_id, title, happened_at, note, completed)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.projectId, 80) || null,
          text(payload.title, 180) || "新的里程碑",
          iso(payload.happenedAt),
          text(payload.note, 1000),
          payload.completed ? 1 : 0,
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "milestone.toggle") {
      const id = text(payload.id, 80);
      await DB.prepare(
        "UPDATE milestones SET completed = ? WHERE id = ?",
      )
        .bind(payload.completed ? 1 : 0, id)
        .run();
      return Response.json({ id });
    }

    if (action === "automation.update") {
      const id = text(payload.id, 80);
      const triggerValue = text(payload.triggerValue, 60);
      await DB.prepare(
        `UPDATE automations
         SET trigger_value = ?, next_run_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(triggerValue, id)
        .run();
      return Response.json({ id, triggerValue });
    }

    if (action === "automation.toggle") {
      const id = text(payload.id, 80);
      await DB.prepare(
        `UPDATE automations SET enabled = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(payload.enabled ? 1 : 0, id)
        .run();
      return Response.json({ id });
    }

    if (action === "automation.run") {
      const result = await runAutomationEngine({
        DB,
        timezoneOffset: timezoneOffset(payload.timezoneOffset),
        createSummary: (kind, periodStart, periodEnd, title) =>
          createSummary(DB, kind, periodStart, periodEnd, title),
      });
      return Response.json(result);
    }

    if (action === "automation.message.read") {
      const id = text(payload.id, 80);
      await DB.prepare(
        `UPDATE automation_messages
         SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE id = ?`,
      )
        .bind(id)
        .run();
      return Response.json({ id });
    }

    if (action === "automation.run.v1") {
      await materializeScheduleInstances();
      const now = new Date();
      const offsetMinutes = timezoneOffset(payload.timezoneOffset);
      const enabled = await DB.prepare(
        `SELECT id, action_type, trigger_type, trigger_value, last_run_at
         FROM automations WHERE enabled = 1`,
      ).all<{
        id: string;
        action_type: string;
        trigger_type: string;
        trigger_value: string;
        last_run_at: string | null;
      }>();
      const generated: string[] = [];
      const skipped: string[] = [];

      for (const automation of enabled.results) {
        const isWeekly = automation.action_type === "weekly_summary";
        const isMonthly = automation.action_type === "monthly_summary";
        if (!isWeekly && !isMonthly) continue;

        const window = legacySummaryWindow(
          now,
          offsetMinutes,
          automation.trigger_type,
          automation.trigger_value,
        );
        const lastRun = legacyParseStoredTimestamp(automation.last_run_at);
        if (
          !window.due ||
          (lastRun && lastRun.getTime() >= window.startAt.getTime())
        ) {
          skipped.push(automation.id);
          continue;
        }

        const claimAt = now.toISOString();
        const claim = await DB.prepare(
          `UPDATE automations
           SET last_run_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND COALESCE(last_run_at, '') = ?`,
        )
          .bind(claimAt, automation.id, automation.last_run_at ?? "")
          .run();
        if ((claim.meta.changes ?? 0) === 0) {
          skipped.push(automation.id);
          continue;
        }

        try {
          const localStart = new Date(
            window.startAt.getTime() - offsetMinutes * 60000,
          );
          if (isWeekly) {
            await createSummary(
              DB,
              "周报",
              window.startAt.toISOString(),
              window.endAt.toISOString(),
              `${localStart.getUTCMonth() + 1}月${localStart.getUTCDate()}日这一周`,
            );
            generated.push("周报");
          } else {
            await createSummary(
              DB,
              "月报",
              window.startAt.toISOString(),
              window.endAt.toISOString(),
              `${localStart.getUTCFullYear()}年${localStart.getUTCMonth() + 1}月回顾`,
            );
            generated.push("月报");
          }
        } catch (error) {
          await DB.prepare(
            `UPDATE automations SET last_run_at = ?
             WHERE id = ? AND last_run_at = ?`,
          )
            .bind(automation.last_run_at, automation.id, claimAt)
            .run();
          throw error;
        }
      }
      return Response.json({
        generated,
        skipped,
        checkedAt: now.toISOString(),
      });
    }

    if (action === "summary.generate") {
      const startAt = iso(
        payload.startAt,
        new Date(Date.now() - 7 * 86400000),
      );
      const endAt = iso(payload.endAt);
      const result = await createSummary(
        DB,
        text(payload.kind, 30) || "专题",
        startAt,
        endAt,
        text(payload.title, 160),
        text(payload.content, 12000),
        text(payload.generatedBy, 40) || "local",
      );
      return Response.json(result, { status: 201 });
    }

    if (action === "photo.insights.save") {
      const insights = Array.isArray(payload.insights)
        ? (payload.insights as JsonObject[]).slice(0, 500)
        : [];
      const statements = insights.map((item) =>
        DB.prepare(
          `INSERT INTO photo_insights
           (media_id, sha256, perceptual_hash, blur_score, duplicate_of,
            is_screenshot, note, exif_removed, scanned_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(media_id) DO UPDATE SET
             sha256 = excluded.sha256,
             perceptual_hash = excluded.perceptual_hash,
             blur_score = excluded.blur_score,
             duplicate_of = excluded.duplicate_of,
             is_screenshot = excluded.is_screenshot,
             note = excluded.note,
             exif_removed = excluded.exif_removed,
             scanned_at = CURRENT_TIMESTAMP`,
        ).bind(
          text(item.mediaId, 80),
          text(item.sha256, 128) || null,
          text(item.perceptualHash, 128) || null,
          number(item.blurScore),
          text(item.duplicateOf, 80) || null,
          item.isScreenshot ? 1 : 0,
          text(item.note, 500),
          item.exifRemoved ? 1 : 0,
        ),
      );
      for (let index = 0; index < statements.length; index += 80) {
        await DB.batch(statements.slice(index, index + 80));
      }
      return Response.json({ count: statements.length });
    }

    if (action === "dashboard.save") {
      const layout = Array.isArray(payload.layout) ? payload.layout : [];
      await DB.prepare(
        `INSERT INTO dashboard_preferences (id, layout_json)
         VALUES ('default', ?)
         ON CONFLICT(id) DO UPDATE SET
           layout_json = excluded.layout_json,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(JSON.stringify(layout).slice(0, 30000))
        .run();
      return Response.json({ id: "default" });
    }

    if (action === "search.save") {
      const id = crypto.randomUUID();
      await DB.prepare(
        "INSERT INTO saved_searches (id, name, query_json) VALUES (?, ?, ?)",
      )
        .bind(
          id,
          text(payload.name, 120) || "未命名搜索",
          JSON.stringify(payload.query ?? {}).slice(0, 10000),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "collection.view.save") {
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO collection_views
         (id, collection_id, name, view_type, filter_json, sort_json, group_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.collectionId, 80),
          text(payload.name, 120) || "新的视图",
          text(payload.viewType, 30) || "table",
          JSON.stringify(payload.filter ?? {}).slice(0, 10000),
          JSON.stringify(payload.sort ?? {}).slice(0, 10000),
          text(payload.groupBy, 80),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "relation.create") {
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO life_relations
         (id, from_event_id, to_type, to_id, label)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.fromEventId, 80),
          text(payload.toType, 40),
          text(payload.toId, 100),
          text(payload.label, 100),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "import.commit") {
      const events = Array.isArray(payload.events)
        ? (payload.events as JsonObject[]).slice(0, 1000)
        : [];
      const schedules = Array.isArray(payload.schedules)
        ? (payload.schedules as JsonObject[]).slice(0, 1000)
        : [];
      const inbox = Array.isArray(payload.inbox)
        ? (payload.inbox as JsonObject[]).slice(0, 1000)
        : [];
      let imported = 0;
      const statements: D1PreparedStatement[] = [];
      for (const item of events) {
        statements.push(
          DB.prepare(
            `INSERT INTO life_events
             (id, title, content, kind, mood, energy, tags, person, place,
              project, happened_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            text(item.title, 200),
            text(item.content, 5000),
            text(item.kind, 30) || "导入",
            text(item.mood, 20) || "平静",
            number(item.energy, 1, 5) || 3,
            JSON.stringify(Array.isArray(item.tags) ? item.tags : []),
            text(item.person, 200),
            text(item.place, 200),
            text(item.project, 200),
            iso(item.happenedAt),
          ),
        );
        imported += 1;
      }
      for (const item of schedules) {
        const id = crypto.randomUUID();
        const startAt = iso(item.startAt);
        const endAt = iso(
          item.endAt,
          new Date(new Date(startAt).getTime() + 3600000),
        );
        statements.push(
          DB.prepare(
            `INSERT INTO schedule_events
             (id, title, category, start_at, end_at, place, note, repeat_rule,
              planned_minutes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            id,
            text(item.title, 200) || "导入日程",
            text(item.category, 30) || "生活",
            startAt,
            endAt,
            text(item.place, 200),
            text(item.note, 2000),
            text(item.repeatRule, 80) || "不重复",
            number(item.plannedMinutes) ||
              Math.max(
                0,
                Math.round(
                  (new Date(endAt).getTime() - new Date(startAt).getTime()) /
                    60000,
                ),
              ),
          ),
        );
        statements.push(
          DB.prepare(
            `INSERT INTO schedule_rule_settings
             (schedule_id, repeat_until, reminder_minutes)
             VALUES (?, ?, ?)`,
          ).bind(
            id,
            item.repeatUntil ? iso(item.repeatUntil) : null,
            number(item.reminderMinutes, 0, 1440) || 10,
          ),
        );
        imported += 1;
      }
      for (const item of inbox) {
        statements.push(
          DB.prepare(
            "INSERT INTO inbox_items (id, content, source_type) VALUES (?, ?, ?)",
          ).bind(
            crypto.randomUUID(),
            text(item.content, 5000),
            text(item.sourceType, 30) || "导入",
          ),
        );
        imported += 1;
      }
      for (let index = 0; index < statements.length; index += 80) {
        await DB.batch(statements.slice(index, index + 80));
      }
      const batchId = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO import_batches
         (id, source_type, filename, imported_count, skipped_count, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          batchId,
          text(payload.sourceType, 40) || "文件",
          text(payload.filename, 300),
          imported,
          number(payload.skipped),
          text(payload.note, 1000),
        )
        .run();
      await materializeScheduleInstances();
      return Response.json({ id: batchId, imported }, { status: 201 });
    }

    return Response.json({ error: "不支持的扩展操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "保存扩展工作台内容失败。",
      },
      { status: 500 },
    );
  }
}
