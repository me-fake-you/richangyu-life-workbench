import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const java = "android/app/src/main/java/com/richangyu/lifeworkbench/";
const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("sync center is available without a cloud snapshot and refresh is read-only", () => {
  const main = source(java + "MainActivity.java");
  assert.match(main, /data == null && !"features".equals\(tab\) && !"home".equals\(tab\) && !"sync".equals\(tab\)/);
  assert.match(main, /if \("sync".equals\(tab\)\) renderSyncCenter\(body\)/);
  assert.match(main, /selectTab\("sync"\)/);
  const start = main.indexOf("private void renderSyncCenter(");
  const end = main.indexOf("private void refreshSyncView(", start);
  const center = main.slice(start, end);
  assert.match(center, /draftSummary\(\)/);
  assert.match(center, /count == null/);
  assert.doesNotMatch(center, /drafts.add|api\("POST"|store.state|submit\(/);
  assert.match(main, /api\("GET", null, envelope/);
  assert.match(main, /WorkbenchSyncPolicy.validScope\(activeDraftScope\)[\s\S]*?"record-create".equals\(key\)[\s\S]*?showRecordDialog/);
});

test("a confirmed draft cannot be reposted even if local cleanup fails", () => {
  const sheet = source(java + "NativeDraftSheet.java");
  assert.match(sheet, /confirmedThisSession.add\(id\)/);
  assert.match(sheet, /store.state\(id,"confirmed"\);\s+store.remove\(id\)/);
  assert.match(sheet, /if\(!canSubmit\(id\)\)/);
  assert.match(sheet, /if\(confirmedThisSession.contains\(id\)\)return false/);
  assert.match(sheet, /WorkbenchSyncPolicy.canSubmit\(row.optString\("state"\)\)/);
  assert.match(sheet, /store.state\(id,"uncertain"\);busy=true/);
  assert.match(sheet, /store.state\(id,"rejected"\)/);
  assert.match(sheet, /id.equals\(receipt.optString\("requestId"\)\)/);
  assert.match(sheet, /host.onAuthRequired\(\)/);
  assert.doesNotMatch(sheet, /setInterval|postDelayed|UUID.randomUUID|rows.sort\(/);
});

test("receipt persistence contains only a scoped timestamp, not content or credentials", () => {
  const store = source(java + "NativeSyncStatusStore.java");
  assert.match(store, /WorkbenchSyncPolicy.validScope\(scope\)/);
  assert.match(store, /putLong\("receipt_time:"\+scope,timestamp\)/);
  assert.match(store, /WorkbenchSyncPolicy.usableReceiptTime/);
  assert.doesNotMatch(store, /putString|putBoolean|CookieManager|WebView|MobileApiBridge|requestId|apiKey/);
  const main = source(java + "MainActivity.java");
  assert.match(main, /!scope.equals\(activeDraftScope\)/);
  assert.match(main, /recordSyncReceipt\(receiptScope\)/);
  assert.match(main, /recordSyncReceipt\(scope\);sync\(\)/);
});

test("uncertain saves still require explicit account-matched manual acknowledgement", () => {
  const main = source(java + "MainActivity.java");
  const start = main.indexOf("private void acknowledgeMainSave(");
  const end = main.indexOf("private void addHomeConnectionState(", start);
  const confirm = main.slice(start, end);
  assert.match(confirm, /!bridgeReady \|\| !homeReadSucceeded \|\| syncing \|\| saving/);
  assert.match(confirm, /!scope.equals\(activeDraftScope\)/);
  assert.match(confirm, /setSaveOutcomeUnknown\(false\)/);
  assert.doesNotMatch(confirm, /api\(|submit\(|store.remove|drafts.remove/);
});
