# ADR-003: Optional Reminders

## Status

Accepted.

## Context

Fenéla is built around daily return. Reminders can help with that.

At the same time, browser push notifications add friction. They require permission, service worker registration, browser support, VAPID configuration and storage setup. On some devices, especially iPhone, web push support may also depend on adding the app to the Home Screen.

A reminder feature can support the product, but it should not block the user from using Fenéla.

## Decision

Fenéla includes optional reminders.

The user must be able to:

- create an anchor without enabling reminders;
- decline notification permission;
- continue the flow without push notifications;
- use the core app even if reminder infrastructure is unavailable;
- later enable, disable or adjust reminders from a separate reminder settings screen.

Reminders are support infrastructure, not the main product.

## Reason

The product loop includes daily return:

```text
overwhelm -> one small action -> gentle accountability -> daily return
```

A reminder can make daily return easier. But if reminder setup becomes mandatory, the app becomes more demanding. That would conflict with the product purpose.

The user may already be overloaded. A browser permission step should not become another barrier.

The reminder setting also has to be recoverable. A user may switch devices, reinstall the PWA, clear browser storage or initially decline permission. Reminder control therefore belongs in runtime settings, not only in screening.

## Trade-off

Optional reminders mean some users will not receive notifications.

I accept that because user control matters more than forced reminder engagement.

## Impact

The reminder flow should:

- offer reminders clearly;
- make declining reminders acceptable;
- avoid pressure-based copy;
- explain permission only when needed;
- keep reminder choices simple;
- fail gracefully if push setup does not work;
- allow the user to turn reminders on or off later;
- allow daily reminder time changes outside the screening flow.

The technical implementation should remain separate from the core UI flow.

## Related routes

Reminder and job routes:

```text
/api/jobs/schedule-daily-start
/api/jobs/schedule-reminder
/api/jobs/cancel
/api/jobs/cancel-daily-start
/api/cron/push
```

Push routes:

```text
/api/push/public-key
/api/push/subscribe
```

Service worker:

```text
public/sw.js
```

## UX boundary

Good reminder behavior:

```text
Would you like a reminder?
```

```text
Continue without reminders.
```

```text
You can still use Fenéla without notifications.
```

```text
Reminders: On / Off.
```

Bad reminder behavior:

```text
Enable reminders to continue.
```

```text
Do not break your streak.
```

```text
Never miss a habit again.
```

The reminder tone should stay calm and non-punitive.

## Technical boundary

Push notifications depend on:

- browser support;
- notification permission;
- service worker registration;
- VAPID keys;
- storage configuration;
- deployment environment;
- cron-triggered processing.

Because these dependencies can fail, reminders must not be treated as guaranteed delivery.

## Public repository boundary

The repository may include:

- push notification code;
- service worker code;
- `.env.example` placeholders;
- setup documentation.

The repository must not include:

- real VAPID private keys;
- real storage tokens;
- deployment secrets;
- local `.env.local` files.

## Result

Fenéla supports reminders without becoming dependent on them.

The core app remains usable, calm and low-friction even when notifications are declined or unavailable.
