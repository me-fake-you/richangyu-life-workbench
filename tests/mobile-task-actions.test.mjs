import test from "node:test";
import assert from "node:assert/strict";
import { database, count } from "./helpers/mobile-db.mjs";
import { applyMobileAction } from "../lib/mobile-actions.mjs";
import { taskRevision } from "../lib/mobile-task-policy.mjs";
import { readMobileTasks } from "../lib/mobile-tasks.mjs";

const NOW = Date.parse("2026-10-13T10:00:00Z");
export function taskDatabase() {
  const db = database();
  db.sqlite.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL)");
  db.sqlite.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY NOT NULL, parent_id TEXT, project_id TEXT, title TEXT NOT NULL," +
    "description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '收件箱', priority TEXT NOT NULL DEFAULT 'P2'," +
    "due_at TEXT, planned_minutes INTEGER NOT NULL DEFAULT 25, actual_minutes INTEGER NOT NULL DEFAULT 0," +
    "estimated_pomodoros INTEGER NOT NULL DEFAULT 1, completed_pomodoros INTEGER NOT NULL DEFAULT 0," +
    "today_rank INTEGER, completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  return db;
}
const operation = (action, payload, requestId = crypto.randomUUID()) => ({ requestId, action, payload });
const create = (title = "fixture task") => operation("task.create", { title, description: "fixture note", priority: "P1", status: "下一步", plannedMinutes: 25 });
const apply = (db, input, owner = "fixture-subject") => applyMobileAction(db, owner, input, NOW, { allowTasks: true });
const row = (db, id) => db.sqlite.prepare("SELECT * FROM tasks WHERE id=?").get(id);
const reference = (input, action) => ({ requestId: input.requestId, action, payload: { action: input.action, payload: input.payload } });
async function edit(db, id) {
  const current = row(db, id);
  return operation("task.update", { id, expectedRevision: await taskRevision(current), title: "updated fixture",
    description: "updated note", priority: "P0", status: "进行中", dueAt: "2026-10-14T18:00:00+08:00", plannedMinutes: 90 });
}
test("Task writes require the dedicated trusted gate; old mobile actions cannot accept them", async () => {
  const db = taskDatabase();
  await assert.rejects(applyMobileAction(db, "fixture-subject", create(), NOW), e => e.status === 400);
  assert.equal(count(db, "tasks"), 0);
});
test("Create and exact replay produce one task, one receipt and no related writes", async () => {
  const db = taskDatabase(), input = create();
  const first = await apply(db, input), again = await apply(db, input);
  assert.equal(first.state, "applied"); assert.equal(first.taskAction, "task.create");
  assert.equal(again.id, first.id); assert.equal(again.alreadyApplied, true);
  assert.equal(count(db, "tasks"), 1); assert.equal(count(db, "mobile_action_receipts"), 1);
  for (const table of ["life_events", "schedule_events", "work_sessions", "finance_transactions", "receivables"])
    assert.equal(count(db, table), 0);
});
test("Reused identifiers cannot change the content or receipt owner", async () => {
  const db = taskDatabase(), input = create(); await apply(db, input);
  await assert.rejects(apply(db, { ...input, payload: { ...input.payload, title: "changed" } }), e => e.status === 409);
  await assert.rejects(apply(db, input, "other-subject"), e => e.status === 409);
  await assert.rejects(apply(db, reference(input, "task.status"), "other-subject"), e => e.status === 409);
  assert.equal(count(db, "tasks"), 1);
});
test("Update uses the complete revision and preserves linked identifiers and actual work", async () => {
  const db = taskDatabase(), first = await apply(db, create());
  db.sqlite.prepare("UPDATE tasks SET parent_id='fixture-parent',project_id='fixture-project',actual_minutes=12,completed_pomodoros=2,today_rank=1 WHERE id=?").run(first.id);
  const input = await edit(db, first.id); await apply(db, input);
  const saved = row(db, first.id);
  assert.equal(saved.title, "updated fixture"); assert.equal(saved.due_at, "2026-10-14T10:00:00.000Z");
  assert.equal(saved.actual_minutes, 12); assert.equal(saved.parent_id, "fixture-parent");
  assert.equal(saved.project_id, "fixture-project"); assert.equal(saved.completed_pomodoros, 2); assert.equal(saved.today_rank, 1);
});
test("Complete clears the today rank but does not manufacture actual work", async () => {
  const db = taskDatabase(), first = await apply(db, create());
  db.sqlite.prepare("UPDATE tasks SET today_rank=1,actual_minutes=7 WHERE id=?").run(first.id);
  const input = operation("task.complete", { id: first.id, expectedRevision: await taskRevision(row(db, first.id)) });
  await apply(db, input); await apply(db, input);
  const saved = row(db, first.id);
  assert.equal(saved.status, "已完成"); assert.equal(saved.today_rank, null); assert.equal(saved.actual_minutes, 7);
  assert.equal(saved.completed_at, new Date(NOW).toISOString());
  const reopen = await edit(db, first.id); await apply(db, reopen);
  assert.equal(row(db, first.id).completed_at, null);
});
test("A concurrent web edit with the same timestamp is rejected before claiming a receipt", async () => {
  const db = taskDatabase(), first = await apply(db, create()), input = await edit(db, first.id);
  db.sqlite.prepare("UPDATE tasks SET description='web edit' WHERE id=?").run(first.id);
  await assert.rejects(apply(db, input), e => e.status === 409);
  assert.equal(row(db, first.id).description, "web edit"); assert.equal(count(db, "mobile_action_receipts"), 1);
});
test("A race after the revision read fails the atomic claim instead of overwriting", async () => {
  const db = taskDatabase(), first = await apply(db, create()), input = await edit(db, first.id);
  db.beforeBatch = sqlite => sqlite.prepare("UPDATE tasks SET actual_minutes=66 WHERE id=?").run(first.id);
  await assert.rejects(apply(db, input), e => e.status === 409);
  assert.equal(row(db, first.id).actual_minutes, 66); assert.equal(row(db, first.id).title, "fixture task");
  assert.equal(count(db, "mobile_action_receipts"), 1);
});
test("Unknown status means not confirmed, never permission to generate another request", async () => {
  const db = taskDatabase(), input = create();
  const status = await apply(db, reference(input, "task.status"));
  assert.equal(status.state, "not-confirmed"); assert.equal(count(db, "mobile_action_receipts"), 0);
  assert.equal(count(db, "tasks"), 0);
  const saved = await apply(db, input);
  assert.equal((await apply(db, reference(input, "task.status"))).id, saved.id);
});
test("Discard reserves the original operation; a late retry cannot create a task", async () => {
  const db = taskDatabase(), input = create();
  assert.equal((await apply(db, reference(input, "task.discard"))).state, "cancelled");
  assert.equal((await apply(db, input)).state, "cancelled"); assert.equal(count(db, "tasks"), 0);
  await assert.rejects(apply(db, { ...input, payload: { title: "changed" } }), e => e.status === 409);
});
test("Discard after application reports saved instead of undoing it", async () => {
  const db = taskDatabase(), input = create(), saved = await apply(db, input);
  const result = await apply(db, reference(input, "task.discard"));
  assert.equal(result.state, "applied"); assert.equal(result.id, saved.id); assert.equal(count(db, "tasks"), 1);
});
test("Invalid selectors, revisions, calendar dates and minutes cannot create tasks", async () => {
  const db = taskDatabase();
  for (const payload of [{ title: "a", ownerId: "other" }, { title: "a", plannedMinutes: 0 },
    { title: "a", plannedMinutes: 1.5 }, { title: "a", priority: "unknown" }, { title: "" },
    { title: "a", dueAt: "2026-02-30T10:00:00Z" }, { title: "a", dueAt: "2026-10-13T10:00:00" },
    { title: "a", dueAt: "2026-10-13T10:00:00+14:01" }])
    await assert.rejects(apply(db, operation("task.create", payload)), e => e.status === 422);
  await assert.rejects(apply(db, operation("task.update", { id: "missing", title: "a" })), e => e.status === 422);
  assert.equal(count(db, "tasks"), 0);
});
test("A failed task insert rolls its receipt back, so an exact retry remains possible", async () => {
  const db = taskDatabase(), input = create();
  db.sqlite.exec("CREATE TRIGGER fixture_reject BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT,'fixture rejection'); END");
  await assert.rejects(apply(db, input), /fixture rejection/);
  assert.equal(count(db, "mobile_action_receipts"), 0);
  db.sqlite.exec("DROP TRIGGER fixture_reject");
  assert.equal((await apply(db, input)).state, "applied");
});
test("Read responses remain backward compatible and expose content-based edit revisions", async () => {
  const db = taskDatabase(), saved = await apply(db, create());
  const before = await readMobileTasks(db, "fixture@example.com", NOW);
  assert.equal(before.readOnly, true); assert.equal(before.taskActions, true);
  assert.equal(before.tasks[0].revision, await taskRevision(row(db, saved.id)));
  db.sqlite.prepare("UPDATE tasks SET description='different' WHERE id=?").run(saved.id);
  const after = await readMobileTasks(db, "fixture@example.com", NOW);
  assert.notEqual(after.tasks[0].revision, before.tasks[0].revision);
});

