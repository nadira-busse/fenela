# Fenéla

[![CI](https://github.com/nadira-busse/Fenela/actions/workflows/ci.yml/badge.svg)](https://github.com/nadira-busse/Fenela/actions/workflows/ci.yml)

## Live application

[Open Fenéla](https://fenela.vercel.app)

Fenéla is a calm accountability app for moments when a goal feels too large to start.

Instead of asking the user to build a full plan, Fenéla narrows attention to one goal, a small set of concrete anchors and one action at a time. The product is deliberately small: features that add cognitive load without strengthening that loop are left out.

```text
overwhelm → one goal → small anchors → one step at a time → gentle accountability → return
```

AI has one bounded role: it can suggest anchors when the user asks for help. The user can edit, replace or ignore those suggestions. AI does not own persistence, reflection facts, reminders, retention or account deletion.

## Why I built it

Most productivity tools assume the user is ready to plan, prioritise and make several decisions. Fenéla is aimed at the moment before that: when even deciding what to do next can feel like extra work.

The product reduces that decision to one small action and keeps the surrounding system quiet.

## Screenshots

### Personalization

![Fenéla personalization choices](assets/screenshots/01-personalization-choices.png)

### Goal and anchors

| Goal intake                                                   | AI-assisted anchor suggestions                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| ![Fenéla goal intake](assets/screenshots/02-focus-intake.png) | ![Fenéla AI-assisted anchor suggestions](assets/screenshots/03-ai-anchor-suggestions.png) |

### Daily accountability

![Fenéla today's small step](assets/screenshots/04-todays-small-step.png)

## Product flow

A user can:

- sign in with a passwordless Magic Link;
- choose a small set of preferences;
- define one goal and describe what makes it difficult;
- create anchors manually or ask Fenéla for AI-assisted suggestions;
- review and edit anchors before saving them;
- focus on one anchor at a time;
- complete, postpone or record friction around an anchor;
- enable or disable optional reminders;
- return to the same account-owned goal and history across sessions;
- receive a deterministic weekly reflection from recorded activity;
- delete their account and associated user-owned data.

Fenéla is an accountability application, not a therapy tool, medical product, autonomous coach or general-purpose productivity suite.

## System boundaries

### Canonical account data

Supabase Auth establishes identity. PostgreSQL stores authenticated account-owned state behind Row Level Security, including preferences, goals, anchors, events, reflections, devices and push subscriptions.

Browser storage is limited to local UI/device state and is not the source of truth for account-owned records.

### AI

`/api/ai/anchors` is the only production AI flow.

Before OpenAI can be called, the server authenticates the user, validates the request and verifies the canonical AI-assistance preference from PostgreSQL. Model output is treated as untrusted derived data: it is parsed, sanitised, validated and safety-checked before it reaches the UI. Invalid output gets one bounded repair attempt and then falls back to deterministic local suggestions.

Nothing is persisted until the user explicitly confirms the anchor set, and the persistence boundary validates the data again.

See [AI and ethical-use guardrails](docs/product/ai-guardrails.md).

### Reminders

Reminder intent, device ownership and delivery state are separate concerns:

- PostgreSQL stores the user's reminder preference;
- an authenticated `Device` owns the push subscription;
- KV-compatible storage holds operational jobs, pointers and rate-limit state;
- `/api/cron/push` processes due jobs.

Push delivery is best effort. A one-shot `TASK_REMINDER` uses an exclusive Redis claim before Fenéla makes one application-level send attempt; Fenéla does not automatically resend the same logical reminder after an ambiguous provider failure. Daily-start reminders use their own pointer and rescheduling flow.

### Reflections

Action and friction events are immutable factual history. Weekly reflections are deterministic snapshots derived from completed-period history; AI is not used in that path.

The stored reflection does not depend on current goal or anchor text, so later edits cannot retroactively change historical reflection output.

### Account lifecycle

User-initiated deletion and 12-month inactivity retention use the same deletion core. Operational reminder state is cleaned before the irreversible Auth deletion step; if required cleanup cannot complete, deletion fails closed and can be retried.

See [Privacy and data lifecycle](docs/product/privacy-data-lifecycle.md).

## Technical stack

- Next.js / React / TypeScript
- Supabase Auth and PostgreSQL
- Row Level Security
- OpenAI for optional anchor suggestions
- Web Push
- KV-compatible operational storage
- Vitest
- GitHub Actions

The repository separates UI flow, authenticated server operations, deterministic domain logic, AI validation/fallback behavior, reminder delivery infrastructure and account lifecycle operations.

See the [architecture overview](architecture/architecture-overview.md) for the system structure and the ADRs for the main design decisions.

## Engineering checks

CI runs formatting, linting, tests and the production build. The repository also includes internal Markdown link checking and a local Supabase RLS test configuration for ownership-sensitive database behavior.

Current validation commands are documented in [Local setup](docs/technical/local-setup.md). The README intentionally does not pin a test count because it becomes stale as the suite changes.

## Architecture decisions

- [ADR-001 — Optional AI-assisted anchors](decisions/ADR-001-ai-assisted-anchors.md)
- [ADR-002 — Optional reminders](decisions/ADR-002-optional-reminders.md)
- [ADR-003 — Authenticated user-owned persistence](decisions/ADR-003-authenticated-user-owned-persistence.md)
- [ADR-004 — Reminder preferences and device ownership](decisions/ADR-004-reminder-preferences-and-device-ownership.md)
- [ADR-005 — Deterministic reflection history](decisions/ADR-005-deterministic-reflection-history.md)

## Run locally

Fenéla requires a local or hosted Supabase project for authentication and canonical persistence.

```bash
npm ci
```

Then follow [Local setup](docs/technical/local-setup.md) to start Supabase, apply migrations, configure `.env.local` and run the application.

Optional AI and reminder features require their corresponding provider configuration.

## Environment variables

| Variable                               | Purpose                                    |
| -------------------------------------- | ------------------------------------------ |
| `SUPABASE_SECRET_KEY`                  | Server-side privileged Supabase operations |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase browser authentication key        |
| `OPENAI_API_KEY`                       | Optional AI-assisted anchor generation     |
| `OPENAI_MODEL`                         | OpenAI model used for anchor generation    |
| `WEB_PUSH_PUBLIC_KEY`                  | Public VAPID key                           |
| `WEB_PUSH_PRIVATE_KEY`                 | Private VAPID key                          |
| `WEB_PUSH_SUBJECT`                     | Contact subject for VAPID                  |
| `STORAGE_KV_REST_API_URL`              | KV-compatible operational storage endpoint |
| `STORAGE_KV_REST_API_TOKEN`            | KV-compatible operational storage token    |
| `CRON_SECRET`                          | Shared secret protecting cron endpoints    |

## Documentation

- [Using Fenéla](docs/product/using-fenela.md) — product use and mobile reminder setup
- [Architecture overview](architecture/architecture-overview.md) — boundaries, state and request flow
- [AI and ethical-use guardrails](docs/product/ai-guardrails.md) — AI scope and validation
- [Privacy and data lifecycle](docs/product/privacy-data-lifecycle.md) — technical data handling and deletion
- [Privacy notice](docs/product/privacy-notice.md) — deployment-facing privacy information
- [Known limitations](docs/product/known-limitations.md) — current limitations and accepted trade-offs
- [Local setup](docs/technical/local-setup.md) — configuration and validation
- [Maintenance notes](docs/technical/maintenance-notes.md) — recurring operational maintenance

## Author

**Nadira Büsse**

## License

Fenéla is available under the [MIT License](LICENSE).
