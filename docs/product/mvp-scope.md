# MVP Scope

This document defines the MVP boundary for Fenéla.

Fenéla is a small accountability app for moments when everything feels too much. The MVP exists to support one loop:

```text
overwhelm -> one small action -> gentle accountability -> daily return
```

Anything that does not directly support this loop should be postponed or rejected.

## MVP goal

The MVP should help a user:

1. arrive with overwhelm;
2. choose one small action;
3. receive gentle accountability;
4. return to that action later.

The MVP is not meant to become a full productivity system.

## In scope

### 1. Onboarding and screening

Fenéla may ask a small number of practical questions to understand the user's situation.

The screening should support anchor creation. It should not become a diagnosis flow, intake form or coaching questionnaire.

### 2. Anchor creation

The user should be able to create one small anchor for the day.

A good anchor is:

- concrete;
- small;
- realistic;
- understandable later;
- not a full plan.

### 3. Optional AI assistance

AI may help the user create or refine an anchor.

AI is allowed to:

- suggest smaller actions;
- rephrase unclear input;
- reduce a large intention into one next step;
- use calm and practical language.

AI is not allowed to become the product itself.

### 4. Optional reminders

The user may enable reminders to support daily return.

Reminders must stay optional. Declining notification permission should not block the app.

The MVP includes a small reminder settings screen so the user can later:

- turn reminders on;
- turn reminders off;
- change the daily reminder time;
- recover reminder setup on a new or existing device outside the screening flow.

### 5. Push notification infrastructure

The MVP includes the technical infrastructure needed for browser push notifications:

- service worker;
- VAPID configuration;
- push public-key route;
- push subscription route;
- daily-start scheduling route;
- task-reminder scheduling route;
- job cancellation routes;
- cron-triggered push delivery route.

This is infrastructure. It should not dominate the user experience.

### 6. KV-compatible storage

The MVP stores reminder and job data outside the UI layer through KV-compatible storage.

The repository must only contain placeholders and setup instructions, not real secrets.

### 7. Public documentation

The public repository should explain:

- what Fenéla is;
- who it is for;
- what it does;
- what it intentionally does not do;
- how to run it locally;
- what decisions shaped the MVP;
- what the current limitations are.

## Out of scope

The following items are not part of the MVP:

- user accounts;
- persistent user profiles;
- multi-device account sync;
- full dashboard;
- journaling;
- analytics;
- streaks;
- heavy gamification;
- paid features;
- community features;
- multi-language support;
- advanced AI planning;
- therapy or medical workflows;
- admin tooling.

These exclusions keep the product boundary clear.

## Possible extensions

Possible extensions:

- better accessibility review;
- clearer error states;
- improved reminder management;
- optional language support;
- privacy-focused account model;
- simple usage insights;
- separate paid version with journaling and reflection.

These are not commitments. They are examples of directions that could be explored later without changing the MVP boundary.

## Manual anchor reordering

Status: Future / nice-to-have

Users may eventually benefit from manually reordering generated care anchors when the AI suggests useful actions in an imperfect order.

This is intentionally not part of the MVP because drag-and-drop on mobile introduces extra interaction complexity, accessibility considerations, state-management, visual feedback and additional testing. For the current public release, users can edit the anchor list by removing anchors and adding their own.

Decision:
Do not build before public-readiness.

Reason:
The current issue is primarily AI-output quality, not a core product-flow failure.

Trade-off:
Users cannot reorder anchors directly yet, but the app remains simpler and more stable.

Impact:
Keep MVP focused on one small action, editable anchors and calm accountability.

## Do not build

Do not build these into the MVP:

- a complete productivity suite;
- a therapy app;
- crisis support;
- mental health diagnosis;
- complex habit tracking;
- social accountability;
- public user profiles;
- AI-generated life plans;
- large coaching questionnaires.

These would change the nature of Fenéla.

## Product discipline

Each new feature should pass this check:

```text
Does this help the user move from overwhelm to one small action and return to it later?
```

If the answer is no, the feature does not belong in the MVP.

## Current MVP verdict

The current MVP scope is appropriate if it stays focused on:

- one daily anchor;
- optional AI support;
- optional reminders;
- calm copy;
- simple local setup;
- clear public documentation.

The main risk is adding useful-looking features that make the product harder to understand.

## Summary

Fenéla should stay small.

The MVP is done when the loop works clearly: overwhelm to one small action, and back again the next day.
