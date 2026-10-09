# Android native 1.8.18-preview

## Native seven-day overview

The home page and schedules page now expose a native seven-day overview. The established green visual language remains unchanged. This page uses the existing authorized calendar GET; it does not generate an AI request or execute a plan.

Package: `com.richangyu.lifeworkbench.preview`
Version code: `10020`
The existing independent preview signing configuration remains unchanged.

## What the page actually shows

- Seven Beijing calendar days anchored to the day of the read, not a rolling 168-hour availability calculation.
- Only ongoing or future entries returned by the existing API. Schedules that already ended today are not returned by this API.
- At most 40 partial calendar choices. An empty day is not proof that the cloud calendar is empty or that the day is free.
- Day selection, chronological schedules, cross-day slices and original cross-day timestamps.
- Exact duplicate occurrences are merged by ID and parsed start/end. Distinct occurrences sharing one recurring ID remain visible.
- Conflicting details for the same occurrence are excluded and reported rather than guessed. Malformed rows are skipped and reported.
- Counts represent loaded day segments. A cross-day occurrence can be shown on several days.
- Approximate duration is clipped to the selected day. Overlapping durations are summed without de-duplication; this is not availability, actual completion time or a full calendar total.
- Overlap hints refer only to loaded entries, not every cloud conflict.

## Read and account boundaries

- Opening the page requests the existing `/api/assistant?days=7` GET once; refresh is manual.
- The endpoint name does not imply an AI-model request. Calendar viewing does not depend on the model-ready flag.
- Switching a day does not request data. A local timer updates snapshot freshness only; it does not poll the server.
- The snapshot timestamp and range remain visible. After five minutes or a Beijing date rollover, the page asks for manual refresh.
- Errors clear the previous snapshot instead of presenting it as a successful new read.
- Responses must match the authorized origin, API path, JSON format, seven-day range and Beijing timezone.
- The page is bound to the confirmed account/workbench scope and clears on closure, authorization navigation, account/workbench change and activity destruction.
- There is no new persistent calendar-content cache, permission, alarm, automatic save, background network request or provider configuration.

## Validation and phone acceptance

Targeted source guards and pure-Java tests cover date boundaries, device timezone independence, scope/freshness, repeated and ambiguous occurrences, multi-day clipping, loaded-only overlaps and bounded snapshots. Automated checks do not establish physical-phone acceptance.

Phone acceptance is still pending. Open the overview from both home and schedules, change days, refresh manually, inspect a cross-midnight entry and repeated occurrences, and check expiry, connection errors and reauthorization. Confirm that partial/empty-day disclosures remain legible with larger fonts.

No private-site deployment is included in this round. Private-site audience, database, API credentials, billing and production signing are unchanged. Existing AI plan signature, conflict and atomic-write mechanisms are not modified. This preview does not complete web-only feature migration, public multi-user launch, app-store review or phone acceptance.
