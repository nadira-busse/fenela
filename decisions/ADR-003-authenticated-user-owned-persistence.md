# ADR-003: Authenticated User-Owned Persistence

## Status

Accepted and implemented.

## Context

Fenéla MVP1 kept most personal state in the current browser or installed PWA.

That was a deliberate product and engineering choice.

At that stage, the main question was whether the core Fenéla loop worked:

```text
overwhelm
→ one small action
→ gentle accountability
→ daily return
```

Adding accounts, database ownership and cross-session persistence before that loop had been proven would have increased the implementation scope without solving an immediate product problem.

Browser-local state was therefore sufficient for MVP1.

That changed during MVP2.

As Fenéla began preserving more of what the user deliberately enters and does over time, browser-local storage stopped being only an implementation detail. It became the boundary that determined whether the user's history could be trusted, recovered and kept separate from someone else's.

The product now needed to preserve information across sessions, including:

- preferences;
- goals;
- anchors;
- completed, postponed and parked actions;
- user-entered friction;
- reflection history;
- reminder preferences.

This created a concrete ownership problem.

A browser-generated device ID can identify one browser installation well enough for device-specific behavior, but it cannot prove who the user is. It is therefore not a trustworthy identity or authorization boundary for persistent personal data.

At that point, authentication was no longer speculative infrastructure. It had become necessary to support product behavior that already existed.

Persistent personal history therefore needed a stable authenticated identity.

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
│   ├── Anchor
│   ├── ActionEvent
│   └── FrictionEvent
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

The important shift was not simply that Fenéla "needed a login".

The product had reached a point where several existing behaviors depended on the same underlying requirement: a reliable answer to the question **which user owns this data?**

That requirement appeared in multiple places:

- preferences needed to survive a new session;
- goals and anchors needed continuity;
- factual action and friction history needed a durable owner;
- weekly reflections needed trustworthy historical input;
- reminder preferences needed to belong to the account rather than only to one browser;
- device-specific push state needed to be connected to an authenticated user;
- account deletion needed to remove the correct user's data;
- inactivity retention needed a server-trusted account boundary.

Authentication therefore solved one shared product problem rather than introducing a separate account-management feature.

Using Supabase for both authentication and PostgreSQL persistence keeps identity and account-owned data within one coherent backend boundary.

PostgreSQL also matches Fenéla's domain because the product depends on:

- explicit user ownership;
- Goal and Anchor relationships;
- immutable historical event records;
- time-based reflection queries;
- deterministic lifecycle behavior.

The architecture deliberately keeps device identity separate from user identity.

A device can belong to a user and carry device-specific push state, but possession of a device ID never proves account ownership.

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

The extra complexity is justified by features Fenéla uses today. I did not add infrastructure for requirements the app does not have.

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
