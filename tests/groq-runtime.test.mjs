import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import ts from "typescript";
import * as policy from "../lib/groq-request-policy.mjs";

const compiled = ts.transpileModule(
  fs.readFileSync(new URL("../lib/groq-ai.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

function harness(fetchImpl, overrides = {}) {
  const exports = {};
  const environment = {
    GROQ_API_KEY: "test-fixture-key-not-a-secret",
    GROQ_VISION_MODEL: "qwen/qwen3.8-27b",
    ...overrides,
  };
  const context = vm.createContext({
    exports, fetch: fetchImpl, process: { env: {} },
    Buffer, URL, AbortSignal, TextEncoder, crypto: webcrypto,
    require(name) {
      if (name === "cloudflare:workers") return { env: environment };
      if (name === "./groq-request-policy.mjs") return policy;
      throw new Error("Unexpected fixture import: " + name);
    },
  });
  vm.runInContext(compiled, context, { filename: "groq-ai.fixture.cjs" });
  return exports;
}
const textInput = { system: "fixture system", prompt: "fixture question" };
const visionInput = { bytes: new Uint8Array([1, 2, 3]).buffer, contentType: "image/png", prompt: "fixture image" };
function reply(content = "fixture answer", finishReason = "stop") {
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }),
    { headers: { "content-type": "application/json" } });
}
function status(expected) {
  return error => error?.name === "GroqError" && error.status === expected;
}

