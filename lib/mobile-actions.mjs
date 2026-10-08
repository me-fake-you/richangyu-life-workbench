const schemas = new WeakMap();
export class MobileActionError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
const fail = (code, status = 422) => { throw new MobileActionError(status, code); };
const text = (value, max, required = false) => {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail("invalid_text");
  const result = value.trim();
  if (required && !result) fail("text_required");
  return result;
};
const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000000 || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) fail("invalid_amount");
  return Math.round(n * 100) / 100;
};
const stamp = (value, now) => {
  if (value === undefined) return new Date(now).toISOString();
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) fail("invalid_time");
  return new Date(value).toISOString();
};
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function ensureMobileActionSchema(DB) {
  let promise = schemas.get(DB);
  if (!promise) {
    promise = DB.prepare("CREATE TABLE IF NOT EXISTS mobile_action_receipts (id TEXT PRIMARY KEY NOT NULL, owner_key TEXT NOT NULL, input_hash TEXT NOT NULL, nonce TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run()
      .then(result => { if (result.success === false) throw new Error("receipt_schema_failed"); })
      .catch(error => { schemas.delete(DB); throw error; });
    schemas.set(DB, promise);
  }
  await promise;
}
export async function readMobileInput(request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim() !== "application/json") fail("json_required", 415);
  const reader = request.body?.getReader();
  if (!reader) fail("invalid_json", 400);
  let bytes = 0, value = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 32768) { await reader.cancel(); fail("input_too_large", 413); }
      value += decoder.decode(chunk.value, { stream: true });
    }
    value += decoder.decode();
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof MobileActionError) throw error;
    fail("invalid_json", 400);
  } finally { reader.releaseLock(); }
}
export async function applyMobileAction(DB, subject, input, now = Date.now()) {
  if (!subject || !input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["requestId", "action", "payload"].includes(key)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.requestId || "")) fail("invalid_operation");
  const payload = input.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("invalid_payload");
  const actions = ["project.create", "work.start", "work.finish", "receivable.receive", "event.create", "schedule.create", "inbox.create"];
  if (!actions.includes(input.action)) fail("unsupported_action", 400);
  const owner = await digest(subject), hash = await digest(JSON.stringify(canonical({ action: input.action, payload })));
  await ensureMobileActionSchema(DB);
  const readReceipt = () => DB.prepare("SELECT owner_key, input_hash, nonce, response_json FROM mobile_action_receipts WHERE id = ?").bind(input.requestId).first();
  const confirmed = receipt => {
    if (receipt.owner_key !== owner || receipt.input_hash !== hash) fail("operation_key_conflict", 409);
    return { ...JSON.parse(receipt.response_json), alreadyApplied: true };
  };
  const previous = await readReceipt();
  if (previous) return confirmed(previous);
  const nonce = crypto.randomUUID();
  const id = "mobile-" + input.requestId;
  const result = { id, requestId: input.requestId };
  let condition = "1", conditionValues = [];
  const steps = [];
  const gate = "EXISTS (SELECT 1 FROM mobile_action_receipts WHERE id = ? AND nonce = ? AND owner_key = ?)";
  const gated = (sql, values) => steps.push(DB.prepare(sql.replace("$GATE", gate)).bind(...values, input.requestId, nonce, owner));
  const p = payload;
  if (input.action === "project.create") {
    const title = text(p.title, 180, true);
    if (!["按小时", "按次"].includes(p.billingMode)) fail("invalid_billing_mode");
    const rate = money(p.unitRate);
    gated("INSERT INTO side_hustle_projects (id,title,kind,billing_mode,unit_rate,settlement_cycle,status,note,color) SELECT ?,?,'兼职',?,?,'手动结算','进行中',?,'#205741' WHERE $GATE",
      [id, title, p.billingMode, rate, text(p.note, 1000)]);
  } else if (input.action === "work.start") {
    const project = text(p.projectId, 100, true), started = stamp(p.startedAt, now);
    if (Date.parse(started) > now + 60000) fail("future_work_start");
    condition = "EXISTS (SELECT 1 FROM side_hustle_projects WHERE id = ? AND status = '进行中') AND NOT EXISTS (SELECT 1 FROM work_sessions WHERE status IN ('进行中','暂停'))";
    conditionValues = [project];
    gated("INSERT INTO work_sessions (id,project_id,started_at,work_content,place,status) SELECT ?,?,?,?,?,'进行中' WHERE $GATE",
      [id, project, started, text(p.workContent, 1200), text(p.place, 200)]);
  } else if (input.action === "work.finish") {
    const sessionId = text(p.id, 100, true);
    const session = await DB.prepare("SELECT w.*,p.title AS project_title,p.billing_mode,p.unit_rate,p.client_id FROM work_sessions w JOIN side_hustle_projects p ON p.id=w.project_id WHERE w.id=?").bind(sessionId).first();
    if (!session || !["进行中", "暂停"].includes(session.status)) fail("work_changed", 409);
    const ended = stamp(p.endedAt, now);
    if (Date.parse(ended) > now + 60000 || Date.parse(ended) < Date.parse(session.started_at)) fail("invalid_work_end");
    const pause = Number(session.paused_minutes || 0) + (session.status === "暂停" && session.paused_at ? Math.max(0, Math.round((Date.parse(ended) - Date.parse(session.paused_at)) / 60000)) : 0);
    const minutes = Math.max(1, Math.round((Date.parse(ended) - Date.parse(session.started_at)) / 60000) - pause);
    const expected = money(p.expectedIncome);
    const due = p.dueAt ? stamp(p.dueAt, now) : null;
    const receivableId = "receivable-" + input.requestId, eventId = "event-" + input.requestId;
    condition = "EXISTS (SELECT 1 FROM work_sessions WHERE id=? AND status=? AND started_at=? AND paused_minutes=? AND paused_at IS ?)";
    conditionValues = [sessionId, session.status, session.started_at, Number(session.paused_minutes || 0), session.paused_at || null];
    gated("INSERT INTO life_events (id,title,content,kind,mood,energy,tags,person,place,project,is_private,happened_at,record_status) SELECT ?,?,?, '兼职','平静',3,'[]','',?,?,0,?,'published' WHERE $GATE",
      [eventId, "完成兼职：" + session.project_title, text(p.workContent, 1200) || "完成工作；待结算金额请在兼职中心查看。", text(p.place, 200), session.project_title, ended]);
    gated("INSERT INTO life_event_versions(id,event_id,revision,snapshot_json,change_note,device_id) SELECT ?,id,revision,json_object('id',id,'title',title,'content',content,'kind',kind,'mood',mood,'energy',energy,'tags',json(tags),'person',person,'place',place,'project',project,'isPrivate',json(CASE WHEN is_private=1 THEN 'true' ELSE 'false' END),'recordStatus',record_status,'revision',revision,'happenedAt',happened_at,'createdAt',created_at,'updatedAt',updated_at,'deletedAt',deleted_at),'Mobile confirmed create','native' FROM life_events WHERE id=? AND $GATE", ["version-" + input.requestId, eventId]);
    gated("UPDATE work_sessions SET ended_at=?,minutes=?,paused_minutes=?,paused_at=NULL,work_content=?,result=?,expected_income=?,status='已完成',life_event_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND $GATE",
      [ended, minutes, pause, text(p.workContent, 1200), text(p.result, 1200), expected, eventId, sessionId]);
    gated("INSERT INTO receivables (id,project_id,client_id,work_session_id,amount_due,amount_received,due_at,status,note) SELECT ?,?,?,?, ?,0,?,? ,? WHERE $GATE",
      [receivableId, session.project_id, session.client_id || null, sessionId, expected, due, expected > 0 ? "待结算" : "已取消", text(p.note, 500)]);
    result.id = sessionId; result.receivableId = receivableId; result.minutes = minutes; result.expectedIncome = expected;
  } else if (input.action === "receivable.receive") {
    const receivableId = text(p.receivableId, 100, true), accountId = text(p.accountId, 100, true);
    const row = await DB.prepare("SELECT r.*,p.title AS project_title FROM receivables r JOIN side_hustle_projects p ON p.id=r.project_id WHERE r.id=?").bind(receivableId).first();
    if (!row || row.status === "已取消") fail("receivable_changed", 409);
    const expectedReceived = money(p.expectedReceived), paid = money(p.amount);
    if (Number(row.amount_received) !== expectedReceived) fail("receivable_changed", 409);
    const remaining = Math.round((Number(row.amount_due) - Number(row.amount_received)) * 100) / 100;
    if (paid <= 0 || paid > remaining) fail("invalid_received_amount");
    const received = Math.round((expectedReceived + paid) * 100) / 100, receivedAt = stamp(p.receivedAt, now);
    condition = "EXISTS (SELECT 1 FROM receivables WHERE id=? AND amount_received=? AND amount_due=? AND status!='已取消') AND EXISTS (SELECT 1 FROM financial_accounts WHERE id=? AND is_archived=0)";
    conditionValues = [receivableId, expectedReceived, row.amount_due, accountId];
    const transactionId = "transaction-" + input.requestId;
    gated("INSERT INTO finance_transactions (id,type,amount,category,account_id,project,side_hustle_project_id,work_session_id,receivable_id,occurred_at,note,is_private) SELECT ?,'收入',?,'兼职',?,?,?,?,?,?,?,1 WHERE $GATE",
      [transactionId, paid, accountId, row.project_title, row.project_id, row.work_session_id || null, receivableId, receivedAt, text(p.note, 500)]);
    gated("INSERT INTO settlements (id,receivable_id,account_id,transaction_id,amount,received_at,note) SELECT ?,?,?,?,?,?,? WHERE $GATE",
      [id, receivableId, accountId, transactionId, paid, receivedAt, text(p.note, 500)]);
    const status = received >= Number(row.amount_due) ? "已到账" : "部分到账";
    gated("UPDATE receivables SET amount_received=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND $GATE", [received, status, receivableId]);
    result.amount = paid; result.status = status; result.receivableId = receivableId;
  } else if (input.action === "event.create") {
    const title = text(p.title, 200), content = text(p.content, 5000);
    if (!title && !content) fail("record_required");
    gated("INSERT INTO life_events (id,title,content,kind,mood,energy,tags,person,place,project,is_private,happened_at,record_status) SELECT ?,?,?,'生活','平静',3,'[]','','','',0,?,'published' WHERE $GATE",
      [id, title, content, stamp(p.happenedAt, now)]);
    gated("INSERT INTO life_event_versions(id,event_id,revision,snapshot_json,change_note,device_id) SELECT ?,id,revision,json_object('id',id,'title',title,'content',content,'kind',kind,'mood',mood,'energy',energy,'tags',json(tags),'person',person,'place',place,'project',project,'isPrivate',json(CASE WHEN is_private=1 THEN 'true' ELSE 'false' END),'recordStatus',record_status,'revision',revision,'happenedAt',happened_at,'createdAt',created_at,'updatedAt',updated_at,'deletedAt',deleted_at),'Mobile confirmed create','native' FROM life_events WHERE id=? AND $GATE", ["version-" + input.requestId, id]);
  } else if (input.action === "inbox.create") {
    gated("INSERT INTO inbox_items (id,content,source_type) SELECT ?,?,'文字' WHERE $GATE", [id, text(p.content, 5000, true)]);
  } else {
    const title = text(p.title, 200, true), start = stamp(p.startAt, now), end = stamp(p.endAt, now);
    if (end <= start || Date.parse(end) - Date.parse(start) > 7 * 86400000) fail("invalid_schedule_range");
    gated("INSERT INTO schedule_events (id,title,category,start_at,end_at,place,person,project,note,repeat_rule,status,planned_minutes,actual_minutes) SELECT ?,?,'日程',?, ?,?,'','',?,'不重复','计划中',?,0 WHERE $GATE",
      [id, title, start, end, text(p.place, 200), text(p.note, 2000), Math.round((Date.parse(end) - Date.parse(start)) / 60000)]);
    gated("INSERT INTO schedule_rule_settings (schedule_id,reminder_minutes,custom_interval,custom_unit,weekdays) SELECT ?,10,1,'week','[]' WHERE $GATE", [id]);
  }
  const claim = DB.prepare("INSERT OR IGNORE INTO mobile_action_receipts (id,owner_key,input_hash,nonce,response_json) SELECT ?,?,?,?,? WHERE " + condition)
    .bind(input.requestId, owner, hash, nonce, JSON.stringify(result), ...conditionValues);
  await DB.batch([claim, ...steps]);
  const receipt = await readReceipt();
  if (!receipt) fail("state_changed_refresh_required", 409);
  if (receipt.owner_key !== owner || receipt.input_hash !== hash) fail("operation_key_conflict", 409);
  return { ...JSON.parse(receipt.response_json), alreadyApplied: receipt.nonce !== nonce };
}
export async function readWorkDashboard(DB) {
  const [projects, sessions, receivables, accounts] = await DB.batch([
    DB.prepare("SELECT id,title,billing_mode AS billingMode,unit_rate AS unitRate,status FROM side_hustle_projects ORDER BY updated_at DESC LIMIT 100"),
    DB.prepare("SELECT w.id,w.project_id AS projectId,p.title AS projectTitle,p.billing_mode AS billingMode,p.unit_rate AS unitRate,w.started_at AS startedAt,w.ended_at AS endedAt,w.minutes,w.paused_minutes AS pausedMinutes,w.paused_at AS pausedAt,w.work_content AS workContent,w.expected_income AS expectedIncome,w.status FROM work_sessions w JOIN side_hustle_projects p ON p.id=w.project_id ORDER BY w.started_at DESC LIMIT 100"),
    DB.prepare("SELECT r.id,p.title AS projectTitle,r.amount_due AS amountDue,r.amount_received AS amountReceived,r.status,r.due_at AS dueAt FROM receivables r JOIN side_hustle_projects p ON p.id=r.project_id ORDER BY r.created_at DESC LIMIT 100"),
    DB.prepare("SELECT id,name FROM financial_accounts WHERE is_archived=0 ORDER BY created_at ASC")
  ]);
  return { projects: projects.results, sessions: sessions.results, receivables: receivables.results, accounts: accounts.results, serverTime: new Date().toISOString(), operationReceipts: true };
}
