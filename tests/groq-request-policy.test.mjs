import test from "node:test";
import assert from "node:assert/strict";
import {
  validGroqBaseUrl, groqRetryAfterSeconds, groqCompletionBudget, createGroqRequestGate,
} from "../lib/groq-request-policy.mjs";

test("Groq policy accepts only the official HTTPS base", () => {
  for (const value of ["https://api.groq.com/openai/v1", "https://api.groq.com/openai/v1/", "https://api.groq.com:443/openai/v1"]) {
    assert.equal(validGroqBaseUrl(value), true);
  }
});
test("Groq policy rejects malformed or credential-bearing bases", () => {
  for (const value of [null, "", "not a URL", "http://api.groq.com/openai/v1",
    "https://api.groq.com.evil.test/openai/v1", "https://u:p@api.groq.com/openai/v1",
    "https://api.groq.com:8443/openai/v1", "https://api.groq.com/openai/v1?q=1",
    "https://api.groq.com/openai/v1#x", "https://api.groq.com/openai/v2",
    "https://api.groq.com/openai/%76%31", "https://api.groq.com/openai/v1//"]) {
    assert.equal(validGroqBaseUrl(value), false, String(value));
  }
});
test("Retry-After numeric values are bounded and rounded upward", () => {
  assert.equal(groqRetryAfterSeconds("15.1"), 16);
  assert.equal(groqRetryAfterSeconds("0"), 10);
  assert.equal(groqRetryAfterSeconds("999999"), 86400);
  for (const value of [null, "-1", "NaN", "Infinity", "invalid"]) assert.equal(groqRetryAfterSeconds(value), 60);
});
test("Retry-After HTTP dates use the supplied clock", () => {
  const now = Date.parse("2026-10-12T00:00:00Z");
  assert.equal(groqRetryAfterSeconds("Mon, 12 Oct 2026 00:01:30 GMT", now), 90);
  assert.equal(groqRetryAfterSeconds("Mon, 12 Oct 2026 00:00:00 GMT", now), 10);
  assert.equal(groqRetryAfterSeconds("Mon, invalid GMT", now), 60);
});
test("Completion budgets remain finite and bounded", () => {
  assert.equal(groqCompletionBudget(1400.9, 400, 2300, 1400), 1400);
  assert.equal(groqCompletionBudget(-1, 400, 2300, 1400), 400);
  assert.equal(groqCompletionBudget(5000, 400, 2300, 1400), 2300);
  for (const value of [NaN, Infinity, undefined, "500"]) assert.equal(groqCompletionBudget(value, 400, 2300, 1400), 1400);
});
test("Admission allows two in-flight requests and does not queue a third", () => {
  const gate = createGroqRequestGate();
  const first = gate.enter(), second = gate.enter(), third = gate.enter();
  assert.equal(first.allowed, true); assert.equal(second.allowed, true);
  assert.equal(third.allowed, false); assert.equal(third.reason, "busy"); assert.equal(third.retryAfter, 2);
  first.release(); second.release();
});
test("Release is idempotent and never opens excess slots", () => {
  const gate = createGroqRequestGate();
  const first = gate.enter(); first.release(); first.release();
  const second = gate.enter(), third = gate.enter();
  assert.equal(second.allowed, true); assert.equal(third.allowed, true);
  assert.equal(gate.enter().allowed, false);
  second.release(); third.release();
});
test("Cooldown expires with the supplied clock without timers", () => {
  let time = 0;
  const gate = createGroqRequestGate({ now: () => time });
  assert.equal(gate.recordRateLimit("90"), 90);
  assert.equal(gate.enter().reason, "cooldown");
  time = 89001; assert.equal(gate.enter().retryAfter, 1);
  time = 90000; const ready = gate.enter(); assert.equal(ready.allowed, true); ready.release();
});
test("A shorter rate-limit response never reduces the current deadline", () => {
  let time = 0;
  const gate = createGroqRequestGate({ now: () => time });
  gate.recordRateLimit("120"); time = 1000;
  assert.equal(gate.recordRateLimit("10"), 119);
  assert.equal(gate.enter().retryAfter, 119);
});
test("Rejected releases are no-ops and separate isolates do not share state", () => {
  const gate = createGroqRequestGate(), independent = createGroqRequestGate();
  const first = gate.enter(), second = gate.enter(), rejected = gate.enter();
  rejected.release(); rejected.release(); assert.equal(gate.enter().allowed, false);
  gate.recordRateLimit("30");
  const other = independent.enter(); assert.equal(other.allowed, true);
  first.release(); second.release(); other.release();
});
