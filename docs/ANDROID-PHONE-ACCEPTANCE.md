# Android phone acceptance guide

This is a manual procedure, not a report that tests passed.
USB debugging is not required. Screenshots or a short screen recording can supply
evidence when the user's phone cannot be connected to the computer.

## Before starting

1. Record the phone model, Android version and exact installed App version.
2. Download only from the official project release. Confirm that the filename ends
   in .apk; a file ending in .apk.1 may not be recognized as an installer.
3. Finish current saves and protect existing local drafts before an update. Do not
   uninstall solely to work around a signing conflict without protecting local data.
4. Use your own trusted HTTPS workbench root address, not a login URL, token or password.
5. Do not share a private workbench address or login credential with another tester.
6. For the current source iteration, wait for a newly built and published APK before
   expecting the new record filters and phone-guide interface.

## Operations and required observations

| Flow | Action | Expected observation | Evidence to record |
| --- | --- | --- | --- |
| Install/update | Install the trusted preview; update over an earlier same-signed preview where available | Correct version; no unexplained signing conflict; local drafts remain accessible in their account scope | Version, installer outcome and any error text |
| Bind/login | Bind the correct root address and authorize inside the App | Returns to the native home with the correct account's data, without repeated login redirects | Native home or redacted error |
| Check-in | Start a real focus activity and finish it when done | Active timer is visible; completion saves once; synced record time/title are correct | Start/finish observations and resulting record |
| Record | Save one truthful record, reopen the App and synchronize | The saved record is retained and not duplicated | Redacted title/time or an identifier |
| Record search | Search a known title/content/type; try today, past seven days and clear filters | Only loaded records are filtered; dates use Beijing time; no cloud records are deleted | Search/filter outcome and displayed counts |
| Schedule | Save a real intended schedule; check date and time after reopening | Correct Beijing date/time and expected selected-day visibility | Redacted schedule observation |
| Nutrition | Open calories from the home entry; review any estimate before saving | Portion and calorie information is visible, reviewed and retained after sync | Entry used, reviewed values and save outcome |
| Work | Inspect a real project, work duration, receivable and actual received payments | Hours do not automatically become income; payable/received/remaining are distinct | Observations without disclosing financial details |
| AI cancel | Ask about a real plan, inspect preview and cancel | No action is written merely because a preview was produced or cancelled | Cancel result |
| AI confirm | Review a harmless truthful plan and explicitly confirm once | Only the confirmed action is added; errors do not silently duplicate operations | Preview and resulting item, redacted |
| Local draft | Explicitly save a suitable local draft; reconnect and submit manually once | Clearly marked as local until submitted; uncertain outcomes are checked before retrying | Draft state and confirmed cloud result |
| Cross-device sync | Inspect the same saved item in the bound web workbench and reopen on phone | Same item and time; no conflicting duplicate | Both observations with private details covered |
| Account/binding change | Only when an independently authorized second workspace exists, switch and return | No other account's records or drafts appear | Workspace-isolation result without addresses |

Do not create fictitious payments, private example records or disposable cloud data
without permission. Use real intended entries for ordinary operation checks.
A request timeout does not prove a save failed. Synchronize and inspect before retrying.

## Feedback format

- App version:
- Phone model / Android version:
- Entry or screen:
- Local date/time of operation:
- What I did:
- Expected result:
- Actual result:
- Did the item appear in the bound web workbench:
- Screenshot or recording with sensitive details covered:

Redact email addresses, private site addresses, authorization links, tokens, keys,
record contents, financial details and unrelated personal information.
The in-app phone guide does not export account identifiers or private addresses.

## Passing criteria

Installation, native login return, main saves, reopening, updating and synchronization
must have actual phone evidence. Record individual outcomes rather than one general
"works" statement. Any unresolved login loop, data loss, duplicate operation or
cross-account data exposure prevents acceptance.

Automated checks and cloud Android builds are separate evidence. A compile or a passing
web check does not replace phone acceptance. This guide does not certify store readiness,
public multiuser availability or full offline support.
