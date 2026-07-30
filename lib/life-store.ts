import { env } from "cloudflare:workers";

export type LifeBindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
};

export function getLifeBindings(): LifeBindings {
  const bindings = env as unknown as Partial<LifeBindings>;
  if (!bindings.DB || !bindings.MEDIA) {
    throw new Error("生活工作台的数据空间尚未连接。");
  }
  return bindings as LifeBindings;
}

let schemaPromise: Promise<unknown> | null = null;

export function ensureLifeSchema() {
  if (schemaPromise) return schemaPromise;
  const { DB } = getLifeBindings();
  const createPromise = DB.batch([
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS life_events (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT '生活',
        mood TEXT NOT NULL DEFAULT '平静',
        energy INTEGER NOT NULL DEFAULT 3,
        tags TEXT NOT NULL DEFAULT '[]',
        person TEXT NOT NULL DEFAULT '',
        place TEXT NOT NULL DEFAULT '',
        project TEXT NOT NULL DEFAULT '',
        is_private INTEGER NOT NULL DEFAULT 0,
        record_status TEXT NOT NULL DEFAULT 'published',
        revision INTEGER NOT NULL DEFAULT 1,
        happened_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS life_events_happened_at_idx ON life_events(happened_at)",
    ),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS life_events_kind_idx ON life_events(kind)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS life_event_versions (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL DEFAULT '{}',
        change_note TEXT NOT NULL DEFAULT '',
        device_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES life_events(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS life_event_versions_event_revision_unique
       ON life_event_versions(event_id, revision)`,
    ),
    DB.prepare(
      `CREATE INDEX IF NOT EXISTS life_event_versions_created_idx
       ON life_event_versions(created_at)`,
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS record_drafts (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT,
        draft_json TEXT NOT NULL DEFAULT '{}',
        device_id TEXT NOT NULL DEFAULT '',
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES life_events(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(
      `CREATE INDEX IF NOT EXISTS record_drafts_updated_idx
       ON record_drafts(updated_at)`,
    ),
    DB.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS record_drafts_event_device_unique
       ON record_drafts(event_id, device_id)`,
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS client_mutations (
        id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL DEFAULT '',
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        base_revision INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'processed',
        result_revision INTEGER NOT NULL DEFAULT 0,
        error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processed_at TEXT
      )
    `),
    DB.prepare(
      `CREATE INDEX IF NOT EXISTS client_mutations_device_created_idx
       ON client_mutations(device_id, created_at)`,
    ),
    DB.prepare(
      `CREATE INDEX IF NOT EXISTS client_mutations_status_idx
       ON client_mutations(status)`,
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL DEFAULT '',
        device_id TEXT NOT NULL DEFAULT '',
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(
      `CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
       ON audit_logs(entity_type, entity_id)`,
    ),
    DB.prepare(
      `CREATE INDEX IF NOT EXISTS audit_logs_created_idx
       ON audit_logs(created_at)`,
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES life_events(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS media_event_id_idx ON media(event_id)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS schedule_events (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '学习',
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        place TEXT NOT NULL DEFAULT '',
        person TEXT NOT NULL DEFAULT '',
        project TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        repeat_rule TEXT NOT NULL DEFAULT '不重复',
        status TEXT NOT NULL DEFAULT '计划中',
        planned_minutes INTEGER NOT NULL DEFAULT 0,
        actual_minutes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS schedule_events_start_at_idx ON schedule_events(start_at)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS inbox_items (
        id TEXT PRIMARY KEY NOT NULL,
        content TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT '文字',
        status TEXT NOT NULL DEFAULT '待整理',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS inbox_items_status_idx ON inbox_items(status)",
    ),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '表',
        description TEXT NOT NULL DEFAULT '',
        fields TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    DB.prepare(`
      CREATE TABLE IF NOT EXISTS collection_rows (
        id TEXT PRIMARY KEY NOT NULL,
        collection_id TEXT NOT NULL,
        values_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      )
    `),
    DB.prepare(
      "CREATE INDEX IF NOT EXISTS collection_rows_collection_idx ON collection_rows(collection_id)",
    ),
  ]);
  schemaPromise = createPromise.then(async () => {
    const info = await DB.prepare("PRAGMA table_info(life_events)").all<{
      name: string;
    }>();
    const columns = new Set(info.results.map((column) => column.name));
    const additions = [
      {
        name: "record_status",
        sql: "ALTER TABLE life_events ADD COLUMN record_status TEXT NOT NULL DEFAULT 'published'",
      },
      {
        name: "revision",
        sql: "ALTER TABLE life_events ADD COLUMN revision INTEGER NOT NULL DEFAULT 1",
      },
      {
        name: "updated_at",
        sql: "ALTER TABLE life_events ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
      },
    ];
    for (const addition of additions) {
      if (!columns.has(addition.name)) {
        await DB.prepare(addition.sql).run();
      }
    }
  });
  return schemaPromise;
}

export function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
