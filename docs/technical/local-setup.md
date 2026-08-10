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

## 7. Supabase persistence and authentication (MVP2)

MVP2 uses Supabase Auth + PostgreSQL for authenticated, user-owned persistence. The current repository includes schema/RLS, authenticated server identity, canonical persistence for user/reminder preferences and Goal/Anchor state, immutable ActionEvent/FrictionEvent history, and authenticated Device/PushSubscription ownership. Reflection persistence is developed separately under ADR-005.

### Prerequisites

- Docker Desktop (or Podman) running locally — the Supabase CLI's local development stack requires it.
- No global install is required. Every command below runs through `npx supabase`.

### Configuration

Reproducible Supabase project configuration lives in:

```text
supabase/
├── config.toml
├── seed.sql
└── migrations/
    └── 20260809120000_mvp2_persistence_foundation.sql
```

Add these values to `.env.local` once a Supabase project (local or hosted) exists:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

The two `NEXT_PUBLIC_` values are browser-safe. `SUPABASE_SECRET_KEY` is server-only and is used only by narrow privileged server-side operations that cannot run through an authenticated user session. It must never be exposed through a `NEXT_PUBLIC_` variable or imported into client code.

### Start the local stack and apply migrations

```bash
npx supabase start
npx supabase db reset
```

`supabase db reset` (re)applies every migration in `supabase/migrations/` against the local database and then runs `supabase/seed.sql`. Treat the migrations directory as the source of truth for the schema — do not hand-configure equivalent state only in the Supabase dashboard.

### Generate TypeScript database types

```bash
npm run db:types
```

This runs `npx supabase gen types typescript --local` and writes `src/types/database.types.ts`. Regenerate after every schema migration. These generated types describe the database contract used by the server-side data-access code. Regenerate them whenever a schema change alters tables, columns, functions or other generated database types.

### Validate schema and Row Level Security manually

With the local stack running:

```bash
npx supabase db lint
```

To check ownership scoping by hand, open a `psql` session against the local database (`npx supabase status` prints the connection string) and simulate two different authenticated users:

```sql
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<user-a-uuid>')::text, true);
-- run SELECT/INSERT statements as user A

select set_config('request.jwt.claims', json_build_object('sub', '<user-b-uuid>')::text, true);
-- confirm user A's rows are not visible or writable as user B
```

Use synthetic `auth.users` rows for this. Never test against real account data.

### Authentication foundation (Phase 3C-2)

With `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set in `.env.local` (the local stack's values are printed by `npx supabase status`), `npm run dev` exposes a minimal `/auth` route that exercises the authentication foundation:

- browser/server Supabase client boundary (`src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`);
- session refresh on every request (`src/proxy.ts`);
- `/auth/callback` — exchanges the Supabase auth code for a session;
- `/auth/signout` — clears the session;
- `src/server/auth/requireUser.ts` — the one place server code should ask "who is the current user?".

The `/auth` route provides the Supabase authentication entry point used by the MVP2 authenticated flow.

**Magic Link**: the local stack's Mailpit inbox (`http://127.0.0.1:54324`) receives the sign-in email. Request a link from `/auth`, open it in Mailpit, and follow it to complete the flow.

**Google OAuth**: requires a Google OAuth client and provider configuration in the target Supabase project (local `supabase/config.toml` `[auth.external.google]`, or the hosted project's Auth settings) that this repository does not include. Without it, the technical initiation flow (`signInWithOAuth`) still runs, but the provider round-trip cannot complete locally.

### Environment note

This repository's automated development environment does not have Docker (or Podman) installed, so `npx supabase start` cannot run there and the migration has not been applied against a live database in that environment. Validate it locally with Docker available before relying on it. The same applies to manual authentication validation above.

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
