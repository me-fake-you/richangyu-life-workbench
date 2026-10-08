# Android delivery roadmap

Updated: 2026-10-08
Product: Richangyu / Life Workbench
Status: active, not complete

## Overall outcome

Deliver an Android application that directly supports check-ins, records, schedules,
reviewed AI actions and synchronization with an explicitly bound workbench.
Preserve private workbench access, signing keys and personal data. Prepare a formally
signed installable release and store submission materials. Submit for review only
after the required account, signing and publication authorization is available.

Also retain the original security scope: resolve public development-branch dependency
security alerts and keep the authorized comprehensive checks passing. A prior passing
check is evidence for that revision only, not for future edits.

A preview APK, an Android compile, a web check or a checklist alone does not establish
successful phone usage, complete account isolation or app-store availability.

## Delivery stages and exit criteria

| Stage | Work | Evidence required to finish | Current state |
| --- | --- | --- | --- |
| 1. Phone functionality | Install/update, binding, authorization, check-ins, records, schedules, nutrition, work settlements, AI preview/confirmation, synchronization | Actual phone results for installation, login, saving, reopening and cross-device synchronization; no unresolved data-loss or duplicate-write issue | Preview 1.8.12 exists; real phone acceptance still pending |
| 2. Usability finish | Clear native feature entries, useful search/date filters, focus hierarchy, readable large text, honest empty/error states, manual acceptance guide | Authorized automated checks and build for the edited revision, plus representative phone screenshots and operation results | Current source iteration implements record filters, focus layout and phone guide; checks/package not yet run |
| 3. Independent multiuser service | Independent deployment, trusted login identity, per-account workspaces, onboarding, client endpoint coverage and access isolation | A separate deployed service; two controlled accounts prove isolation through supported Android flows | Server foundation exists; deployment, onboarding and Android parity remain unfinished |
| 4. Formal release and store preparation | Authorized production signing, privacy/deletion documents, accurate screenshots, store-specific materials, installable package and submission | Verified authorized signed package and phone update; complete chosen-store checklist; actual submission receipt | Preview signing is not production signing; formal package and store submission remain pending |

Plan approximately 4-6 focused development iterations, with phone feedback collected
alongside implementation. This is a planning estimate, not a promise that store review
or external account setup completes in a fixed number of iterations.

## Known released baseline

- Public repository: https://github.com/me-fake-you/richangyu-life-workbench
- Development branch: codex/workbench-ai-20261002-c258dd87
- Last completed source baseline: 57e6af635c4fe6820b3edee6855bb5a57b58b331
- Public preview: https://github.com/me-fake-you/richangyu-life-workbench/releases/tag/v1.8.12-preview
- APK package: com.richangyu.lifeworkbench.preview
- Version name/code: 1.8.12-preview / 10014
- Minimum/target Android SDK: 22 / 36
- APK SHA-256: 6478acf1a3098e943a0c9fc345d15fc002ef9d956c57c0394b91914b0354c864
- Preview certificate SHA-256: 3d95f415542ae451b8ba42dce11a2fbc536e72b3264c99280d77efb1dd05f79a

The preceding iteration recorded successful public CI, CodeQL, multiuser foundation
and Android cloud checks, plus private backend checks and deployment. These are
historical baseline results, not new test results for this source iteration.

Do not use the Windows non-ASCII-path JUnit runner initialization failure as evidence
of passing or failing application behavior. The completed baseline used the Linux
Android workflow for its Android test results.

## Current source iteration

Files:

- android/app/src/main/java/com/richangyu/lifeworkbench/MainActivity.java
- android/app/src/main/java/com/richangyu/lifeworkbench/WorkbenchRecordPolicy.java
- docs/ANDROID-PHONE-ACCEPTANCE.md
- docs/DELIVERY-ROADMAP-20261008.md

Changes:

- Move an active focus check-in ahead of home quick actions.
- Keep an inactive focus entry compact, with a vertical layout at larger font sizes.
- Search loaded records by title, content and type, including Chinese type labels.
- Filter all records, today's records, or the past seven calendar days in Beijing time.
- Sort and group loaded records by time; retain invalid dates in the all-records view
  under an explicit time-needs-review heading.
- Count today's records from the loaded snapshot rather than implying a server-wide
  total. Empty search results do not imply missing cloud data.
- Reset record filters when binding or account scope changes.
- Add an in-app manual phone acceptance guide without exporting private account data.
- Preserve existing workbench permissions, data and signing.

This iteration does not write records automatically, change backend access, enable
public registration, alter signing, bump the version or publish a new APK.
Source changes are not visible in an already installed APK.

## Validation and publication gate

The implementation request authorizes source work. This iteration separately requested
permission for targeted checks, packaging and preview publication; wait for the human
answer before those actions. Do not treat an unanswered suggested answer as consent.

After approval:

1. Add and run focused record policy tests for search, Beijing day/week boundaries,
   invalid timestamps, stable sorting, null input and device timezone independence.
2. Run the applicable authorized Android unit, compilation and compatibility checks.
3. Advance preview version/code without overwriting an existing immutable release.
4. Use the existing preview certificate and expected branch head; do not access or
   replace the production signing key.
5. Publish only after the required checks succeed; report exact release evidence.
6. Collect actual phone acceptance separately using ANDROID-PHONE-ACCEPTANCE.md.

## Scope and privacy boundaries

- The private workbench remains private. Other people cannot be granted access to
  the owner's data simply by distributing the APK.
- Public multiuser access requires an independent service and verified account
  isolation. Its server foundation is not equivalent to an available public product.
- Local drafts are account/origin-scoped and require explicit submission. Do not
  advertise complete offline support.
- AI changes require preview review and human confirmation. Calorie estimation is
  an estimate to review, not a medical or nutritional measurement.
- Work duration, receivable and actual received payment must remain distinct.
  Never create fake payments solely to complete a test.
- Advanced web-only features must be labeled as such instead of claiming Android parity.
- Cloud/backend updates only reach compatible clients. Native screen changes require
  a newly installed APK.
- Store acceptance is decided by the selected store, not by a local checklist.

## Remaining external evidence and inputs

- Phone model, Android version, installed App version and redacted operation evidence.
- Installation, login, update and same-workbench synchronization results.
- Independent multiuser deployment target and authorized account/login configuration.
- Chosen application store and required developer account information.
- Authorized production signing and the store's current publication requirements.
- Actual submission receipt and subsequent review outcome.

Keep the overall goal active while meaningful authorized work can continue. Mark it
complete only when the original full outcome, including required real-world evidence
and authorized submission, has actually been achieved.
