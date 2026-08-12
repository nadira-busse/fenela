# ADR-004: Reminder Preferences and Device Ownership

## Status

Accepted and implemented.

## Context

Fenéla MVP1 used a locally generated device ID to connect:

- push subscriptions;
- scheduled reminder jobs;
- reminder cancellation;
- daily reminder state.

That worked as a lightweight device-correlation mechanism.

It was not a reliable authorization boundary because the device ID came from the client.

The earlier implementation also represented daily reminder settings in more than one place.

Screening stored a reminder choice and start time, while the coaching settings flow could later maintain the same concept through separate local values.

Those representations could diverge even though they described one user preference.

The underlying design also mixed three different concepts:

- whether the user wants reminders;
- which device belongs to that user;
- which technical push endpoint can receive a notification.

These responsibilities needed separate ownership boundaries.

## Decision

Fenéla separates reminder preference from delivery infrastructure.

The domain model is:

```text
User
├── ReminderPreference
└── Device
    └── PushSubscription
```

## ReminderPreference

ReminderPreference represents the user's product-level choice.

It stores the canonical reminder configuration, including:

- enabled state;
- daily start time.

The user's timezone is stored as part of the user preference context used for local-calendar interpretation.

The onboarding reminder choice and later reminder settings update the same canonical preference rather than maintaining independent representations.

## Device

`Device` represents a browser or device installation associated with an authenticated user.

A device identifier is useful for operational correlation.

It is not user identity and is not treated as an authorization credential.

## PushSubscription

`PushSubscription` represents the technical Web Push endpoint associated with a verified Device.

A push subscription describes delivery capability.

It does not describe whether the user currently wants a daily reminder.

Authenticated reminder operations derive ownership from the current server session and verified Device association.

Rate limiting remains separate from authentication and authorization. It protects routes that can create operational storage growth or external cost.

## Reason

The earlier model combined three responsibilities:

```text
- user preference
- device ownership
- push delivery
```

Separating them makes each boundary explicit.

The resulting model answers three different questions:

```text
What does the user want?
→ ReminderPreference

Which device belongs to the user?
→ Device

Where can a notification be delivered?
→ PushSubscription
```

The design also removes duplicated reminder-time state for authenticated users.

Product preference can therefore change without treating a push endpoint as the preference itself.

## Trade-off

The reminder system has more explicit structure than the original device-only model.

That additional structure is accepted because it resolves existing ambiguity around ownership and duplicated state.

Operational delivery remains device-specific.

Fenéla does not introduce a broader multi-device notification system unless a concrete product requirement justifies that additional complexity.

Push delivery also remains dependent on:

- browser support;
- notification permission;
- service worker behavior;
- device behavior;
- operational configuration.

Reminder delivery therefore cannot be treated as guaranteed.

## Impact

Fenéla now:

- persists one canonical ReminderPreference for an authenticated user;
- associates Devices with authenticated users;
- associates PushSubscriptions with owned Devices;
- does not use a device ID as pseudo-authorization;
- derives authenticated ownership server-side;
- uses the same reminder preference from onboarding and later settings;
- allows the user to enable, disable and reschedule reminders;
- keeps reminder failures from blocking the core accountability flow;
- separates canonical PostgreSQL ownership from KV-backed operational scheduling.

Timezone handling is explicit in the persisted user context and reminder scheduling flow.

Absolute timestamps remain separate from local calendar interpretation.

The reminder architecture supports the current product without requiring speculative multi-device behavior.
