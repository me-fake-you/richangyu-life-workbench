import test from "node:test";
import assert from "node:assert/strict";
import { database, count } from "./helpers/mobile-db.mjs";
import { readMobileDashboard, dashboardOptions } from "../lib/mobile-dashboard.mjs";
import { applyLedgerAction, ledgerPayload } from "../lib/mobile-ledger-actions.mjs";
const NOW = Date.parse("2026-10-15T10:00:00Z");
const options = query => dashboardOptions(new URLSearchParams(query), NOW);
function fixture() {
  const db = database();
  db.sqlite.exec("CREATE TABLE finance_budgets(id TEXT PRIMARY KEY,month TEXT,category TEXT,amount REAL)");
  db.sqlite.exec("CREATE TABLE savings_goals(id TEXT PRIMARY KEY,title TEXT,target_amount REAL,saved_amount REAL,target_at TEXT,created_at TEXT)");
  db.sqlite.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,title TEXT,kind TEXT,status TEXT,progress INTEGER,description TEXT,target_at TEXT,updated_at TEXT)");
  db.sqlite.exec("CREATE TABLE tasks(id TEXT PRIMARY KEY,project_id TEXT,status TEXT,completed_at TEXT)");
  db.sqlite.exec("CREATE TABLE milestones(id TEXT PRIMARY KEY,project_id TEXT,title TEXT,note TEXT,happened_at TEXT,completed INTEGER)");
  db.sqlite.exec("INSERT INTO financial_accounts(id,name,initial_balance) VALUES('cash','fixture cash',100),('bank','fixture bank',0)");
  return db;
}
function tx(db, id, type, amount, at = "2026-10-15T00:00:00Z", account = "cash", extra = {}) {
  db.sqlite.prepare("INSERT INTO finance_transactions(id,type,amount,category,account_id,transfer_account_id,occurred_at,note,deleted_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(id, type, amount, extra.category || "餐饮", account, extra.transfer || null, at, "fixture", extra.deleted || null);
}
const command = (payload = {}, id = crypto.randomUUID()) => ({ requestId: id, action: "ledger.create",
  payload: { type: "支出", amount: "0.29", category: "餐饮", accountId: "cash",
    occurredAt: "2026-10-15T00:00:00.000Z", note: "fixture", ...payload } });
const control = (input, action) => ({ requestId: input.requestId, action, payload: { action: input.action, payload: input.payload } });
const apply = (db, input, owner = "fixture@example.com") => applyLedgerAction(db, owner, input, NOW);
test("Dashboard strictly validates kinds, dates, duplicate keys and unsupported selectors", () => {
  assert.equal(options("kind=finance").month, "2026-10");
  assert.equal(options("kind=review&days=7").start, "2026-10-08T16:00:00.000Z");
  for (const query of ["kind=x", "kind=finance&month=2026-13", "kind=finance&page=-1", "kind=finance&page=1000",
    "kind=goals&ownerId=x", "kind=review&days=2", "kind=goals&kind=finance", "kind=goals&days=7", "kind=review&month=2026-10"])
    assert.throws(() => options(query));
});
test("Ledger month uses Beijing boundaries and true instants, not UTC prefixes", async () => {
  const db = fixture();
  tx(db, "before", "支出", 9, "2026-09-30T15:59:59Z");
  tx(db, "first", "支出", 3, "2026-09-30T16:00:00Z");
  tx(db, "offset", "收入", 10, "2026-10-01T00:00:00+08:00");
  tx(db, "next", "支出", 7, "2026-10-31T16:00:00Z");
  const result = await readMobileDashboard(db, options("kind=finance&month=2026-10"), NOW);
  assert.equal(result.total, 2); assert.equal(result.metrics[0].value, "10.00"); assert.equal(result.metrics[1].value, "3.00");
});
test("Balance is calculated from all history including transfers and excluding deleted entries", async () => {
  const db = fixture();
  for (let i = 0; i < 1501; i++) tx(db, "old-" + i, "支出", 1, "2025-01-01T00:00:00Z");
  tx(db, "transfer", "转账", 4, undefined, "cash", { transfer: "bank" });
  tx(db, "income", "收入", 10); tx(db, "refund", "退款", 2); tx(db, "loan", "借入", 5);
  tx(db, "deleted", "支出", 999, undefined, "cash", { deleted: "2026-10-15" });
  const result = await readMobileDashboard(db, options("kind=finance"), NOW);
  const balances = result.groups[1].items;
  assert.equal(balances.find(row => row.id === "cash").value, "-1388.00 元");
  assert.equal(balances.find(row => row.id === "bank").value, "4.00 元");
  assert.equal(result.metrics[0].value, "10.00"); assert.equal(result.metrics[1].value, "0.00");
});
test("Finance pages are stable ordered, bounded and do not mutate business rows", async () => {
  const db = fixture();
  for (let i = 0; i < 55; i++) tx(db, String(i).padStart(3, "0"), "支出", 1);
  const first = await readMobileDashboard(db, options("kind=finance&page=0"), NOW);
  const second = await readMobileDashboard(db, options("kind=finance&page=1"), NOW);
  assert.equal(first.groups[0].items.length, 50); assert.equal(first.nextPage, 1); assert.equal(first.total, 55);
  assert.equal(second.groups[0].items.length, 5); assert.equal(second.nextPage, null);
  assert.equal(new Set([...first.groups[0].items, ...second.groups[0].items].map(x => x.id)).size, 55);
  assert.equal(count(db, "finance_transactions"), 55); assert.equal(count(db, "audit_logs"), 0);
});
test("Budgets and savings retain their saved semantics and archived accounts cannot be selected", async () => {
  const db = fixture(); tx(db, "spend", "支出", 5); tx(db, "advance", "预付款", 2); tx(db, "loan", "借出", 9);
  db.sqlite.exec("INSERT INTO finance_budgets VALUES('b','2026-10','餐饮',10)");
  db.sqlite.exec("INSERT INTO savings_goals VALUES('s','fixture',100,25,NULL,'2026-10-01')");
  db.sqlite.exec("UPDATE financial_accounts SET is_archived=1 WHERE id='bank'");
  const result = await readMobileDashboard(db, options("kind=finance"), NOW);
  assert.equal(result.groups[2].items[0].progress, 70); assert.equal(result.groups[3].items[0].progress, 25);
  assert.deepEqual(result.accounts.map(x => x.id), ["cash"]);
});
test("Goal overview preserves manual progress instead of replacing it with task completion", async () => {
  const db = fixture();
  db.sqlite.exec("INSERT INTO projects VALUES('p','fixture goal','个人目标','进行中',73,'fixture note',NULL,'2026-10-15')");
  db.sqlite.exec("INSERT INTO tasks VALUES('t','p','已完成','2026-10-15T00:00:00Z')");
  const result = await readMobileDashboard(db, options("kind=goals"), NOW);
  assert.equal(result.groups[0].items[0].progress, 73); assert.match(result.groups[0].items[0].detail, /1\/1/);
  assert.equal(db.sqlite.prepare("SELECT progress FROM projects").get().progress, 73);
});
test("Review excludes private, deleted and running checkins and does not read finance or call AI", async () => {
  const db = fixture();
  const insert = db.sqlite.prepare("INSERT INTO life_events(id,title,happened_at,is_private,record_status,deleted_at) VALUES(?,?,?,?,?,?)");
  insert.run("ok", "visible", "2026-10-08T16:00:00Z", 0, "published", null);
  insert.run("before", "outside", "2026-10-08T15:59:59Z", 0, "published", null);
  insert.run("private", "secret", "2026-10-15T00:00:00Z", 1, "published", null);
  insert.run("running", "active", "2026-10-15T00:00:00Z", 0, "checkin_running", null);
  insert.run("deleted", "deleted", "2026-10-15T00:00:00Z", 0, "published", "2026-10-15");
  db.sqlite.exec("DROP TABLE finance_transactions");
  const result = await readMobileDashboard(db, options("kind=review&days=7"), NOW);
  assert.equal(result.startDate, "2026-10-09"); assert.equal(result.endDate, "2026-10-15");
  assert.equal(result.metrics[0].value, "1"); assert.equal(result.groups[1].items.length, 1);
  assert.equal(result.groups[1].items[0].title, "visible"); assert.equal(count(db, "life_events"), 5);
});
test("Review includes only stored schedule instances and completed tasks in range", async () => {
  const db = fixture();
  db.sqlite.exec("INSERT INTO schedule_events(id,title,start_at,end_at,planned_minutes) VALUES('s','fixture','2026-10-14T00:00:00Z','2026-10-14T01:00:00Z',60)");
  db.sqlite.exec("INSERT INTO schedule_instances(id,schedule_id,occurrence_start,occurrence_end,actual_minutes) VALUES('i','s','2026-10-14T00:00:00Z','2026-10-14T01:00:00Z',35)");
  db.sqlite.exec("INSERT INTO tasks VALUES('t',NULL,'已完成','2026-10-15T00:00:00Z')");
  const result = await readMobileDashboard(db, options("kind=review&days=30"), NOW);
  assert.equal(result.metrics[2].value, "1"); assert.equal(result.metrics[3].value, "60"); assert.equal(result.metrics[4].value, "35");
});
test("Read failures reject instead of producing an all-zero dashboard", async () => {
  await assert.rejects(() => readMobileDashboard({ batch: async () => [{ success: false }] }, options("kind=finance"), NOW));
});
test("Manual ledger money rejects rounding, coercion, extra linkage and invalid timestamps", () => {
  assert.equal(ledgerPayload(command().payload).cents, 29);
  for (const extra of [{amount:0.3}, {amount:"0"}, {amount:"1e2"}, {amount:"1.001"}, {amount:"01.00"},
    {amount:"10000000"}, {accountId:""}, {category:" "}, {type:"转账"}, {receivableId:"x"},
    {occurredAt:"2026-02-30T00:00:00.000Z"}, {occurredAt:"2026-10-15T00:00:00Z"}])
    assert.throws(() => ledgerPayload(command(extra).payload));
});
test("Ledger receipt makes repeat submissions exactly once without altering settlements", async () => {
  const db = fixture(), input = command();
  const first = await apply(db, input), second = await apply(db, input);
  assert.deepEqual(second, first); assert.equal(first.state, "applied");
  assert.equal(count(db, "finance_transactions"), 1); assert.equal(count(db, "audit_logs"), 1); assert.equal(count(db, "settlements"), 0);
  const saved = db.sqlite.prepare("SELECT amount,is_private FROM finance_transactions").get();
  assert.equal(saved.amount, 0.29); assert.equal(saved.is_private, 1);
});
test("Unknown result stays unconfirmed; discard tombstone blocks later original and does not undo saved entries", async () => {
  const db = fixture(), pending = command();
  assert.equal((await apply(db, control(pending, "ledger.status"))).state, "not-confirmed");
  assert.equal((await apply(db, control(pending, "ledger.discard"))).state, "cancelled");
  assert.equal((await apply(db, pending)).state, "cancelled"); assert.equal(count(db, "finance_transactions"), 0);
  const saved = command(); await apply(db, saved);
  assert.equal((await apply(db, control(saved, "ledger.discard"))).state, "applied");
  assert.equal(count(db, "finance_transactions"), 1);
});
test("Receipts isolate identities and reject request identifier reuse with another payload", async () => {
  const db = fixture(), input = command();
  await apply(db, input);
  await assert.rejects(() => apply(db, {...input, payload:{...input.payload,amount:"2.00"}}), error => error.status === 409);
  const other = await apply(db, input, "another-fixture@example.com"); assert.equal(other.state, "applied");
  assert.equal(count(db, "finance_transactions"), 2);
});
test("Invalid or concurrently archived accounts do not save a receipt or transaction", async () => {
  const db = fixture(), input = command();
  db.beforeBatch = sqlite => sqlite.exec("UPDATE financial_accounts SET is_archived=1 WHERE id='cash'");
  await assert.rejects(() => apply(db, input), error => error.status === 409);
  assert.equal(count(db, "finance_transactions"), 0); assert.equal(count(db, "mobile_ledger_receipts_v1"), 0);
});
test("A competing discard before the atomic write prevents a late ledger save", async () => {
  const db = fixture(), input = command();
  await apply(db, control(input, "ledger.status"));
  db.beforeBatch = sqlite => {
    const owner = sqlite.prepare("SELECT 1").get(); assert.ok(owner);
    const nonce = "fixture-cancel";
    // Hashes use the same canonical validation, but are prepared asynchronously before the race hook.
    sqlite.prepare("INSERT INTO mobile_ledger_receipts_v1 VALUES(?,?,?,?,?,?,?)")
      .run(db.cancel.owner, input.requestId, db.cancel.digest, nonce, "cancelled", db.cancel.id, "2026-10-15");
  };
  const h = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,"0")).join("");
  const owner = await h("fixture@example.com");
  db.cancel = {owner, digest:await h(JSON.stringify(ledgerPayload(input.payload))), id:"ledger-"+input.requestId+"-"+owner.slice(0,16)};
  assert.equal((await apply(db, input)).state, "cancelled"); assert.equal(count(db, "finance_transactions"), 0);
});
test("Ledger batch rollback includes receipts, transaction and audit; the same request can then retry", async () => {
  const db = fixture(), input = command();
  db.sqlite.exec("CREATE TRIGGER stop_ledger BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'fixture fault'); END");
  await assert.rejects(() => apply(db, input)); assert.equal(count(db, "finance_transactions"), 0);
  assert.equal(count(db, "mobile_ledger_receipts_v1"), 0);
  db.sqlite.exec("DROP TRIGGER stop_ledger"); assert.equal((await apply(db, input)).state, "applied");
  assert.equal(count(db, "finance_transactions"), 1);
});
