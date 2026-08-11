# Privacy and Data Lifecycle

This document explains, factually and at a product level, what Fenéla stores, why it stores it, how long it keeps it and how it is deleted.

It is not a lawyer-drafted privacy policy and is not intended to substitute for one before a public production launch. It describes the product's actual current data behavior in the repository, so contributors, reviewers and (eventually) users have one canonical place to read it. Contractual/legal items that the codebase itself cannot prove (data-processing agreements, hosting region, provider retention settings) are called out explicitly as release-checklist items rather than asserted here.

Fenéla is an accountability app, not a therapy, medical or diagnostic product. It does not ask for and does not need health, mental-health or other special-category information to work.

## What Fenéla stores

| Data                                                                                                                    | Purpose                                                                                                            | Retention while active             | AI exposure                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------- |
| Auth identity (email or Google account, session state)                                                                  | Sign-in and identifying which account owns everything below                                                        | Until deletion                     | No                                                            |
| Account activity signal                                                                                                 | Recognizes an account as actively used, so the 12-month retention policy never mistakes ongoing use for inactivity | Until deletion                     | No                                                            |
| Display name                                                                                                            | Personalizes on-screen copy                                                                                        | Until deletion                     | No                                                            |
| Guidance preferences (anchor-choice mode, resistance pattern, main challenge, action trigger, anti-help list, timezone) | Shapes deterministic copy and AI prompt context                                                                    | Until deletion                     | Yes (the preference categories, not the timezone)             |
| Reminder preference (enabled, daily start time)                                                                         | Controls optional daily reminder scheduling                                                                        | Until deletion                     | No                                                            |
| Goal (title, why, initial struggle, status)                                                                             | The one active goal the anchors are built around                                                                   | Until deletion                     | Yes (title, why, initial struggle)                            |
| Anchors (text, source, position, status)                                                                                | The small actions the user works through                                                                           | Until deletion                     | No (anchors are usually AI's _output_, not re-sent as input)  |
| Action events (started/completed/postponed/parked, timestamps)                                                          | Factual history behind deterministic reflections                                                                   | Until deletion                     | No                                                            |
| Friction events (user-entered reason text, timestamps)                                                                  | The user's own explanation of a specific difficulty; factual history                                               | Until deletion                     | No                                                            |
| Reflections (period, deterministic facts snapshot, generated text)                                                      | Short weekly/monthly summary of the above history                                                                  | Until deletion                     | No (MVP2 reflections are 100% deterministic — see "AI" below) |
| Devices                                                                                                                 | Which browser/installation belongs to the account, for reminder delivery                                           | Until deletion                     | No                                                            |
| Push subscriptions                                                                                                      | The technical endpoint needed to deliver a Web Push notification                                                   | Until deletion                     | No                                                            |
| Operational push-delivery state (KV)                                                                                    | Scheduling/delivery bookkeeping mirroring the above                                                                | Until deletion or reminder disable | No                                                            |
| Browser-local compatibility state                                                                                       | Lets the current UI read screening/anchor/day state without a network round trip                                   | Until sign-out or account deletion | No                                                            |

Every row above is scoped to one authenticated account (PostgreSQL Row Level Security) or one device (KV, browser storage) and is never shared between accounts.

## Why Fenéla stores it

Each category above exists to support one part of the core loop: turning a stated goal into small anchors, tracking whether the user returns to them, and being able to say something true and specific in a weekly or monthly reflection. Fenéla does not collect data for analytics, profiling, or any purpose beyond running the product for the account that owns it.

## Retention

Fenéla deletes accounts and their account-owned data after 12 months without authenticated Fenéla product activity.

Users may permanently delete their account earlier from within Fenéla, at any time, from `/auth`.

The 12-month period is Fenéla's own chosen data-retention policy — a concrete, explainable storage-limitation boundary — not a period the GDPR/AVG itself prescribes for this product. It exists so account-owned personal data does not accumulate indefinitely for accounts that have stopped being used.

"Activity" is derived from server-observed authenticated use of Fenéla, not from anything the browser alone reports. Signing in is always a safe baseline signal, but Fenéla also recognizes ongoing use of an already-signed-in session, so a genuinely active account is never mistaken for inactive just because it hasn't needed a fresh sign-in recently.

No advance warning email is sent before this deletion. Fenéla does not currently have any email-sending infrastructure, and building one solely for a retention warning would be disproportionate to what this feature needs. This is a current product behavior, not a claimed legal requirement or limitation.

## Account deletion

Both user-initiated deletion and 12-month inactivity retention delete an account through the exact same mechanism:

```text
resolve the account's owned Devices
→ clean up their operational push-delivery state
→ delete the Supabase Auth identity
→ PostgreSQL foreign-key cascades remove every account-owned row
  (preferences, the account activity signal, goals, anchors,
  action/friction history, reflections, devices, push subscriptions)
→ (user-initiated only) the browser clears its own local Fenéla-owned
  state and the current session
```

This is a permanent, hard deletion. There is no soft delete, no recovery window and no export step — once it runs, the data is gone.

Deletion is fail-closed before the irreversible step: if cleaning up a Device's operational state fails, the Auth identity is not deleted. The account's canonical Auth and PostgreSQL data always remains intact in that case — but operational push-delivery cleanup may already have partially succeeded for some of the account's devices before the failure. That partial cleanup is never undone; it is simply safe to leave as-is, because retrying deletion cleans up every device again regardless of what a previous attempt already finished. Only once that cleanup succeeds in full does the Auth identity get deleted, which is what triggers the PostgreSQL cascade.

## AI

When AI-assisted anchor generation is enabled and configured, the model receives: the user's goal, "why," and stated current struggle (as entered at intake), plus the guidance-preference categories (resistance pattern, main challenge, action trigger, anti-help list). The user's display name is not included.

The model does not receive: friction-event reason text, action/friction event history, reflection facts, account identity/email, or timezone.

AI is never the source of truth for event history, friction counts, reflection facts, account ownership, retention eligibility, or any deletion decision — all of those are deterministic application logic. AI only ever produces anchor _suggestions_, which the user can keep, edit, regenerate or discard.

Weekly and monthly reflections in the current product are entirely deterministic — a fixed template filled in from stored counts, with no model call anywhere in that path. Optional AI-assisted reflection wording is a possible future (MVP3) direction and is explicitly not implemented today.

## Free text

A few fields in Fenéla are free text the user types themselves: the goal, why, and struggle at intake; anchor wording; and the friction-moment reason. None of Fenéla's own prompts or labels ask for health, mental-health, religious, ethnic, sexual-orientation, political or other special-category information — they ask practical questions like "what usually gets in the way?" and "why does this matter to you?"

A user could still choose to type something sensitive into any of these fields; that is a normal property of any open text field and does not, by itself, make Fenéla a health or therapy product. If you'd rather not, there's no need to include more personal detail than the practical question calls for.

## External services

Fenéla currently relies on the following external infrastructure. These are technical data recipients / service providers for the stated purpose — this document does not make a legal determination of each provider's processor status; that is a contractual matter, see "Limitations" below.

| Service                                                                                                  | Used for                                               | Data that may reach it                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase (Auth + PostgreSQL)                                                                             | Authentication and canonical account-owned persistence | Everything in the "What Fenéla stores" table above                                                                                    |
| Vercel                                                                                                   | Application hosting/deployment                         | Standard request traffic; may also host the KV integration below                                                                      |
| KV-compatible storage (accessed via the `@vercel/kv` client against an Upstash-compatible REST endpoint) | Operational push-delivery scheduling state             | Device IDs, push subscription endpoints/keys, scheduled reminder job payloads (Fenéla-authored notification text, not user free text) |
| OpenAI                                                                                                   | Optional AI-assisted anchor generation                 | Goal, why, struggle, guidance-preference categories (see "AI" above) — only while AI assistance is enabled and configured             |
| Browser/OS push services (e.g. the browser vendor's Web Push infrastructure)                             | Delivering reminder notifications                      | The push subscription endpoint and the notification payload, when reminders are enabled                                               |

## Limitations

This document describes what the codebase actually does. It does not, and cannot, confirm from source code alone:

- whether a signed data-processing agreement (DPA) exists with each provider above;
- each provider's own data-region/residency configuration for the production account;
- each provider's own internal retention of logs or backups (Fenéla deleting its own copy of a user's data does not delete that provider's independent operational logs, if any);
- production-account-level settings (e.g. OpenAI request retention/training settings) beyond what this repository configures.

Those are release-checklist items for whoever operates the production deployment, not facts this document asserts.

The 12-month retention job is a bounded, sequential batch (see [architecture overview](../../architecture/architecture-overview.md)) rather than a queueing platform designed for unlimited scale; this is an accepted MVP2 engineering trade-off; there is no known real-world usage level where this would be a practical constraint at the time of writing.
