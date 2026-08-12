# ADR-003: Authenticated User-Owned Persistence

## Status

Accepted and implemented.

## Context

Fenéla MVP1 kept most personal state in the current browser or installed PWA.

That was a deliberate choice. It allowed the core product loop to be built and tested without introducing accounts, persistent profiles or cross-device ownership before those capabilities were needed.

The product requirements later changed.

Fenéla needed to preserve information that the user deliberately provides across sessions, including:

- preferences;
- goals;
- anchors;
- completed, postponed and parked actions;
- user-entered friction;
- reflection history;
- reminder preferences.

The device-based MVP1 model could not provide reliable long-term ownership for that data.

A browser-generated device ID can correlate records with one browser installation, but it is not a trustworthy user identity or authorization boundary.

Persistent personal history therefore required a stable authenticated identity.

## Decision

Fenéla uses authenticated, user-owned persistence based on:

```text
Next.js
+
Supabase Auth
+
Supabase PostgreSQL
```

Supabase Auth establishes the user's identity.

Persistent application data is associated with that authenticated identity rather than with a client-provided user or device identifier.

The implemented authentication experience uses passwordless email Magic Link.

Fenéla does not implement its own password-management system.

The persistent domain is relational.

The main user-owned concepts are:

```text
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
```

This domain model is represented through version-controlled PostgreSQL migrations rather than through a separate ORM layer.

PostgreSQL Row Level Security provides an additional ownership boundary.

Application code still derives identity from the authenticated server session and applies ownership rules explicitly. RLS is a second boundary, not a replacement for application-level authorization.

Supabase-generated TypeScript database types and explicit server-side data-access modules are used instead of introducing an ORM without a demonstrated need.

Existing MVP1 browser data was not migrated into authenticated persistence because there were no external production users whose local state needed to be preserved.

Limited browser storage remains for local UI, compatibility and device-specific state where appropriate.

It is not the ownership source for authenticated account data.

## Reason

Authentication supports a coherent set of product requirements:

- durable ownership;
- persistent preferences;
- goal continuity;
- factual action history;
- factual friction history;
- deterministic reflection;
- recovery after a new session;
- account deletion;
- inactivity retention;
- authenticated device ownership.

Using Supabase for both authentication and PostgreSQL persistence keeps identity and account-owned data within one coherent boundary.

PostgreSQL also matches Fenéla's domain well because the product depends on:

- explicit user ownership;
- Goal and Anchor relationships;
- immutable historical event records;
- time-based reflection queries;
- deterministic lifecycle behavior.

The architecture deliberately avoids treating a device identifier as user identity.

## Trade-off

Authenticated persistence adds responsibilities that MVP1 intentionally avoided:

- authentication;
- authorization;
- relational persistence;
- database migrations;
- Row Level Security;
- account lifecycle;
- data retention;
- account deletion;
- stronger ownership testing.

The application is therefore more complex than the original browser-local product.

That complexity is accepted because it supports current product behavior rather than speculative infrastructure.

The decision also creates a dependency on Supabase.

Fenéla's product and deterministic domain logic are therefore kept separate from provider-specific implementation details where that separation has a concrete maintenance benefit.

## Impact

Fenéla now has a server-derived authenticated identity for persistent user-owned state.

The implementation:

- establishes identity through Supabase Auth;
- uses passwordless email Magic Link for sign-in;
- scopes account-owned records to the authenticated user;
- protects account-owned tables with Row Level Security;
- keeps service credentials out of client code;
- uses version-controlled database migrations;
- persists preferences, Goals, Anchors, factual events and Reflections;
- associates Devices and PushSubscriptions with authenticated ownership;
- supports user-initiated account deletion;
- supports deterministic inactivity retention;
- preserves only limited local browser state where it still serves UI or device behavior.

Authentication remains infrastructure for continuity and ownership.

It does not turn account management into a separate product area.

```

```
