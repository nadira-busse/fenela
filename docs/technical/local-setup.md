# Local Setup

This document explains how to run Fenéla locally.

Fenéla is a Next.js application with optional AI-assisted anchor suggestions, optional web push reminders and KV-compatible storage for reminder/job data.

## Prerequisites

You need:

- Node.js installed;
- npm available in your terminal;
- a local copy of this repository;
- environment variables configured in `.env.local`.

Recommended Node.js version:

```text
24
```

The GitHub Actions workflow also uses Node.js 24.

## 1. Install dependencies

Run from the project root:

```bash
npm install
```

## 2. Create the local environment file

On Windows PowerShell:

```powershell
Copy-Item ".env.example" ".env.local"
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

You can also create `.env.local` manually.

## 3. Fill environment variables

`.env.local` should contain:

```env
# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=

# Web Push / VAPID
WEB_PUSH_PUBLIC_KEY=
WEB_PUSH_PRIVATE_KEY=
WEB_PUSH_SUBJECT=

# KV-compatible storage
STORAGE_KV_REST_API_URL=
STORAGE_KV_REST_API_TOKEN=

# Cron protection
CRON_SECRET=
```

Use real values only in `.env.local` or in your deployment environment.

Do not commit real secrets.

## 4. Run the development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 5. Build for production

```bash
npm run build
```

This runs the Next.js production build. It checks whether the app compiles, whether TypeScript passes and which routes are included in the production output.

## 6. Expected route output

The production build should include the main app route and API routes similar to:

```text
/
/api/ai/anchors
/api/cron/push
/api/jobs/cancel
/api/jobs/cancel-daily-start
/api/jobs/schedule-daily-start
/api/jobs/schedule-reminder
/api/push/public-key
/api/push/subscribe
/manifest.webmanifest
```

There should be no extra development-only, internal test or legacy API routes in the production output.

## 7. Environment variable notes

| Variable                    | Required for         | Notes                                     |
| --------------------------- | -------------------- | ----------------------------------------- |
| `OPENAI_API_KEY`            | Optional AI support  | Required only when using AI routes        |
| `OPENAI_MODEL`              | Optional AI support  | Defines the model used by the app         |
| `WEB_PUSH_PUBLIC_KEY`       | Push notifications   | Public VAPID key                          |
| `WEB_PUSH_PRIVATE_KEY`      | Push notifications   | Private VAPID key; keep secret            |
| `WEB_PUSH_SUBJECT`          | Push notifications   | Usually a mailto or project contact value |
| `STORAGE_KV_REST_API_URL`   | Reminder/job storage | KV-compatible REST endpoint               |
| `STORAGE_KV_REST_API_TOKEN` | Reminder/job storage | Keep secret                               |
| `CRON_SECRET`               | Cron protection      | Protects the cron-triggered push endpoint |

When connecting storage through an integration, generated variable names may differ. Fenéla expects the `STORAGE_KV_*` names above.

## 8. What not to commit

Do not commit:

```text
.env
.env.local
.env.*.local
.env.vercel.local
node_modules/
.next/
.vercel/
*.log
*.exe
docs-learning-private/
```

The repository should include `.env.example`, but never real secrets.

## 9. Useful validation commands

Run these checks before publishing or reviewing the repository.

### Format check

Check whether all files follow the configured Prettier style:

```bash
npm run format:check
```

Expected result:

```text
All matched files use Prettier code style!
```

If formatting fails, run:

```bash
npm run format
```

Then run the format check again.

### Lint

Check code quality rules:

```bash
npm run lint
```

Expected result:

```text
no output
```

ESLint should complete without errors.

### Tests

Run the test suite:

```bash
npm run test
```

Expected result:

```text
Test Files  3 passed
Tests       33 passed
```

The current test suite covers:

- safety and ethical-use validation;
- AI response parsing;
- AI anchor validation;
- AI fallback behavior;
- API route validation.

The AI route handler should stay thin. Parsing, validation and fallback behavior live in testable library code:

```text
src/lib/aiAnchors.ts
```

### Build

Check whether the app builds for production:

```bash
npm run build
```

Expected result includes:

```text
Compiled successfully
Finished TypeScript
```

The build output should also show the documented application and API routes.

### Internal Markdown links

Check internal Markdown links.

On Windows:

```powershell
py scripts/check_internal_links.py
```

On macOS/Linux:

```bash
python3 scripts/check_internal_links.py
```

Expected result:

```text
All internal links resolve.
```

### Production route surface

After running `npm run build`, compare the route output with the expected route list in this document.

Expected result:

- only the main app route, manifest route and documented API routes are present;
- no development-only test routes are present;
- no obsolete internal API routes are present.

### Publishable file scan

Check for files that should not be part of a public repository:

```powershell
Get-ChildItem -Path . -Recurse -Force |
Where-Object {
    $_.FullName -notmatch '\\node_modules\\' -and
    $_.FullName -notmatch '\\.next\\' -and
    $_.FullName -notmatch '\\.git\\'
} |
Where-Object {
    $_.Name -in @(
        ".env",
        ".env.local",
        ".env.production",
        ".env.development",
        ".env.vercel.local"
    ) -or
    $_.FullName -match '\\.vercel\\' -or
    $_.FullName -match '\\docs-learning-private\\'
} |
Select-Object FullName
```

Expected result:

```text
no output
```

### Secret scan

Check publishable files for accidentally included secret values:

```powershell
$SecretPatterns = @(
  "sk-proj-[A-Za-z0-9_-]+",
  "OPENAI_API_KEY\s*=\s*[^`"`'\s][^\s]+",
  "WEB_PUSH_PRIVATE_KEY\s*=\s*[^`"`'\s][^\s]+",
  "STORAGE_KV_REST_API_TOKEN\s*=\s*[^`"`'\s][^\s]+",
  "CRON_SECRET\s*=\s*[^`"`'\s][^\s]+"
)

