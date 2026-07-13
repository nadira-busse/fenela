# Local Setup

This guide covers local installation, required configuration and the validation steps used before publication.

## Prerequisites

You need:

- Node.js 24;
- npm;
- a local copy of the repository.

The GitHub Actions workflow also uses Node.js 24.

## 1. Install dependencies

Run from the project root:

```bash
npm ci
```

Use `npm install` when intentionally changing dependencies or updating `package-lock.json`.

## 2. Create `.env.local`

Windows PowerShell:

```powershell
Copy-Item ".env.example" ".env.local"
```

macOS or Linux:

```bash
cp .env.example .env.local
```

## 3. Configure environment variables

Add the required values to `.env.local`:

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

| Variable                    | Used for                               |
| --------------------------- | -------------------------------------- |
| `OPENAI_API_KEY`            | Optional AI-assisted anchor generation |
| `OPENAI_MODEL`              | OpenAI model selection                 |
| `WEB_PUSH_PUBLIC_KEY`       | Browser push subscriptions             |
| `WEB_PUSH_PRIVATE_KEY`      | Sending push notifications             |
| `WEB_PUSH_SUBJECT`          | VAPID contact value                    |
| `STORAGE_KV_REST_API_URL`   | Reminder and job storage               |
| `STORAGE_KV_REST_API_TOKEN` | Access to KV-compatible storage        |
| `CRON_SECRET`               | Authorization for the cron worker      |

Storage integrations may generate different variable names. Fenéla expects the `STORAGE_KV_*` names shown above.

Keep real credentials in `.env.local` or the deployment environment. Do not commit them.

## 4. Start the application

```bash
npm run dev
```

Open the local URL shown in the terminal. Next.js uses this address by default:

```text
http://localhost:3000
```

## 5. Run the validation checks

```bash
npm run format:check
npm run lint
npm run test
npm run build
```

Check internal Markdown links as well.

Windows:

```powershell
py scripts/check_internal_links.py
```

macOS or Linux:

```bash
python3 scripts/check_internal_links.py
```

## 6. Verify the production routes

After `npm run build`, the output should include the root page and the production routes below:

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

No development-only, test or obsolete API routes should appear.

## Optional features

### AI assistance

AI-assisted anchors require:

```env
OPENAI_API_KEY=
OPENAI_MODEL=
```

Parsing, validation, repair and fallback behavior live in:

```text
src/lib/aiAnchors.ts
```

### Reminders and Web Push

Reminder testing requires:

- valid VAPID configuration;
- KV-compatible storage;
- notification permission;
- service worker registration;
- a configured cron trigger.

Reminder testing should be performed in a normal browser profile or installed PWA. Private browsing is suitable only for basic UI checks.

Push delivery is optional and should not block the core application flow.

### GitHub Actions

The CI workflow is located at:

```text
.github/workflows/ci.yml
```

It runs the locked install, formatting, linting, tests and production build on pushes and pull requests.

Route exposure and rate-limit behavior are documented in [Architecture overview](../../architecture/architecture-overview.md). Recurring maintenance issues are documented in [Maintenance notes](maintenance-notes.md).

## Troubleshooting

### PowerShell shows `>>`

PowerShell is waiting for the rest of an incomplete command, often because of an open quote, trailing backtick or unfinished multiline expression.

Cancel it with:

```text
Ctrl + C
```

Then run the command again in a smaller block.

### AI generation fails

Confirm that `.env.local` exists and contains valid OpenAI configuration.

AI support is optional. The rest of the application should remain usable without successful model generation.

### Push notifications do not work

Check:

- notification permission;
- service worker registration;
- VAPID keys;
- KV configuration;
- cron configuration;
- browser and device support.

On iPhone and iPad, test Web Push through an installed Home Screen app.

### `npm ci` works on Windows but fails on Linux or WSL

A lockfile generated after dependency changes can miss platform-specific optional dependency entries.

Regenerate and verify the lockfile in Linux or WSL:

```bash
npm install --package-lock-only
npm ci
```

After dependency or lockfile changes, verify `npm ci` on both Windows and Linux or WSL.

### Production logs show `DEP0169`

Node may report a `url.parse()` deprecation warning from the upstream `web-push` dependency.

Fenéla does not call `url.parse()` directly. No application-code workaround is required unless a future dependency update provides a confirmed compatible fix.

## Setup complete

The setup is complete when dependencies install, the required environment variables are configured, the validation commands pass and the application opens through the local URL shown in the terminal.
