import { getLifeBindings } from "./life-store";
import { GroqError, signAssistantDraft, verifyAssistantDraft } from "./groq-ai";

type ObjectValue = Record<string, unknown>;
export type CalendarChoice = {
  id: string; title: string; category: string; startAt: string; endAt: string; editable: boolean;
};
type ScheduleRow = {
  id: string; title: string; category: string; start_at: string; end_at: string;
  place: string; person: string; project: string; note: string;
  repeat_rule: string; status: string; planned_minutes: number; actual_minutes: number;
};
export type PlanOperation = {
  action: "create" | "update"; id: string; title: string; category: string;
  startAt: string; endAt: string; note: string; before: ScheduleRow | null;
};
export type PlanPreview = {
  summary: string; operations: PlanOperation[]; warnings: string[];
  payload: string; signature: string; expiresAt: number;
};
type SignedPlan = {
  nonce: string; subject: string; expiresAt: number; operations: PlanOperation[];
};
const categories = ["学习", "科研", "工作", "运动", "休息", "生活", "日程"];
const snapshotFields = ["title", "category", "start_at", "end_at", "place", "person", "project",
  "note", "repeat_rule", "status", "planned_minutes", "actual_minutes"] as const;

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function calendarChoices(days: number) {
  const { DB } = getLifeBindings();
  const now = new Date().toISOString();
  const end = new Date(Date.now() + days * 86400000).toISOString();
  const rows = await DB.prepare(`
    SELECT se.id, se.title, se.category, si.occurrence_start AS start_at,
           si.occurrence_end AS end_at, se.repeat_rule, si.status, si.actual_minutes
    FROM schedule_instances si JOIN schedule_events se ON se.id = si.schedule_id
    WHERE julianday(si.occurrence_end) > julianday(?)
      AND julianday(si.occurrence_start) < julianday(?) AND si.status NOT IN ('已取消', '已跳过')
    ORDER BY si.occurrence_start ASC LIMIT 40
  `).bind(now, end).all<Pick<ScheduleRow, "id" | "title" | "category" | "start_at" | "end_at" | "repeat_rule" | "status" | "actual_minutes">>();
  return rows.results.map((row) => ({
    id: row.id, title: row.title, category: row.category,
    startAt: row.start_at, endAt: row.end_at,
    editable: row.repeat_rule === "不重复" && row.status === "计划中" && !row.actual_minutes &&
      Date.parse(row.start_at) > Date.now(),
  }));
}

