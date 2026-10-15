import { MobileActionError } from "./mobile-actions.mjs";
const fail = (text, status = 422) => { throw new MobileActionError(status, text); };
const plain = value => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key));
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map(b => b.toString(16).padStart(2, "0")).join("");
}
export function ledgerPayload(input) {
  if (!exact(input, ["type", "amount", "category", "accountId", "occurredAt", "note"])) fail("账目字段无效。");
  if (!["收入", "支出"].includes(input.type)) fail("手机记账仅支持手动收入或支出。");
  if (typeof input.amount !== "string" || !/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(input.amount)) fail("金额须为大于0、最多两位小数的数字。");
  const [whole, fraction = ""] = input.amount.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents <= 0 || cents > 999999999) fail("金额超出范围。");
  if (typeof input.category !== "string" || !input.category.trim() || input.category.length > 100 ||
      typeof input.note !== "string" || input.note.length > 2000 ||
      !(input.accountId === null || (typeof input.accountId === "string" && input.accountId.length > 0 && input.accountId.length <= 100)))
    fail("分类、账户或备注无效。");
  if (typeof input.occurredAt !== "string" || !/^(20\d{2}|2100)-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.occurredAt) ||
      !Number.isFinite(Date.parse(input.occurredAt)) || new Date(input.occurredAt).toISOString() !== input.occurredAt)
    fail("请填写有效的实际发生时间。");
  return { type: input.type, amount: (cents / 100).toFixed(2), category: input.category.trim(),
    accountId: input.accountId, occurredAt: input.occurredAt, note: input.note, cents };
}
export async function applyLedgerAction(DB, subject, input, now = Date.now()) {
  if (typeof subject !== "string" || !subject || subject.length > 500) fail("账号无效。", 401);
  if (!exact(input, ["requestId", "action", "payload"]) || !uuid(input.requestId) ||
      !["ledger.create", "ledger.status", "ledger.discard"].includes(input.action)) fail("账本提交无效。");
  const control = input.action !== "ledger.create";
  if (control && (!exact(input.payload, ["action", "payload"]) || input.payload.action !== "ledger.create"))
    fail("核对请求必须包含原账目。");
  const payload = ledgerPayload(control ? input.payload.payload : input.payload);
  const owner = await hash(subject), digest = await hash(JSON.stringify(payload));
  const id = "ledger-" + input.requestId + "-" + owner.slice(0, 16);
  const result = state => ({ schemaVersion: 1, requestId: input.requestId, ledgerAction: "ledger.create", id, state });
  await DB.prepare("CREATE TABLE IF NOT EXISTS mobile_ledger_receipts_v1 (" +
    "owner_hash TEXT NOT NULL,request_id TEXT NOT NULL,payload_hash TEXT NOT NULL,nonce TEXT NOT NULL," +
    "state TEXT NOT NULL CHECK(state IN ('applied','cancelled')),entity_id TEXT NOT NULL,created_at TEXT NOT NULL," +
    "PRIMARY KEY(owner_hash,request_id))").run();
  const read = async () => {
    const row = await DB.prepare("SELECT payload_hash,state,entity_id FROM mobile_ledger_receipts_v1 WHERE owner_hash=? AND request_id=?")
      .bind(owner, input.requestId).first();
    if (row && row.payload_hash !== digest) fail("同一提交编号不能用于不同账目。", 409);
    if (row && (row.entity_id !== id || !["applied", "cancelled"].includes(row.state))) fail("回执需人工核对。", 503);
    return row ? result(row.state) : null;
  };
  const existing = await read();
  if (existing) return existing;
  if (input.action === "ledger.status") return result("not-confirmed");
  const nonce = crypto.randomUUID(), at = new Date(now).toISOString();
  if (input.action === "ledger.discard") {
    await DB.prepare("INSERT INTO mobile_ledger_receipts_v1 VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_hash,request_id) DO NOTHING")
      .bind(owner, input.requestId, digest, nonce, "cancelled", id, at).run();
    return await read();
  }
  const claim = "owner_hash=? AND request_id=? AND nonce=? AND state='applied'";
  await DB.batch([
    DB.prepare("INSERT INTO mobile_ledger_receipts_v1 " +
      "SELECT ?,?,?,?,?,?,? WHERE (? IS NULL OR EXISTS(SELECT 1 FROM financial_accounts WHERE id=? AND is_archived=0)) " +
      "ON CONFLICT(owner_hash,request_id) DO NOTHING")
      .bind(owner, input.requestId, digest, nonce, "applied", id, at, payload.accountId, payload.accountId),
    DB.prepare("INSERT INTO finance_transactions (id,type,amount,category,account_id,occurred_at,note,is_private) " +
      "SELECT ?,?,?,?,?,?,?,1 WHERE EXISTS(SELECT 1 FROM mobile_ledger_receipts_v1 WHERE " + claim + ")")
      .bind(id, payload.type, payload.cents / 100, payload.category, payload.accountId, payload.occurredAt, payload.note,
        owner, input.requestId, nonce),
    DB.prepare("INSERT INTO audit_logs (id,action,entity_type,entity_id,detail_json) " +
      "SELECT ?,'finance.create','finance_transaction',?,'{\"source\":\"android-native-ledger\"}' " +
      "WHERE EXISTS(SELECT 1 FROM mobile_ledger_receipts_v1 WHERE " + claim + ")")
      .bind("audit-" + id, id, owner, input.requestId, nonce),
  ]);
  const saved = await read();
  if (!saved) fail("账户已不存在或已归档。未保存这笔账目，请核对后放弃原提交。", 409);
  return saved;
}
