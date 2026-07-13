# MVP Scope

This document defines the boundary of Fenéla MVP 1.

The current version supports a focused path from one stated goal to a small set of anchors, one action at a time and daily return.

Features outside that path are not part of the current scope.

## MVP goal

Fenéla helps a user who has a goal but does not know how to begin or feels mentally blocked by it.

The app supports the user to:

1. describe one goal, the current friction and why the goal matters;
2. turn that goal into a small set of realistic anchors;
3. review and adjust the anchors before saving them;
4. focus on one anchor at a time;
5. receive gentle accountability;
6. return to the same anchor set over time.

Fenéla remains an accountability app rather than a full productivity system.

## In scope

### 1. Onboarding and screening

Fenéla asks a small number of practical questions about the user's preferences and current situation.

The screening records:

- whether the user wants AI-generated anchor suggestions;
- whether the user wants reminders;
- the tone and interaction preferences used in the app.

These questions support the product flow without becoming a diagnostic intake or extensive questionnaire.

### 2. Goal intake

The user describes:

- one goal;
- what currently makes it difficult;
- why the goal matters.

The goal provides direction. The stated friction helps Fenéla find a realistic starting point, while the motivation keeps the suggestions connected to what matters to the user.

### 3. Anchor creation

The user can save up to five anchors for one goal.

During setup, the user can:

- use AI-generated suggestions or create anchors manually;
- regenerate AI suggestions;
- edit or remove suggestions;
- add manual anchors;
- review the complete set before saving it.

A suitable anchor is:

- concrete;
- realistic;
- relevant to the stated goal;
- understandable when shown again later;
- limited to one practical action.

After setup, Fenéla presents one saved anchor at a time.

### 4. Optional AI assistance

When AI assistance is enabled, Fenéla:

- suggests three realistic actions based on the goal, friction and motivation;
- turns broad or unclear intentions into concrete starting points;
- keeps suggestions short, calm and practical;
- reduces the effort required to decide where to begin.

The user reviews the suggestions before saving the anchor set. The manual route remains available without an AI model call.

### 5. Gentle accountability

For the active anchor, the user can:

- start the action;
- mark it as completed;
- postpone it;
- return to it later.

After the second postponement, Fenéla asks what could make the anchor easier to finish. The reflection step is present in the interface, but the response is not yet persisted — doing so would require a separate product, privacy and data-model decision.

After the third postponement, Fenéla parks the anchor for the current day rather than continuing to apply pressure.

The current accountability flow does not use scores, streaks or competitive elements.

### 6. Reusing saved anchors

Saved anchors remain available across daily sessions in the same browser or installed PWA.

The user can:

- reset the current day while keeping the existing anchors;
- start again with a different goal.

Direct editing of an already saved anchor set is not included in the current release.

### 7. Optional reminders

The user can enable browser notifications to support daily return.

Reminder settings remain accessible after onboarding. The user can:

- enable reminders;
- disable reminders;
- change the daily reminder time.

Declining notification permission does not block the core application flow.

Reminder delivery is best effort and depends on browser, device and deployment support.

### 8. Push notification infrastructure

The app includes the infrastructure required for browser push notifications:

- service worker registration;
- VAPID configuration;
- push public-key and subscription routes;
- daily-start and task-reminder scheduling;
- job cancellation;
- cron-triggered delivery;
- KV-compatible storage for subscriptions and scheduled jobs.

This infrastructure supports reminders but remains separate from the main user flow.

### 9. Local and device-based state

Screening answers, saved anchors, day state and reminder preferences are stored for the current browser or installed PWA.

The current version does not include:

- user accounts;
- persistent user profiles;
- account-based cross-device synchronization.

Adding these capabilities requires a separate product, privacy and architecture decision.

### 10. Public documentation

The public repository documents:

- what Fenéla is;
- who it is for;
- how the current product flow works;
- how to run the application locally;
- the main product and architecture decisions;
- AI and ethical-use guardrails;
- current technical limitations;
- the current scope boundary.

## Current exclusions

The current release does not include:

- direct editing of an already saved anchor set;
- manual anchor reordering;
- persisted responses to the postponement reflection question;
- user accounts or account-based synchronization;
- dashboards or extensive progress tracking;
- journaling;
- long-term trend analysis;
- analytics;
- streaks or heavy gamification;
- social or community features;
- multiple interface languages;
- advanced AI planning;
- admin tooling.

A later version may add selected capabilities when they support a clear user need and fit the product’s calm interaction model.
