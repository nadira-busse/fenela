# Known Limitations

Fenéla MVP1 is a small public MIT-licensed accountability app. Some limitations are intentional to keep the product simple and maintainable.

## Device-based setup

Fenéla MVP1 is device-based.

If a user installs Fenéla on both laptop and phone, setup may need to be repeated on each device.

Different browsers, browser profiles or devices may create separate Fenéla installations because each environment has its own localStorage, service worker state, push permission and device ID.

Possible extension: optional account sync.

## Push notifications

Push notifications depend on browser, device, operating system and user permission state.

On iOS and iPadOS, Web Push should be tested as an installed Home Screen app, not only as a Safari tab.

Reminder delivery is approximate because due jobs are processed by an external cron trigger.

## Reminder settings

Fenéla includes reminder settings so a user can turn reminders on or off and change the daily reminder time after onboarding.

Turning reminders off cancels the daily-start job for the current device. It does not need to delete the browser push subscription.

## Incognito and private browsing

Fenéla reminders should not be tested in incognito or private browsing mode.

Incognito sessions may block or limit notification permissions, service workers, push subscriptions and persistent local storage. This can make reminders appear unavailable even when the app works correctly in a normal browser profile or installed PWA.

Incognito can be used for checking basic UI flows, but reminder and push notification tests should be done in a normal browser profile or installed Home Screen app.

## Updates

Normal app updates should not require users to delete and reinstall Fenéla.

During development, reinstalling may sometimes be useful to reset service worker, manifest, localStorage or push subscription state.

Fenéla MVP1 does not include an in-app PWA update prompt.

## Timezone

Daily start reminders and day-state keys are currently interpreted using Europe/Amsterdam time in MVP1.

## Account sync

Fenéla MVP1 does not include login or account sync. Screening answers, anchor preferences and reminder settings are device-based.

A future account model should be privacy-focused and optional. Push subscriptions would still remain device-specific.

## Rate limiting is not authentication

Fenéla is intentionally accountless.

Public routes use server-side rate limiting to reduce repeated requests, storage abuse and unexpected AI usage. The limiter uses device-based signals and, for selected write routes, IP-based limits.

This is useful for accidental repeated use and low-effort abuse. It is not a complete protection against deliberate misuse. A stronger solution would require authentication or a dedicated abuse-prevention layer, which is outside the MVP scope.

## Safety filter

Fenéla MVP1 includes a basic pattern-based safety filter.

It is not comprehensive content moderation, crisis detection or a therapeutic safety system.

## AI limitations

AI assistance is limited to bounded anchor suggestions.

Fenéla is not a general AI coach, therapist, planner or crisis support tool.

## Result

These limitations keep the MVP small, predictable and maintainable.
