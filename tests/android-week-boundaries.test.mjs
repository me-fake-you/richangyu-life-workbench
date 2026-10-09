import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const java = "android/app/src/main/java/com/richangyu/lifeworkbench/";
const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("seven-day overview uses one authenticated GET and never requests a model or writes", () => {
  const sheet=source(java+"NativeWeekSheet.java");
  assert.match(sheet,/ENDPOINT = "\/api\/assistant\?days=7"/);
  assert.match(sheet,/bridge\.request\(ENDPOINT, null, envelope/);
  assert.equal((sheet.match(/bridge\.request\(/g)||[]).length,1);
  assert.doesNotMatch(sheet,/generateGroq|new WebView|SharedPreferences|java\.io|\.put\(/);
  assert.match(sheet,/requestRevision != revision/);
  assert.match(sheet,/code == 401 \|\| code == 403/);
  assert.match(sheet,/bridge\.matchesOrigin\(uri\)/);
  assert.match(sheet,/payload\.optInt\("days"\) != 7/);
  assert.match(sheet,/rows\.length\(\) > WorkbenchWeekPolicy\.MAX_ROWS/);
});

test("overview remains a bounded partial seven-natural-day snapshot, not availability", () => {
  const policy=source(java+"WorkbenchWeekPolicy.java"),sheet=source(java+"NativeWeekSheet.java");
  assert.match(policy,/DAYS = 7, MAX_ROWS = 40/);
  assert.match(policy,/dayStart\(readAt\)/);
  assert.match(policy,/entry\.end <= readAt \|\| entry\.start >= until/);
  assert.match(policy,/Math\.max\(entry\.start, from\)/);
  assert.match(policy,/Math\.min\(entry\.end, until\)/);
  assert.match(policy,/TimeZone\.getTimeZone\("Asia\/Shanghai"\)/);
  assert.match(sheet,/rawCount >= WorkbenchWeekPolicy\.MAX_ROWS/);
  assert.match(sheet,/WorkbenchWeekPolicy\.fresh\(snapshot/);
  assert.match(sheet,/selectedDay = day; render\(\)/);
  assert.doesNotMatch(sheet,/findFree|availableMinutes|autoApply|postDelayed\([^\n]*load/);
});

test("repeat occurrences, ambiguous snapshots, and loaded-only overlaps retain their boundaries", () => {
  const policy=source(java+"WorkbenchWeekPolicy.java");
  assert.ok(policy.includes('return id + "\\n" + start + "\\n" + end;'));
  assert.match(policy,/previous\.title\.equals\(entry\.title\) && previous\.category\.equals\(entry\.category\)/);
  assert.match(policy,/unique\.remove\(key\); ambiguous\.add\(key\)/);
  assert.match(policy,/Collections\.unmodifiableList\(ordered\)/);
  assert.match(policy,/a\.start < b\.end && b\.start < a\.end/);
});

test("account, authorization and activity boundaries clear the in-memory overview", () => {
  const main=source(java+"MainActivity.java"),sheet=source(java+"NativeWeekSheet.java");
  const start=main.indexOf("private void showWeek("),end=main.indexOf("private void showAi(",start);
  const host=main.slice(start,end);
  assert.match(host,/final String scope = activeDraftScope/);
  assert.match(host,/bridgeReady && homeReadSucceeded && !saving && !syncing && !bindingChanging/);
  assert.match(host,/scope\.equals\(activeDraftScope\)/);
  assert.match(host,/onClosed\(\) \{ weekSheet = null;/);
  assert.match(main,/private void showAuth\(\) \{\s+if \(weekSheet != null\) weekSheet\.close\(\)/);
  assert.match(main,/if\(!accountScope\.equals\(activeDraftScope\)\)\{\s+if \(weekSheet != null\) weekSheet\.close\(\)/);
  assert.match(sheet,/scopeMatches\(scope, host\.accountScope\(\)\)/);
  assert.match(sheet,/handler\.removeCallbacks\(staleTick\); snapshot = null/);
  assert.match(sheet,/timeline\.removeAllViews\(\)/);
  assert.match(sheet,/if \(closed \|\| requestRevision != revision\) return/);
});

test("overview is reachable from both home and schedules and preview metadata is aligned", () => {
  const main=source(java+"MainActivity.java");
  const quick=main.slice(main.indexOf("private void addQuickActions("),main.indexOf("private void ",main.indexOf("private void addQuickActions(")+20));
  const schedules=main.slice(main.indexOf("private void renderSchedules("),main.indexOf("private void ",main.indexOf("private void renderSchedules(")+20));
  assert.match(quick,/week\.setOnClickListener\(v -> showWeek\(\)\)/);
  assert.match(schedules,/week\.setOnClickListener\(v -> showWeek\(\)\)/);
  assert.match(source("android/app/build.gradle"),/versionCode 10020/);
  assert.match(source("android/app/build.gradle"),/versionName "1\.8\.18"/);
  const notes=source("docs/ANDROID-PREVIEW-RELEASE-1.8.18.md");
  assert.match(notes,/Phone acceptance is still pending/);
  assert.match(notes,/No private-site deployment/);
  assert.match(notes,/not availability/);
});
