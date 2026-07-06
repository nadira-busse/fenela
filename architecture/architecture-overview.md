# Architecture Overview

Fenéla is a small Next.js application built around one product loop:

```text
overwhelm -> one small action -> gentle accountability -> daily return
```

The architecture is intentionally simple. Fenéla does not need a complex platform structure for the current MVP. Every component serves one of three areas: the core anchor flow, optional AI support, or optional reminders.

## Architecture goals

Fenéla should be:

- easy to run locally;
- easy to understand from the repository;
- small enough to maintain;
- clear in its separation of responsibilities;
- safe to publish as a public MIT-licensed project;
- flexible enough to support optional AI and reminders without making them mandatory.

## High-level flow

```mermaid
flowchart LR
    subgraph core[Core flow]
        Screening --> Intake
        Intake --> Coaching
        Coaching --> Return[Daily return]
    end

    subgraph ai[Optional AI]
        Intake -. request .-> API_AI[/api/ai/anchors]
        API_AI -. suggestions .-> Intake
    end

    subgraph reminders[Optional reminders]
        Coaching -. enable .-> Push[/api/push/subscribe]
        Coaching -. schedule .-> Jobs[/api/jobs/*]
        Jobs --> KV[(KV storage)]
        Cron[/api/cron/push] --> KV
        Cron -. notification .-> Device([Device])
        Device -. returns user .-> Coaching
    end
```

The core loop is the product. AI and reminders are optional supporting layers.

## Main responsibilities

| Area               | Responsibility                                                             |
| ------------------ | -------------------------------------------------------------------------- |
| UI flow            | Guides the user through screening, anchor creation and reminder choices    |
| Anchor logic       | Keeps the product focused on one small action                              |
| AI route           | Provides optional bounded anchor suggestions                               |
| Job routes         | Schedule and cancel reminder jobs                                          |
| Cron route         | Processes due reminder jobs and sends push notifications                   |
| Push routes        | Manage browser push subscriptions                                          |
| Storage            | Stores reminder and job data outside the UI layer                          |
| Environment config | Keeps secrets and deployment-specific values outside the public repository |

## Route groups

### UI

The main application route is:

```text
/
```

This is where the user moves through the Fenéla flow.

### AI route

```text
/api/ai/anchors
```

This route supports optional AI-assisted anchor generation.

AI is not required for the product concept. Fenéla should still make sense as a simple accountability app without AI.

### Reminder and job routes

```text
/api/jobs/schedule-daily-start
/api/jobs/schedule-reminder
/api/jobs/cancel
/api/jobs/cancel-daily-start
/api/cron/push
```

These routes support reminder scheduling, reminder cancellation and push execution.

The reminder system is optional. The user must be able to continue without enabling reminders.

### Push routes

```text
/api/push/public-key
/api/push/subscribe
```

These routes support browser push notification setup.

Push notifications are infrastructure, not the core user experience.

## Reminder architecture

Fenéla uses device-based reminder setup in MVP1.

The reminder flow is:

```mermaid
flowchart TD
    Browser([Browser / device])
    Browser --> Permission[Notification permission]
    Permission --> SW[Service worker registration]
    SW --> PushSub[Push subscription]
    PushSub --> Subscribe[/api/push/subscribe]
    Subscribe --> KV[(KV storage)]
    Browser --> Schedule[/api/jobs/schedule-daily-start]
    Schedule --> KV
    Cron[/api/cron/push] -->|reads due jobs| KV
    Cron -->|web push| Browser
```

Reminder settings are intentionally separated from screening. Screening captures the first-run preference. Reminder settings let the user later enable, disable or adjust reminders on the current device.

Turning reminders off cancels the daily-start job for that device, but does not need to delete the push subscription. A subscription is device infrastructure. Enabled or disabled reminder state is product behavior.

## Data and configuration

Fenéla uses environment variables for deployment-specific configuration.

```env
OPENAI_API_KEY=
OPENAI_MODEL=
WEB_PUSH_PUBLIC_KEY=
WEB_PUSH_PRIVATE_KEY=
WEB_PUSH_SUBJECT=
STORAGE_KV_REST_API_URL=
STORAGE_KV_REST_API_TOKEN=
CRON_SECRET=
```

Real secrets must stay in `.env.local` or deployment configuration. They must not be committed to the public repository.

## Design decisions

### AI is optional

Decision:
AI assistance remains optional.

Reason:
The core loop should work without requiring the user to rely on AI.

Trade-off:
The AI experience stays smaller than a full planning assistant.

Impact:
The app remains easier to explain, test and maintain.

### Reminders are optional

Decision:
Reminder setup must not block the flow.

Reason:
A user who declines reminders should still be able to use Fenéla.

Trade-off:
Some users may never enable reminders.

Impact:
The app stays calmer and keeps reminder control with the user.

### No user accounts in the MVP

Decision:
The MVP does not include user accounts.

Reason:
Accounts are not required for the core loop.

Trade-off:
There is no full profile system or cross-device account sync.

Impact:
The MVP remains lighter and safer to publish.

## Storage boundary

Fenéla stores reminder and job data in KV-compatible storage.

The repository does not contain real user data, credentials or deployment secrets.

Public repository rule:

```text
No secrets. No private user data. No local deployment files.
```

## Service worker and push notifications

The service worker lives in:

```text
public/sw.js
```

It supports browser push notification handling.

Push reliability depends on the browser, device, service worker registration, notification permission and deployment configuration. This is a known limitation of the MVP.

## What is intentionally not included

Fenéla leaves out user accounts, dashboards, analytics, streaks, journaling and advanced AI planning. The full list of excluded features and the reasoning behind each exclusion is in [MVP scope](../docs/product/mvp-scope.md).

Leaving these out keeps the core loop light.

## Architecture risk

The main architecture risk is unnecessary expansion.

Features such as dashboards, journals, profiles, analytics and advanced AI planning would require more storage, more state, more privacy decisions and more UX complexity.

For the MVP, that added complexity is not justified.

## Summary

Fenéla's architecture is small on purpose.

It separates the core user flow from optional AI, optional reminders, push infrastructure and storage. That keeps the product understandable as a public MIT-licensed project and maintainable as a portfolio-grade app.
