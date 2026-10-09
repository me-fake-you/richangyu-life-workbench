# Android native 1.8.15-preview

## Local schedule reminders

- Open Schedule, tap a schedule, then choose the local-reminder action.
- Choose at start, or 10, 30, or 60 minutes before start. Only future valid times are accepted.
- Notification permission is requested only after choosing to set a reminder. Declining does not block schedules.
- The My screen includes reminder counts, settings guidance, a refresh action, and confirmed local-only cancellation.
- Notifications contain only a generic prompt, not the schedule title, notes, place, or account.
- Tapping a notification opens the native app, requires its existing authorization, and checks a fresh current-account snapshot before opening details. No cloud record is created by a tap.

## Explicit limits

- These are inexact local alarms, not guaranteed on-time notifications. Android power saving, force-stop, disabled permissions, or device behavior can delay or prevent them.
- No exact-alarm permission, foreground service, background network polling, or new paid service is added.
- The boot/update/time-change receiver is enabled only while an armed reminder exists. Recovery restores only future reminders; overdue reminders are not replayed.
- Remote edits and cancellations are checked only when the app successfully refreshes. This is not real-time background sync.
- The mobile API returns a limited schedule snapshot. An absent or ambiguous item is paused for review, never assumed deleted. Paused reminders require an explicit new setting.
- Changed dates are re-armed only when the same scheduled item is confirmed active and its selected reminder time is still in the future.
- Account changes, workbench switches, and authorization failures invalidate and clear old local reminders. Cancelling a reminder never deletes a cloud schedule.
- At most 64 reminder settings are retained locally. Metadata consists of IDs, timestamps, offsets, random delivery tokens, and a hashed account scope; no event text or credentials are saved in the reminder store. App-private storage is not an additional encryption guarantee.

## Validation and distribution

The release workflow runs Android unit tests, compilation, lint, package metadata checks, and verification against the existing persistent preview certificate before publishing this immutable prerelease. Repository CI separately checks source boundaries and application builds. These automated checks do not establish real-device notification delivery.

Phone acceptance is still pending: permission allow/deny, a future reminder while idle, tapping with the app closed, account switching, reboot recovery, force-stop behavior, and updating over the prior preview need owner-device testing. No connected-phone or store-approval claim is made.

No private-site deployment, audience change, formal signing-key change, or public multiuser rollout is included. This remains a preview app, not an app-store release. Existing native record, nutrition, work, and schedule flows remain; full web-only areas are not represented as completed native features.

[Overall native-app upgrade plan](https://github.com/me-fake-you/richangyu-life-workbench/blob/codex/workbench-ai-20261002-c258dd87/docs/NATIVE-APP-UPGRADE-PLAN-20261009.md)
