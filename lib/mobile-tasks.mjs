export const MOBILE_TASK_LIMIT = 100;
export class MobileTasksError extends Error {
  constructor(message, status = 503) { super(message); this.name = "MobileTasksError"; this.status = status; }
}
export function mobileTasksQuery(value) {
  let url;
  try { url = new URL(value); } catch { throw new MobileTasksError("任务地址无效。", 400); }
  if (url.pathname !== "/api/mobile-tasks" || url.search || url.hash) {
    throw new MobileTasksError("任务读取不接受账号选择或其他查询参数。", 400);
  }
}
export async function readMobileTasks(db, email, now = Date.now()) {
  if (typeof email !== "string" || !email.trim() || email.length > 320 || !Number.isFinite(now)) {
    throw new MobileTasksError("无法确认当前工作台账号。", 401);
  }
  const result = await db.prepare(
    "SELECT t.id, t.title, t.description, t.status, t.priority, t.due_at, " +
    "t.planned_minutes, t.actual_minutes, t.today_rank, p.title AS project_title " +
    "FROM tasks t LEFT JOIN projects p ON p.id = t.project_id " +
    "ORDER BY CASE WHEN t.today_rank IS NULL THEN 1 ELSE 0 END, t.today_rank ASC, " +
    "CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, " +
    "CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC, t.created_at DESC LIMIT 101",
  ).all();
  if (!Array.isArray(result?.results)) throw new MobileTasksError("任务读取未完成，不代表没有任务。");
  const boundedText = (value, max) => typeof value === "string" ? value.slice(0, max) : "";
  const boundedNumber = value => {
    const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(10000000, Math.max(0, Math.floor(parsed))) : 0;
  };
  return {
    schemaVersion: 1, readOnly: true, user: { email: email.trim() }, readAt: new Date(now).toISOString(),
    limit: MOBILE_TASK_LIMIT, truncated: result.results.length > MOBILE_TASK_LIMIT,
    tasks: result.results.slice(0, MOBILE_TASK_LIMIT).map(row => ({
      id: boundedText(row.id, 80), title: boundedText(row.title, 200),
      description: boundedText(row.description, 5000), status: boundedText(row.status, 30),
      priority: boundedText(row.priority, 10), due_at: boundedText(row.due_at, 80),
      project_title: boundedText(row.project_title, 200), planned_minutes: boundedNumber(row.planned_minutes),
      actual_minutes: boundedNumber(row.actual_minutes), today_rank: boundedNumber(row.today_rank),
    })),
  };
}
