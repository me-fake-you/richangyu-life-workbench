import assert from "node:assert/strict";

/** Keep release alignment checks valid across later preview versions without weakening the baseline. */
export function assertPreviewMetadata(source) {
  const gradle = source("android/app/build.gradle");
  const workflow = source(".github/workflows/android-native-preview.yml");
  const match = /versionName "(\d+)\.(\d+)\.(\d+)"/.exec(gradle);
  const code = Number(/versionCode (\d+)/.exec(gradle)?.[1]);
  assert.ok(match && Number.isSafeInteger(code) && code >= 10021 && code <= 2100000000,
    "native preview metadata must meet the supported baseline");
  const parts = match.slice(1).map(Number), baseline = [1, 8, 19];
  let comparison = 0;
  for (let i = 0; i < 3; i++) {
    if (parts[i] !== baseline[i]) { comparison = parts[i] - baseline[i]; break; }
  }
  assert.ok(comparison >= 0, "native preview version cannot regress below 1.8.19");
  const version = parts.join(".");
  assert.ok(workflow.includes("versionCode='" + code + "'.*versionName='" + version + "-preview'"),
    "APK badging verification must match current Gradle metadata");
  assert.ok(workflow.includes("tag=v" + version + "-preview"), "release tag must match the current preview");
  assert.ok(workflow.includes("life-workbench-v" + version + "-preview.apk"), "APK filename must match the preview");
  assert.match(workflow, /RICHANGYU_ANDROID_PREVIEW_CERT_SHA256/);
  assert.match(workflow, /:app:lintDebug/);
  return { version, code, notes: source("docs/ANDROID-PREVIEW-RELEASE-" + version + ".md") };
}
