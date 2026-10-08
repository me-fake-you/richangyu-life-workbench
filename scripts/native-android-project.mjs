#!/usr/bin/env node

// Native project guidance only. Never installs tools, regenerates Android files, signs or uploads.
const action = process.argv[2] || "guide";
const guidance = [
  "Richangyu now uses the independent native Android project in android/.",
  "Open android/ in Android Studio, or use the existing Gradle build scripts.",
  "Native build: npm run android:build:debug",
  "Formal build: npm run android:build:release (requires the owner's configured signing environment).",
  "Public updatable previews use the fixed preview signing workflow, not a local random debug key.",
  "Phone acceptance: docs/ANDROID-PHONE-ACCEPTANCE.md",
  "Signing and store preparation: docs/ANDROID-STORE-PREPARATION-20261003.md",
  "This guide does not check tools, run tests, build an APK, read signing keys or publish."
].join("\n");
if (action === "guide") {
  process.stdout.write(guidance + "\n");
} else {
  process.stderr.write(
    "This legacy Capacitor command is retired for the native Android project.\n"
    + "It has not installed Capacitor, synced a web shell or regenerated Android files.\n"
    + guidance + "\n"
  );
  process.exitCode = 1;
}
