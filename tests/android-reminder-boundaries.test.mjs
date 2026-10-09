import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const java = "android/app/src/main/java/com/richangyu/lifeworkbench/";
const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("local reminders add contextual notifications, not exact alarms or a service", () => {
  const manifest = source("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android.permission.POST_NOTIFICATIONS/);
  assert.match(manifest, /android.permission.RECEIVE_BOOT_COMPLETED/);
  assert.match(manifest, /ScheduleReminderReceiver" android:exported="false"/);
  assert.match(manifest, /ScheduleReminderRestoreReceiver" android:exported="false" android:enabled="false"/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.doesNotMatch(manifest, /SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM|FOREGROUND_SERVICE/);
});

test("reminder dispatch is scoped, immutable, generic, and local", () => {
  const manager = source(java + "NativeScheduleReminders.java");
  assert.match(manager, /setAndAllowWhileIdle/);
  assert.match(manager, /PendingIntent.FLAG_IMMUTABLE/);
  assert.match(manager, /ScheduleReminderReceiver.class/);
  assert.match(manager, /scopeCurrent\(\)/);
  assert.match(manager, /WorkbenchReminderPolicy.mayDeliver/);
  assert.match(manager, /WorkbenchReminderPolicy.mayRestore/);
  assert.match(manager, /put\(item, "state", "handled"\); save\(items\);/);
  assert.doesNotMatch(manager, /setExact|HttpURLConnection|java.net.|WebView|MobileApiBridge/);
  assert.doesNotMatch(manager, /put\(item, "(title|note|place|email|cookie|origin|password)"/);
  const receiver = source(java + "ScheduleReminderReceiver.java");
  assert.match(receiver, /"local".equals\(data.getHost\(\)\)/);
  assert.match(receiver, /intent.getStringExtra\("token"\)/);
});

test("native UI validates current snapshot and clears reminders at account boundaries", () => {
  const main = source(java + "MainActivity.java");
  assert.match(main, /REMINDER_PERMISSION_REQUEST = 4100/);
  assert.match(main, /ActivityCompat.requestPermissions/);
  assert.match(main, /commitReminderRequest\(request\)/);
  assert.match(main, /!request.scope.equals\(activeDraftScope\)/);
  assert.match(main, /WorkbenchReminderPolicy.sameTime\(candidate/);
  assert.match(main, /reminders.reconcile\(accountScope, snapshot.optJSONArray\("schedules"\)\)/);
  assert.match(main, /private void bindWorkbench\(String origin\) \{\s+invalidateLocalReminders\(\)/);
  assert.match(main, /if \(required\) \{[\s\S]*?invalidateLocalReminders\(\)/);
  assert.match(main, /reminders.idForKey\(key, activeDraftScope\)/);
  assert.match(main, /currentSchedule\(id, snapshot\)/);
  assert.match(main, /selectTab\("schedule"\);\s+showScheduleDetails\(schedule\)/);
});

test("reminder preview version and release notes remain aligned", () => {
  const gradle = source("android/app/build.gradle");
  const workflow = source(".github/workflows/android-native-preview.yml");
  const version = /versionName "([0-9.]+)"/.exec(gradle)?.[1];
  const code = /versionCode ([0-9]+)/.exec(gradle)?.[1];
  assert.ok(version && code, "native version metadata is required");
  const notes = source("docs/ANDROID-PREVIEW-RELEASE-" + version + ".md");
  assert.ok(workflow.includes("versionCode='" + code + "'"));
  assert.ok(workflow.includes("versionName='" + version + "-preview'"));
  assert.match(workflow, /RICHANGYU_ANDROID_PREVIEW_CERT_SHA256/);
  assert.match(workflow, /:app:lintDebug/);
  assert.match(notes, /Phone acceptance is still pending/);
  assert.match(notes, /No private-site deployment/);
  assert.match(source(java + "NativePrivacySheet.java"), /2026-10-09/);
});
