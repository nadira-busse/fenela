# Known Technical Notes

This document records technical notes that are relevant for running, testing and reviewing Fenéla.

Fenéla is a small public MIT-licensed accountability app. The goal of this document is not to list product features, but to make important implementation constraints, debugging outcomes and validation notes visible to maintainers and reviewers.

## Reminder and push architecture

Fenéla MVP1 uses a device-based reminder architecture.

The reminder flow combines:

- browser notification permission;
- service worker registration;
- Web Push subscription;
- VAPID configuration;
- KV-compatible storage;
- scheduled reminder jobs;
- a cron-triggered push worker.

The active reminder-related API routes are:

```text
/api/push/public-key
/api/push/subscribe
/api/jobs/schedule-daily-start
/api/jobs/schedule-reminder
/api/jobs/cancel
/api/jobs/cancel-daily-start
/api/cron/push
```

Reminder settings can be changed after onboarding. Users can turn reminders on or off, restore reminder setup on a device and update the daily reminder time without repeating the screening flow.

## Reminder Settings runtime validation

Reminder Settings were tested after implementation on:

```text
Laptop
Android phone
iPhone
```

Validated behavior:

```text
Open reminder settings from the main app flow
Enable reminders outside the original screening flow
Request notification permission
Create and store a push subscription
Schedule a daily reminder
Change the daily reminder time
Disable daily reminders
Re-enable daily reminders
Receive reminders on real devices
```

Status:

```text
Classification: cross-device runtime validation
MVP blocker: no
Repository action: documented here
```

## Device-based setup

Fenéla MVP1 does not include accounts or cross-device sync.

Each browser, browser profile or installed PWA can have its own:

- local storage;
- service worker state;
- notification permission;
- push subscription;
- Fenéla device ID.

This is intentional for MVP1 because it keeps the app lightweight and accountless.

Possible extension:

```text
Optional account sync
```

The current implementation keeps push subscriptions device-specific even if account sync is explored later.

## Development device records

During development, repeated clearing of browser storage can create multiple device records because Fenéla MVP1 uses device-based local setup.

Old test records may remain in KV storage while the browser creates a new local device ID.

The cron worker is expected to handle this safely by:

- skipping devices without a valid push subscription;
- cleaning failed push devices where appropriate;
- avoiding zombie reschedules after failed push delivery.

Status:

```text
Classification: development/testing behavior
MVP blocker: no
Repository action: documented here
```

## Device cleanup scripts

Fenéla includes two local maintenance scripts for development and reset scenarios:

```text
scripts/cleanup-devices.mjs
scripts/cleanup-all-devices.mjs
```

cleanup-devices.mjs audits device registrations and removes stale devices that no longer have an active push subscription.

cleanup-all-devices.mjs is a destructive reset script. It removes all stored device registrations, push subscriptions, reminder jobs and daily reminder pointers from the configured KV store.

The scripts are meant for local maintenance with a deliberately configured .env.local. Storage credentials are not included in the repository.

The destructive script asks for explicit confirmation before deleting data. It should not be run against production data unless the goal is to reset all stored reminder state.

## Failed push cleanup

Failed push delivery can happen when a browser/device subscription becomes invalid.

The cleanup behavior should remove stale reminder state for the affected device, including:

- the stored subscription;
- the device reference;
- daily reminder pointer data;
- pending reminder jobs for that device.

Important behavior:

```text
After a failed push, DAILY_START should not be blindly rescheduled for that device.
```

Reason:

```text
Avoid zombie reminders for devices that can no longer receive notifications.
```

## Amsterdam timezone handling

Daily reminder scheduling uses Amsterdam-aware date/time handling.

This matters because UTC date boundaries can differ from the user's local day, especially around late evening and midnight.

Relevant behavior:

```text
Daily reminder scheduling should use Europe/Amsterdam semantics.
Day-state keys should align with the user's Amsterdam day, not UTC day boundaries.
```

Status:

```text
Classification: timezone consistency decision
MVP blocker: no
Repository action: implemented and documented here
```

## Cron processing

Fenéla uses cron-triggered reminder processing.

The cron-triggered endpoint is:

```text
/api/cron/push
```

Production deployments should protect this endpoint with:

```text
CRON_SECRET
```

The cron worker processes due reminder jobs and sends push notifications where a valid subscription exists.

## Vercel Hobby cron limitation

Vercel Hobby projects are limited in cron frequency.

Fenéla MVP1 therefore uses an external cron trigger for periodic reminder processing instead of relying only on Vercel Cron.

Reason:

```text
Keep MVP1 low-cost while preserving cron-polled reminder processing.
```

Status:

```text
Classification: deployment constraint
MVP blocker: no
Repository action: documented here
```

## AI-assisted anchor generation

Fenéla uses AI only for bounded anchor suggestions.

The AI route is:

```text
/api/ai/anchors
```

The route handler orchestrates the API request. AI parsing, validation and fallback behavior live in testable library code:

```text
src/lib/aiAnchors.ts
```

The app does not provide:

- therapy;
- diagnosis;
- crisis support;
- open-ended coaching;
- broad mental-health advice.

The deterministic app flow remains leading. AI is used only after basic validation and safety checks.

## AI and ethical-use guardrails

Fenéla includes basic validation and safety checks for AI-assisted and manually edited anchors.

