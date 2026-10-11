# Android delivery roadmap

Updated: 2026-10-11
Product: Richangyu / Life Workbench
Status: implementation in progress; overall delivery is not complete

## Overall goal

Deliver a usable native Android life workbench, not a shortcut that requires using
the website for its advertised core workflows. Preserve the existing private Site,
personal data and production signing. Work within the user's continuous authorization
for relevant source reads, staged implementation, checks and preview publication.

Use the existing unfinished goal. Do not create a duplicate goal, silently resume
a blocked controller, or mark it achieved merely because an APK compiles.
Physical phone evidence, an independent multiuser launch and store submission are
separate outcomes. The existing goal is active; implementation and external
acceptance must be tracked separately.

## Milestones and acceptance gates

| Milestone | Concrete outcome | Finish evidence | Current state |
| --- | --- | --- | --- |
| 1. Reliable phone core | Binding, login, records, focus, nutrition, schedules, reviewed AI actions, safe sync and update | Phone install/update, real login, save/reopen, cross-device read and uncertain-write recovery | Preview 1.8.18 released; physical acceptance pending |
| 2. Calendar completeness | History, manual pagination, recurrence coverage, plan versus execution, range changes | Checked endpoint/client, compatible private deployment, phone paging and history evidence | 1.8.19 source introduces stored-occurrence/single-event browsing; recurrence expansion parity remains unfinished |
| 3. Native ledger and goals | Account/transaction entries, goals/tasks, explicit confirmations, receipts and concurrency checks | Authorized focused tests/build, deployed contract, actual phone create/read/update | Existing work settlements are native; full ledger/goals still web-only |
| 4. Review and coherent experience | Readable daily/weekly review, consistent entry points, search, loading/errors, accessibility | Checked native views and representative large-font phone screenshots | Existing home and feature map available; native review and UI parity pending |
| 5. Independent multiuser | Separate service, trusted identity, independent spaces, onboarding, export/deletion | Authorized separate deployment and two controlled accounts proving isolation | Foundation exists; no public registration or deployment claimed |
| 6. Formal release | Production signing, selected-store materials, privacy/contact/delete flow, submission | Authorized signed package, phone update, required store account and submission receipt | Preview signature only; formal signing and store submission pending |

The milestones are bounded delivery outcomes, not an unlimited list of invented
features. Several can be implemented together, but external phone/account/review
steps cannot be promised to complete in a fixed number of rounds.

## Verified released baseline

- Repository: https://github.com/me-fake-you/richangyu-life-workbench
- Development branch: codex/workbench-ai-20261002-c258dd87
- Source head: e5414b2ee4399861a10fa66efd334f7f4f65fe88
- Preview: https://github.com/me-fake-you/richangyu-life-workbench/releases/tag/v1.8.18-preview
- Package/version: com.richangyu.lifeworkbench.preview / 1.8.18-preview / 10020
- Minimum/target SDK: 22 / 36
- APK SHA-256: 48c2a400211dbe33351bfc6587adf62b9fb1a89bb31e559f2713b59fc0e09592
- Preview certificate SHA-256: 3d95f415542ae451b8ba42dce11a2fbc536e72b3264c99280d77efb1dd05f79a

Baseline evidence: 156 Android unit tests, 17 targeted Node tests and 97 cloud Node
tests passed; Android/CI/CodeQL workflows succeeded. Android lint retained 43 warnings,
frontend lint retained 9 warnings. These results do not validate subsequent edits.
No private Site deployment or physical phone acceptance was completed by that release.

## Current source stage: calendar browsing

- Separate calendar GET from AI context. Never widen AI sharing just to browse.
- Seven Beijing calendar days with previous/next periods and date selection.
- Read ended-today and historical entries, including long events crossing the boundary.
- Read 50 rows per manual page, capped at 2,000 rows per period with an explicit
  capacity error rather than pretending excess data is absent.
- Freeze pages using a digest of account, range, coverage and all selected stored rows.
  Any changed content/account/range rejects an old cursor and requires refresh.
- Preserve stored execution status, actual minutes, reflection and interruption;
  never infer completed work or payments from a planned duration.
- Single non-repeating events without an instance are projected without inserting
  new events, occurrences, audit entries, execution records or model requests.
- Repeating events are limited to existing generated instances. Unmaterialized
  recurrence history is not inferred. Full expansion parity is a remaining task,
  so this stage is not advertised as a complete cloud calendar or availability tool.
- Data is kept in memory only; binding/auth/account/activity boundaries clear it.
- A server without the new endpoint offers an explicit legacy-preview button,
  retaining the earlier bounded 40-row read view.
- Native render work is capped to 100 visible day entries at a time, with a manual
  local reveal button. This does not fetch or write additional cloud data.
- New native screens require a newly installed APK. An interface deployment cannot
  update an already installed native layout.

Current source version: 1.8.19 / 10021. Implementation, checks, private deployment,
public source publication and phone acceptance must be reported separately.
A version number or a local debug APK is not proof of a published signed preview.

Local verification on 2026-10-11: 165 Android unit tests passed; Android compile,
debug packaging and lint succeeded (0 errors, 46 warnings). Node checks: 114 total,
113 passed and one Git-tracking check skipped in the ZIP-extracted workspace.
Type checking and the web build passed; frontend lint retains nine warnings.
The public source production audit has zero findings, but the full audit retains
eight high development-tool findings from unpatched braces 3.0.3:
https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
Do not interpret the production-only result as complete dependency remediation.
The private Site has a separate dependency baseline and must be checked separately.

## Continuous authorization and hard boundaries

Authorized: relevant source rereads, staged edits, focused checks, Android packages,
preview publication using the existing independent workspace and preview certificate,
and private interface deployment with the same owner-only audience.

Separate human decisions remain required for public multiuser launch, paid resources,
production signing and actual app-store submission. Never copy the private database,
photos, tokens, secrets or signing keys into the public repository or new service.

Use branch-head leases and immutable previews. Preserve unrelated changes. Disclose
newly discovered authored bugs before repairing them under the editing constraints.
Do not replace phone acceptance with browser checks or describe pending checks as passed.

## Remaining inputs and blockers

- Physical Android installation/update, authorization and cross-device operation results.
- Canonical recurrence expansion/history parity before claiming a complete calendar.
- Native ledger, goals and review endpoint/client delivery.
- Independent service deployment target and controlled second-account configuration.
- Chosen store, developer account, privacy contact/delete-request channel and production-signing authorization.
- Sites source access and publication transport must succeed before any private
  deployment is claimed; a transient connection failure must not alter the old Site.
- Comprehensive dependency security checks still belong to the overall goal.
  A zero production audit does not establish zero development-tool vulnerabilities.

Mark each item implemented, checked, published and phone-accepted separately.
Only mark the overall goal achieved when its required outcomes actually exist.
