import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { authenticatedSubject } from "../multiuser/workspace-service.mjs";
import worker from "../multiuser/worker.mjs";

const origin = "https://multiuser.example.test";

function fixture(context) {
  const sqlite = new DatabaseSync(":memory:");
  context.after(() => sqlite.close());
  let queries = 0;
  const database = {
    prepare(sql) {
      queries += 1;
      const prepared = sqlite.prepare(sql);
      function statement(parameters = []) {
        return {
          bind(...values) { return statement(values); },
          async first() { return prepared.get(...parameters) || null; },
          async run() {
            const result = prepared.run(...parameters);
            return { success: true, meta: { changes: Number(result.changes) } };
          },
        };
      }
      return statement();
    },
  };
  return {
    sqlite,
    queries: () => queries,
    env: {
      MULTIUSER_FOUNDATION_ENABLED: "true",
      MULTIUSER_AUTH_MODE: "sites-dispatch",
      MULTIUSER_DB: database,
    },
  };
}

function request(subject, method = "GET", body, options = {}) {
  const headers = new Headers();
  if (subject !== null) headers.set("oai-authenticated-user-id", subject);
  headers.set("oai-authenticated-user-email", options.email || "user@example.test");
  if (method !== "GET") {
    headers.set("origin", options.origin ?? origin);
    headers.set("content-type", options.contentType ?? "application/json");
  }
  if (options.fetchSite) headers.set("sec-fetch-site", options.fetchSite);
  return new Request(origin + (options.path || "/api/account/workspace"), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function send(f, subject, method = "GET", body, options) {
  const response = await worker.fetch(request(subject, method, body, options), f.env);
  return { response, body: await response.json() };
}

test("foundation is closed by default even with supplied identity headers", async (context) => {
  const f = fixture(context);
  const response = await worker.fetch(request("example-user-a"), {
    MULTIUSER_DB: f.env.MULTIUSER_DB,
  });
  assert.equal(response.status, 503);
  assert.equal(f.queries(), 0);
});

test("unverified authentication mode cannot activate account storage", async (context) => {
  const f = fixture(context);
  const response = await worker.fetch(request("example-user-a"), {
    ...f.env, MULTIUSER_AUTH_MODE: "headers",
  });
  assert.equal(response.status, 503);
  assert.equal(f.queries(), 0);
});

test("legacy mobile, AI and backup endpoints never fall through", async (context) => {
  const f = fixture(context);
  for (const path of ["/api/mobile", "/api/ai", "/api/backup", "/api/workspace"]) {
    assert.equal((await send(f, "example-user-a", "GET", undefined, { path })).response.status, 404);
  }
  assert.equal(f.queries(), 0);
});

test("email alone does not provide a stable authenticated subject", async (context) => {
  const f = fixture(context);
  assert.equal((await send(f, null)).response.status, 401);
  assert.equal(f.queries(), 0);
});

test("opaque subjects reject padding, controls and excessive length", () => {
  for (const value of ["", " user-a", "user-a ", "user\nid", "user\u007fid",
    "user\u0085id", "x".repeat(513), "user\ud800"]) {
    assert.equal(authenticatedSubject({ get: () => value }), null);
  }
  assert.equal(authenticatedSubject({ get: () => "User-A:opaque" }), "User-A:opaque");
});

test("two authenticated users create and read distinct workspaces", async (context) => {
  const f = fixture(context);
  const a = await send(f, "example-user-a", "POST", { name: "Space A" });
  const b = await send(f, "example-user-b", "POST", { name: "Space B" });
  assert.equal(a.response.status, 201);
  assert.equal(b.response.status, 201);
  assert.notEqual(a.body.workspace.id, b.body.workspace.id);
  assert.equal((await send(f, "example-user-a")).body.workspace.name, "Space A");
  assert.equal((await send(f, "example-user-b")).body.workspace.name, "Space B");
  assert.equal("owner_user_id" in a.body.workspace, false);
  assert.equal("email" in a.body.workspace, false);
});

test("changing email does not change account ownership", async (context) => {
  const f = fixture(context);
  const original = await send(f, "example-user-a", "POST", {}, { email: "a@example.test" });
  const changed = await send(f, "example-user-a", "GET", undefined, { email: "b@example.test" });
  assert.equal(changed.body.workspace.id, original.body.workspace.id);
});

test("case-sensitive opaque account IDs remain distinct", async (context) => {
  const f = fixture(context);
  const a = await send(f, "User-A", "POST", { name: "Upper" });
  const b = await send(f, "user-a", "POST", { name: "Lower" });
  assert.notEqual(a.body.workspace.id, b.body.workspace.id);
});

test("missing workspaces return null rather than another account's data", async (context) => {
  const f = fixture(context);
  await send(f, "example-user-a", "POST", { name: "Existing" });
  assert.equal((await send(f, "example-user-b")).body.workspace, null);
});

test("repeated creation is idempotent and preserves the original name", async (context) => {
  const f = fixture(context);
  const a = await send(f, "example-user-a", "POST", { name: "Original" });
  const b = await send(f, "example-user-a", "POST", { name: "Replacement" });
  assert.equal(b.response.status, 200);
  assert.equal(b.body.created, false);
  assert.equal(b.body.workspace.id, a.body.workspace.id);
  assert.equal(b.body.workspace.name, "Original");
});

test("concurrent creation leaves exactly one workspace for one account", async (context) => {
  const f = fixture(context);
  const results = await Promise.all(Array.from({ length: 6 }, () =>
    send(f, "example-user-a", "POST", { name: "Concurrent" })));
  assert.equal(new Set(results.map((result) => result.body.workspace.id)).size, 1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM multiuser_workspaces").get().count, 1);
});

test("client ownership and workspace fields are rejected before storage", async (context) => {
  const f = fixture(context);
  for (const field of ["ownerUserId", "userId", "workspaceId", "id", "__proto__"]) {
    const body = JSON.parse('{"name":"Attempt","' + field + '":"example-user-b"}');
    assert.equal((await send(f, "example-user-a", "POST", body)).response.status, 422);
  }
  assert.equal(f.queries(), 0);
});

test("workspace query selectors are rejected before storage", async (context) => {
  const f = fixture(context);
  assert.equal((await send(f, "example-user-a", "GET", undefined, {
    path: "/api/account/workspace?workspaceId=other",
  })).response.status, 400);
  assert.equal(f.queries(), 0);
});

test("renaming changes only the caller's workspace", async (context) => {
  const f = fixture(context);
  await send(f, "example-user-a", "POST", { name: "A" });
  await send(f, "example-user-b", "POST", { name: "B" });
  assert.equal((await send(f, "example-user-a", "PATCH", { name: "A updated" })).response.status, 200);
  assert.equal((await send(f, "example-user-b")).body.workspace.name, "B");
  assert.equal((await send(f, "example-user-a")).body.workspace.name, "A updated");
});

test("a forged rename target cannot modify another user's workspace", async (context) => {
  const f = fixture(context);
  const b = await send(f, "example-user-b", "POST", { name: "Untouched" });
  const rejected = await send(f, "example-user-a", "PATCH", {
    name: "Wrong", workspaceId: b.body.workspace.id,
  });
  assert.equal(rejected.response.status, 422);
  assert.equal((await send(f, "example-user-b")).body.workspace.name, "Untouched");
});

test("rename without an existing owned workspace returns 404", async (context) => {
  const f = fixture(context);
  assert.equal((await send(f, "example-user-a", "PATCH", { name: "Missing" })).response.status, 404);
});

test("SQL-shaped subjects and names remain bound values", async (context) => {
  const f = fixture(context);
  const subject = "opaque-' OR 1=1 --";
  const name = "Name'); DROP TABLE multiuser_workspaces; --";
  const own = await send(f, subject, "POST", { name });
  assert.equal(own.response.status, 201);
  assert.equal((await send(f, subject)).body.workspace.name, name);
  assert.equal((await send(f, "example-user-b")).body.workspace, null);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM multiuser_workspaces").get().count, 1);
});

test("write requests require the exact secure origin and reject cross-site context", async (context) => {
  const f = fixture(context);
  for (const options of [{ origin: "" }, { origin: "null" },
    { origin: "https://multiuser.example.test.attacker.test" },
    { origin: origin + "/path" }, { fetchSite: "cross-site" }]) {
    assert.equal((await send(f, "example-user-a", "POST", {}, options)).response.status, 403);
  }
  assert.equal(f.queries(), 0);
});

test("non-JSON input is rejected before schema access", async (context) => {
  const f = fixture(context);
  assert.equal((await send(f, "example-user-a", "POST", {}, { contentType: "text/plain" })).response.status, 415);
  assert.equal(f.queries(), 0);
});

test("oversized bodies are rejected while streaming", async (context) => {
  const f = fixture(context);
  assert.equal((await send(f, "example-user-a", "POST", { name: "x".repeat(5000) })).response.status, 413);
  assert.equal(f.queries(), 0);
});

test("invalid JSON and malformed UTF-8 cannot reach storage", async (context) => {
  const f = fixture(context);
  for (const body of ["{", new Uint8Array([0x7b, 0xff, 0x7d])]) {
    const response = await worker.fetch(new Request(origin + "/api/account/workspace", {
      method: "POST",
      headers: { origin, "content-type": "application/json",
        "oai-authenticated-user-id": "example-user-a" },
      body,
    }), f.env);
    assert.equal(response.status, 400);
  }
  assert.equal(f.queries(), 0);
});

test("invalid workspace names and payload shapes are rejected", async (context) => {
  const f = fixture(context);
  for (const body of [null, [], "text", { name: 1 }, { name: "" },
    { name: " " }, { name: "x".repeat(81) }, { name: "line\nbreak" }]) {
    assert.equal((await send(f, "example-user-a", "POST", body)).response.status, 422);
  }
  assert.equal((await send(f, "example-user-a", "PATCH", {})).response.status, 422);
  assert.equal(f.queries(), 0);
});

test("unsupported methods do not access the database", async (context) => {
  const f = fixture(context);
  const result = await send(f, "example-user-a", "DELETE");
  assert.equal(result.response.status, 405);
  assert.equal(result.response.headers.get("allow"), "GET, POST, PATCH");
  assert.equal(f.queries(), 0);
});

test("the dedicated database binding is required with no legacy DB fallback", async (context) => {
  const f = fixture(context);
  const response = await worker.fetch(request("example-user-a"), {
    MULTIUSER_FOUNDATION_ENABLED: "true", MULTIUSER_AUTH_MODE: "sites-dispatch",
    DB: f.env.MULTIUSER_DB,
  });
  assert.equal(response.status, 503);
  assert.equal(f.queries(), 0);
});

test("storage errors do not expose internal details or account identifiers", async () => {
  const response = await worker.fetch(request("example-user-a"), {
    MULTIUSER_FOUNDATION_ENABLED: "true", MULTIUSER_AUTH_MODE: "sites-dispatch",
    MULTIUSER_DB: { prepare() { throw new Error("private database detail example-user-a"); } },
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "workspace_operation_failed" });
});

test("workspace initialization never imports existing single-user records", async (context) => {
  const f = fixture(context);
  f.sqlite.exec("CREATE TABLE life_events (id TEXT PRIMARY KEY, content TEXT)");
  f.sqlite.prepare("INSERT INTO life_events VALUES (?, ?)").run("legacy-1", "Existing data");
  await send(f, "example-user-a", "POST", { name: "New independent space" });
  assert.equal(f.sqlite.prepare("SELECT content FROM life_events WHERE id = ?").get("legacy-1").content, "Existing data");
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM multiuser_workspaces").get().count, 1);
});

test("account responses are not cacheable and do not advertise unfinished features", async (context) => {
  const f = fixture(context);
  const result = await send(f, "example-user-a");
  assert.equal(result.response.headers.get("cache-control"), "private, no-store");
  assert.equal(result.body.capabilities.records, false);
  assert.equal(result.body.capabilities.schedules, false);
  assert.equal(result.body.capabilities.ai, false);
  const health = await worker.fetch(new Request(origin + "/health"), {});
  const status = await health.json();
  assert.equal(status.registrationOpen, false);
  assert.equal(status.fullWorkbenchReady, false);
});
