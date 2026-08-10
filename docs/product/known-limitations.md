# Known Limitations

This document describes the current boundaries of the Fenéla MVP2 repository state.

Some are deliberate product choices. Others follow from browser, device, deployment and infrastructure constraints. The production deployment has not yet been updated to the final MVP2 repository state.

## Account and device state

MVP2 uses Supabase Auth and authenticated, user-owned PostgreSQL persistence for canonical preferences, Goals, Anchors, reminder preferences and factual event history.

Some compatibility/day-state UI data remains browser-local. Push subscriptions remain device-specific and belong to an authenticated Device row; a device identifier is not an authorization credential.

Full multi-device fanout is not implemented.

See [ADR-003: Authenticated User-Owned Persistence](../../decisions/ADR-003-authenticated-user-owned-persistence.md).

## Push notifications

Push notifications depend on:

- browser support;
- operating-system behavior;
- notification permission;
- service worker registration;
- VAPID configuration;
- storage availability;
- cron-triggered processing.

Reminder delivery is best effort.

Timing can vary because delivery depends on the cron trigger, deployment availability and the receiving device.

On iPhone and iPad, Web Push should be tested through a Home Screen installation rather than only in a regular Safari tab.

## Reminder settings

For authenticated users, reminder `enabled` state and daily `start_time` are canonical account-owned `ReminderPreference` data in PostgreSQL. Push delivery remains device-specific.

The current MVP2 scope does not add sophisticated multi-device reminder fanout.

## Private browsing

Private or incognito browsing may restrict:

- notification permission;
- service workers;
- push subscriptions;
- persistent local storage.

Use a normal browser profile or installed PWA when testing reminders.

Private browsing is suitable only for basic UI checks.

## PWA updates

Fenéla does not include an in-app update prompt.

Browsers normally update the application automatically, but development testing may sometimes require clearing service worker or local browser state.

## Timezone

Authenticated reminder scheduling and factual event dates use the canonical IANA timezone stored in `user_preferences.time_zone`.

Some legacy/local compatibility behavior may still use browser-local state, but authenticated scheduling no longer assumes `Europe/Amsterdam`.

## Authentication and route protection

MVP2 uses Supabase Auth for user-owned persistence and derives authenticated identity server-side. RLS and ownership checks protect account-owned data; device identifiers are not treated as authorization credentials.

Validation, rate limiting and other abuse controls remain separate from authentication where they serve a different purpose. They reduce repeated use, cost exposure or storage growth but are not substitutes for identity and authorization.

See [ADR-003: Authenticated User-Owned Persistence](../../decisions/ADR-003-authenticated-user-owned-persistence.md) and [ADR-004: Reminder Preferences and Device Ownership](../../decisions/ADR-004-reminder-preferences-and-device-ownership.md).

## AI and safety limits

AI is currently limited to generating anchor suggestions.

The safety layer combines pattern-based checks, prompt restrictions and output validation. It does not provide comprehensive content moderation or reliable detection of every unsafe intention.

Indirect or unusual unsafe phrasing may still be missed.
