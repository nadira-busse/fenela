# Maintenance Notes

This document records recurring maintenance details that do not belong in the product explanation or main architecture overview.

It focuses on device cleanup, cross-platform dependency checks and known upstream behavior.

## Device records and cleanup

Fenéla uses a device-based reminder model.

A browser, browser profile or installed PWA receives its own local device ID. During development, clearing browser data, reinstalling the PWA or repeatedly resetting the application can create multiple device records in KV storage.

Older records may remain after the browser has lost its local state or push subscription.

The cron worker reduces stale state by:

- skipping devices without a valid subscription;
- removing device data after a push subscription is confirmed invalid;
- avoiding rescheduling for devices that can no longer receive notifications.

When a push subscription is no longer valid, the cleanup flow can remove:

- the stored subscription;
- the device record;
- the daily reminder pointer;
- pending reminder jobs associated with that device.

A failed daily reminder is not rescheduled when the device can no longer receive push notifications.

## Maintenance scripts

The repository contains two local maintenance scripts:

```text
scripts/cleanup-devices.mjs
scripts/cleanup-all-devices.mjs
```

### `cleanup-devices.mjs`

This script audits registered devices and removes records that no longer have an active push subscription.

Use it when development or repeated browser resets have left stale device records in KV storage.

### `cleanup-all-devices.mjs`

This script removes all registered device data handled by the reminder system, including:

- device records;
- push subscriptions;
- scheduled reminder jobs;
- daily reminder pointers;
- legacy reminder keys covered by the script.

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
