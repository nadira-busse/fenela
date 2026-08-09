# ADR-003: Authenticated User-Owned Persistence

## Status

Accepted for MVP2. Not implemented in the current release.

## Context

Fenéla MVP1 keeps most personal state in the current browser or installed PWA.

That was a deliberate choice. It allowed the core product loop to be built and tested without introducing accounts, persistent profiles or cross-device synchronization before they were needed.

MVP2 changes that requirement.

Fenéla is intended to use information the user deliberately provides over more than one session. This includes goals, preferences, completed or postponed actions, user-entered friction and short weekly or monthly reflections.

The current device-based model cannot provide reliable long-term ownership for that data.

A browser-generated device ID can separate records, but it is not a trustworthy user identity or authorization boundary.

MVP2 therefore needs a stable authenticated identity before personal history becomes persistent server-side data.

## Decision

MVP2 will introduce authenticated, user-owned persistence.

The selected baseline is:

```text
Next.js
+
Supabase Auth
+
Supabase PostgreSQL
```

Authentication will establish a stable user identity.

Persistent application data will be related to that authenticated identity rather than to a client-provided user or device identifier.

The initial authentication experience should remain small:

Google sign-in;
passwordless email through Magic Link or OTP.

Fenéla will not build its own password-management system unless a later requirement justifies it.

The persistent model is relational.

Expected user-owned concepts include:

User
├── UserPreference
├── ReminderPreference
├── Goal
│ ├── Anchor
│ ├── ActionEvent
│ └── FrictionEvent
├── Reflection
└── Device
└── PushSubscription

This is a conceptual domain model, not a fixed database schema.

Schema details, constraints and indexes must still follow actual access patterns during implementation.

PostgreSQL Row Level Security will be used where appropriate as an additional ownership boundary.

Application code must still derive the user identity from the authenticated session and enforce ownership explicitly.

MVP2 will not introduce an ORM by default.

Supabase-generated types and a small explicit data-access layer are the preferred starting point. An ORM should only be added if concrete query or mapping complexity later justifies it.

No migration layer will be built for existing MVP1 browser data because there are no external production users whose current local state needs to be preserved.

## Reason

Authentication is no longer being added only to protect reminder routes.

It now supports a coherent set of product requirements:

durable ownership;
persistent preferences;
goal continuity;
action history;
friction history;
weekly reflection;
monthly reflection;
recovery after a new session;
future multi-device continuity.

Using one provider for authentication and PostgreSQL persistence keeps the architecture smaller than splitting identity and application data across separate services without a current need.

PostgreSQL also matches the domain more directly than a document-first store because Fenéla needs clear ownership relationships and time-based historical queries.

## Trade-off

MVP2 introduces responsibilities that MVP1 intentionally avoided:

authentication;
authorization;
relational persistence;
account lifecycle;
personal-data retention;
account deletion;
database migrations;
stronger integration testing.

The application becomes more complex.

That complexity is accepted because it now supports real product behavior rather than speculative infrastructure.

The decision also creates a dependency on Supabase.

The implementation should therefore keep Fenéla's domain and application logic separate from provider-specific details where that separation has a clear maintenance benefit.

## Impact

The current release remains local and device-based until MVP2 implementation is complete.

MVP2 implementation must:

establish authenticated identity server-side;
scope persistent data to that identity;
prevent cross-user reads and writes;
keep service credentials out of client code;
use version-controlled database migrations;
define account deletion and data lifecycle behavior;
test authentication and authorization separately;
preserve the current calm product flow.

Authentication is infrastructure for continuity.

It must not turn account management into a new product area.
