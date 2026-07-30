import { generateDailyIntelligenceBrief } from "./intelligence-briefing";
import { ensureIntelligenceSchema } from "./intelligence-store";

type AutomationRow = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_value: string;
  action_type: string;
  last_run_at: string | null;
  next_run_at: string | null;
};

type SummaryCreator = (
  kind: string,
  periodStart: string,
  periodEnd: string,
  title: string,
) => Promise<{ id: string; content: string }>;

type AutomationNotification = {
  id: string;
  title: string;
  body: string;
  actionTarget: string;
  dueAt: string;
};

type EngineResult = {
  checkedAt: string;
  executed: string[];
  generated: string[];
  skipped: string[];
  failed: Array<{ automationId: string; error: string }>;
  notifications: AutomationNotification[];
};

const DAY = 86_400_000;

function safeOffset(value: number) {
  return Number.isFinite(value)
    ? Math.max(-840, Math.min(840, Math.round(value)))
    : 0;
}

function localClock(date: Date, offsetMinutes: number) {
  return new Date(date.getTime() - offsetMinutes * 60_000);
}

function localDateToUtc(
  year: number,
  month: number,
  day: number,
  offsetMinutes: number,
  hour = 0,
  minute = 0,
) {
  return new Date(
    Date.UTC(year, month, day, hour, minute) + offsetMinutes * 60_000,
  );
}

function parseClock(value: string, fallback = "00:00") {
  const clock = /^\d{1,2}:\d{2}$/.test(value) ? value : fallback;
  const [rawHour, rawMinute] = clock.split(":").map(Number);
  return {
    hour: Math.max(0, Math.min(23, rawHour || 0)),
    minute: Math.max(0, Math.min(59, rawMinute || 0)),
  };
}

