import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { readMobileInput, MobileActionError } from "../lib/mobile-actions.mjs";
const require = createRequire(import.meta.url), ts = require("typescript");
const code = ts.transpileModule(readFileSync(new URL("../app/api/mobile-task-actions/route.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function route(email = "fixture@example.com") {
  const calls = [], exports = {};
  vm.runInNewContext(code, { exports, Response, URL, Date, require(name) {
    if (name.includes("chatgpt-auth")) return { getChatGPTUser: async () => email ? { email } : null };
    if (name.includes("life-store")) return { getLifeBindings: () => ({ DB: {} }) };
    if (name.includes("advanced-store")) return { ensureAdvancedSchema: async () => {} };
    if (name.includes("mobile-actions")) return { readMobileInput, MobileActionError,
      applyMobileAction: async (...args) => { calls.push(args); return { state: "applied", requestId: args[2].requestId }; } };
    throw new Error("Unexpected route dependency");
  } });
  return { post: exports.POST, calls };
}
function request(body, headers = {}, path = "/api/mobile-task-actions") {
  return new Request("https://example.com" + path, { method: "POST", headers: {
    origin: "https://example.com", "content-type": "application/json", "oai-authenticated-user-id": "fixture-subject", ...headers },
    body: JSON.stringify(body) });
}
const input = { requestId: "11111111-1111-4111-8111-111111111111", action: "task.create",
  expectedAccount: "fixture@example.com", payload: { title: "fixture" } };
test("Task route requires authentication, exact origin/path and expected account before writes", async () => {
  assert.equal((await route("").post(request(input))).status, 401);
  for (const [body, headers, path, status] of [
    [input, { origin: "https://other.test" }, undefined, 403],
    [input, { "sec-fetch-site": "cross-site" }, undefined, 403],
    [input, {}, "/api/mobile-task-actions?ownerId=other", 403],
    [{ ...input, expectedAccount: "other@example.com" }, {}, undefined, 409],
    [{ ...input, ownerId: "other" }, {}, undefined, 422],
    [{ ...input, action: "event.create" }, {}, undefined, 400],
  ]) {
    const r = route(); assert.equal((await r.post(request(body, headers, path))).status, status); assert.equal(r.calls.length, 0);
  }
});
test("Task route strips the expected-account guard and binds receipts to server identity", async () => {
  const r = route(), result = await r.post(request(input));
  assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await result.json()).user.email, input.expectedAccount);
  assert.equal(r.calls[0][1], "fixture-subject");
  assert.equal("expectedAccount" in r.calls[0][2], false); assert.equal(r.calls[0][4].allowTasks, true);
});
test("Task request byte limits remain enforced before passing content to storage", async () => {
  const r = route();
  assert.equal((await r.post(request({ ...input, payload: { title: "x".repeat(33000) } }))).status, 413);
  assert.equal(r.calls.length, 0);
});
