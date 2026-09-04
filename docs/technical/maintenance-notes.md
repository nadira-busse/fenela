# Maintenance Notes

This file contains recurring operational details that are easy to miss during normal development. It is not a release log.

## Push-state cleanup

Canonical reminder intent and device ownership live in PostgreSQL. KV holds derived delivery state such as push payloads, scheduled jobs, daily-start pointers and discovery indexes.

A terminal Web Push response (`404` or `410`) removes the unusable push subscription and associated operational KV state. The canonical `Device` row remains because an expired endpoint does not invalidate device ownership.

`TASK_REMINDER` and `DAILY_START` have different execution semantics:

- `TASK_REMINDER` is claimed exclusively before delivery and gets at most one Fenéla send attempt for that logical job;
- `DAILY_START` uses its own pointer/singleton flow and may schedule the next daily occurrence after the current occurrence is processed.

Operational cleanup is intentionally retry-safe. If cleanup cannot complete, discovery references are preserved where required so a later maintenance/deletion path can find remaining state.

## Account retention

`/api/cron/retention` applies the 12-month inactivity policy. The hosted deployment invokes it through an external scheduler; self-hosted deployments must configure their own schedule and protect the endpoint with `CRON_SECRET`.

The scan is bounded by `RETENTION_SCAN_MAX_PAGES` in `src/server/account/listInactiveAccountCandidates.ts`:

- 200 users per page;
- 50 pages per invocation;
- maximum 10,000 scanned accounts per run.

When the bound is reached, the result reports `truncated: true`. This should be monitored if the account base grows beyond the current batch design.

Retention uses server-observed activity in `public.user_activity` together with `auth.users.last_sign_in_at`. Browser clients cannot write the activity timestamp because it contributes to a destructive retention decision.

See [Privacy and data lifecycle](../product/privacy-data-lifecycle.md).

## Maintenance scripts

The repository contains two local scripts:

```text
scripts/cleanup-devices.mjs
scripts/cleanup-all-devices.mjs
```

`cleanup-devices.mjs` removes stale operational KV records that no longer have an active push subscription. It does not delete canonical PostgreSQL `Device` rows.

`cleanup-all-devices.mjs` is a destructive development/test reset for KV-managed reminder state. It can target a remote/shared store, so it prints the target, requires explicit shared-store opt-in when applicable and requires the exact confirmation phrase:

```text
DELETE ALL DEVICES
```

Do not use either script as an account-deletion substitute.

## Database and dependency maintenance

Generated database types live in `src/types/database.types.ts` and should be regenerated after schema changes. Format the generated file before commit.

The local setup pins the Supabase CLI version that was validated with the repository. If that version changes, validate migrations and update the documented command in the same change.

After dependency or lockfile changes, run installation/validation on Linux or WSL as well as Windows because platform-specific optional dependencies can affect `npm ci`.

Production logs may show Node warning `DEP0169` from the upstream `web-push` dependency. Fenéla does not call `url.parse()` directly. Revisit this note when `web-push` is upgraded.

See [Local setup](local-setup.md) for the standard validation commands.