export async function selectedScheduleRows(ids: string[]) {
  if (!ids.length) return [];
  const { DB } = getLifeBindings();
  const result = await DB.prepare(`SELECT id, title, category, start_at, end_at, place, person,
    project, note, repeat_rule, status, planned_minutes, actual_minutes
    FROM schedule_events WHERE id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids).all<ScheduleRow>();
  return result.results;
}

function parseTimestamp(value: unknown, latest: number) {
  const raw = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|\+08:00)$/.test(raw)) {
    throw new GroqError("AI 草稿的时间格式不完整，请重新生成；不会保存这份草稿。", 422);
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp) || timestamp < Date.now() - 60000 || timestamp > latest) {
    throw new GroqError("草稿含已过去或超出所选天数的安排，请调整问题后重新生成。", 422);
  }
  return new Date(timestamp).toISOString();
}

function overlaps(a: PlanOperation, b: PlanOperation) {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

export async function makePlanPreview(raw: ObjectValue, selected: ScheduleRow[], subject: string, days: number) {
  if (!Array.isArray(raw.operations) || !raw.operations.length || raw.operations.length > 8) {
    throw new GroqError("请把计划缩小为 1 至 8 项具体安排，再生成草稿。", 422);
  }
  const latest = Date.now() + days * 86400000;
  const usedIds = new Set<string>();
  const operations: PlanOperation[] = raw.operations.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new GroqError("计划条目格式有误。", 422);
    const item = value as ObjectValue;
    if (item.action !== "create" && item.action !== "update") {
      throw new GroqError("助手只能新增或调整日程，不会自动删除任何记录。", 422);
    }
    const before = item.action === "update" ? selected.find((row) => row.id === item.id) || null : null;
    if (item.action === "update" && (!before || before.repeat_rule !== "不重复" ||
        before.status !== "计划中" || before.actual_minutes || Date.parse(before.start_at) <= Date.now())) {
      throw new GroqError("只能调整你已勾选、尚未开始的单次日程；重复日程和打卡记录不会被改动。", 422);
    }
    const id = before?.id || crypto.randomUUID();
    if (usedIds.has(id)) throw new GroqError("同一日程出现了重复修改，请重新生成。", 422);
    usedIds.add(id);
    const title = text(item.title, 120);
    const startAt = parseTimestamp(item.startAt, latest);
    const endAt = parseTimestamp(item.endAt, latest + 86400000);
    if (!title || endAt <= startAt || Date.parse(endAt) - Date.parse(startAt) > 12 * 3600000) {
      throw new GroqError("草稿含空标题或不合理的时间段，请重新生成。", 422);
    }
    return {
      action: item.action, id, title,
      category: categories.includes(text(item.category)) ? text(item.category) : before?.category || "日程",
      startAt, endAt, note: text(item.note, 400), before,
    };
  });
  const warnings = await planWarnings(operations);
  const expiresAt = Date.now() + 15 * 60000;
  const payload = JSON.stringify({ nonce: crypto.randomUUID(), subject, expiresAt, operations } satisfies SignedPlan);
  return {
    summary: text(raw.summary, 600) || "请核对时间与安排后再保存。",
    operations, warnings, payload, signature: await signAssistantDraft(payload), expiresAt,
  } satisfies PlanPreview;
}

async function planWarnings(operations: PlanOperation[]) {
  const warnings = new Set<string>();
  const { DB } = getLifeBindings();
  const changed = operations.filter((item) => item.action === "update").map((item) => item.id);
  const exclusion = changed.length ? `AND schedule_id NOT IN (${changed.map(() => "?").join(",")})` : "";
  for (let i = 0; i < operations.length; i++) {
    for (let j = i + 1; j < operations.length; j++) {
      if (overlaps(operations[i], operations[j])) warnings.add(`草稿中的“${operations[i].title}”与“${operations[j].title}”时间重叠。`);
    }
    const item = operations[i];
    const rows = await DB.prepare(`SELECT se.title FROM schedule_instances si
      JOIN schedule_events se ON se.id = si.schedule_id
      WHERE si.status NOT IN ('已取消', '已跳过')
        AND julianday(si.occurrence_start) < julianday(?)
        AND julianday(si.occurrence_end) > julianday(?) ${exclusion} LIMIT 3`)
      .bind(item.endAt, item.startAt, ...changed).all<{ title: string }>();
    for (const row of rows.results) warnings.add(`“${item.title}”与已有日程“${row.title}”时间重叠，请修改草稿。`);
  }
  return [...warnings];
}

export async function applyPlan(payload: string, signature: string, subject: string) {
  if (payload.length > 40000 || !await verifyAssistantDraft(payload, signature)) {
    throw new GroqError("草稿凭证无效，请重新生成。", 400);
  }
  const plan = JSON.parse(payload) as SignedPlan;
  if (plan.subject !== subject || plan.expiresAt < Date.now()) {
    throw new GroqError("草稿已过期或属于其他会话，请重新生成。", 409);
  }
  const { DB } = getLifeBindings();
  const auditId = `assistant-plan:${plan.nonce}`;
  const applied = await DB.prepare("SELECT id FROM audit_logs WHERE id = ? AND action = 'assistant.plan.apply'")
    .bind(auditId).first();
  if (applied) return { saved: plan.operations.length, alreadyApplied: true };
  if (plan.operations.some((item) => Date.parse(item.startAt) < Date.now() - 60000)) {
    throw new GroqError("草稿中的安排已经开始，请重新生成。", 409);
  }
  const warnings = await planWarnings(plan.operations);
  if (warnings.length) throw new GroqError(warnings.join(" "), 409);

  // Read the signed operations from one JSON binding instead of repeating
  // parameters for every snapshot and exclusion. The guard always uses four bindings.
  const statements = [DB.prepare(`
    WITH ops AS (SELECT value FROM json_each(?, '$.operations')),
    changed AS (
      SELECT json_extract(value, '$.id') AS id FROM ops
      WHERE json_extract(value, '$.action') = 'update'
    )
    INSERT INTO audit_logs (id, action, entity_type, entity_id, detail_json)
    SELECT CASE WHEN
      NOT EXISTS (
        SELECT 1 FROM ops LEFT JOIN schedule_events se
          ON se.id = json_extract(ops.value, '$.id')
        WHERE json_extract(ops.value, '$.action') = 'update'
          AND (se.id IS NULL OR ${snapshotFields.map((field) =>
            `se.${field} IS NOT json_extract(ops.value, '$.before.${field}')`).join(" OR ")})
      )
      AND NOT EXISTS (
        SELECT 1 FROM schedule_instances WHERE schedule_id IN (SELECT id FROM changed)
          AND (status != '计划中' OR actual_minutes != 0 OR actual_start_at IS NOT NULL
            OR actual_end_at IS NOT NULL OR reflection != '' OR interruption_reason != '')
      )
      AND NOT EXISTS (
        SELECT 1 FROM schedule_exceptions WHERE schedule_id IN (SELECT id FROM changed)
      )
      AND NOT EXISTS (
        SELECT 1 FROM schedule_instances si JOIN ops
          ON julianday(si.occurrence_start) < julianday(json_extract(ops.value, '$.endAt'))
         AND julianday(si.occurrence_end) > julianday(json_extract(ops.value, '$.startAt'))
        WHERE si.status NOT IN ('已取消', '已跳过')
          AND si.schedule_id NOT IN (SELECT id FROM changed)
      )
      AND NOT EXISTS (
        SELECT 1 FROM schedule_events se JOIN ops
          ON julianday(se.start_at) < julianday(json_extract(ops.value, '$.endAt'))
         AND julianday(se.end_at) > julianday(json_extract(ops.value, '$.startAt'))
        WHERE se.repeat_rule = '不重复' AND se.status NOT IN ('已取消', '已跳过')
          AND se.id NOT IN (SELECT id FROM changed)
      )
      THEN ? ELSE NULL END, 'assistant.plan.apply', 'schedule', ?, ?
  `).bind(payload, auditId, plan.nonce, JSON.stringify({ subject, operations: plan.operations }))];
  for (let i = 0; i < plan.operations.length; i++) {
    const item = plan.operations[i];
    const minutes = Math.round((Date.parse(item.endAt) - Date.parse(item.startAt)) / 60000);
    if (item.action === "create") {
      statements.push(DB.prepare(`INSERT INTO schedule_events
        (id, title, category, start_at, end_at, note, repeat_rule, status, planned_minutes, actual_minutes)
        VALUES (?, ?, ?, ?, ?, ?, '不重复', '计划中', ?, 0)`)
        .bind(item.id, item.title, item.category, item.startAt, item.endAt, item.note, minutes));
      statements.push(DB.prepare(`INSERT INTO schedule_rule_settings
        (schedule_id, reminder_minutes, custom_interval, custom_unit, weekdays)
        VALUES (?, 10, 1, 'week', '[]')`).bind(item.id));
    } else {
      statements.push(DB.prepare(`UPDATE schedule_events SET title = ?, category = ?, start_at = ?,
        end_at = ?, note = ?, planned_minutes = ? WHERE id = ?`)
        .bind(item.title, item.category, item.startAt, item.endAt, item.note, minutes, item.id));
      statements.push(DB.prepare(`UPDATE schedule_instances SET occurrence_start = ?, occurrence_end = ?,
        updated_at = CURRENT_TIMESTAMP WHERE schedule_id = ?`)
        .bind(item.startAt, item.endAt, item.id));
    }
    statements.push(DB.prepare(`INSERT OR IGNORE INTO schedule_instances
      (id, schedule_id, occurrence_start, occurrence_end, status, actual_minutes)
      VALUES (?, ?, ?, ?, '计划中', 0)`)
      .bind(`assistant-${plan.nonce}-${i}`, item.id, item.startAt, item.endAt));
  }
  try {
    await DB.batch(statements);
  } catch {
    const duplicate = await DB.prepare("SELECT id FROM audit_logs WHERE id = ? AND action = 'assistant.plan.apply'")
      .bind(auditId).first();
    if (duplicate) return { saved: plan.operations.length, alreadyApplied: true };
    throw new GroqError("保存未完成，日程可能已被修改或出现新冲突。请重新生成草稿；这次没有覆盖原有日程。", 409);
  }
  return { saved: plan.operations.length, alreadyApplied: false };
}