test("Actual text runtime uses the official endpoint and bounded non-streaming request", async () => {
  let request;
  const ai = harness(async (url, init) => { request = { url, init }; return reply(); });
  const result = await ai.generateGroqText({ ...textInput, maxTokens: NaN });
  assert.equal(result.text, "fixture answer"); assert.equal(result.provider, "groq");
  assert.equal(request.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(request.init.redirect, "error"); assert.equal(request.init.method, "POST");
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, "openai/gpt-oss-120b"); assert.equal(body.max_completion_tokens, 1400);
  assert.equal(body.stream, false); assert.equal(body.reasoning_effort, "low");
});
test("Both runtime paths reject invalid service bases before sending credentials", async () => {
  for (const base of ["not a URL", "https://api.groq.com:8443/openai/v1",
    "https://api.groq.com/openai/v1?x=1", "https://api.groq.com/openai/v1#x",
    "https://user@api.groq.com/openai/v1", "https://other.test/openai/v1"]) {
    let calls = 0;
    const ai = harness(async () => { calls++; return reply(); }, { GROQ_BASE_URL: base });
    await assert.rejects(ai.generateGroqText(textInput), status(503));
    await assert.rejects(ai.generateGroqVision(visionInput), status(503));
    assert.equal(calls, 0);
  }
});
test("Missing keys and oversized inputs do not make network requests", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return reply(); };
  await assert.rejects(harness(fetcher, { GROQ_API_KEY: "" }).generateGroqText(textInput), status(503));
  const ai = harness(fetcher);
  await assert.rejects(ai.generateGroqText({ ...textInput, prompt: "x".repeat(6201) }), status(413));
  await assert.rejects(ai.generateGroqVision({ ...visionInput, bytes: new ArrayBuffer(0) }), status(413));
  await assert.rejects(ai.generateGroqVision({ ...visionInput, contentType: "image/svg+xml" }), status(413));
  assert.equal(calls, 0);
});
test("An already-cancelled caller is rejected before admission or fetch", async () => {
  let calls = 0;
  const ai = harness(async () => { calls++; return reply(); });
  await assert.rejects(ai.generateGroqText({ ...textInput, signal: AbortSignal.abort() }), status(499));
  assert.equal(calls, 0);
  await ai.generateGroqText(textInput); assert.equal(calls, 1);
});
test("Malformed and unusable upstream payloads become safe errors", async () => {
  const payloads = ["not JSON", "null", "{}", JSON.stringify({ choices: [] }),
    JSON.stringify({ choices: [{ message: { content: 123 } }] }),
    JSON.stringify({ choices: [{ message: { content: "x".repeat(16001) } }] })];
  for (const payload of payloads) {
    const ai = harness(async () => new Response(payload));
    await assert.rejects(ai.generateGroqText(textInput), status(502));
    await assert.rejects(ai.generateGroqVision(visionInput), status(502));
  }
});
test("Truncated structured output is never accepted as a usable draft", async () => {
  const ai = harness(async () => reply('{"fixture":true}', "length"));
  await assert.rejects(ai.generateGroqText({ ...textInput, json: true }), status(422));
  await assert.rejects(ai.generateGroqVision(visionInput), status(502));
});
test("A text rate limit gates later text and vision requests without automatic retries", async () => {
  let calls = 0;
  const ai = harness(async () => { calls++; return new Response("", { status: 429, headers: { "retry-after": "90" } }); });
  await assert.rejects(ai.generateGroqText(textInput), error => status(429)(error) && error.retryAfter === 90);
  await assert.rejects(ai.generateGroqVision(visionInput), status(429));
  await assert.rejects(ai.generateGroqText(textInput), status(429));
  assert.equal(calls, 1);
});
test("A vision rate limit shares the gate and never falls back to another provider", async () => {
  let calls = 0;
  const ai = harness(async () => { calls++; return new Response("", { status: 429 }); });
  await assert.rejects(ai.generateGroqVision(visionInput), error => status(429)(error) && error.retryAfter === 60);
  await assert.rejects(ai.generateGroqText(textInput), status(429));
  assert.equal(calls, 1);
});
test("Only two requests enter and successful completion releases capacity", async () => {
  const pending = [];
  let calls = 0;
  const ai = harness(() => { calls++; return new Promise(resolve => pending.push(resolve)); });
  const first = ai.generateGroqText(textInput), second = ai.generateGroqVision(visionInput);
  await assert.rejects(ai.generateGroqText(textInput), error => status(429)(error) && error.retryAfter === 2);
  assert.equal(calls, 2);
  pending[0](reply()); pending[1](reply()); await Promise.all([first, second]);
  const next = ai.generateGroqText(textInput); assert.equal(calls, 3); pending[2](reply()); await next;
});
test("Transport failures release capacity and do not silently retry", async () => {
  let calls = 0;
  const ai = harness(async () => { calls++; if (calls <= 2) throw new Error("fixture secret upstream detail"); return reply(); });
  await assert.rejects(ai.generateGroqText(textInput), error => status(504)(error) && !error.message.includes("fixture secret"));
  await assert.rejects(ai.generateGroqVision(visionInput), status(504));
  assert.equal(calls, 2);
  await ai.generateGroqText(textInput); assert.equal(calls, 3);
});
test("Upstream configuration errors do not expose raw provider bodies", async () => {
  for (const code of [400, 401, 403, 404, 413, 500]) {
    const ai = harness(async () => new Response("fixture private provider detail", { status: code }));
    await assert.rejects(ai.generateGroqText(textInput), error => status(503)(error) && !error.message.includes("fixture private"));
  }
});
test("Vision remains explicitly enabled and uses a finite output budget", async () => {
  let calls = 0, body;
  const fetcher = async (url, init) => { calls++; body = JSON.parse(init.body); return reply('{"fixture":true}'); };
  await assert.rejects(harness(fetcher, { GROQ_VISION_MODEL: "" }).generateGroqVision(visionInput), status(503));
  assert.equal(calls, 0);
  await harness(fetcher).generateGroqVision({ ...visionInput, maxTokens: NaN });
  assert.equal(body.model, "qwen/qwen3.8-27b"); assert.equal(body.max_completion_tokens, 1800);
  assert.equal(body.stream, false); assert.equal(body.messages[0].content[1].image_url.url, "data:image/png;base64,AQID");
});
test("Draft HMAC signing contract still verifies without any network access", async () => {
  let calls = 0;
  const ai = harness(async () => { calls++; return reply(); });
  const payload = '{"fixture":"draft"}';
  const signature = await ai.signAssistantDraft(payload);
  assert.match(signature, /^[a-f0-9]{64}$/);
  assert.equal(await ai.verifyAssistantDraft(payload, signature), true);
  assert.equal(await ai.verifyAssistantDraft(payload + " ", signature), false);
  assert.equal(await ai.verifyAssistantDraft(payload, "bad"), false);
  assert.equal(calls, 0);
});
