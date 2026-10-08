# Android v1.8.12-preview

This prerelease keeps the existing preview package and signing identity.
It does not automatically upgrade previously installed APKs.

## Native improvements

- A compact home screen and searchable feature map distinguish native and web-only features.
- Common meals are stored locally per bound account. Reuse and portion scaling always require review.
- Part-time work supports projects, timed sessions, confirmed receivables and partial actual payments.
- Finishing work creates a receivable, not income. Only a confirmed payment enters the shared ledger.
- Text, inbox and one-off schedule drafts can be kept on-device and submitted individually.
- Retry receipts prevent duplicate draft, work and payment submissions.
- AI uses the correct server prompt field. Eligible plan and life-record changes can be undone
  within 30 minutes only if no later edits or activity conflict. Financial changes require manual review.

## Delivery gates

The signed release pipeline must pass Java unit tests, compilation, Android lint,
package/version checks, APK signature verification and the existing preview certificate pin.
Do not treat a generated file as a successful delivery until these gates pass.

## Boundaries

A real Android phone is still required for installation, login, image capture and sync testing.
Offline drafts are not a complete offline mirror. Keep the App installed to preserve local drafts.
Complete accounts, budgets, albums and some advanced web tools remain web-only and are labelled as such.
The independent multiuser foundation is not publicly launched. Your private workbench remains private.
This APK is a preview, not an application-store-approved release.
