# Dependency remediation source changes

Date: 2026-10-08
Scope: isolated public development source, not the private deployed service.
Status: implementation in progress; no new security audit, tests, CI or release result.

## Authoritative input

The public development branch remained at
57e6af635c4fe6820b3edee6855bb5a57b58b331 when this iteration inspected PR 7.
The current local package manifest and lockfile declared Capacitor 6 packages even
though the public native Android project and app/scripts/tests search did not show
Capacitor imports or sync calls.

The exported source did not contain the old setup-android-store-app.ps1,
release-android-workbench.ps1 or capacitor.config.json targets referenced by legacy
entry points. This is not a reason to reconstruct a web wrapper around the native App.

Observed dependency chains before this edit:

- @capacitor/cli 6.2.2 -> tar ^6.1.11 -> tar 6.2.1.
- drizzle-kit 0.31.10 -> @esbuild-kit/esm-loader 2.6.5 ->
  @esbuild-kit/core-utils 3.3.2 -> esbuild 0.18.20.
- The separate Drizzle esbuild branch already resolved to 0.25.12.

## Source changes

1. Remove unused @capacitor/android, @capacitor/core, @capacitor/splash-screen and
   @capacitor/cli declarations. This addresses the obsolete tool chain at its root
   rather than forcing an incompatible tar major into an old CLI.
2. Retire legacy add/sync/open/install/setup commands with a clear, nonzero message
   and native project instructions. They do not auto-install Capacitor, run npx,
   overwrite the Android project or open an upload flow.
3. Route android:release to the existing native release build script instead of a
   missing wrapper script. It still requires the configured owner-controlled
   production signing environment; it is not executed by this source iteration.
4. Add android:guide as a read-only instruction entry point.
5. Scope an exact esbuild 0.25.12 override to @esbuild-kit/core-utils only.
   Do not replace the loader package with a different API or upgrade all esbuild
   branches indiscriminately.
6. Refresh package-lock.json using the package manager with lifecycle scripts and
   automatic audit disabled. Lockfile generation is not a compatibility or security
   acceptance result.

No Next.js, Vinext, Cloudflare, React or Drizzle major migration is included.
The Node engine remains unchanged. No database migration, backend deployment,
keystore access, tests or APK build is triggered by these edits.

## Primary evidence

- [tar hardlink path traversal advisory](https://github.com/advisories/GHSA-34x7-hfp2-rc4v)
  lists tar versions below 7.5.7 as affected.
- [esbuild development server advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
  lists versions through 0.24.2 as affected and 0.25.0 as patched.
- [esbuild 0.25.0 release notes](https://github.com/evanw/esbuild/releases/tag/v0.25.0)
  explicitly describe breaking changes. Scoped replacement still needs compatibility checks.
- [Capacitor maintainer issue about tar overrides](https://github.com/ionic-team/capacitor/issues/8310)
  reports old CLI extraction failures after forcing newer tar.
- [core-utils source exports](https://github.com/esbuild-kit/core-utils/blob/master/src/index.ts)
  is source context, not a test of this application's database configuration.

A listed vulnerable version proves an affected dependency is present, not that the
same exploit is reachable in a deployed service. The esbuild advisory concerns its
development server. Do not claim source code was exposed merely from the lockfile.

## Remaining acceptance gates

- Successful lockfile generation must be reported from the actual process.
- Authorized full dependency audit, including dev dependencies, and assessment of
  remaining advisories. Do not report "zero alerts" from this narrow remediation.
- Clean lockfile installation and current complete project checks.
- Targeted loader/schema-generation compatibility, without modifying production data.
- Native checks for the unpublished record and privacy UI changes.
- Safe publication against the expected branch head only after approval.
- Actual GitHub security-alert status after publication, if authorized access is available.

The GitHub connector used here does not provide a repository security-alert endpoint.
Public advisory pages are not equivalent to the repository's actual alert dashboard.
There is no claim that open alerts have been closed, the full goal is complete, or
the current mobile preview contains these source changes.
