# Native App Upgrade Plan

Date: 2026-10-09

## Status and scope

This is a researched implementation plan, not a new Android release.
The baseline is development commit 87975258d1a6646bffa9dde4a7d4e34200d5e43a.
The downloadable native preview remains 1.8.13-preview.
None of the proposed milestones below is marked delivered by this document.

The product focus is a personal daily-action workbench: record life, arrange
time, track food and part-time work, and turn AI suggestions into reviewed
actions. Do not rebuild it as a second generic document editor or a website
wrapper. Preserve the existing forest-green visual language.

Phone installation, login, actual saves, synchronization, and replacement
updates still require real-device evidence. A web check or a CI result is
not evidence that these flows work on a particular Android phone.

## What to learn from open source

| Reference | Verified source material | Design lesson for this project |
| --- | --- | --- |
| [Tasks.org documentation](https://tasks.org/docs/) and [reminders](https://tasks.org/docs/notifications/) | Android task management, recurring tasks, notifications, filters, and sync options; reminders can repeat until completion. | Make reminders a first-class native action, with understandable opt-in and cancellation. |
| [Joplin synchronization specification](https://joplinapp.org/help/dev/spec/sync/) | Offline-first local data, uploads/downloads, item sync state, target-scoped tracking. | Separate locally saved data from confirmed cloud data; keep identity and sync-target boundaries explicit. |
| [AppFlowy repository](https://github.com/AppFlowy-IO/AppFlowy) | AI workspace and native mobile distribution using Flutter and Rust. | Keep navigation and contextual AI inside the app rather than sending routine actions to a browser. |

These are architectural and interaction references, not dependencies imported
by this change. No upstream source code, icons, branding, or credentials are
copied. Any later code reuse needs a separate license and compatibility review.
Do not claim this project inherits their encryption, sync protocols, or cloud
features. Open-source availability does not establish that a hosted service or
an AI API is free without limits.

## Existing native capabilities, not new promises

The native feature catalog already lists food/calorie capture, life records,
schedules, focus check-ins, part-time work and settlement, AI, and scoped local
drafts. Their presence in source does not prove a user's phone can reach and
complete the flows.

Full finance books, photo albums, custom tables, intelligence feeds, reviews,
task/goal management, backup recovery, and the private vault are still listed
as web-only. Keep these labels truthful; do not label a browser link as a
completed native feature.

Independent multiuser foundations are not a publicly deployed, fully bound
Android service. Do not invite other users into the owner's private workbench.

## Milestone 1: Today home and discoverable native actions

Priority: next implementation candidate.
Status: planned; scoped source re-reading and packaging approval requested.

- Keep the existing five-tab navigation and recognizable visual identity.
- Put food/calories, a new record, a new schedule, and a focus check-in in a
  clearly labeled first-screen action area.
- Make the food entry name explicit; do not rely only on an ambiguous icon.
- Show today's schedule and ongoing focus state when the available data
  supports them, with compact cards rather than duplicate large panels.
- Show loading, disconnected, empty, local-only, and last-successful-refresh
  states distinctly. Do not replace an unknown value with a fake zero.
- Treat partial snapshots as partial; do not present loaded items as complete
  cloud totals. Use the existing date policy consistently.
- Put less frequent features in a searchable feature map with native/web-only
  badges. No duplicated storage or new server write endpoint for navigation.
- Preserve readable Chinese labels, large-font layouts, contrast, tap targets,
  and the existing privacy/connection controls.

Acceptance:

1. A user can find food/calories without using feature search.
2. Each shortcut opens the existing native flow, not an external web page.
3. A disconnected or empty workbench explains the next action without claiming
   that private data is absent or that synchronization has completed.
4. Large font settings do not hide actions or the navigation bar.
5. Existing binding, account boundaries, drafts, and confirmation flows remain
   intact. Phone screenshots are recorded as actual evidence, not assumed.

## Milestone 2: Native schedule reminders

Priority: after navigation, independently shippable.
Status: planned.

Start with optional reminders for individual schedules. Evaluate recurring
schedules only after the single-reminder lifecycle is proven.

- Request notification access in context, not on first launch.
- Explain denied permission without blocking schedule creation.
- Cancel or replace reminders on schedule edit, completion, deletion, account
  change, and binding change.
- Handle process death, reboot, time/time-zone change, and duplicate scheduling.
- Scope reminders to the bound origin and account; do not display another
  account's event details.
- Use a privacy-conscious lock-screen notification and open the intended native
  item after a tap.
- Do not request exact-alarm access by default or promise precise delivery
  without meeting current platform and store requirements.
- Explain battery-saving and delivery limitations honestly.

Platform references:
[notification permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission)
and [alarm scheduling](https://developer.android.com/develop/background-work/services/alarms).

Acceptance:

1. A permitted reminder arrives and opens the correct item on a real phone.
2. Editing or deleting an item does not leave an obsolete reminder.
3. Permission denial, background operation, reboot, and account changes have
   documented actual results.
4. No reminder is presented as guaranteed when system policy can delay it.

## Milestone 3: Explicit offline and synchronization state

Priority: after single-device reminder basics.
Status: planned.

Build on the existing account/origin-scoped drafts; do not replace them with
an unreviewed automatic upload queue.

- Add scoped cached reads and a visible last successful synchronization time.
- Distinguish draft, explicitly submitted/pending, confirmed, failed, and
  conflicted items.
- Only enqueue a write after the user's explicit submission; preserving a draft
  alone must never authorize later upload.
- Persist stable request identities for retry without duplicate creation.
- Handle server revision conflicts explicitly; do not silently overwrite a
  newer version or replay a write under a different account.
- Show actionable retry guidance rather than a permanent connecting badge.
- Keep deletion semantics explicit: removing a local draft is not cloud deletion.
- Do not claim end-to-end encryption or encrypted draft storage unless those
  properties have been implemented and independently established.

Acceptance:

1. Airplane-mode drafts survive an app restart without creating cloud records.
2. A submitted retry creates at most one server item.
3. Account or origin changes do not expose, submit, or replay another scope's data.
4. A two-client edit conflict is visible and does not silently discard data.
5. Refresh and successful sync are tested on the actual bound service and phone.

## Milestone 4: Contextual AI plan adjustment

Priority: after reliable data flow.
Status: planned.

Extend the existing preview/confirm/undo safety model instead of bypassing it.

- Let a user describe a part-time shift, appointment, or change of plans in
  natural language and see proposed schedule/record changes.
- Ask for missing dates or ambiguous time ranges; do not silently invent them.
- Make any selected workbench context explicit and minimal. Do not upload the
  full private workbench or unrelated history by default.
- Display each addition, edit, and potential scheduling conflict before saving.
- Preserve explicit confirmation, validation, request identities, and safe undo.
- Treat quoted records, documents, and external material as data, not authority
  to perform unrelated actions.
- Preserve manual review of work settlement and actual financial receipt data.
  Do not infer real income solely from hours or AI-generated estimates.
- Show provider availability, quota exhaustion, timeout, and model limitations
  clearly; no promise of unlimited free AI or perfect food-photo accuracy.

Acceptance:

1. A proposal alone changes no stored item.
2. Only reviewed, selected actions are applied once after confirmation.
3. Ambiguous requests and unavailable AI leave the original plan unchanged.
4. Undo operates only within its supported scope and time window.
5. Private context is not sent unless the user has selected the intended scope.

## Delivery cadence and gates

There are four product milestones, not a promise that four chat turns can
complete them. Each milestone has a separate source change, targeted checks,
preview package when Android changes, and phone evidence.

Do not release another preview merely to change a version number. Preserve the
fixed preview signing identity and never replace the production signing key.
Do not overwrite existing releases or ask users to uninstall and lose local
drafts to simulate a successful update.

This planning commit changes documentation only: no runtime code, dependency,
permissions, server deployment, App version, signing, or APK bytes are changed.
It does not run a fresh test suite or establish new CI results.

## Separate public launch track

Public promotion, public registration, and store submission have additional
gates outside the four native usability milestones.

- Keep the private workbench separate from an independent multiuser service.
- Finish ownership, authentication, isolation, deletion, abuse controls, and
  the actual native binding protocol before opening public registration.
- Finish operator contact, privacy notice, retention/deletion procedures,
  formal signing, store assets, and required store accounts.
- Resolve the PR merge-state anomaly without forcing or overwriting main.
- Track the development dependency risks, legacy lockfile consistency, and
  private deployment patching separately. The prior production npm audit
  result is not a claim that all deployments or tooling are vulnerability-free.
- Describe the current APK as a preview. Do not advertise store availability,
  native feature parity, universal login, or real-device acceptance before
  those facts are established.

## Next implementation boundary

Only Milestone 1 is proposed for the next code change. Re-read the required
native screen, feature catalog, version configuration, and related checks with
the user's approval; plan one application phase; run the explicitly authorized
targeted checks and preview build; publish with the existing preview identity.
Preserve unrelated local work and private Site permissions.
