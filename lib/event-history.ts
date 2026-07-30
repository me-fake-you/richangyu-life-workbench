import { safeJson } from "./life-store";

export type LifeEventRow = {
  id: string;
  title: string;
  content: string;
  kind: string;
  mood: string;
  energy: number;
  tags: string;
  person: string;
  place: string;
  project: string;
  is_private: number;
  record_status: string;
  revision: number;
  happened_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export function eventSnapshot(row: LifeEventRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    kind: row.kind,
    mood: row.mood,
    energy: Number(row.energy) || 3,
    tags: safeJson<string[]>(row.tags, []),
    person: row.person,
    place: row.place,
    project: row.project,
    isPrivate: Boolean(row.is_private),
    recordStatus: row.record_status,
    revision: Number(row.revision) || 1,
    happenedAt: row.happened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    deletedAt: row.deleted_at,
  };
}

export async function readLifeEvent(DB: D1Database, id: string) {
  return DB.prepare(
    `SELECT id, title, content, kind, mood, energy, tags, person, place,
            project, is_private, record_status, revision, happened_at,
            created_at, updated_at, deleted_at
     FROM life_events WHERE id = ?`,
  )
    .bind(id)
    .first<LifeEventRow>();
}

export async function addLifeEventVersion(
  DB: D1Database,
  row: LifeEventRow,
  {
    changeNote = "",
    deviceId = "",
  }: { changeNote?: string; deviceId?: string } = {},
) {
  await DB.prepare(
    `INSERT OR IGNORE INTO life_event_versions
     (id, event_id, revision, snapshot_json, change_note, device_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      row.id,
      Math.max(1, Number(row.revision) || 1),
      JSON.stringify(eventSnapshot(row)),
      changeNote.slice(0, 500),
      deviceId.slice(0, 120),
    )
    .run();
}

export async function addAuditLog(
  DB: D1Database,
  {
    action,
    entityType,
    entityId,
    deviceId = "",
    detail = {},
  }: {
    action: string;
    entityType: string;
    entityId: string;
    deviceId?: string;
    detail?: Record<string, unknown>;
  },
) {
  await DB.prepare(
    `INSERT INTO audit_logs
     (id, action, entity_type, entity_id, device_id, detail_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      action.slice(0, 80),
      entityType.slice(0, 80),
      entityId.slice(0, 120),
      deviceId.slice(0, 120),
      JSON.stringify(detail).slice(0, 12000),
    )
    .run();
}
