export const TASK_FIELDS = ["id", "parent_id", "project_id", "title", "description", "status", "priority",
  "due_at", "planned_minutes", "actual_minutes", "estimated_pomodoros", "completed_pomodoros",
  "today_rank", "completed_at", "created_at", "updated_at"];
export const TASK_STATUSES = ["收件箱", "下一步", "进行中", "已完成", "已取消"];
export const TASK_MUTATIONS = ["task.create", "task.update", "task.complete"];
export async function taskRevision(row) {
  const raw = JSON.stringify(TASK_FIELDS.map(key => row[key] ?? null));
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
export function validateTaskPayload(action, payload, fail) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("invalid_task_payload");
  const fields = action === "task.complete" ? ["id", "expectedRevision"] :
    ["title", "description", "status", "priority", "dueAt", "plannedMinutes",
      ...(action === "task.update" ? ["id", "expectedRevision"] : [])];
  if (!TASK_MUTATIONS.includes(action) || Object.keys(payload).some(key => !fields.includes(key))) fail("invalid_task_fields");
  const clean = (value, max, required = false) => {
    if (value === undefined && !required) return "";
    if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail("invalid_task_text");
    const result = value.trim();
    if (required && !result) fail("task_title_required");
    return result;
  };
  const result = {};
  if (action !== "task.create") {
    result.id = clean(payload.id, 100, true);
    if (typeof payload.expectedRevision !== "string" || !/^[0-9a-f]{64}$/.test(payload.expectedRevision)) fail("task_revision_required");
    result.expectedRevision = payload.expectedRevision;
  }
  if (action === "task.complete") return result;
  result.title = clean(payload.title, 200, true);
  result.description = clean(payload.description, 5000);
  result.status = payload.status ?? "下一步";
  result.priority = payload.priority ?? "P2";
  result.plannedMinutes = payload.plannedMinutes ?? 25;
  if (!TASK_STATUSES.includes(result.status) || !["P0", "P1", "P2", "P3"].includes(result.priority)) fail("invalid_task_status");
  if (!Number.isInteger(result.plannedMinutes) || result.plannedMinutes < 1 || result.plannedMinutes > 14400) fail("invalid_task_minutes");
  result.dueAt = null;
  if (payload.dueAt != null && payload.dueAt !== "") {
    const raw = payload.dueAt;
    if (typeof raw !== "string" || raw.length > 40) fail("invalid_task_due");
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
    if (!match) fail("invalid_task_due");
    const [, y, m, d, h, min, sec, offset] = match;
    const days = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    if (Number(y) < 1900 || Number(y) > 9999 || Number(m) < 1 || Number(m) > 12 ||
        Number(d) < 1 || Number(d) > days || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59 ||
        (offset !== "Z" && (Number(offset.slice(1, 3)) > 14 || Number(offset.slice(4)) > 59 ||
          (Number(offset.slice(1, 3)) === 14 && Number(offset.slice(4)) !== 0))) ||
        !Number.isFinite(Date.parse(raw))) fail("invalid_task_due");
    result.dueAt = new Date(raw).toISOString();
  }
  return result;
}
