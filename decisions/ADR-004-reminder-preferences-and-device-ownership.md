# ADR-004: Reminder Preferences and Device Ownership

## Status

Accepted and implemented.

## Context

Fenéla MVP1 used a locally generated device ID to connect:

- push subscriptions;
- scheduled reminder jobs;
- reminder cancellation;
- daily reminder state.

That was enough for the first version of the reminder flow.

At that stage, the device ID only needed to answer a practical question:

> which browser installation should this reminder state belong to?

For lightweight device correlation, that worked.

The problem became clearer as reminders moved from a local MVP feature into authenticated, persistent product behavior.

A client-generated device ID can identify one browser installation, but the client also controls that value. It therefore cannot prove which authenticated user owns the device or authorize changes to account-owned reminder state.

During the MVP2 work, a second problem became visible.

The same reminder preference was represented in more than one place.

Screening could store whether the user wanted reminders and a start time, while the later coaching/settings flow could maintain the same concept through separate local state.

Those values could diverge even though they were supposed to describe one decision made by one user.

This showed that the reminder implementation was mixing three different questions:

```text
Does the user want reminders?

Which browser or device belongs to that user?

Where can a push notification technically be delivered?
```

Those questions are related, but they do not have the same owner or lifecycle.

Treating them as one piece of reminder state made the boundaries harder to reason about and created room for stale or conflicting state.

## Decision

Fenéla separates reminder preference from device ownership and push-delivery infrastructure.

The domain model is:

```text
User
├── ReminderPreference
└── Device
    └── PushSubscription
```

### ReminderPreference

`ReminderPreference` represents the user's product-level choice.

It stores the canonical reminder configuration, including:

- enabled state;
- daily start time.

The user's timezone is stored as part of the user preference context used for local-calendar interpretation.

The reminder choice made during onboarding and changes made later in Reminder settings update the same canonical preference.

Fenéla does not maintain a second independent reminder preference for the same authenticated user.

### Device

`Device` represents a browser or device installation associated with an authenticated user.

A device identifier remains useful for operational correlation.

It can be used to connect device-specific push and scheduling state to the correct browser installation.

It is not user identity and is never treated as an authorization credential.

Authenticated device operations derive the user from the current server session and verify that the device belongs to that user.

### PushSubscription

`PushSubscription` represents the technical Web Push endpoint associated with a verified Device.

It answers a delivery question:

> where can this device currently receive a push notification?

It does not answer the product question:

> does the user currently want reminders?

A valid push subscription can exist independently of the user's current reminder preference, and a reminder preference can exist even when push delivery is unavailable or blocked.

Authenticated reminder operations therefore derive ownership from the current server session and verified Device association.

Rate limiting remains separate from authentication and authorization.

It protects routes that can create operational storage growth or external cost, but it does not establish identity or ownership.

## Reason

The important change was separating concepts that had previously been convenient to treat as one thing.

During implementation and testing, that distinction became necessary because each part of the reminder flow has a different responsibility.

The resulting model answers three explicit questions:

```text
What does the user want?
→ ReminderPreference

Which device belongs to the authenticated user?
→ Device

Where can that device currently receive a notification?
→ PushSubscription
```

That separation removes ambiguity from both persistence and authorization.

The user can change a reminder preference without treating a technical push endpoint as the preference itself.

A push subscription can expire without implying that the user's reminder preference should be deleted.

A device ID can still be used for device-specific operations without being trusted as proof of account ownership.

The model also removes duplicated reminder-time state for authenticated users.

Onboarding and later reminder settings now refer to the same canonical preference rather than maintaining separate versions of the same product decision.

This became especially important during acceptance testing, where stale client state could otherwise make the UI show a reminder status that no longer matched the persisted preference.

The ownership and state boundaries are therefore explicit by design rather than inferred from whichever browser value happens to be available.

## Trade-off

The reminder system now has more explicit structure than the original device-only MVP1 model.

It requires separate handling for:

- product preference;
- authenticated device ownership;
- push-subscription lifecycle;
- operational scheduling state.

That additional structure is accepted because it resolves problems that already existed:

- duplicated reminder state;
- unclear ownership;
- stale client representations;
- device identifiers being too easy to mistake for credentials;
- push delivery state being confused with user intent.

Operational delivery remains device-specific.

Fenéla does not introduce a broader multi-device notification platform unless a concrete product requirement justifies that additional complexity.

Push delivery also remains dependent on:

- browser support;
- operating-system behavior;
- notification permission;
- service worker behavior;
- device behavior;
- push-provider availability;
- operational scheduling and deployment configuration.

Reminder delivery is therefore best effort rather than guaranteed.

That limitation is accepted because reminders support the accountability loop but are not required for Fenéla to remain usable.

## Impact

Fenéla now:

- persists one canonical `ReminderPreference` for an authenticated user;
- uses the same reminder preference from onboarding and later Reminder settings;
- associates Devices with authenticated users;
- associates PushSubscriptions with owned Devices;
- does not use a device ID as pseudo-authorization;
- derives authenticated ownership server-side;
- verifies device ownership before account-owned device operations;
- allows the user to enable, disable and reschedule reminders without creating a second preference source;
- keeps notification permission and delivery capability separate from reminder intent;
- keeps reminder failures from blocking the core accountability flow;
- separates canonical PostgreSQL ownership from KV-backed operational scheduling and delivery state.

Timezone handling is explicit in the persisted user context and reminder scheduling flow.

Absolute timestamps remain separate from local calendar interpretation.

The reminder architecture supports the current product without requiring speculative multi-device behavior or treating operational push state as account identity.
