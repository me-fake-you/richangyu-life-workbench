import { ensureLifeSchema, getLifeBindings, safeJson } from "./life-store";

export type ScheduleTemplateRow = {
  id: string;
  title: string;
  category: string;
  start_at: string;
  end_at: string;
  status: string;
  repeat_rule: string;
  repeat_until: string | null;
  reminder_minutes: number | null;
  weekdays: string | null;
};

let advancedSchemaPromise: Promise<unknown> | null = null;

export async function ensureAdvancedSchema() {
  await ensureLifeSchema();
  if (advancedSchemaPromise) return advancedSchemaPromise;
  const { DB } = getLifeBindings();
  advancedSchemaPromise = DB.batch([
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS schedule_rule_settings (
        schedule_id TEXT PRIMARY KEY NOT NULL,
        repeat_until TEXT,
        reminder_minutes INTEGER NOT NULL DEFAULT 10,
        custom_interval INTEGER NOT NULL DEFAULT 1,
        custom_unit TEXT NOT NULL DEFAULT 'week',
        weekdays TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (schedule_id) REFERENCES schedule_events(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS schedule_instances (
        id TEXT PRIMARY KEY NOT NULL,
        schedule_id TEXT NOT NULL,
        occurrence_start TEXT NOT NULL,
        occurrence_end TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '计划中',
        actual_minutes INTEGER NOT NULL DEFAULT 0,
        actual_start_at TEXT,
        actual_end_at TEXT,
        interruption_reason TEXT NOT NULL DEFAULT '',
        reflection TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (schedule_id) REFERENCES schedule_events(id) ON DELETE CASCADE,
        UNIQUE(schedule_id, occurrence_start)
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS schedule_instances_start_idx ON schedule_instances(occurrence_start)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS schedule_exceptions (
        id TEXT PRIMARY KEY NOT NULL,
        schedule_id TEXT NOT NULL,
        occurrence_start TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '取消本次',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (schedule_id) REFERENCES schedule_events(id) ON DELETE CASCADE,
        UNIQUE(schedule_id, occurrence_start)
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT '个人目标',
        status TEXT NOT NULL DEFAULT '进行中',
        progress INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#76528b',
        start_at TEXT,
        target_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT,
        title TEXT NOT NULL,
        happened_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT NOT NULL DEFAULT '',
        action_type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY NOT NULL,
        automation_id TEXT NOT NULL,
        run_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        scheduled_for TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT,
        outcome_json TEXT NOT NULL DEFAULT '{}',
        error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
        UNIQUE (automation_id, run_key)
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS automation_runs_started_idx ON automation_runs(started_at)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS automation_messages (
        id TEXT PRIMARY KEY NOT NULL,
        automation_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'reminder',
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        action_target TEXT NOT NULL DEFAULT '',
        due_at TEXT NOT NULL,
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
        FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE,
        UNIQUE (run_id)
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS automation_messages_unread_idx ON automation_messages(read_at)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS generated_summaries (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        source_ids TEXT NOT NULL DEFAULT '[]',
        generated_by TEXT NOT NULL DEFAULT 'local',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(kind, period_start, period_end)
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS ai_tasks (
        id TEXT PRIMARY KEY NOT NULL,
        mode TEXT NOT NULL DEFAULT 'question',
        prompt TEXT NOT NULL DEFAULT '',
        start_at TEXT,
        end_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        answer TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        source_ids TEXT NOT NULL DEFAULT '[]',
        error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        finished_at TEXT
      )
    `),
    DB.prepare(
      `CREATE INDEX IF NOT EXISTS ai_tasks_status_created_idx
       ON ai_tasks(status, created_at)`,
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS photo_insights (
        media_id TEXT PRIMARY KEY NOT NULL,
        sha256 TEXT,
        perceptual_hash TEXT,
        blur_score REAL,
        duplicate_of TEXT,
        is_screenshot INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        exif_removed INTEGER NOT NULL DEFAULT 0,
        scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS photo_metadata (
        media_id TEXT PRIMARY KEY NOT NULL,
        caption TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        taken_at TEXT,
        place TEXT NOT NULL DEFAULT '',
        latitude REAL,
        longitude REAL,
        album TEXT NOT NULL DEFAULT '',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        cover_date TEXT,
        hidden_from_memories INTEGER NOT NULL DEFAULT 0,
        vision_provider TEXT NOT NULL DEFAULT '',
        vision_model TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS photo_metadata_taken_at_idx ON photo_metadata(taken_at)",
    ),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS photo_metadata_cover_date_idx ON photo_metadata(cover_date)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS photo_stories (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        cover_media_id TEXT,
        content TEXT NOT NULL,
        media_ids TEXT NOT NULL DEFAULT '[]',
        generated_by TEXT NOT NULL DEFAULT 'local',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(period_start, period_end),
        FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS inbox_attachments (
        id TEXT PRIMARY KEY NOT NULL,
        inbox_id TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inbox_id) REFERENCES inbox_items(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS photo_insights_sha_idx ON photo_insights(sha256)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY NOT NULL,
        source_type TEXT NOT NULL,
        filename TEXT NOT NULL DEFAULT '',
        imported_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT '已完成',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS backup_operations (
        id TEXT PRIMARY KEY NOT NULL,
        operation_type TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'metadata',
        filename TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'completed',
        table_count INTEGER NOT NULL DEFAULT 0,
        row_count INTEGER NOT NULL DEFAULT 0,
        file_count INTEGER NOT NULL DEFAULT 0,
        include_private INTEGER NOT NULL DEFAULT 0,
        strategy TEXT NOT NULL DEFAULT 'skip',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS backup_operations_created_at_idx ON backup_operations(created_at)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS meals (
        id TEXT PRIMARY KEY NOT NULL,
        meal_type TEXT NOT NULL DEFAULT '午餐',
        eaten_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        estimated_calories REAL NOT NULL DEFAULT 0,
        protein_g REAL NOT NULL DEFAULT 0,
        carbs_g REAL NOT NULL DEFAULT 0,
        fat_g REAL NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        analysis_provider TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS meals_eaten_at_idx ON meals(eaten_at)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS meal_items (
        id TEXT PRIMARY KEY NOT NULL,
        meal_id TEXT NOT NULL,
        name TEXT NOT NULL,
        portion TEXT NOT NULL DEFAULT '',
        calories REAL NOT NULL DEFAULT 0,
        protein_g REAL NOT NULL DEFAULT 0,
        carbs_g REAL NOT NULL DEFAULT 0,
        fat_g REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS meal_media (
        id TEXT PRIMARY KEY NOT NULL,
        meal_id TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS nutrition_settings (
        id TEXT PRIMARY KEY NOT NULL,
        calorie_target INTEGER NOT NULL DEFAULT 2000,
        protein_target INTEGER NOT NULL DEFAULT 90,
        carbs_target INTEGER NOT NULL DEFAULT 250,
        fat_target INTEGER NOT NULL DEFAULT 65,
        water_target INTEGER NOT NULL DEFAULT 8,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS water_logs (
        id TEXT PRIMARY KEY NOT NULL,
        glasses INTEGER NOT NULL DEFAULT 1,
        logged_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(
      `INSERT OR IGNORE INTO nutrition_settings
       (id, calorie_target, protein_target, carbs_target, fat_target, water_target)
       VALUES ('default', 2000, 90, 250, 65, 8)`,
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS dashboard_preferences (
        id TEXT PRIMARY KEY NOT NULL,
        layout_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS sync_preferences (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        device_id TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS saved_searches (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        query_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS collection_views (
        id TEXT PRIMARY KEY NOT NULL,
        collection_id TEXT NOT NULL,
        name TEXT NOT NULL,
        view_type TEXT NOT NULL DEFAULT 'table',
        filter_json TEXT NOT NULL DEFAULT '{}',
        sort_json TEXT NOT NULL DEFAULT '{}',
        group_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS life_relations (
        id TEXT PRIMARY KEY NOT NULL,
        from_event_id TEXT NOT NULL,
        to_type TEXT NOT NULL,
        to_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_event_id) REFERENCES life_events(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(
      `INSERT OR IGNORE INTO automations
       (id, name, trigger_type, trigger_value, action_type, enabled)
       VALUES ('auto-night-note', '每晚一句话日记', 'daily', '21:30', 'remind_journal', 1)`,
    ),
    DB.prepare(
      `INSERT OR IGNORE INTO automations
       (id, name, trigger_type, trigger_value, action_type, enabled)
       VALUES ('auto-daily-intelligence', '每日国内外热点简报', 'daily', '08:00', 'daily_intelligence_brief', 1)`,
    ),
    DB.prepare(
      `INSERT OR IGNORE INTO automations
       (id, name, trigger_type, trigger_value, action_type, enabled)
       VALUES ('auto-weekly-summary', '周日生成周报', 'weekly', '0@20:30', 'weekly_summary', 1)`,
    ),
    DB.prepare(
      `INSERT OR IGNORE INTO automations
       (id, name, trigger_type, trigger_value, action_type, enabled)
       VALUES ('auto-monthly-story', '月末照片故事', 'monthly', 'last@21:00', 'monthly_summary', 1)`,
    ),
    DB.prepare(
      `INSERT OR IGNORE INTO automations
       (id, name, trigger_type, trigger_value, action_type, enabled)
       VALUES ('auto-schedule-reminder', '日程开始前提醒', 'schedule', '10', 'schedule_notification', 1)`,
    ),
    DB.prepare(
      `INSERT OR IGNORE INTO automations
       (id, name, trigger_type, trigger_value, action_type, enabled)
       VALUES ('auto-photo-caption', '新照片补充文字', 'upload', 'photo', 'photo_caption_prompt', 1)`,
    ),
    DB.prepare(
      `INSERT OR IGNORE INTO automations
       (id, name, trigger_type, trigger_value, action_type, enabled)
       VALUES ('auto-return-gently', '长期未记录温和提醒', 'inactive', '7d', 'return_reminder', 1)`,
    ),
  ]);
  return advancedSchemaPromise;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function addMonths(date: Date, amount: number) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + amount);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

function advanceOccurrence(date: Date, rule: string, interval: number) {
  if (rule === "自定义") return addDays(date, 7 * interval);
  if (rule === "每天" || rule === "工作日") return addDays(date, interval);
  if (rule === "每月") return addMonths(date, interval);
  if (rule === "单周" || rule === "双周") return addDays(date, 14 * interval);
  return addDays(date, 7 * interval);
}

function shouldIncludeOccurrence(date: Date, rule: string) {
  if (rule !== "工作日") return true;
  const weekday = date.getDay();
  return weekday !== 0 && weekday !== 6;
}

export async function materializeScheduleInstances(
  rangeStart = new Date(Date.now() - 120 * 86400000),
  rangeEnd = new Date(Date.now() + 400 * 86400000),
) {
  await ensureAdvancedSchema();
  const { DB } = getLifeBindings();
  const templates = await DB.prepare(
    `SELECT se.id, se.title, se.category, se.start_at, se.end_at, se.status,
            se.repeat_rule, srs.repeat_until, srs.reminder_minutes,
            srs.custom_interval, srs.custom_unit, srs.weekdays
     FROM schedule_events se
     LEFT JOIN schedule_rule_settings srs ON srs.schedule_id = se.id
     ORDER BY se.start_at ASC`,
  ).all<
    ScheduleTemplateRow & {
      custom_interval: number | null;
      custom_unit: string | null;
    }
  >();
  const exceptionRows = await DB.prepare(
    "SELECT schedule_id, occurrence_start FROM schedule_exceptions",
  ).all<{ schedule_id: string; occurrence_start: string }>();
  const exceptionKeys = new Set(
    exceptionRows.results.map(
      (row) => `${row.schedule_id}::${row.occurrence_start}`,
    ),
  );
  const isException = (scheduleId: string, occurrenceStart: string) =>
    exceptionKeys.has(`${scheduleId}::${occurrenceStart}`);

  const statements: D1PreparedStatement[] = [];
  for (const template of templates.results) {
    const originalStart = new Date(template.start_at);
    const originalEnd = new Date(template.end_at);
    if (Number.isNaN(originalStart.getTime()) || Number.isNaN(originalEnd.getTime())) {
      continue;
    }
    const duration = Math.max(60000, originalEnd.getTime() - originalStart.getTime());
    const rule = template.repeat_rule || "不重复";
    const interval = Math.max(1, Number(template.custom_interval) || 1);
    const selectedWeekdays = safeJson<number[]>(
      String(template.weekdays ?? "[]"),
      [],
    )
      .map(Number)
      .filter((day) => day >= 0 && day <= 6);
    const hardEnd = template.repeat_until
      ? new Date(template.repeat_until)
      : rangeEnd;
    const until = hardEnd < rangeEnd ? hardEnd : rangeEnd;
    let cursor = new Date(originalStart);
    let safety = 0;

    if (rule === "不重复") {
      if (
        cursor >= rangeStart &&
        cursor <= rangeEnd &&
        !isException(template.id, cursor.toISOString())
      ) {
        statements.push(
          DB.prepare(
            `INSERT OR IGNORE INTO schedule_instances
             (id, schedule_id, occurrence_start, occurrence_end, status,
              actual_minutes)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            template.id,
            cursor.toISOString(),
            new Date(cursor.getTime() + duration).toISOString(),
            template.status || "计划中",
            0,
          ),
        );
      }
      continue;
    }

    if (rule === "每周" && selectedWeekdays.length) {
      const anchorDay = new Date(originalStart);
      anchorDay.setHours(0, 0, 0, 0);
      while (cursor < rangeStart && safety < 10000) {
        cursor = addDays(cursor, 1);
        safety += 1;
      }
      while (cursor <= until && safety < 11000) {
        const cursorDay = new Date(cursor);
        cursorDay.setHours(0, 0, 0, 0);
        const weekIndex = Math.floor(
          (cursorDay.getTime() - anchorDay.getTime()) / (7 * 86400000),
        );
        if (
          weekIndex >= 0 &&
          weekIndex % interval === 0 &&
          selectedWeekdays.includes(cursor.getDay()) &&
          !isException(template.id, cursor.toISOString())
        ) {
          statements.push(
            DB.prepare(
              `INSERT OR IGNORE INTO schedule_instances
               (id, schedule_id, occurrence_start, occurrence_end)
               VALUES (?, ?, ?, ?)`,
            ).bind(
              crypto.randomUUID(),
              template.id,
              cursor.toISOString(),
              new Date(cursor.getTime() + duration).toISOString(),
            ),
          );
        }
        cursor = addDays(cursor, 1);
        safety += 1;
      }
      continue;
    }

    while (cursor < rangeStart && safety < 10000) {
      cursor =
        rule === "自定义" && template.custom_unit === "day"
          ? addDays(cursor, interval)
          : rule === "自定义" && template.custom_unit === "month"
            ? addMonths(cursor, interval)
            : advanceOccurrence(cursor, rule, interval);
      safety += 1;
    }
    while (cursor <= until && safety < 11000) {
      if (
        shouldIncludeOccurrence(cursor, rule) &&
        !isException(template.id, cursor.toISOString())
      ) {
        statements.push(
          DB.prepare(
            `INSERT OR IGNORE INTO schedule_instances
             (id, schedule_id, occurrence_start, occurrence_end)
             VALUES (?, ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            template.id,
            cursor.toISOString(),
            new Date(cursor.getTime() + duration).toISOString(),
          ),
        );
      }
      cursor =
        rule === "自定义" && template.custom_unit === "day"
          ? addDays(cursor, interval)
          : rule === "自定义" && template.custom_unit === "month"
            ? addMonths(cursor, interval)
            : advanceOccurrence(cursor, rule, interval);
      safety += 1;
    }
  }

  for (let index = 0; index < statements.length; index += 80) {
    await DB.batch(statements.slice(index, index + 80));
  }
  return statements.length;
}

export function parseStoredJson<T>(value: unknown, fallback: T): T {
  return safeJson(String(value ?? ""), fallback);
}
