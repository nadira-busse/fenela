# ADR-002: Optional Reminders

## Status

Accepted.

## Context

Fenéla supports daily return to a saved anchor set.

Reminders can make that return easier, but browser push notifications depend on user permission, browser and device support, service worker state and scheduled processing.

These dependencies can fail or be declined.

Reminder setup must therefore not become a condition for using the core application.

## Decision

Fenéla includes optional reminders.

The user can:

- complete the core flow without enabling reminders;
- decline notification permission without blocking the app;
- enable or disable reminders later;
- change the daily reminder time after onboarding.

Reminder settings remain available outside the initial screening flow.

## Reason

A user may already be dealing with high cognitive load.

A permission request, technical failure or forced setup step should not become another barrier.

Reminder preferences can also change over time. Keeping the settings available after onboarding allows the user to enable, disable or adjust reminders without repeating the full setup flow.

## Trade-off

Some users will never enable reminders, and reminder delivery cannot be guaranteed.

Fenéla accepts that limitation in exchange for:

- user control;
- access to the core flow without notifications;
- less onboarding friction;
- failure that does not block the rest of the application.

Reminder engagement is less important than keeping the app usable without external permission or delivery dependencies.

## Impact

The reminder flow:

- remains optional;
- requests notification permission only after the user chooses reminders;
- stays accessible through a separate settings screen;
- allows reminders to be enabled, disabled or rescheduled;
- fails without blocking the core application;
- treats reminder delivery as best effort.

Disabling reminders cancels the active reminder job for the current device. It does not require deletion of the stored push subscription.

The technical implementation remains separate from the main user flow.

## Related documentation

- [Architecture overview](../architecture/architecture-overview.md)
- [Maintenance notes](../docs/technical/maintenance-notes.md)
- [Local setup](../docs/technical/local-setup.md)
