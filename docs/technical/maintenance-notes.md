# Maintenance Notes

This document records recurring maintenance details that do not belong in the product explanation or main architecture overview.

It focuses on operational cleanup, account retention, dependency maintenance and known upstream behavior.

## Device records and cleanup

Fenéla separates canonical account ownership in PostgreSQL from operational push-delivery state in KV.

An authenticated browser or device has an owned `devices` row in PostgreSQL. KV stores operational subscription, job and delivery state keyed by that device ID.

When a push subscription is confirmed terminally invalid through a `404` or `410` response, cleanup removes the PushSubscription and associated operational KV state.

The canonical PostgreSQL Device row is preserved. A failed or expired push endpoint does not mean the authenticated device ownership record itself is invalid.

The push cron therefore:

- skips devices without usable operational subscription state;
- removes terminally invalid push-subscription state;
- removes associated KV jobs and pointers;
- avoids rescheduling delivery to a subscription that can no longer receive notifications.

Transient delivery failures such as network errors, `429` responses or `5xx` responses do not delete the subscription or Device row.

For a one-shot `TASK_REMINDER`, Fenéla keeps the job for one additional cron attempt after the first transient delivery failure. If the second attempt also fails transiently, the reminder is dropped. This bounded retry keeps reminder delivery best effort without introducing a general retry queue or backoff system.

`DAILY_START` reminders keep their existing behavior: after a transient delivery failure, the failed occurrence is removed and the next daily occurrence is scheduled.

## Account retention batch bound

`/api/cron/retention` applies Fenéla's inactivity-retention policy.

The hosted Fenéla deployment invokes this route once per day through an external scheduler. Self-hosted deployments must configure their own scheduled invocation and protect it with the configured `CRON_SECRET`.

The scheduler provider is deployment infrastructure rather than part of Fenéla's repository architecture.

The batch scans Supabase Auth users page by page within a single invocation. The scan is bounded by `RETENTION_SCAN_MAX_PAGES` in:

```text
src/server/account/listInactiveAccountCandidates.ts
```

The current bound is:

- 200 users per page;
- 50 pages per invocation;
- maximum 10,000 scanned accounts per run.

If the account base exceeds that bound, the result reports:

```text
truncated: true
```

rather than silently presenting the partial scan as complete.

That signal should be monitored if Fenéla grows beyond the current batch size.

See [Privacy and data lifecycle](../product/privacy-data-lifecycle.md) for the retention policy itself.

## Account activity signal

Retention decisions use a server-observed activity signal stored in:

```text
public.user_activity
```

The table contains:

```text
user_id
last_active_at
```

The activity timestamp is deliberately separate from `user_preferences`.

This matters because an authenticated user can use Fenéla before a preferences row exists.

Every authenticated root-page request updates the caller's own activity record through:

```text
src/server/account/touchOwnActivity.ts
```

The write uses the privileged server client.

Authenticated browser clients do not receive direct PostgreSQL write access to `user_activity`, because the timestamp contributes to a destructive retention decision and must not be client-controlled.

The relevant migration grants `service_role` only the operations needed to maintain the activity timestamp.

Rows are removed through the `auth.users` ownership cascade rather than through a separate user-facing delete path.

Retention uses the most recent valid value from:

- `auth.users.last_sign_in_at`;
- `user_activity.last_active_at`.

Missing or malformed activity values do not count as evidence of inactivity by themselves.

The deterministic retention rules live in:

```text
src/server/account/retentionPolicy.ts
```

## Maintenance scripts

The repository contains two local maintenance scripts:

```text
scripts/cleanup-devices.mjs
scripts/cleanup-all-devices.mjs
```

### `cleanup-devices.mjs`

This legacy maintenance script audits KV-registered device IDs and removes operational KV records that no longer have an active push subscription.

It does not delete canonical PostgreSQL `devices` rows.

Use it only when development, repeated browser resets or reminder testing have left stale KV delivery records.

### `cleanup-all-devices.mjs`

This destructive development/test maintenance script clears the reminder system's KV-managed operational state. It is useful after repeated browser, device or reminder testing has created operational state that should be reset before another controlled test cycle.

It removes:

- KV device-set entries;
- KV push-subscription payloads;
- scheduled reminder jobs;
- daily reminder pointers;
- legacy reminder keys covered by the script.

It does not remove canonical PostgreSQL Device rows or ReminderPreference rows.

The script operates against the KV store configured through the active local environment. That store may be remote or shared, so the script must not assume that a locally executed command targets disposable local data.

Before deletion, the script displays the target KV hostname and affected operational-state counts. A remote or shared store requires an additional explicit opt-in through `--allow-shared-store` or `ALLOW_SHARED_KV_CLEANUP=true`.

Deletion then requires the exact confirmation phrase:

```text
DELETE ALL DEVICES
```

Any other confirmation cancels the operation.

For manual maintenance, prefer the command-line --allow-shared-store override so destructive permission is explicit for that individual execution rather than remaining enabled in the environment.

Storage credentials are read from the local environment. Tokens are not printed and are never stored in the repository.

## Dependency and cross-platform checks

Fenéla is developed on Windows and the current repository state has been validated on both Windows and Linux through WSL.

Cross-platform validation exposed a lockfile issue where `package-lock.json` worked on Windows but failed during Linux `npm ci` because platform-specific optional dependency entries were missing.

The lockfile was repaired in Linux with:

```bash
npm install --package-lock-only
npm ci
```

After future dependency or lockfile changes, cross-platform verification on Linux or WSL is recommended because platform-specific optional dependencies can affect installation even when Windows validation succeeds.

The standard validation flow is documented in [Local setup](local-setup.md).

## Supabase CLI version

The local setup documentation uses the Supabase CLI version that was validated with this repository:

```text
2.113.0
```

Setup commands therefore use an explicit version such as:

```bash
npx supabase@2.113.0 status
```

This avoids silently changing local database behavior when a newer CLI release becomes available.

If the project deliberately upgrades the Supabase CLI, update and validate the documented version as part of the same change.

## Generated database types

Database types are committed in:

```text
src/types/database.types.ts
```

They only need to be regenerated after a database schema change.

The generated file must also be formatted before commit, because raw Supabase CLI output does not necessarily satisfy the repository's Prettier configuration.

The exact contributor command is documented in [Local setup](local-setup.md).

## Upstream `url.parse()` warning

Production logs may show Node warning `DEP0169` related to `url.parse()`.

Fenéla does not call `url.parse()` directly.

The warning originates from the upstream `web-push` dependency.

No application-code workaround is currently required.

Review this note after future web-push updates. It can be removed when the dependency no longer produces the warning or when the repository adopts a confirmed compatible fix.

## Maintenance boundary

This file is not a release log.

Dated test counts, one-time debugging history, sprint details and temporary development observations do not belong here.

Keep a note only when it describes:

- a recurring maintenance requirement;
- a destructive operation;
- a non-obvious operational constraint;
- a dependency issue that may reasonably recur;
- a repository-specific verification requirement.
