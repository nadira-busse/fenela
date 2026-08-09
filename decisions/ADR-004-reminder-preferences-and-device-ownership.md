# ADR-004: Reminder Preferences and Device Ownership

## Status

Accepted for MVP2. Not implemented in the current release.

## Context

Fenéla MVP1 uses a locally generated device ID to connect:

- push subscriptions;
- scheduled reminder jobs;
- reminder cancellation;
- daily reminder state.

This works as a lightweight device correlation mechanism.

It is not a reliable authorization boundary because the device ID is supplied by the client.

The current implementation also stores the daily reminder time in more than one place.

Screening stores a start time as part of the screening state. The coaching settings flow can later store the same concept under a separate local value.

These values can diverge even though they represent the same user preference.

The MVP2 input audit also showed that reminder preference and push delivery are currently mixed conceptually.

A user's choice to receive a reminder is not the same thing as the technical push subscription that can deliver it.

## Decision

MVP2 will separate reminder preference from delivery infrastructure.

The conceptual model becomes:

```text
User
├── ReminderPreference
└── Device
    └── PushSubscription
```

ReminderPreference represents what the user wants.

It is expected to contain the user-level reminder configuration needed by the product, including:

enabled
start_time
timezone

The exact database shape will be finalized during implementation.

Device represents a device or browser installation belonging to an authenticated user.

PushSubscription represents the technical endpoint used to deliver notifications to that device.

A device is not a user identity.

A push subscription is not a reminder preference.

MVP2 will also use one canonical daily reminder time.

The onboarding value and the later settings value will no longer be stored as two independent representations of the same preference.

Changing the reminder time later updates the same persistent preference established during onboarding.

Reminder operations will derive ownership from the authenticated user.

Client-provided device identifiers must not act as authorization credentials.

Rate limiting remains separate from authentication and authorization and will be retained where it still protects against abuse or unnecessary cost.

## Reason

The current model combines three different responsibilities:

user preference
device identity
push delivery

Separating them makes ownership and behavior easier to reason about.

It also removes duplicated state around the reminder start time.

The resulting model answers three different questions explicitly:

What does the user want?
→ ReminderPreference

Which device belongs to the user?
→ Device

Where can a push message be delivered?
→ PushSubscription

This provides a cleaner basis for future multi-device support without requiring multi-device complexity in the first MVP2 implementation.

## Trade-off

The reminder model gains one additional domain concept.

That is more structure than MVP1 needs.

The extra concept is accepted because it removes an existing ambiguity rather than creating abstraction for future possibilities.

MVP2 will also need to define how reminder delivery behaves when a user has more than one registered device.

That behavior should remain minimal until a real multi-device use case needs more sophistication.

## Impact

MVP2 implementation must:

persist one canonical reminder preference;
associate devices with authenticated users;
associate push subscriptions with devices;
remove device ID as pseudo-authorization;
update scheduling and cancellation routes to use authenticated ownership;
preserve the user's ability to enable, disable and reschedule reminders;
retain failure behavior that does not block the core Fenéla flow.

Timezone handling must also become explicit before reminder and reflection periods are finalized.

Absolute timestamps should remain separate from the user's local calendar interpretation.

The exact week boundary and timezone UX are implementation decisions that must be resolved before weekly and monthly aggregation is considered complete.
