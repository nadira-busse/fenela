# Local Setup

This guide explains how to run Fenéla locally from a fresh copy of the repository.

The core application requires Supabase for authentication and persistent user-owned data.

OpenAI assistance and browser reminders are optional. Fenéla can run without either of them.

## Prerequisites

To run Fenéla locally, install:

- Node.js 24;
- npm;
- Docker Desktop or Podman.

Docker or Podman is required for the local Supabase stack.

For the full repository validation checks, also install:

- Python 3.

The GitHub Actions workflow uses Node.js 24.

## 1. Install dependencies

Run from the project root:

```bash
npm ci
```

Use `npm install` only when intentionally changing dependencies or updating `package-lock.json`.

## 2. Create `.env.local`

Copy the public environment template.

Windows PowerShell:

```powershell
Copy-Item ".env.example" ".env.local"
```

macOS or Linux:

```bash
cp .env.example .env.local
```

Keep real credentials in `.env.local`. Do not commit this file.

## 3. Start local Supabase

Fenéla uses Supabase Auth and PostgreSQL for authentication and persistent user-owned data.

The repository contains the Supabase configuration and version-controlled database migrations under:

```text
supabase/
├── config.toml
├── seed.sql
└── migrations/
```

Start the local Supabase stack with the CLI version used to validate this repository:

```bash
npx supabase@2.113.0 start
```

This starts the local services, including PostgreSQL, Auth, Studio and Mailpit.

## 4. Apply the database schema

Reset the local database:

```bash
npx supabase@2.113.0 db reset
```

This applies the migrations in `supabase/migrations/` in filename order and then runs `supabase/seed.sql`.

Treat the migrations directory as the source of truth for the database schema. Do not reproduce the schema manually in the Supabase dashboard.

## 5. Configure Supabase

Display the local Supabase connection details:

```bash
npx supabase@2.113.0 status
```

Use the values from `supabase status` as follows:

| Supabase status field | `.env.local` variable                  |
| --------------------- | -------------------------------------- |
| `API_URL`             | `NEXT_PUBLIC_SUPABASE_URL`             |
| `PUBLISHABLE_KEY`     | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `SECRET_KEY`          | `SUPABASE_SECRET_KEY`                  |

The status output also includes `ANON_KEY` and `SERVICE_ROLE_KEY`. Fenéla uses the newer `PUBLISHABLE_KEY` and `SECRET_KEY` values instead.

The two `NEXT_PUBLIC_` variables are browser-safe.

`SUPABASE_SECRET_KEY` is server-only. Fenéla uses it for narrow privileged operations that cannot run through a normal authenticated user session, including account and operational cleanup paths.

Never expose `SUPABASE_SECRET_KEY` through a `NEXT_PUBLIC_` variable or client-side code.

## 6. Start Fenéla

Run:

```bash
npm run dev
```

Open the local URL shown in the terminal. By default:

```text
http://localhost:3000
```

The application can now connect to the local Supabase stack.

## 7. Test Magic Link sign-in

Fenéla uses passwordless email Magic Link authentication.

Open:

```text
http://localhost:3000/auth
```

Enter an email address and request a Magic Link.

The local Supabase stack captures outgoing authentication email in Mailpit. Find the Mailpit URL in the `MAILPIT_URL` field of:

```bash
npx supabase@2.113.0 status
```

Open that URL, find the email in Mailpit, and follow the Magic Link.

The link returns through:

```text
/auth/callback
```

The callback exchanges the authentication code for a Supabase session and returns the user to Fenéla.

After this step, the normal authenticated product flow can be used locally.

## Optional features

The following configuration is not required to start and use the core application.

### AI-assisted anchors

To use OpenAI-generated anchor suggestions, add:

```env
OPENAI_API_KEY=
OPENAI_MODEL=
```

`OPENAI_API_KEY` enables the OpenAI request.

`OPENAI_MODEL` selects the model used for anchor generation.

Without OpenAI configuration, Fenéla remains usable and returns deterministic fallback anchor suggestions instead.

AI parsing, validation, repair and fallback behavior live in:

```text
src/lib/aiAnchors.ts
```

### Reminders and Web Push

To enable browser reminders, configure:

```env
WEB_PUSH_PUBLIC_KEY=
WEB_PUSH_PRIVATE_KEY=
WEB_PUSH_SUBJECT=

STORAGE_KV_REST_API_URL=
STORAGE_KV_REST_API_TOKEN=
```

The Web Push values provide the VAPID configuration used for browser push subscriptions and notification delivery.

The `STORAGE_KV_*` values connect Fenéla to the KV-compatible operational store used for reminder jobs, delivery state and application rate limiting.

If KV is unavailable, the AI rate limiter fails open rather than blocking anchor generation.

Storage integrations may generate additional environment-variable names. Fenéla reads the `STORAGE_KV_*` names shown above.

Local reminder testing also requires:

- notification permission;
- service worker registration;
- a supported browser or installed PWA.

Push delivery is optional and does not block the core accountability flow.

### Cron operations

Scheduled push processing and inactivity retention use:

```env
CRON_SECRET=
```

`CRON_SECRET` protects the server-to-server cron endpoints:

```text
/api/cron/push
/api/cron/retention
```

A production deployment must configure its scheduler separately so these endpoints are invoked at the required cadence.

## Validation

After the local application is configured, run the repository validation checks:

