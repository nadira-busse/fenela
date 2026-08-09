# Known Limitations

This document describes the current boundaries of Fenéla MVP 1.

Some are deliberate product choices. Others follow from the current browser-, device- and infrastructure-based implementation.

## Device-based state

Fenéla has no login or account synchronization.

Screening answers, saved anchors, day state and reminder settings belong to the current browser or installed PWA.

Using Fenéla on another device, in another browser or in another browser profile may require setup again.

Push subscriptions also remain device-specific.

MVP2 now has an accepted architecture decision for authenticated, user-owned persistence.

That work is not implemented in the current release, so the limitations above still apply to the application today.

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

Reminder settings apply to the current browser or installed PWA.

Changing or disabling reminders on one device does not update another device.

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

Daily reminders and day-state keys use `Europe/Amsterdam`.

Users in other timezones may therefore see reminder timing or day boundaries that do not match their local time.

## Public-route protection

Fenéla's public product routes have no user authentication.

Public AI and reminder routes use validation and rate limiting to reduce repeated use, cost exposure and storage growth.

These controls are not identity verification and do not fully prevent deliberate abuse.

MVP2 will introduce authenticated ownership for persistent user and reminder data. A technical authentication foundation (Supabase Auth sign-in/sign-out) now exists at `/auth`, but it is not yet connected to any product route above, and no user or reminder data is scoped to an authenticated user in the current release.

Rate limiting and other abuse controls will remain separate from authentication where they still serve a different purpose.

See [ADR-003: Authenticated User-Owned Persistence](../../decisions/ADR-003-authenticated-user-owned-persistence.md) and [ADR-004: Reminder Preferences and Device Ownership](../../decisions/ADR-004-reminder-preferences-and-device-ownership.md).

## AI and safety limits

AI is currently limited to generating anchor suggestions.

The safety layer combines pattern-based checks, prompt restrictions and output validation. It does not provide comprehensive content moderation or reliable detection of every unsafe intention.

Indirect or unusual unsafe phrasing may still be missed.
