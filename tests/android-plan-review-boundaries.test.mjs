import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const java = "android/app/src/main/java/com/richangyu/lifeworkbench/";
const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("calendar references remain manual, bounded, current and account matched", () => {
  const sheet=source(java+"NativeAiSheet.java");
  assert.match(sheet,/accountScope = host.accountScope\(\)/);
  assert.match(sheet,/WorkbenchPlanReviewPolicy.scopeMatches\(accountScope,host.accountScope\(\)\)/);
  assert.match(sheet,/WorkbenchPlanReviewPolicy.contextFresh\(choicesReadElapsed,SystemClock.elapsedRealtime\(\)\)/);
  assert.match(sheet,/WorkbenchPlanReviewPolicy.unambiguousIds\(ids\)/);
  assert.match(sheet,/WorkbenchPlanReviewPolicy.selectionValid\(selected/);
  assert.match(sheet,/calendar.setChecked\(!selected.isEmpty\(\)\)/);
  assert.match(sheet,/calendar.isChecked\(\) \? new JSONArray\(selected\) : new JSONArray\(\)/);
  assert.doesNotMatch(sheet,/calendar.setChecked\(true\)|apiKey|gsk_[A-Za-z0-9]{20}/);
});

test("visible plans require matching payload, explicit review and existing authoritative guards", () => {
  const sheet=source(java+"NativeAiSheet.java");
  assert.match(sheet,/displayedPlanMatchesPayload\(operations\)/);
  assert.match(sheet,/planReviewed.setChecked\(false\)/);
  assert.match(sheet,/previewMatchesPayload && sourceCountMatches && planReviewed != null && planReviewed.isChecked\(\)/);
  assert.match(sheet,/WorkbenchPlanReviewPolicy.problems\(reviewOperations/);
  assert.match(sheet,/WorkbenchClientPolicy.canConfirm/);
  assert.match(sheet,/put\(payload, "confirmed", true\)/);
  assert.match(sheet,/confirmUndo\(\)/);
  assert.match(sheet,/beforeTime\(before,"startAt","start_at"\)/);
  assert.match(sheet,/beforeTime\(before,"endAt","end_at"\)/);
});

test("revision and context clearing do not auto-send or leak full before snapshots", () => {
  const sheet=source(java+"NativeAiSheet.java");
  const minimal=sheet.slice(sheet.indexOf("private String minimalPreviousDraft("),sheet.indexOf("private void renderPlanReview("));
  assert.doesNotMatch(minimal,/put\(next,"before"|put\(next,"payload"|put\(next,"signature"|put\(next,"id"/);
  assert.match(minimal,/"action","title","category","startAt","endAt","note"/);
  const revision=sheet.slice(sheet.indexOf("private void revisePlan("),sheet.indexOf("private void showSettings("));
  assert.match(revision,/question.setText\(lastPlanPrompt\)/);
  assert.doesNotMatch(revision,/bridge.request|generate\(\)|warnings.optString/);
  const clear=sheet.slice(sheet.indexOf("private void confirmClearContext("),sheet.indexOf("private String beforeTime("));
  assert.match(clear,/selected.clear\(\);previousDraft="";pendingSource="";history=new JSONArray\(\)/);
  assert.doesNotMatch(clear,/bridge.request|generate\(\)/);
});

test("AI receipts stay scoped and writes remain blocked while workbench state is uncertain", () => {
  const main=source(java+"MainActivity.java");
  const start=main.indexOf("private void showAi("),end=main.indexOf("private void showBindingWelcome(",start);
  const host=main.slice(start,end);
  assert.match(host,/final String scope=activeDraftScope/);
  assert.match(host,/saveOutcomeUnknown \|\| saving \|\| syncing \|\| bindingChanging/);
  assert.match(host,/!bridgeReady \|\| !homeReadSucceeded \|\| !scope.equals\(activeDraftScope\)/);
  assert.match(host,/public String accountScope\(\)/);
  assert.match(host,/recordSyncReceipt\(scope\);sync\(\)/);
  assert.match(host,/invalidateLocalReminders\(\);showAuth\(\)/);
});