function localDateKey(date: Date, offsetMinutes: number) {
  const local = localClock(date, offsetMinutes);
  return [
    local.getUTCFullYear(),
    String(local.getUTCMonth() + 1).padStart(2, "0"),
    String(local.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function dailyOccurrence(
  now: Date,
  offsetMinutes: number,
  triggerValue: string,
) {
  const local = localClock(now, offsetMinutes);
  const { hour, minute } = parseClock(triggerValue, "21:30");
  const scheduledFor = localDateToUtc(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    offsetMinutes,
    hour,
    minute,
  );
  const nextRunAt =
    now.getTime() < scheduledFor.getTime()
      ? scheduledFor
      : new Date(scheduledFor.getTime() + DAY);
  const dayStart = localDateToUtc(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    offsetMinutes,
  );
  return {
    due: now.getTime() >= scheduledFor.getTime(),
    scheduledFor,
    nextRunAt,
    periodStart: dayStart,
    periodEnd: new Date(dayStart.getTime() + DAY),
    runKey: `daily:${localDateKey(scheduledFor, offsetMinutes)}`,
  };
}

function weeklyOccurrence(
  now: Date,
  offsetMinutes: number,
  triggerValue: string,
) {
  const local = localClock(now, offsetMinutes);
  const [rawWeekday = "0", rawClock = "20:30"] = triggerValue.split("@");
  const triggerWeekday = Math.max(0, Math.min(6, Number(rawWeekday) || 0));
  const { hour, minute } = parseClock(rawClock, "20:30");
  let delta = (local.getUTCDay() - triggerWeekday + 7) % 7;
  let scheduledFor = localDateToUtc(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - delta,
    offsetMinutes,
    hour,
    minute,
  );
  if (scheduledFor.getTime() > now.getTime()) {
    delta += 7;
    scheduledFor = localDateToUtc(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() - delta,
      offsetMinutes,
      hour,
      minute,
    );
  }
  const scheduledLocal = localClock(scheduledFor, offsetMinutes);
  const mondayDelta = (scheduledLocal.getUTCDay() + 6) % 7;
  const periodStart = localDateToUtc(
    scheduledLocal.getUTCFullYear(),
    scheduledLocal.getUTCMonth(),
    scheduledLocal.getUTCDate() - mondayDelta,
    offsetMinutes,
  );
  return {
    due: now.getTime() - scheduledFor.getTime() <= 8 * DAY,
    scheduledFor,
    nextRunAt: new Date(scheduledFor.getTime() + 7 * DAY),
    periodStart,
    periodEnd: scheduledFor,
    runKey: `weekly:${localDateKey(scheduledFor, offsetMinutes)}`,
  };
}

function monthOccurrenceAt(
  year: number,
  month: number,
  offsetMinutes: number,
  rule: string,
  hour: number,
  minute: number,
) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const requested = rule === "last" ? lastDay : Number(rule) || lastDay;
  const day = Math.max(1, Math.min(lastDay, requested));
  return localDateToUtc(year, month, day, offsetMinutes, hour, minute);
}

function monthlyOccurrence(
  now: Date,
  offsetMinutes: number,
  triggerValue: string,
) {
  const local = localClock(now, offsetMinutes);
  const [rule = "last", rawClock = "21:00"] = triggerValue.split("@");
  const { hour, minute } = parseClock(rawClock, "21:00");
  let year = local.getUTCFullYear();
  let month = local.getUTCMonth();
  let scheduledFor = monthOccurrenceAt(
    year,
    month,
    offsetMinutes,
    rule,
    hour,
    minute,
  );
  if (scheduledFor.getTime() > now.getTime()) {
    month -= 1;
    if (month < 0) {
      year -= 1;
      month = 11;
    }
    scheduledFor = monthOccurrenceAt(
      year,
      month,
      offsetMinutes,
      rule,
      hour,
      minute,
    );
  }
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 11) {
    nextYear += 1;
    nextMonth = 0;
  }
  return {
    due: now.getTime() - scheduledFor.getTime() <= 40 * DAY,
    scheduledFor,
    nextRunAt: monthOccurrenceAt(
      nextYear,
      nextMonth,
      offsetMinutes,
      rule,
      hour,
      minute,
    ),
    periodStart: localDateToUtc(year, month, 1, offsetMinutes),
    periodEnd: scheduledFor,
    runKey: `monthly:${year}-${String(month + 1).padStart(2, "0")}`,
    year,
    month,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 1000)
    : String(error).slice(0, 1000);
}

async function updateNextRun(
  DB: D1Database,
  automationId: string,
  nextRunAt: Date | null,
) {
  await DB.prepare(
    `UPDATE automations
     SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(nextRunAt?.toISOString() ?? null, automationId)
    .run();
}

async function claimRun(
  DB: D1Database,
  automationId: string,
  runKey: string,
  scheduledFor: Date,
  now: Date,
) {
  const id = crypto.randomUUID();
  const inserted = await DB.prepare(
    `INSERT INTO automation_runs
     (id, automation_id, run_key, status, scheduled_for, started_at)
     VALUES (?, ?, ?, 'running', ?, ?)
     ON CONFLICT(automation_id, run_key) DO NOTHING`,
  )
    .bind(
      id,
      automationId,
      runKey,
      scheduledFor.toISOString(),
      now.toISOString(),
    )
    .run();
  if (Number(inserted.meta.changes ?? 0) > 0) return id;

  const existing = await DB.prepare(
    `SELECT id, status, started_at
     FROM automation_runs
     WHERE automation_id = ? AND run_key = ?`,
  )
    .bind(automationId, runKey)
    .first<{ id: string; status: string; started_at: string }>();
  if (!existing) return null;
  const startedAt = new Date(existing.started_at).getTime();
  const stale =
    existing.status === "running" &&
    (!Number.isFinite(startedAt) || now.getTime() - startedAt > 5 * 60_000);
  if (existing.status !== "failed" && !stale) return null;
  const reclaimed = await DB.prepare(
    `UPDATE automation_runs
     SET status = 'running', started_at = ?, finished_at = NULL,
         outcome_json = '{}', error = ''
     WHERE id = ? AND status = ? AND started_at = ?`,
  )
    .bind(now.toISOString(), existing.id, existing.status, existing.started_at)
    .run();
  return Number(reclaimed.meta.changes ?? 0) > 0 ? existing.id : null;
}

async function finishRun(
  DB: D1Database,
  runId: string,
  automationId: string,
  now: Date,
  nextRunAt: Date | null,
  outcome: Record<string, unknown>,
) {
  await DB.batch([
    DB.prepare(
      `UPDATE automation_runs
       SET status = 'succeeded', finished_at = ?, outcome_json = ?, error = ''
       WHERE id = ?`,
    ).bind(now.toISOString(), JSON.stringify(outcome), runId),
    DB.prepare(
      `UPDATE automations
       SET last_run_at = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(now.toISOString(), nextRunAt?.toISOString() ?? null, automationId),
  ]);
}

