# Privacy and Data Lifecycle

This document describes the technical data model and lifecycle implemented by Fenéla. The deployment-facing legal explanation is in the [Privacy Notice](privacy-notice.md).

## Stored data

Canonical account-owned data is stored in Supabase PostgreSQL behind authenticated server boundaries and Row Level Security.

| Data                   | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `user_preferences`     | Product, AI-assistance and timezone preferences |
| `reminder_preferences` | Reminder intent and daily start time            |
| `goals` / `anchors`    | Current accountability structure                |
| `action_events`        | Immutable factual action history                |
| `friction_events`      | Immutable factual friction history              |
| `reflections`          | Immutable deterministic reflection snapshots    |
| `devices`              | Authenticated device ownership                  |
| `push_subscriptions`   | Device-specific Web Push capability             |
| `user_activity`        | Server-observed activity used for retention     |

Browser storage is limited to local UI/device state and is not the source of truth for account-owned records.

KV-compatible storage holds derived operational state for reminders and rate limiting, including device-indexed jobs, daily-start pointers, cached push-subscription payloads and rate-limit counters.

## AI data flow

OpenAI is used only for optional anchor suggestions.

Before a provider call is allowed, the server verifies the authenticated user's canonical AI-assistance preference. When AI assistance is disabled, Fenéla does not send intake data to OpenAI.

When enabled, the provider receives only:

- goal;
- why the goal matters;
- current struggle entered during intake;
- guidance-preference categories used to shape suggestions.

It does not receive account identity/email, display name, event history, reflection facts, timezone, retention state or deletion state.

AI output is untrusted derived data. It is parsed, validated and safety-checked before display, and nothing becomes canonical Goal/Anchor state until the user confirms it and the persistence boundary validates it again.

Weekly reflection is deterministic and does not call an AI provider.

## Free text

The user can enter free text for goal/context, anchor wording and friction reasons. Fenéla's own labels do not request special-category information, but a user can choose to type sensitive information into any open text field.

Friction reason text is stored as factual history but is not copied into reflection snapshots or sent to OpenAI.

## Reminders and operational state

Reminder intent is canonical PostgreSQL state. Push subscriptions are device-specific delivery capability. KV jobs and pointers are derived operational state.

A one-shot `TASK_REMINDER` is claimed before Fenéla makes one application-level send attempt. It is not automatically resent after an ambiguous provider failure. `DAILY_START` uses a separate pointer/rescheduling model.

Push delivery is best effort and depends on browser, operating-system and provider infrastructure.

## Account deletion

Users can request permanent account deletion from `/auth`.

The deletion path:

1. derives the authenticated user server-side;
2. enumerates owned devices;
3. cleans required operational push state;
4. performs any final retention eligibility guard when deletion was initiated by retention;
5. deletes the Supabase Auth identity;
6. relies on database cascades to remove account-owned PostgreSQL rows.

Deletion fails closed before the irreversible Auth step. If required operational cleanup fails, the Auth identity and canonical PostgreSQL data remain. Cleanup for some devices may already have succeeded; that work is not rolled back, and a later deletion attempt runs the same cleanup path again.

There is no soft-delete recovery period after Auth deletion succeeds.

## Inactivity retention

Fenéla applies a 12-month inactivity policy using the most recent valid authenticated activity signal from:

- `auth.users.last_sign_in_at`;
- `user_activity.last_active_at`.

The activity timestamp is server-controlled because it contributes to a destructive retention decision.

The hosted deployment runs retention processing on a schedule. The scan is bounded; if the configured page limit is reached, the result reports that the scan was truncated rather than presenting a partial scan as complete.

User-initiated deletion and inactivity deletion use the same deletion core.

## External services

| Service                        | Purpose                                  | Data that may reach it                                              |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------- |
| Supabase                       | Authentication and canonical persistence | Account-owned application data                                      |
| Vercel                         | Application hosting                      | Standard request/deployment traffic                                 |
| KV-compatible storage          | Reminder/rate-limit operational state    | Device IDs, push subscription data, reminder jobs, rate-limit state |
| OpenAI                         | Optional anchor suggestions              | Bounded intake/context fields when AI is enabled                    |
| Browser/OS push infrastructure | Push delivery                            | Push endpoint and notification payload                              |

Source code cannot establish provider-contract details such as DPAs, production data-region settings, provider-side log retention or backup deletion. Those remain deployment/operator responsibilities.

## Related documents

- [Privacy Notice](privacy-notice.md)
- [AI and ethical-use guardrails](ai-guardrails.md)
- [Known limitations](known-limitations.md)
- [Architecture overview](../../architecture/architecture-overview.md)
