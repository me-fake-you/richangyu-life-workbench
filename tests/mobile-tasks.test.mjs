import test from "node:test";
import assert from "node:assert/strict";
import { MOBILE_TASK_LIMIT, mobileTasksQuery, readMobileTasks, MobileTasksError } from "../lib/mobile-tasks.mjs";

function database(rows) {
  const calls = [];
  return { calls, prepare(sql) { calls.push(sql); return { async all() { return { results: rows }; } }; } };
}
const fixture = { id: "fixture-task", title: "fixture title", description: "fixture note",
  status: "下一步", priority: "P1", due_at: "2026-10-12T10:00:00.000Z",
  project_title: "fixture project", planned_minutes: 25, actual_minutes: 0, today_rank: 1 };
test("Task query accepts only the exact read endpoint without selectors", () => {
  assert.doesNotThrow(() => mobileTasksQuery("https://example.com/api/mobile-tasks"));
  for (const query of ["?ownerId=x", "?email=x", "?limit=1000", "?x=", "#x", "/"]) {
    assert.throws(() => mobileTasksQuery("https://example.com/api/mobile-tasks" + query),
      error => error instanceof MobileTasksError && error.status === 400);
  }
});
test("A bounded read returns its authenticated identity without executing writes", async () => {
  const db = database([fixture]);
  const result = await readMobileTasks(db, "fixture@example.com", 0);
  assert.equal(result.user.email, "fixture@example.com"); assert.equal(result.readOnly, true);
  assert.equal(result.schemaVersion, 1); assert.equal(result.readAt, "1970-01-01T00:00:00.000Z");
  assert.equal(result.tasks[0].id, fixture.id); assert.equal(result.tasks[0].today_rank, 1);
  assert.equal(db.calls.length, 1); assert.match(db.calls[0], /^SELECT /);
  assert.match(db.calls[0], /LIMIT 101$/); assert.doesNotMatch(db.calls[0], /INSERT|UPDATE|DELETE/);
});
test("Missing identity is rejected before a database read", async () => {
  const db = database([fixture]);
  await assert.rejects(readMobileTasks(db, ""), error => error.status === 401);
  await assert.rejects(readMobileTasks(db, "fixture@example.com", NaN), error => error.status === 401);
  assert.equal(db.calls.length, 0);
});
test("An empty successful read is distinct from a failed database response", async () => {
  assert.equal((await readMobileTasks(database([]), "fixture@example.com")).tasks.length, 0);
  await assert.rejects(readMobileTasks(database(null), "fixture@example.com"), error => error.status === 503);
  await assert.rejects(readMobileTasks({ prepare() { throw new Error("fixture database failure"); } },
    "fixture@example.com"), /fixture database failure/);
});
test("More than one page is disclosed instead of claiming complete cloud totals", async () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ ...fixture, id: "fixture-" + i }));
  const result = await readMobileTasks(database(rows), "fixture@example.com");
  assert.equal(result.tasks.length, MOBILE_TASK_LIMIT); assert.equal(result.truncated, true);
  assert.equal(new Set(result.tasks.map(row => row.id)).size, 100);
});
test("Response data is bounded and unrelated private fields are not exported", async () => {
  const row = { ...fixture, description: "x".repeat(6000), private_note: "not exported", actual_minutes: Infinity };
  const result = await readMobileTasks(database([row]), "fixture@example.com");
  assert.equal(result.tasks[0].description.length, 5000); assert.equal(result.tasks[0].actual_minutes, 0);
  assert.equal("private_note" in result.tasks[0], false); assert.equal(row.description.length, 6000);
});