Get-ChildItem -Path . -Recurse -File |
Where-Object {
    $_.FullName -notmatch '\\node_modules\\' -and
    $_.FullName -notmatch '\\.next\\' -and
    $_.FullName -notmatch '\\.vercel\\' -and
    $_.FullName -notmatch '\\.git\\' -and
    $_.FullName -notmatch '\\docs-learning-private\\' -and
    $_.FullName -notmatch '\\docs\\technical\\local-setup\.md$' -and
    $_.Name -notmatch '^\.env(\.|$)' -and
    $_.Name -ne ".env" -and
    $_.Name -notlike "*.zip" -and
    $_.Name -notlike "*.log" -and
} |
Select-String -Pattern $SecretPatterns |
Select-Object Path, LineNumber, Line
```

Expected result:

```text
no output
```

## 10. GitHub Actions CI

Fenéla includes a GitHub Actions workflow at:

```text
.github/workflows/ci.yml
```

The workflow runs on push and pull request.

Current CI checks:

```text
npm ci
npm run format:check
npm run lint
npm run test
npm run build
```

This mirrors the local validation flow.

## 11. Reminder and push testing notes

Reminder functionality depends on browser support, service worker registration, notification permission, push subscription storage and the cron-triggered reminder worker.

For meaningful reminder tests, use:

- a normal browser profile;
- a supported mobile browser;
- an installed Home Screen app/PWA where required;
- a real deployment URL.

Do not rely on incognito or private browsing for reminder testing.

## 12. Troubleshooting

### PowerShell shows `>>`

PowerShell is waiting for the rest of a command.

Common causes:

- open quote;
- unfinished here-string;
- trailing backtick;
- pasted multiline command not closed correctly.

Fix:

```text
Ctrl + C
```

Then run the command again in smaller blocks.

### Build succeeds but Browserslist warning appears

You may see:

```text
Browserslist: browsers data (caniuse-lite) is 6 months old.
```

This is a maintenance warning, not a build failure.

Do not run automatic dependency updates during repo cleanup unless you intentionally want to update dependencies.

### AI route fails locally

If AI functionality fails with a missing environment variable error, check that `.env.local` exists and includes:

```env
OPENAI_API_KEY=
OPENAI_MODEL=
```

AI is optional. A missing OpenAI key should not change the product positioning.

### Push notifications do not work

Check:

- VAPID keys are present;
- storage variables are present;
- browser notification permission is enabled;
- the app is served in a supported environment;
- the service worker is registered;
- the cron endpoint is configured and protected with `CRON_SECRET`.

Push notifications are optional and should not block the core Fenéla flow.

### Incognito or private browsing

Incognito/private browsing is not a reliable environment for reminder testing.

It may block or limit notification permissions, service workers, push subscriptions and persistent local storage. Use incognito only for basic UI checks. Test reminders in a normal browser profile or installed PWA.

## Summary

A clean local setup means:

- dependencies install;
- `.env.local` is configured locally;
- the development server starts;
- formatting checks pass;
- lint passes;
- tests pass;
- the production build succeeds;
- internal Markdown links resolve;
- the production route output matches the documented route surface;
- CI uses the same validation sequence;
- no private environment files are committed;
- no secrets are committed.