test("A discard committed just before the original transaction prevents its late write", async () => {
  const db = taskDatabase(), cancelledDb = taskDatabase(), input = create();
  await apply(cancelledDb, reference(input, "task.discard"));
  const receipt = cancelledDb.sqlite.prepare("SELECT * FROM mobile_action_receipts WHERE id=?").get(input.requestId);
  db.beforeBatch = sqlite => sqlite.prepare("INSERT INTO mobile_action_receipts(id,owner_key,input_hash,nonce,response_json) VALUES(?,?,?,?,?)")
    .run(receipt.id, receipt.owner_key, receipt.input_hash, receipt.nonce, receipt.response_json);
  const result = await apply(db, input);
  assert.equal(result.state, "cancelled"); assert.equal(count(db, "tasks"), 0);
  assert.equal(count(db, "mobile_action_receipts"), 1);
});
test("Two different operation IDs based on one task revision cannot both overwrite it", async () => {
  const db = taskDatabase(), first = await apply(db, create()), input = await edit(db, first.id);
  const second = { ...input, requestId: crypto.randomUUID(), payload: { ...input.payload, title: "competing edit" } };
  const results = await Promise.allSettled([apply(db, input), apply(db, second)]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(results.filter(x => x.status === "rejected" && x.reason.status === 409).length, 1);
  assert.equal(count(db, "mobile_action_receipts"), 2);
});