async function failRun(
  DB: D1Database,
  runId: string,
  automationId: string,
  now: Date,
  nextRunAt: Date | null,
  error: unknown,
) {
  const message = errorMessage(error);
  await DB.batch([
    DB.prepare(
      `UPDATE automation_runs
       SET status = 'failed', finished_at = ?, error = ?
       WHERE id = ?`,
    ).bind(now.toISOString(), message, runId),
    DB.prepare(
      `UPDATE automations
       SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(nextRunAt?.toISOString() ?? null, automationId),
  ]);
  return message;
}

async function createMessage(
  DB: D1Database,
  automationId: string,
  runId: string,
  kind: string,
  title: string,
  body: string,
  actionTarget: string,
  dueAt: Date,
) {
  const id = crypto.randomUUID();
  await DB.prepare(
    `INSERT INTO automation_messages
     (id, automation_id, run_id, kind, title, body, action_target, due_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id) DO NOTHING`,
  )
    .bind(
      id,
      automationId,
      runId,
      kind,
      title,
      body,
      actionTarget,
      dueAt.toISOString(),
    )
    .run();
  const persisted = await DB.prepare(
    "SELECT id FROM automation_messages WHERE run_id = ?",
  )
    .bind(runId)
    .first<{ id: string }>();
  return {
    id: persisted?.id ?? id,
    title,
    body,
    actionTarget,
    dueAt: dueAt.toISOString(),
  };
}

async function createMonthlyPhotoStory(
  DB: D1Database,
  periodStart: string,
  periodEnd: string,
  title: string,
) {
  const photos = await DB.prepare(
    `SELECT m.id, le.title, le.content, le.happened_at,
            COALESCE(pm.caption, '') AS caption
     FROM media m
     JOIN life_events le ON le.id = m.event_id
     LEFT JOIN photo_metadata pm ON pm.media_id = m.id
     WHERE le.deleted_at IS NULL AND le.is_private = 0
       AND m.content_type LIKE 'image/%'
       AND COALESCE(pm.hidden_from_memories, 0) = 0
       AND le.happened_at >= ? AND le.happened_at < ?
     ORDER BY le.happened_at ASC
     LIMIT 120`,
  )
    .bind(periodStart, periodEnd)
    .all<{
      id: string;
      title: string;
      content: string;
      happened_at: string;
      caption: string;
    }>();
  if (!photos.results.length) return null;
  const mediaIds = photos.results.map((photo) => photo.id);
  const moments = photos.results
    .filter((photo) => photo.caption || photo.title || photo.content)
    .slice(0, 12)
    .map((photo) => {
      const copy = photo.caption || photo.title || photo.content;
      return `· ${copy.trim().slice(0, 90)}`;
    });
  const content = [
    `这个月保存了 ${photos.results.length} 张生活照片。`,
    moments.length ? moments.join("\n") : "照片已经替你保留了当时的光线与场景。",
  ].join("\n\n");
  const id = crypto.randomUUID();
  await DB.prepare(
    `INSERT INTO photo_stories
     (id, title, period_start, period_end, cover_media_id, content,
      media_ids, generated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'automation')
     ON CONFLICT(period_start, period_end) DO UPDATE SET
       title = excluded.title,
       cover_media_id = excluded.cover_media_id,
       content = excluded.content,
       media_ids = excluded.media_ids,
       generated_by = excluded.generated_by,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      id,
      `${title} · 照片故事`,
      periodStart,
      periodEnd,
      mediaIds[0],
      content,
      JSON.stringify(mediaIds),
    )
    .run();
  const persisted = await DB.prepare(
    `SELECT id FROM photo_stories
     WHERE period_start = ? AND period_end = ?`,
  )
    .bind(periodStart, periodEnd)
    .first<{ id: string }>();
  return { id: persisted?.id ?? id, photoCount: mediaIds.length };
}

async function runSummaryAutomation(
  DB: D1Database,
  automation: AutomationRow,
  now: Date,
  offsetMinutes: number,
  createSummary: SummaryCreator,
  result: EngineResult,
) {
  const monthly = automation.action_type === "monthly_summary";
  const window = monthly
    ? monthlyOccurrence(now, offsetMinutes, automation.trigger_value)
    : weeklyOccurrence(now, offsetMinutes, automation.trigger_value);
  await updateNextRun(DB, automation.id, window.nextRunAt);
  if (!window.due) {
    result.skipped.push(automation.id);
    return;
  }
  const runId = await claimRun(
    DB,
    automation.id,
    window.runKey,
    window.scheduledFor,
    now,
  );
  if (!runId) {
    result.skipped.push(automation.id);
    return;
  }
  try {
    const localStart = localClock(window.periodStart, offsetMinutes);
    const kind = monthly ? "月报" : "周报";
    const title = monthly
      ? `${localStart.getUTCFullYear()}年${localStart.getUTCMonth() + 1}月回顾`
      : `${localStart.getUTCMonth() + 1}月${localStart.getUTCDate()}日这一周`;
    const summary = await createSummary(
      kind,
      window.periodStart.toISOString(),
      window.periodEnd.toISOString(),
      title,
    );
    const photoStory = monthly
      ? await createMonthlyPhotoStory(
          DB,
          window.periodStart.toISOString(),
          window.periodEnd.toISOString(),
          title,
        )
      : null;
    const notification = await createMessage(
      DB,
      automation.id,
      runId,
      "summary",
      monthly && photoStory ? "月报与照片故事已生成" : `${kind}已生成`,
      monthly && photoStory
        ? `已整理 ${photoStory.photoCount} 张照片，并保存可回溯的月度总结。`
        : "已保存到长期回顾中心，可从结论点回原始记录。",
      "review",
      now,
    );
    await finishRun(DB, runId, automation.id, now, window.nextRunAt, {
      summaryId: summary.id,
      kind,
      photoStoryId: photoStory?.id ?? null,
      photoCount: photoStory?.photoCount ?? 0,
    });
    result.generated.push(
      monthly && photoStory ? "月报与照片故事" : kind,
    );
    result.executed.push(automation.id);
    result.notifications.push(notification);
  } catch (error) {
    result.failed.push({
      automationId: automation.id,
      error: await failRun(
        DB,
        runId,
        automation.id,
        now,
        window.nextRunAt,
        error,
      ),
    });
  }
}

async function runDailyJournalAutomation(
  DB: D1Database,
  automation: AutomationRow,
  now: Date,
  offsetMinutes: number,
  result: EngineResult,
) {
  const occurrence = dailyOccurrence(
    now,
    offsetMinutes,
    automation.trigger_value,
  );
  await updateNextRun(DB, automation.id, occurrence.nextRunAt);
  if (!occurrence.due) {
    result.skipped.push(automation.id);
    return;
  }
  const runId = await claimRun(
    DB,
    automation.id,
    occurrence.runKey,
    occurrence.scheduledFor,
    now,
  );
  if (!runId) {
    result.skipped.push(automation.id);
    return;
  }
  try {
    const recorded = await DB.prepare(
      `SELECT COUNT(*) AS count
       FROM life_events
       WHERE deleted_at IS NULL AND is_private = 0
         AND happened_at >= ? AND happened_at < ?`,
    )
      .bind(
        occurrence.periodStart.toISOString(),
        occurrence.periodEnd.toISOString(),
      )
      .first<{ count: number }>();
    if (Number(recorded?.count ?? 0) === 0) {
      result.notifications.push(
        await createMessage(
          DB,
          automation.id,
          runId,
          "journal",
          "留下一句今天",
          "不必完整，写下一句话或放一张照片，就能把今天保存下来。",
          "today",
          now,
        ),
      );
    }
    await finishRun(DB, runId, automation.id, now, occurrence.nextRunAt, {
      alreadyRecorded: Number(recorded?.count ?? 0) > 0,
    });
    result.executed.push(automation.id);
  } catch (error) {
    result.failed.push({
      automationId: automation.id,
      error: await failRun(
        DB,
        runId,
        automation.id,
        now,
        occurrence.nextRunAt,
        error,
      ),
    });
  }
}

async function runDailyIntelligenceAutomation(
  DB: D1Database,
  automation: AutomationRow,
  now: Date,
  offsetMinutes: number,
  result: EngineResult,
) {
  const occurrence = dailyOccurrence(
    now,
    offsetMinutes,
    automation.trigger_value,
  );
  await updateNextRun(DB, automation.id, occurrence.nextRunAt);
  if (!occurrence.due) {
    result.skipped.push(automation.id);
    return;
  }
  const runId = await claimRun(
    DB,
    automation.id,
    `intelligence:${localDateKey(now, offsetMinutes)}`,
    occurrence.scheduledFor,
    now,
  );
  if (!runId) {
    result.skipped.push(automation.id);
    return;
  }
  try {
    const brief = await generateDailyIntelligenceBrief(DB, {
      timezoneOffset: offsetMinutes,
      refresh: true,
    });
    result.notifications.push(
      await createMessage(
        DB,
        automation.id,
        runId,
        "intelligence",
        "国内外热点已更新",
        `收录国内 ${brief.domesticCount} 条、国际 ${brief.internationalCount} 条，已生成来源可追溯的今日简报。`,
        "intelligence",
        now,
      ),
    );
    await finishRun(DB, runId, automation.id, now, occurrence.nextRunAt, {
      briefId: brief.id,
      generatedBy: brief.generatedBy,
      domesticCount: brief.domesticCount,
      internationalCount: brief.internationalCount,
      sourceIds: brief.sourceIds,
    });
    result.generated.push("国内外热点");
    result.executed.push(automation.id);
  } catch (error) {
    result.failed.push({
      automationId: automation.id,
      error: await failRun(
        DB,
        runId,
        automation.id,
        now,
        occurrence.nextRunAt,
        error,
      ),
    });
  }
}

async function runScheduleReminders(
  DB: D1Database,
  automation: AutomationRow,
  now: Date,
  result: EngineResult,
) {
  const rows = await DB.prepare(
    `SELECT si.id, si.occurrence_start, se.title, se.place,
            COALESCE(srs.reminder_minutes, ?) AS reminder_minutes
     FROM schedule_instances si
     JOIN schedule_events se ON se.id = si.schedule_id
     LEFT JOIN schedule_rule_settings srs ON srs.schedule_id = se.id
     WHERE si.occurrence_start >= ? AND si.occurrence_start <= ?
       AND si.status NOT IN ('已完成', '已取消')
     ORDER BY si.occurrence_start ASC
     LIMIT 100`,
  )
    .bind(
      Math.max(0, Math.min(1440, Number(automation.trigger_value) || 10)),
      new Date(now.getTime() - 60 * 60_000).toISOString(),
      new Date(now.getTime() + 2 * DAY).toISOString(),
    )
    .all<{
      id: string;
      occurrence_start: string;
      title: string;
      place: string;
      reminder_minutes: number;
    }>();
  let nextRunAt: Date | null = null;
  for (const row of rows.results) {
    const startsAt = new Date(row.occurrence_start);
    const reminderAt = new Date(
      startsAt.getTime() - Math.max(0, row.reminder_minutes) * 60_000,
    );
    if (reminderAt.getTime() > now.getTime()) {
      if (!nextRunAt || reminderAt.getTime() < nextRunAt.getTime()) {
        nextRunAt = reminderAt;
      }
      continue;
    }
    if (startsAt.getTime() < now.getTime() - 60 * 60_000) continue;
    const runId = await claimRun(
      DB,
      automation.id,
      `schedule:${row.id}:${row.occurrence_start}`,
      reminderAt,
      now,
    );
    if (!runId) continue;
    try {
      const minutesUntil = Math.max(
        0,
        Math.ceil((startsAt.getTime() - now.getTime()) / 60_000),
      );
      const timing =
        minutesUntil > 0 ? `${minutesUntil} 分钟后开始` : "已到开始时间";
      result.notifications.push(
        await createMessage(
          DB,
          automation.id,
          runId,
          "schedule",
          row.title,
          row.place ? `${timing} · ${row.place}` : timing,
          "schedule",
          now,
        ),
      );
      await finishRun(DB, runId, automation.id, now, nextRunAt, {
        scheduleInstanceId: row.id,
      });
      result.executed.push(`${automation.id}:${row.id}`);
    } catch (error) {
      result.failed.push({
        automationId: automation.id,
        error: await failRun(
          DB,
          runId,
          automation.id,
          now,
          nextRunAt,
          error,
        ),
      });
    }
  }
  await updateNextRun(
    DB,
    automation.id,
    nextRunAt ?? new Date(now.getTime() + 12 * 60 * 60_000),
  );
  if (!rows.results.length) result.skipped.push(automation.id);
}

async function runPhotoPrompts(
  DB: D1Database,
  automation: AutomationRow,
  now: Date,
  result: EngineResult,
) {
  const rows = await DB.prepare(
    `SELECT m.id, m.filename, m.created_at
     FROM media m
     JOIN life_events le ON le.id = m.event_id
     LEFT JOIN photo_metadata pm ON pm.media_id = m.id
     WHERE le.deleted_at IS NULL AND le.is_private = 0
       AND m.content_type LIKE 'image/%'
       AND COALESCE(pm.caption, '') = ''
       AND m.created_at >= ?
     ORDER BY m.created_at DESC
     LIMIT 20`,
  )
    .bind(new Date(now.getTime() - 30 * DAY).toISOString())
    .all<{ id: string; filename: string; created_at: string }>();
  for (const row of rows.results) {
    const runId = await claimRun(
      DB,
      automation.id,
      `photo:${row.id}`,
      new Date(row.created_at),
      now,
    );
    if (!runId) continue;
    try {
      result.notifications.push(
        await createMessage(
          DB,
          automation.id,
          runId,
          "photo",
          "给这张照片补一句话",
          row.filename || "一张还没有说明的生活照片",
          "photos",
          now,
        ),
      );
      await finishRun(
        DB,
        runId,
        automation.id,
        now,
        new Date(now.getTime() + DAY),
        { mediaId: row.id },
      );
      result.executed.push(`${automation.id}:${row.id}`);
    } catch (error) {
      result.failed.push({
        automationId: automation.id,
        error: await failRun(
          DB,
          runId,
          automation.id,
          now,
          new Date(now.getTime() + DAY),
          error,
        ),
      });
    }
  }
  await updateNextRun(DB, automation.id, new Date(now.getTime() + DAY));
  if (!rows.results.length) result.skipped.push(automation.id);
}

async function runInactiveReminder(
  DB: D1Database,
  automation: AutomationRow,
  now: Date,
  offsetMinutes: number,
  result: EngineResult,
) {
  const parsedDays = Number.parseInt(automation.trigger_value, 10);
  const inactiveDays = Math.max(1, Math.min(365, parsedDays || 7));
  const latest = await DB.prepare(
    `SELECT MAX(happened_at) AS happened_at
     FROM life_events
     WHERE deleted_at IS NULL AND is_private = 0`,
  ).first<{ happened_at: string | null }>();
  const happenedAt = latest?.happened_at
    ? new Date(latest.happened_at)
    : null;
  const due =
    happenedAt &&
    now.getTime() - happenedAt.getTime() >= inactiveDays * DAY;
  const nextRunAt = happenedAt
    ? new Date(happenedAt.getTime() + inactiveDays * DAY)
    : new Date(now.getTime() + DAY);
  await updateNextRun(DB, automation.id, nextRunAt);
  if (!due) {
    result.skipped.push(automation.id);
    return;
  }
  const runId = await claimRun(
    DB,
    automation.id,
    `inactive:${localDateKey(now, offsetMinutes)}`,
    now,
    now,
  );
  if (!runId) {
    result.skipped.push(automation.id);
    return;
  }
  try {
    result.notifications.push(
      await createMessage(
        DB,
        automation.id,
        runId,
        "return",
        "从今天重新开始也很好",
        "不用补齐空白，写一句此刻的感受就可以。",
        "today",
        now,
      ),
    );
    await finishRun(
      DB,
      runId,
      automation.id,
      now,
      new Date(now.getTime() + DAY),
      { inactiveDays },
    );
    result.executed.push(automation.id);
  } catch (error) {
    result.failed.push({
      automationId: automation.id,
      error: await failRun(
        DB,
        runId,
        automation.id,
        now,
        new Date(now.getTime() + DAY),
        error,
      ),
    });
  }
}

export async function runAutomationEngine({
  DB,
  now = new Date(),
  timezoneOffset = 0,
  createSummary,
}: {
  DB: D1Database;
  now?: Date;
  timezoneOffset?: number;
  createSummary: SummaryCreator;
}): Promise<EngineResult> {
  const offsetMinutes = safeOffset(timezoneOffset);
  await ensureIntelligenceSchema();
  const enabled = await DB.prepare(
    `SELECT id, name, action_type, trigger_type, trigger_value,
            last_run_at, next_run_at
     FROM automations
     WHERE enabled = 1
     ORDER BY created_at ASC`,
  ).all<AutomationRow>();
  const result: EngineResult = {
    checkedAt: now.toISOString(),
    executed: [],
    generated: [],
    skipped: [],
    failed: [],
    notifications: [],
  };

  for (const automation of enabled.results) {
    if (
      automation.action_type === "weekly_summary" ||
      automation.action_type === "monthly_summary"
    ) {
      await runSummaryAutomation(
        DB,
        automation,
        now,
        offsetMinutes,
        createSummary,
        result,
      );
    } else if (automation.action_type === "remind_journal") {
      await runDailyJournalAutomation(
        DB,
        automation,
        now,
        offsetMinutes,
        result,
      );
    } else if (automation.action_type === "daily_intelligence_brief") {
      await runDailyIntelligenceAutomation(
        DB,
        automation,
        now,
        offsetMinutes,
        result,
      );
    } else if (automation.action_type === "schedule_notification") {
      await runScheduleReminders(DB, automation, now, result);
    } else if (automation.action_type === "photo_caption_prompt") {
      await runPhotoPrompts(DB, automation, now, result);
    } else if (automation.action_type === "return_reminder") {
      await runInactiveReminder(
        DB,
        automation,
        now,
        offsetMinutes,
        result,
      );
    } else {
      result.skipped.push(automation.id);
    }
  }
  return result;
}
