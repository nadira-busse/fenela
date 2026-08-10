# Maintenance Notes

This document records recurring maintenance details that do not belong in the product explanation or main architecture overview.

It focuses on device cleanup, cross-platform dependency checks and known upstream behavior.

## Device records and cleanup

MVP2 separates canonical account ownership in PostgreSQL from operational push-delivery state in KV. An authenticated browser/device has an owned `devices` row in PostgreSQL; KV stores delivery-oriented subscription/job pointers keyed by that device ID.

When a push subscription is confirmed terminally invalid (404/410), cleanup removes the PushSubscription and associated operational KV delivery state. The canonical PostgreSQL Device row is preserved; it is not reassigned or deleted as part of terminal-subscription cleanup.

The cron worker therefore:

- skips devices without usable operational subscription state;
- removes terminally invalid push-subscription state;
- removes associated KV jobs/pointers;
- avoids rescheduling delivery to a subscription that can no longer receive notifications.

Transient delivery failures such as network errors, 429 responses or 5xx responses do not delete the subscription or Device row.

## Maintenance scripts

The repository contains two local maintenance scripts:

```text
scripts/cleanup-devices.mjs
scripts/cleanup-all-devices.mjs
```

### `cleanup-devices.mjs`

This legacy maintenance script audits KV-registered device IDs and removes operational KV records that no longer have an active push subscription.

It does not delete canonical PostgreSQL `devices` rows. Use it only when development or repeated browser resets have left stale KV delivery records.

### `cleanup-all-devices.mjs`

This destructive maintenance script clears the reminder system's KV-managed operational state, including:

- KV device-set entries;
- KV push-subscription payloads;
- scheduled reminder jobs;
- daily reminder pointers;
- legacy reminder keys covered by the script.

It does not remove canonical PostgreSQL account-owned Device rows or ReminderPreference rows.

This is a destructive reset. The script requires explicit confirmation before deleting data.

Storage credentials are read from the local environment and are not included in the repository.

## Cross-platform dependency checks

Fenéla is developed on Windows and has also been validated in Linux through WSL.

A dependency update previously produced a `package-lock.json` that worked on Windows but failed during `npm ci` on Linux because platform-specific optional dependency entries were missing.

The lockfile was repaired in Linux with:

```bash
npm install --package-lock-only
npm ci
```

After dependency or lockfile changes, verify installation in both environments:

- Windows;
- Linux or WSL.

The full validation flow is documented in [Local setup](local-setup.md).

## Upstream `url.parse()` warning

Production logs may show Node warning `DEP0169` related to `url.parse()`.

Fenéla does not call `url.parse()` directly. The warning originates from the upstream `web-push` dependency.

No application-code workaround is currently required.

Review this note after future `web-push` updates. It can be removed when the dependency no longer produces the warning or when the repository adopts a confirmed compatible fix.

## Maintenance boundary

This file is not a release log.

Dated test counts, audit snapshots and one-time debugging history belong in CI, release notes or the relevant setup documentation.

Update this file only when a recurring maintenance issue, destructive operation or non-obvious dependency behavior needs to remain visible.
