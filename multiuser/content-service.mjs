import { WorkspaceRequestError, ensureWorkspaceSchema, ownWorkspace } from "./workspace-service.mjs";
const ready = new WeakMap();
const fail = (code, status = 422) => { throw new WorkspaceRequestError(status, code); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(stable(value))))), b => b.toString(16).padStart(2, "0")).join("");
}
export async function readContentInput(request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") fail("json_required", 415);
  if (!request.body) fail("invalid_json", 400);
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "", bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); fail("body_too_large", 413); }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof WorkspaceRequestError) throw error;
    fail("invalid_json", 400);
  } finally { reader.releaseLock(); }
}
export async function ensureContentSchema(DB) {
  await ensureWorkspaceSchema(DB);
  let pending = ready.get(DB);
  if (!pending) {
    pending = DB.batch([
      DB.prepare("CREATE TABLE IF NOT EXISTS multiuser_content (id TEXT PRIMARY KEY NOT NULL,workspace_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('record','schedule')),data_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,deleted_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(workspace_id) REFERENCES multiuser_workspaces(id) ON DELETE CASCADE)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS multiuser_content_workspace_idx ON multiuser_content(workspace_id,updated_at)"),
      DB.prepare("CREATE TABLE IF NOT EXISTS multiuser_content_receipts (owner_user_id TEXT NOT NULL,request_id TEXT NOT NULL,input_hash TEXT NOT NULL,response_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(owner_user_id,request_id))"),
    ]).catch(error => { ready.delete(DB); throw error; });
    ready.set(DB, pending);
  }
  await pending;
}
function cleanText(value, max, required = false) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail("invalid_text");
  if (required && !value.trim()) fail("text_required");
  return value.trim();
}
function cleanData(kind, data) {
  const keys = kind === "record" ? ["title", "content", "happenedAt"] : ["title", "startAt", "endAt", "note"];
  if (!object(data) || Object.keys(data).some(key => !keys.includes(key))) fail("content_fields_rejected");
  const date = value => {
    if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) fail("invalid_time");
    return new Date(value).toISOString();
  };
  if (kind === "record") {
    const title = cleanText(data.title ?? "", 200), content = cleanText(data.content ?? "", 5000);
    if (!title && !content) fail("record_required");
    return { title, content, happenedAt: date(data.happenedAt) };
  }
  const startAt = date(data.startAt), endAt = date(data.endAt);
  if (endAt <= startAt || Date.parse(endAt) - Date.parse(startAt) > 7 * 86400000) fail("invalid_schedule_range");
  return { title: cleanText(data.title, 200, true), startAt, endAt, note: cleanText(data.note ?? "", 2000) };
}
export async function listOwnContent(DB, subject) {
  await ensureContentSchema(DB);
  const workspace = await ownWorkspace(DB, subject);
  if (!workspace) fail("workspace_not_found", 404);
  const result = await DB.prepare("SELECT c.id,c.kind,c.data_json,c.revision,c.created_at,c.updated_at FROM multiuser_content c JOIN multiuser_workspaces w ON w.id=c.workspace_id WHERE w.owner_user_id=? AND c.deleted_at IS NULL ORDER BY c.updated_at DESC,c.id DESC LIMIT 101").bind(subject).all();
  return { items: result.results.slice(0, 100).map(row => ({ id: row.id, kind: row.kind, data: JSON.parse(row.data_json), revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at })), hasMore: result.results.length > 100, limit: 100 };
}
export async function changeOwnContent(DB, subject, input) {
  if (!object(input) || Object.keys(input).some(key => !["requestId", "action", "kind", "id", "expectedRevision", "data"].includes(key)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.requestId || "") ||
      !["create", "update", "delete"].includes(input.action) || !["record", "schedule"].includes(input.kind)) fail("invalid_content_operation");
  if (input.action === "create" && ("id" in input || "expectedRevision" in input)) fail("server_ids_required");
  if (input.action !== "create" && (typeof input.id !== "string" || !/^item_[0-9a-f-]{36}$/.test(input.id) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)) fail("revision_required");
  if (input.action === "delete" && "data" in input) fail("delete_data_rejected");
  const data = input.action === "delete" ? null : cleanData(input.kind, input.data);
  await ensureContentSchema(DB);
  const workspace = await ownWorkspace(DB, subject);
  if (!workspace) fail("workspace_not_found", 404);
  const digest = await hash(input);
  const readReceipt = () => DB.prepare("SELECT input_hash,response_json FROM multiuser_content_receipts WHERE owner_user_id=? AND request_id=?").bind(subject, input.requestId).first();
  const receiptResult = receipt => {
    if (receipt.input_hash !== digest) fail("operation_key_conflict", 409);
    return { ...JSON.parse(receipt.response_json), alreadyApplied: true };
  };
  const previous = await readReceipt();
  if (previous) return receiptResult(previous);
  const id = input.action === "create" ? "item_" + crypto.randomUUID() : input.id;
  const response = { id, requestId: input.requestId, revision: input.action === "create" ? 1 : input.expectedRevision + 1 };
  const condition = input.action === "create" ? "EXISTS(SELECT 1 FROM multiuser_workspaces WHERE id=? AND owner_user_id=?)" :
    "EXISTS(SELECT 1 FROM multiuser_content c JOIN multiuser_workspaces w ON w.id=c.workspace_id WHERE c.id=? AND w.owner_user_id=? AND c.kind=? AND c.revision=? AND c.deleted_at IS NULL)";
  const conditionValues = input.action === "create" ? [workspace.id, subject] : [id, subject, input.kind, input.expectedRevision];
  const guard = DB.prepare("INSERT INTO multiuser_content_receipts(owner_user_id,request_id,input_hash,response_json) SELECT CASE WHEN " + condition + " THEN ? ELSE NULL END,?,?,?").bind(...conditionValues, subject, input.requestId, digest, JSON.stringify(response));
  const write = input.action === "create" ?
    DB.prepare("INSERT INTO multiuser_content(id,workspace_id,kind,data_json) VALUES(?,?,?,?)").bind(id, workspace.id, input.kind, JSON.stringify(data)) :
    input.action === "delete" ?
      DB.prepare("UPDATE multiuser_content SET deleted_at=CURRENT_TIMESTAMP,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(id, workspace.id) :
      DB.prepare("UPDATE multiuser_content SET data_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(JSON.stringify(data), id, workspace.id);
  try { await DB.batch([guard, write]); }
  catch {
    const duplicate = await readReceipt();
    if (duplicate) return receiptResult(duplicate);
    fail("content_changed_refresh_required", 409);
  }
  return { ...response, alreadyApplied: false };
}