The safety layer is intentionally limited and pattern-based. It is designed to block clearly low-quality or unsafe input before it becomes a small action.

Examples of blocked intent categories:

- violence or physical harm;
- stalking or harassment;
- fraud or theft;
- illegal drug activity;
- malware, hacking or unauthorized access;
- evading legal accountability;
- self-harm or harm to others.

Limitations:

```text
This is not comprehensive content moderation.
This is not crisis detection.
This is not a therapeutic safety system.
```

Reason:

```text
Fenéla should not turn harmful or illegal intent into an actionable small step.
```

Status:

```text
Classification: MVP safety guardrail
MVP blocker: no
Repository action: documented here and in docs/product/ai-guardrails.md
```

## Defensive display behavior

Unsafe or low-quality input should be blocked before storage or AI generation where possible.

For additional robustness, display logic should avoid amplifying unsafe or stale text that may already exist in local storage from older development sessions.

Status:

```text
Classification: defensive UI behavior
MVP blocker: no
Repository action: implemented where relevant
```

## DEP0169 `url.parse()` warning

During production log review, Node showed a warning similar to:

```text
[DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications.
```

A source scan showed that Fenéla app code does not directly use `url.parse()`.

The warning was traced to the upstream `web-push` package.

Status:

```text
Classification: upstream dependency warning
MVP blocker: no
Code action: none in Fenéla app code
Repository action: documented here
```

## CSP eval resolution

An earlier browser console warning about `eval` was observed during development.

The app source was scanned for direct usage of `eval`, `new Function`, string-based `setTimeout` and string-based `setInterval`. No app-code usage was found.

After removing `'unsafe-eval'` from the Content Security Policy in `next.config.ts`, the full app flow was tested in production. The browser reports a blocked eval attempt without a source location, and no functionality is affected.

`'unsafe-eval'` has been removed from the CSP. The app does not need it.

Status:

```text
Classification: resolved
```

## Browser and PWA reminder testing

Reminder behavior should be tested in a normal browser profile or installed PWA, not incognito/private browsing.

Push reminders depend on:

- browser support;
- service worker registration;
- notification permission;
- VAPID configuration;
- KV storage configuration;
- cron-triggered processing.

Incognito/private browsing may block or limit notification permissions, service workers, push subscriptions and persistent local storage.

Use incognito only for basic UI checks.

## Validation commands

Recommended validation before publication:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

Internal Markdown links:

On Windows:

```powershell
py scripts/check_internal_links.py
```

On macOS/Linux:

```bash
python3 scripts/check_internal_links.py
```

Also verify:

- no private environment files are committed;
- no real secrets are committed;
- the production route output matches the documented API surface;
- reminder functionality is tested in a normal browser profile or installed PWA.

Latest validated result during public-readiness cleanup:

```text
npm run format:check passed
npm run lint passed
npm test passed — 33 tests
npm run build passed
py scripts/check_internal_links.py passed
```

## GitHub Actions CI

Fenéla includes a GitHub Actions workflow at:

```text
.github/workflows/ci.yml
```

The CI workflow runs on push and pull request.

Current CI checks:

```text
npm ci
npm run format:check
npm run lint
npm test
npm run build
```

This mirrors the local validation flow and reduces regression risk before publication.

## Dependency audit status

`npm audit fix` was run during public-readiness cleanup.

Result:

- The audit count was reduced from 10 vulnerabilities to 2 moderate vulnerabilities.
- `next` and `eslint-config-next` were updated to 16.2.9.
- `npm run lint` passes.
- `npm test` passes.
- `npm run build` passes.
- `npm run format:check` passes.
- Internal Markdown links resolve.

The remaining audit warning is tied to `next` and its transitive `postcss` dependency.

`npm audit fix --force` was not applied because npm proposed a breaking downgrade to `next@9.3.3`.

Decision:
Keep the current Next.js 16.2.9 setup, keep lint/test/build/format/linkcheck green, and revisit the remaining audit warning when an upstream patch is available without a breaking downgrade.

## Cross-platform install verification

Fenéla is developed on Windows and was also verified in a Linux environment through WSL.

During public-readiness testing, a Windows-generated `package-lock.json` initially passed `npm ci` on Windows but failed in Linux because of missing platform-specific optional dependency entries related to `@emnapi/runtime` and `@emnapi/core`.

The lockfile was repaired from WSL/Linux with:

```bash
npm install --package-lock-only
npm ci
```

After copying the updated `package-lock.json` back to the Windows working tree, the install and validation checks passed on both platforms.

Verified commands:

```bash
npm ci
npm run format:check
npm run lint
npm test
npm run build
python3 scripts/check_internal_links.py
```

Equivalent Windows checks also passed with:

```powershell
npm ci
npm run format:check
npm run lint
npm test
npm run build
py scripts/check_internal_links.py
```

This note is kept as maintenance context for dependency updates. If package dependencies are changed later, `npm ci` should be rechecked on both Windows and Linux/WSL before release.

## Result

These notes are not product features.

They document technical context that is useful for reviewers and maintainers:

- root-cause analysis;
- reminder architecture constraints;
- cross-device runtime validation;
- deployment limitations;
- upstream dependency warnings;
- safety and guardrail boundaries;
- known browser/PWA testing limitations;
- dependency audit status;
- CI validation;
- publication validation results.

Fenéla is currently validated with formatting, linting, automated tests, API route tests, production build and internal Markdown link checks.
