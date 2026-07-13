# Known Limitations

This document describes the current boundaries of Fenéla MVP 1.

Some are deliberate product choices. Others follow from the current browser-, device- and infrastructure-based implementation.

## Device-based state

Fenéla has no login or account synchronization.

Screening answers, saved anchors, day state and reminder settings belong to the current browser or installed PWA.

Using Fenéla on another device, in another browser or in another browser profile may require setup again.

Push subscriptions also remain device-specific.

Optional account synchronization would require a separate privacy and architecture decision.

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

Fenéla has no user authentication.

Public AI and reminder routes use validation and rate limiting to reduce repeated use, cost exposure and storage growth.

These controls are not identity verification and do not fully prevent deliberate abuse.

Stronger protection would require authentication or a separate abuse-prevention design.

## AI and safety limits

AI is currently limited to generating anchor suggestions.

The safety layer combines pattern-based checks, prompt restrictions and output validation. It does not provide comprehensive content moderation or reliable detection of every unsafe intention.

Indirect or unusual unsafe phrasing may still be missed.
