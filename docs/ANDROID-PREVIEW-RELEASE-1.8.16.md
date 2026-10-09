# Android native 1.8.16-preview

## Clear local and cloud state

- A native Sync Status and Local Drafts center is reachable from Home and My, including when no cloud snapshot is available.
- The center distinguishes cloud reads, local-only drafts, rejected requests, uncertain outcomes, and confirmed save receipts. It never calls an unreadable draft store an empty list.
- Refresh is read-only and does not automatically send drafts, retry writes, or treat one successful read as full synchronization.
- Previously authenticated accounts can open native record and schedule forms while disconnected and explicitly save local drafts. Drafts remain partitioned by workbench and account.
- The app does not add a persistent cloud-content cache. Closing the app still requires another cloud read; nutrition and work entries are not newly advertised as offline-capable.

## Confirmed is different from pending

- A draft is marked uncertain before sending, and retains its original operation number across retry.
- A matched successful receipt immediately blocks a second send in the current session, then marks the local draft confirmed before removing it.
- If local cleanup fails, a confirmed copy permits local-only cleanup, not another submission.
- A rejected request is shown separately, without claiming that earlier attempts never reached the cloud.
- Authorization failures retain the draft and original operation number, and require login again.
- Review-required items are listed first. No automatic submission, regenerated operation IDs, bulk send, or cloud deletion is added.
- Clearing a main-page / AI uncertain-save marker requires a successful current-account read and explicit manual acknowledgement. It is not server proof and does not resubmit anything. Nutrition uncertainty is handled separately in its own native screen.

## Timestamp and privacy boundary

Only the time when the app received a validated save receipt is added to account-scoped private preferences; no additional event text, cloud ID, credentials, or provider key is stored by this status feature. The time is recorded by the phone clock, not an authoritative server timestamp. It covers the main-page and draft flows, not every feature or all historical cloud operations. A missing timestamp never means the cloud is empty. Reauthorizing or switching accounts does not delete existing local drafts, timestamps, or cloud data.

## Validation and remaining acceptance

The release workflow runs Android unit tests, compilation, lint, package metadata checks, and verification against the existing persistent preview certificate before publishing this immutable prerelease. Repository CI checks source boundaries and builds. Automated checks are not real-device acceptance.

Phone acceptance is still pending: create record/schedule drafts without a connection, verify local-only labels, reconnect without automatic send, manually confirm one draft, inspect failure/uncertain handling, switch accounts, and install over the preceding preview. Reminder arrival and reboot behavior from 1.8.15 still require phone testing.

No private-site deployment, audience change, formal signing-key change, public multiuser launch, or app-store approval is included. Full web-only areas remain web-only.

[Overall upgrade plan](https://github.com/me-fake-you/richangyu-life-workbench/blob/codex/workbench-ai-20261002-c258dd87/docs/NATIVE-APP-UPGRADE-PLAN-20261009.md)

Next product phase: context-aware AI plan changes with preview, conflict explanation, explicit confirmation, and safe undo; not autonomous unreviewed schedule edits.
