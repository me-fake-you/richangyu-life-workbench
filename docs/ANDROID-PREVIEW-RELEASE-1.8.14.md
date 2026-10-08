# Android native 1.8.14-preview

## Today home and clear native entry points

- The first action area now contains food/calories, a new life record,
  a new schedule, and focus check-in. Part-time settlement, AI, and local
  drafts remain available as secondary actions.
- The home screen remains visible before a cloud snapshot is available.
  It explains binding/login and shows no invented cloud counts.
- Loaded data, refreshing data, a failed refresh, and uncertain save results
  have distinct messages. The displayed refresh time is local to this session.
- Today schedules and recent records link to their native lists. Today's
  schedule link clears an unrelated old search query.
- Narrow screens and large font settings use stacked actions.
- Existing native sheets, save confirmations, scoped drafts, privacy controls,
  and web-only feature labels remain in place. No new server write endpoint
  or private workbench permission change is introduced.

## Package and validation boundary

Preview application ID: com.richangyu.lifeworkbench.preview
Version code: 10016
Version name: 1.8.14-preview
Minimum SDK: 22
Target SDK: 36

The public preview workflow requires the existing pinned preview certificate,
runs Android unit tests and lint, builds the APK, and checks its package and
signature before publishing. The workflow adds the actual public certificate
digest and a SHA-256 file to the release.

This note is not evidence of phone acceptance. Actual installation, native
entry navigation, login, saves, synchronization, font/viewport screenshots,
and replacement updates must still be tested on a real Android phone.
The presentation-policy tests cover state and layout decisions, not taps,
network service availability, or visual screenshots.

This is not a production-signed package or an app-store release.
It does not deploy the independent multiuser service or open the owner's
private workbench. Production signing keys are unchanged.

## Installing and updating

Install over the compatible preview with the same package and pinned signing
identity. Do not uninstall first merely to make installation appear successful;
uninstalling can discard local drafts. If Android reports a signature mismatch,
stop and report the prior version and message rather than deleting user data.

New native UI is delivered in this APK; updating the web workbench alone
does not install it on an older App.

## Next work

After real-device feedback, the next product milestone is optional native
schedule reminders. Offline synchronization and contextual AI plan changes
remain separate planned milestones:
[NATIVE-APP-UPGRADE-PLAN-20261009.md](NATIVE-APP-UPGRADE-PLAN-20261009.md).