```bash
npm run format:check
npm run lint
npm run test
npm run build
```

For internal Markdown links:

Windows PowerShell:

```powershell
py scripts/check_internal_links.py
```

macOS or Linux:

```bash
python3 scripts/check_internal_links.py
```

These checks cover repository formatting, linting, automated tests, the production build and internal documentation links.

## Verify the production routes

After:

```bash
npm run build
```

the build output should include the Fenéla application routes below:

```text
/
/api/ai/anchors
/api/cron/push
/api/cron/retention
/api/jobs/cancel
/api/jobs/cancel-daily-start
/api/jobs/schedule-daily-start
/api/jobs/schedule-reminder
/api/push/public-key
/api/push/subscribe
/api/push/unsubscribe
/auth
/auth/callback
/auth/signout
/manifest.webmanifest
/privacy
```

Framework-generated routes and static assets may also appear in the build output.

The purpose of this check is to confirm that the expected Fenéla routes are present, not to require the build output to match this list exactly.

## Contributor checks

The following commands are not required for an ordinary first run. Use them when changing the related parts of the repository.

### After database schema changes

After adding or changing a migration, regenerate and format the committed TypeScript database types with the validated Supabase CLI version:

```bash
npx supabase@2.113.0 gen types typescript --local > src/types/database.types.ts
npx prettier --write src/types/database.types.ts
```

Then lint the local database schema:

```bash
npx supabase@2.113.0 db lint
```

Review the generated type diff before committing it.

### After dependency changes

Use:

```bash
npm install
```

only when intentionally changing dependencies or regenerating `package-lock.json`.

After dependency or lockfile changes, verify that a fresh locked install still works:

```bash
npm ci
```

Cross-platform validation on Linux or WSL is recommended after dependency or lockfile changes because platform-specific optional dependencies can affect the generated lockfile.

## GitHub Actions

The CI workflow is located at:

```text
.github/workflows/ci.yml
```

It runs the locked install and repository validation checks on pushes and pull requests.

The workflow provides repeatable repository-level validation but does not replace local testing of Supabase authentication, browser notification permission or external service configuration.

## Troubleshooting

### PowerShell shows `>>`

PowerShell is waiting for the rest of an incomplete command. This is usually caused by an open quote, trailing backtick or unfinished multiline expression.

Cancel the incomplete command with:

```text
Ctrl + C
```

Then run the command again as a complete command.

### `supabase start` fails with a port bind error on Windows

If `npx supabase@2.113.0 start` fails with an error containing:

```text
bind: An attempt was made to access a socket in a way forbidden by its access permissions
```

Windows is currently excluding the TCP port Supabase is trying to use. This is a machine-level networking condition (commonly tied to Hyper-V/WSL2 dynamic port reservations), not a Fenéla or Supabase defect.

Confirm this with:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

If the port from the error falls inside a listed range, edit the affected port(s) in `supabase/config.toml` locally to a free port outside every listed range (verify with `netstat -ano | findstr "<port>"` first), then re-run `npx supabase@2.113.0 start`. Update `.env.local` and any Mailpit URL you use afterwards to match. Treat such a port change as a local workaround for this machine, not a change to propose upstream, unless the exclusion is reliably reproducible for other contributors too.

### Fenéla reports missing Supabase configuration

Confirm that `.env.local` contains:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

and that the values came from the running local Supabase stack.

If the local stack is not running, start it with:

```bash
npx supabase@2.113.0 start
```

Then confirm its values with:

```bash
npx supabase@2.113.0 status
```

Restart `npm run dev` after changing `.env.local`.

### Magic Link email does not appear

Confirm that the local Supabase stack is running.

Open Mailpit at the `MAILPIT_URL` shown by `npx supabase@2.113.0 status`.

Request a new Magic Link from:

```text
http://localhost:3000/auth
```

### AI generation fails

Confirm that `.env.local` contains a valid:

```env
OPENAI_API_KEY=
```

and, if explicitly configured:

```env
OPENAI_MODEL=
```

AI assistance is optional. If OpenAI is unavailable or not configured, Fenéla can use deterministic fallback suggestions.

### Push notifications do not work

Check:

- notification permission;
- service worker registration;
- VAPID keys;
- KV configuration;
- browser and device support;
- cron configuration when testing scheduled delivery.

On iPhone and iPad, Web Push should be tested through an installed Home Screen app.

### `npm ci` works on Windows but fails on Linux or WSL

A lockfile generated after dependency changes can miss platform-specific optional dependency entries.

Regenerate the lockfile in the environment where the problem occurs:

```bash
npm install --package-lock-only
npm ci
```

Do this only when the lockfile genuinely needs to change, and review the resulting diff before committing it.

### Production logs show `DEP0169`

Node may report a `url.parse()` deprecation warning from the upstream `web-push` dependency.

Fenéla does not call `url.parse()` directly. No application-code workaround is required unless a compatible dependency update resolves it.

## Setup complete

The core local setup is complete when:

- dependencies install successfully;
- the local Supabase stack is running;
- all version-controlled migrations have been applied;
- the required Supabase environment values are configured;
- Fenéla opens locally;
- Magic Link authentication completes successfully.

The repository validation is complete when:

```bash
npm run format:check
npm run lint
npm run test
npm run build
```

and the internal Markdown link check all pass.

AI assistance, Web Push and scheduled reminder delivery can then be configured separately when those capabilities are needed.
