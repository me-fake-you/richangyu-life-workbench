# Android native preview 1.8.2

## What this round implements

- Native home, records, check-in and schedule pages remain in the Android Activity.
- Native AI chat and plan sheets, with explicit signed-draft confirmation before any save.
- Optional calendar context: select up to eight schedules, otherwise no calendar rows are shared.
- Separate per-request consent for financial text, credential filtering, quota cooldown, draft expiry and uncertain-write protection.
- An HTTPS workbench origin is entered on first launch. No personal production address or AI key is embedded.
- Switching workbenches clears client session, snapshot and AI drafts, not cloud records.
- Uncertain save state survives process restart and blocks further writes until the user checks cloud results.
- Android Gradle no longer includes the obsolete Capacitor/Cordova projects or applies their generated script. Root npm Capacitor tooling and its audit findings are not claimed fixed.

## Installation preparation

Build the native project with Java 17 or a compatible local JDK, Android SDK 36 and Gradle 8.11.1:

```powershell
cd android
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --console=plain
```

The debug output is `android/app/build/outputs/apk/debug/app-debug.apk`. The local packaging helper copies it to `outputs/android/life-workbench-debug.apk` and writes a SHA-256 file.

Application ID: `com.richangyu.lifeworkbench.preview`. Version: `1.8.2-preview`. This is a development preview, not an application-store release. Rename a transferred `.apk.1` file to `.apk` if necessary and open it with Android's installer, not a chat application's file preview. Only install packages from sources you trust.

On first launch enter your own trusted workbench HTTPS root address, authorize inside the app, then return to the native pages. The server must provide `/mobile-connect`, `/api/mobile` and `/api/assistant`. Authorization is still session-based and its embedded-provider compatibility requires real-device testing.

## Verification result, 2026-10-03

The app now owns the three legacy theme colors previously supplied by removed Capacitor components. Java compilation passed. Tests initially failed to load both old and new classes in the original workspace. Copying only native sources into an ASCII isolated directory, without release keys or web assets, produced a successful Gradle build and 9/9 tests (eight policy tests plus the inherited example). The exact underlying workspace/cache incompatibility is not claimed conclusively diagnosed.

Local preview: 3,393,484 bytes, SHA-256 `57b9e4691a126ccc35a9101d81500c14e6f5e62a1983c8c61f10d9ec632d53f6`; Android Debug v1/v2 signature verified. Package `com.richangyu.lifeworkbench.preview`, version code `10004`, version `1.8.2-preview`, min SDK `22`, target SDK `36`. The metadata tool likewise required the ASCII artifact path. CI-built bytes/signature differ and are not represented by this local hash.

The new standalone public Android project and publishing workflow must pass their own CI before public download is declared ready. Tests cover address normalization, endpoint allowlisting, financial consent, credential detection and draft confirmation constraints. They do not cover Android UI, provider login, real network writes or end-to-end synchronization.

The user currently cannot connect an Android phone. Installation, login, AI confirmation writes, reload/synchronization, keyboard/layout behavior and upgrade installation remain pending on a real device. This round does not deploy the private server or modify its data.

## Update and release boundaries

The app reads online workbench data. Compatible server/data updates become visible after sync; new native screens or Android integrations require a new APK. Draft confirmation always remains server-validated.

Existing release signing material must be preserved. Formal APK/AAB packaging still requires local signing configuration, a stable signing key and store account/material review. Passwords, release keys, production addresses, databases and personal records must never be uploaded. CI debug signatures can differ from a local debug signature, so an APK produced elsewhere is not guaranteed to update an existing preview without uninstalling it. Do not uninstall solely to bypass a signature mismatch if there is unsynced state.

This round does not claim store submission, approval, a public Release download, complete dependency-audit remediation or real-device acceptance.
