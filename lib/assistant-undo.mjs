export class AssistantUndoError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
const fail = code => { throw new AssistantUndoError(409, code); };
const fields = ["title", "category", "start_at", "end_at", "place", "person", "project", "note", "repeat_rule", "status", "planned_minutes", "actual_minutes"];
export async function issueAssistantUndo(DB, payload, subject, capture, sign, now = Date.now()) {
  let source = JSON.parse(payload), kind = "plan";
  if (capture) {
    if (source.kind === "income") return { unavailable: "financial_records_require_manual_review" };
    if (source.kind === "schedule") source = JSON.parse(source.data.payload);
    else kind = "life";
  }
  const auditId = (kind === "plan" ? "assistant-plan:" : "assistant-capture:") + source.nonce;
  const undone = await DB.prepare("SELECT id FROM audit_logs WHERE id=?").bind("assistant-undo:" + auditId).first();
  if (undone) return { alreadyUndone: true };
  const data = { format: "assistant-undo-v1", auditId, kind, subject, expiresAt: now + 30 * 60000,
    ...(kind === "plan" ? { operations: source.operations } : { record: source.data }) };
  const encoded = JSON.stringify(data);
  return { payload: encoded, signature: await sign(encoded), expiresAt: data.expiresAt };
}
export async function undoAssistantChange(DB, payload, signature, subject, verify, now = Date.now()) {
  if (typeof payload !== "string" || payload.length > 46000 || !await verify(payload, signature)) {
    throw new AssistantUndoError(400, "invalid_undo_receipt");
  }
  const data = JSON.parse(payload);
  if (data.format !== "assistant-undo-v1" || data.subject !== subject || data.expiresAt <= now) fail("undo_expired_or_other_account");
  if (!["plan", "life"].includes(data.kind)) fail("undo_type_not_supported");
  const undoId = "assistant-undo:" + data.auditId;
  const existing = await DB.prepare("SELECT id FROM audit_logs WHERE id=? AND action='assistant.undo'").bind(undoId).first();
  if (existing) return { undone: 1, alreadyUndone: true };
  const conditions = ["EXISTS (SELECT 1 FROM audit_logs WHERE id=? AND json_extract(detail_json,'$.subject')=? AND action=?)"];
  const bindings = [data.auditId, subject, data.kind === "plan" ? "assistant.plan.apply" : "assistant.capture.apply"], writes = [];
  if (data.kind === "life") {
    const record = data.record;
    if (!record || typeof record.id !== "string") fail("invalid_undo_record");
    conditions.push("EXISTS (SELECT 1 FROM life_events WHERE id=? AND title=? AND content=? AND kind=? AND mood=? AND happened_at=? AND revision=1 AND record_status='published' AND is_private=0 AND deleted_at IS NULL AND updated_at=created_at)");
    bindings.push(record.id, record.title, record.content, record.kind, record.mood, record.happenedAt);
    writes.push(DB.prepare("UPDATE life_events SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE id=?").bind(record.id));
    writes.push(DB.prepare("INSERT INTO life_event_versions(id,event_id,revision,snapshot_json,change_note,device_id) SELECT ?,id,revision,json_object('id',id,'title',title,'content',content,'kind',kind,'mood',mood,'energy',energy,'tags',json(tags),'person',person,'place',place,'project',project,'isPrivate',json(CASE WHEN is_private=1 THEN 'true' ELSE 'false' END),'recordStatus',record_status,'revision',revision,'happenedAt',happened_at,'createdAt',created_at,'updatedAt',updated_at,'deletedAt',deleted_at),'AI confirmed undo','assistant' FROM life_events WHERE id=?").bind(crypto.randomUUID(), record.id));
  } else {
    if (!Array.isArray(data.operations) || !data.operations.length || data.operations.length > 8) fail("invalid_undo_plan");
    const ops = data.operations;
    for (const op of ops) {
      if (!["create", "update"].includes(op.action)) fail("invalid_undo_plan");
      if (op.action === "update" && (!op.before || Date.parse(op.before.start_at) <= now)) fail("original_schedule_already_started");
    }
    // One JSON binding keeps even an eight-operation receipt below D1's binding limit.
    const expected = field => {
      const replacements = { title: "$.title", category: "$.category", start_at: "$.startAt", end_at: "$.endAt", note: "$.note" };
      if (replacements[field]) return "json_extract(o.value,'" + replacements[field] + "')";
      if (field === "planned_minutes") return "CAST(round((julianday(json_extract(o.value,'$.endAt'))-julianday(json_extract(o.value,'$.startAt')))*1440) AS INTEGER)";
      const defaults = { place: "''", person: "''", project: "''", repeat_rule: "'不重复'", status: "'计划中'", actual_minutes: "0" };
      return "CASE WHEN json_extract(o.value,'$.action')='update' THEN json_extract(o.value,'$.before." + field + "') ELSE " + defaults[field] + " END";
    };
    conditions.push("NOT EXISTS (SELECT 1 FROM ops o LEFT JOIN schedule_events s ON s.id=json_extract(o.value,'$.id') WHERE s.id IS NULL OR " + fields.map(field => "s." + field + " IS NOT (" + expected(field) + ")").join(" OR ") + ")");
    conditions.push("NOT EXISTS (SELECT 1 FROM schedule_instances WHERE schedule_id IN (SELECT json_extract(value,'$.id') FROM ops) AND (status!='计划中' OR actual_minutes!=0 OR actual_start_at IS NOT NULL OR actual_end_at IS NOT NULL OR reflection!='' OR interruption_reason!=''))");
    conditions.push("NOT EXISTS (SELECT 1 FROM schedule_exceptions WHERE schedule_id IN (SELECT json_extract(value,'$.id') FROM ops))");
    conditions.push("NOT EXISTS (SELECT 1 FROM work_sessions WHERE schedule_id IN (SELECT json_extract(value,'$.id') FROM ops))");
    for (const table of ["schedule_events", "schedule_instances"]) {
      const start = table === "schedule_events" ? "start_at" : "occurrence_start";
      const end = table === "schedule_events" ? "end_at" : "occurrence_end";
      const id = table === "schedule_events" ? "id" : "schedule_id";
      conditions.push("NOT EXISTS (SELECT 1 FROM " + table + " s JOIN ops o ON json_extract(o.value,'$.action')='update' AND julianday(s." + start + ")<julianday(json_extract(o.value,'$.before.end_at')) AND julianday(s." + end + ")>julianday(json_extract(o.value,'$.before.start_at')) WHERE s.status NOT IN ('已取消','已跳过') " + (table === "schedule_events" ? "AND s.repeat_rule='不重复' " : "") + "AND s." + id + " NOT IN (SELECT json_extract(value,'$.id') FROM ops))");
    }
    for (const op of data.operations) {
      if (!["create", "update"].includes(op.action)) fail("invalid_undo_plan");
      if (op.action === "create") {
        writes.push(DB.prepare("UPDATE schedule_events SET status='已取消' WHERE id=?").bind(op.id));
        writes.push(DB.prepare("UPDATE schedule_instances SET status='已取消',updated_at=CURRENT_TIMESTAMP WHERE schedule_id=?").bind(op.id));
      } else {
        if (!op.before || Date.parse(op.before.start_at) <= now) fail("original_schedule_already_started");
        writes.push(DB.prepare("UPDATE schedule_events SET " + fields.map(field => field + "=?").join(",") + " WHERE id=?").bind(...fields.map(field => op.before[field]), op.id));
        writes.push(DB.prepare("UPDATE schedule_instances SET occurrence_start=?,occurrence_end=?,updated_at=CURRENT_TIMESTAMP WHERE schedule_id=?").bind(op.before.start_at, op.before.end_at, op.id));
      }
    }
  }
  const prefix = data.kind === "plan" ? "WITH ops AS (SELECT value FROM json_each(?, '$.operations')) " : "";
  const claim = DB.prepare(prefix + "INSERT INTO audit_logs (id,action,entity_type,entity_id,detail_json) SELECT CASE WHEN " + conditions.join(" AND ") + " THEN ? ELSE NULL END,'assistant.undo',?,?,?")
    .bind(...(data.kind === "plan" ? [payload] : []), ...bindings, undoId, data.kind === "plan" ? "schedule" : "life_event", data.auditId, JSON.stringify({ subject, original: data.auditId }));
  try { await DB.batch([claim, ...writes]); }
  catch {
    const duplicate = await DB.prepare("SELECT id FROM audit_logs WHERE id=? AND action='assistant.undo'").bind(undoId).first();
    if (duplicate) return { undone: 1, alreadyUndone: true };
    fail("undo_conflict_refresh_required");
  }
  return { undone: data.kind === "plan" ? data.operations.length : 1, alreadyUndone: false };
}
