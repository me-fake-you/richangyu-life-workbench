# Android native 1.8.17-preview

## Scope

This round improves the existing native AI plan-adjustment experience. It does not introduce a new AI service, a new model, automatic calendar sharing, or automatic plan execution.

Package: `com.richangyu.lifeworkbench.preview`
Version code: `10019`
Preview signing configuration remains unchanged. The production signing key is not used or changed.

## Visible references and manual context

- Open AI Assistant, choose Plan adjustment, and manually choose calendar references.
- Calendar sharing is off by default. At most eight uniquely identifiable references can be selected.
- The current API returns at most 40 calendar choices for the selected range; this is a partial list, not the entire calendar.
- Repeated IDs, including ambiguous recurring instances, are excluded from selection instead of being treated as independently editable entries.
- Each selected reference displays its title, time, and editable or reference-only status.
- Reference freshness uses monotonic device time with a five-minute limit. Old references must be read again before they are shared.
- Changing the workbench or account invalidates the session. Applying or undoing a plan invalidates old reference freshness.
- Clear conversation references is manual and local to the current sheet. It does not delete cloud records or make an AI request.

## Review before saving

- Plan cards show create or update actions and a before/after comparison.
- Original snake_case timestamps returned by the existing server are displayed correctly alongside the proposed timestamps.
- The visible operation projection is compared with the signed payload. This is not client-side cryptographic signature verification.
- Local guards reject unknown actions, duplicate operation IDs, ambiguous or unselected updates, reference-only updates, invalid time ranges, stale original times, and overlaps between proposed operations.
- The plan-review checkbox starts unchecked and is required before confirmation.
- Server warnings, expired drafts, mismatched reference counts, uncertain workbench state, and account changes continue to block saving.
- Existing authenticated server signature, subject, expiry, conflict, atomic-write, and undo checks remain authoritative and unchanged.
- There is no automatic generation, application, or retry of uncertain saves.

## Revision and receipt boundaries

- Revise a suggestion returns the original user prompt for manual editing; it does not submit the prompt automatically.
- Previous unsaved suggestions shared with the model contain only the summary and proposed action/title/category/time/note projection, not full original records, signatures, or IDs.
- Unselected calendar titles shown by the server in conflict warnings are not automatically copied into a new AI request.
- The sync-status receipt timestamp now includes valid native AI apply and undo receipts, scoped to the confirmed workbench and account.
- A receipt timestamp is not a full synchronization log or evidence that every feature has synchronized.

## Validation and rollout

Targeted source guards and pure-Java plan-review tests are included. Build, test, package verification, and publication require approval for this round. Automated checks are not a live AI-provider request, real-account mutation test, or physical-phone acceptance.

Phone acceptance is still pending. On a phone, check a selected editable schedule, a reference-only schedule, before/after times, explicit review, manual revision, conflicts, expired references, apply, and undo. Do not repeatedly submit a save whose outcome is uncertain.

No private-site deployment is included in this round. Existing private-site audience, API credentials, billing configuration, database, and production signing remain unchanged. This preview does not launch a public multi-user service, complete all web-only feature migrations, or establish app-store readiness.
