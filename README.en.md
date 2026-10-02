# Richangyu · Life Workbench

**Make room for what comes next. Keep a trace of what happened.**

A privacy-minded, self-hostable personal workbench for schedules, life notes and side-job tracking. AI prepares a preview; you decide whether to save it.

![Concept illustration using fictional data](public/tutorial/showcase/media/overview.svg)

[中文介绍](README.md) · [Interactive fictional demo](https://me-fake-you.github.io/richangyu-life-workbench/showcase/) · [Setup and deployment](docs/QUICKSTART.md)

## Status on 2026-10-03

- The existing web/PWA source is on the default branch.
- The AI upgrade and deployed follow-up fixes are in [draft PR #7](https://github.com/me-fake-you/richangyu-life-workbench/pull/7), not merged into main.
- The last CI run failed during dependency installation because the manifest and lockfile were out of sync. Full validation has not passed.
- No new APK/AAB was produced in this round. A PWA is not a native Android release.
- The public demo uses fixed fictional examples, has no model connection, and keeps changes only in page memory. Reloading resets it.

## Intent before action

Future plans and past events are different. Incomplete instructions need clarification. Money not yet received should not be presented as settled income. Proposed writes require an explicit confirmation and server-side validation.

Groq free-tier usage has limits; it is not an unlimited or permanent guarantee. API keys belong on the server. See the [official rate limits](https://console.groq.com/docs/rate-limits).

## Documentation

- [Product guide](docs/PROJECT-GUIDE-20261002.md)
- [Quick start](docs/QUICKSTART.md)
- [Cloudflare deployment](docs/deployment-cloudflare.md)
- [Verification scope](docs/VERIFICATION-20261003.md)
- [Release notes](docs/RELEASE-NOTES-20261003.md)
- [Roadmap](docs/ROADMAP.md)
- [Previous English README archive](docs/archive/README-before-20261003.en.md)

Open source means public code and examples, not public personal accounts, backups, photos or schedules. Preserve authentication when deploying. This project is licensed under [MIT](LICENSE).
