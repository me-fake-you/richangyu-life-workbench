// Read-only pagination over stored occurrences and non-repeating source events.
// This module does not infer missing recurrence history or create execution records.
export const CALENDAR_PAGE_SIZE = 50;
export const CALENDAR_MAX_ROWS = 2000;
const DAY = 86400000, OFFSET = 8 * 3600000;
export class MobileCalendarError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
export function calendarRange(value, now = Date.now()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new MobileCalendarError("Choose a valid calendar date.");
  const start = Date.parse(value + "T00:00:00+08:00");
  if (!Number.isFinite(start) || new Date(start + OFFSET).toISOString().slice(0, 10) !== value)
    throw new MobileCalendarError("Choose a valid calendar date.");
  const today = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET;
  if (start < today - 365 * DAY || start > today + 365 * DAY)
    throw new MobileCalendarError("Calendar browsing is limited to one year before or after today.");
  return { from: value, to: new Date(start + 7 * DAY + OFFSET).toISOString().slice(0, 10),
    start, end: start + 7 * DAY };
}
export function calendarQuery(url, now = Date.now()) {
  const params = new URL(url).searchParams;
  for (const key of params.keys()) {
    if (!["from", "cursor"].includes(key) || params.getAll(key).length !== 1)
      throw new MobileCalendarError("Unsupported calendar query.");
  }
  const range = calendarRange(params.get("from"), now);
  const cursor = params.get("cursor") ?? "";
  if (params.has("cursor") && !/^[a-f0-9]{64}\.[1-9]\d{0,3}$/.test(cursor))
    throw new MobileCalendarError("Invalid calendar cursor.");
  return { range, cursor };
}
const iso = value => {
  if (typeof value !== "string") return null;
  // Legacy SQLite timestamps are UTC, never the machine's local time.
  const raw = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
    ? value.replace(" ", "T") + "Z" : value;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(raw)) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
async function digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}
export async function readMobileCalendar(DB, subject, query, now = Date.now()) {
  if (typeof subject !== "string" || !subject || subject.length > 500)
    throw new MobileCalendarError("Authenticated account required.", 401);
  const { range, cursor } = query;
  // One transaction gives a consistent read for rows and coverage counters.
  const [result, coverage] = await DB.batch([
    DB.prepare(`
      SELECT si.id AS occurrence_id, se.id AS schedule_id, se.title, se.category,
        si.occurrence_start AS start_at, si.occurrence_end AS end_at, se.place, se.note,
        si.status, si.actual_minutes, si.actual_start_at, si.actual_end_at,
        si.reflection, si.interruption_reason, 'stored' AS source
      FROM schedule_instances si JOIN schedule_events se ON se.id = si.schedule_id
      WHERE julianday(si.occurrence_start) < julianday(?)
        AND julianday(si.occurrence_end) > julianday(?)
      UNION ALL
      SELECT 'event:' || se.id, se.id, se.title, se.category, se.start_at, se.end_at,
        se.place, se.note, se.status, se.actual_minutes, NULL, NULL, '', '', 'single'
      FROM schedule_events se
      WHERE COALESCE(se.repeat_rule, '') IN ('', '\u4e0d\u91cd\u590d')
        AND julianday(se.start_at) < julianday(?) AND julianday(se.end_at) > julianday(?)
        AND NOT EXISTS (SELECT 1 FROM schedule_instances si WHERE si.schedule_id = se.id
          AND julianday(si.occurrence_start) = julianday(se.start_at))
        AND NOT EXISTS (SELECT 1 FROM schedule_exceptions sx WHERE sx.schedule_id = se.id
          AND julianday(sx.occurrence_start) = julianday(se.start_at))
      ORDER BY start_at, occurrence_id LIMIT ?
    `).bind(new Date(range.end).toISOString(), new Date(range.start).toISOString(),
      new Date(range.end).toISOString(), new Date(range.start).toISOString(), CALENDAR_MAX_ROWS + 1),
    DB.prepare(`
      SELECT SUM(CASE WHEN COALESCE(repeat_rule, '') NOT IN ('', '\u4e0d\u91cd\u590d') THEN 1 ELSE 0 END) AS repeating,
        SUM(CASE WHEN julianday(start_at) IS NULL OR julianday(end_at) IS NULL
          OR julianday(end_at) <= julianday(start_at) THEN 1 ELSE 0 END) AS invalid
      FROM schedule_events
    `),
  ]);
  if (result.results.length > CALENDAR_MAX_ROWS)
    throw new MobileCalendarError("This date range is too large to read safely.", 413);
  const rows = result.results.map(row => {
    const startAt = iso(row.start_at), endAt = iso(row.end_at);
    if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)
      || typeof row.occurrence_id !== "string" || typeof row.title !== "string"
      || !row.title.trim() || row.title.length > 200)
      throw new MobileCalendarError("Some stored calendar entries need repair.", 503);
    return { id: row.occurrence_id, scheduleId: row.schedule_id, title: row.title,
      category: String(row.category ?? ""), startAt, endAt, place: String(row.place ?? ""),
      note: String(row.note ?? ""), status: String(row.status ?? ""),
      actualMinutes: Number(row.actual_minutes ?? 0), actualStartAt: iso(row.actual_start_at),
      actualEndAt: iso(row.actual_end_at), reflection: String(row.reflection ?? ""),
      interruptionReason: String(row.interruption_reason ?? ""), source: row.source };
  }).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id));
  const repeating = Number(coverage.results[0]?.repeating ?? 0);
  const invalidTemplates = Number(coverage.results[0]?.invalid ?? 0);
  const snapshot = await digest(JSON.stringify({ subject, from: range.from, to: range.to,
    repeating, invalidTemplates, rows }));
  let offset = 0;
  if (cursor) {
    const [previous, value] = cursor.split(".");
    offset = Number(value);
    if (previous !== snapshot || offset % CALENDAR_PAGE_SIZE !== 0 || offset >= rows.length)
      throw new MobileCalendarError("Calendar changed. Refresh this range before continuing.", 409);
  }
  const selected = rows.slice(offset, offset + CALENDAR_PAGE_SIZE);
  const loaded = offset + selected.length;
  return { schema: 1, timezone: "Asia/Shanghai", from: range.from, to: range.to,
    coverage: "stored-occurrences-and-single-events", repeating, invalidTemplates,
    total: rows.length, offset, rows: selected, snapshot,
    nextCursor: loaded < rows.length ? snapshot + "." + loaded : "",
    readAt: new Date(now).toISOString() };
}
