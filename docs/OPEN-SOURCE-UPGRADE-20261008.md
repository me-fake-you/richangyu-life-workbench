# Workbench upgrade goal and acceptance plan

## Goal

Deliver a useful native Android companion, with discoverable features, safe write
operations and independently owned future multiuser spaces, without changing the
private site's audience or the formal signing key.

## What we learned

We studied design patterns, not copied third-party implementations.

- [Memos editor architecture](https://github.com/usememos/memos/blob/main/web/src/components/MemoEditor/README.md):
  compose quickly, separate editing state from save coordination, and preserve drafts.
- [wger nutrition logging](https://github.com/wger-project/wger/blob/master/wger/nutrition/models/log.py):
  keep quantities explicit and review portion assumptions rather than treating estimates as truth.
- [Super Productivity sync primitives](https://github.com/super-productivity/super-productivity/blob/master/packages/sync-core/src/vector-clock.ts):
  distinguish retries from genuinely concurrent changes. This project uses operation receipts and revision guards,
  not a copied vector-clock engine.
- [Joplin offline-first sync](https://joplinapp.org/help/dev/spec/sync/):
  keep local drafts recoverable; remote conflicts must not silently erase work.
- [AppFlowy space permissions](https://appflowy.com/blog/appflowy-updates-space-permissions-member-groups-database-rollups-and-more):
  spaces and permissions must be explicit.

Third-party repositories have different licences. No third-party source was imported
by this upgrade, and the existing project licence is unchanged.

## Implementation acceptance

- Native navigation: nutrition, work, drafts, records, schedules and AI are reachable without a web-only detour.
- Nutrition: scoped common meals, reviewed reuse and proportionate calorie/macronutrient scaling.
- Work: projects -> timed work -> confirmed receivable -> partial actual payment, sharing the existing web ledger.
- AI: preview/confirmation retained; undo checks account, expiry, original audit receipt and unchanged current state.
- Offline: explicit local save, account/origin partitioning, manual submission, stable operation IDs and uncertain-result recovery.
- Independent multiuser foundation: server-owned spaces plus record/schedule storage, revision checks and idempotent receipts.
  Content remains opt-in and disabled by default. No route falls back to the private legacy database.

Tests must exercise duplicate requests, changed amounts, interrupted results,
cross-account access, stale revisions, rollback, expiry and edited-record undo.

## External delivery requirements, still pending

- Real-phone installation, authentication, camera/gallery, offline/retry and cross-device sync tests.
- Verified identity gateway and separately provisioned multiuser database.
- Native multiuser onboarding and the remaining multiuser workbench modules.
- Formal production signing and application-store developer account, privacy material and review.

These requirements cannot be replaced by a passing build. Public registration,
application-store listing and a fully offline or fully multiuser App are not claimed.
