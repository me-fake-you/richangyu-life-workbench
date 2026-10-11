# Android native 1.8.19-preview

Source preparation: 2026-10-10; local verification: 2026-10-11.
Publication is not established by this file.

## Native calendar browsing

- Browse seven Beijing calendar days, move to previous/next periods or choose a date.
- Read today's ended arrangements and stored historical occurrences.
- Load 50 entries per manual page instead of using the 40-row AI context.
- Calendar changes invalidate older pagination; refresh instead of mixing revisions.
- Show stored status, actual minutes, reflection and interruption separately from plan.
- Keep the old recent preview available when a bound server has not deployed the new endpoint.

The new endpoint is /api/mobile-calendar. It projects stored occurrences and single
non-repeating source events without creating new schedules or execution records.
Ungenerated recurring history is not inferred. This is not availability, not a
complete recurrence expansion, and not a full execution/finance editor.

The per-period capacity is 2,000 rows. Excess data produces an explicit error.
The native view renders 100 day entries at a time, with a manual local reveal control.
Only account-scoped in-memory calendar content is retained. No new Android permission,
background fetch, provider request, fee or persistent cloud-content cache is introduced.

## Delivery status

No private-site deployment is performed by installing this APK. Operators must
publish /api/mobile-calendar separately; a server without it retains the explicit
legacy-preview option. Owner-private deployment results are reported separately.

Local Android compilation, debug packaging and 165 unit tests passed. Android lint
has 0 errors and 46 warnings. Local Node checks: 114 total, 113 passed and 1 skipped
because Git tracking could not be checked in the extracted source workspace.
Type checking and web build passed; frontend lint has 0 errors and 9 warnings.
Cloud workflows, persistent preview signing and package hashes require actual results.
Production dependency audit: 0 findings in the public source; the full audit still
has 8 high development-tool findings from unpatched braces 3.0.3. No security
suppression or unsafe framework downgrade is used.
Phone acceptance is still pending. Public multiuser service and store release remain pending.
Existing preview signing is retained; production signing and store submission are unchanged.
