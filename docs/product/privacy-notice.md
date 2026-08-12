# Privacy Notice

Last updated: 12 August 2026

Fenéla is an accountability application that helps users move from overwhelm to one small action.

This privacy notice explains what personal data Fenéla processes, why it is processed, how long it is kept and what rights users have.

## Who is responsible

The person or organization operating a public Fenéla deployment is responsible for completing this section with their own controller and privacy contact details.

Data controller:

**[CONTROLLER NAME]**

Contact:

**[PRIVACY CONTACT EMAIL]**

These placeholders are intentionally left unset in the repository. They must be replaced before a deployment is offered to external users and processes their personal data.

## Personal data Fenéla processes

Fenéla may process the following information when you use the application:

- your email address and authentication session;
- your display name;
- guidance preferences you choose during setup;
- your goal and related anchor actions;
- action history, such as starting, completing, postponing or parking an anchor;
- friction text you deliberately enter when describing what makes a step difficult;
- reminder preferences;
- device and Web Push subscription information when reminders are enabled;
- account activity timestamps used for the inactivity-retention policy;
- deterministic weekly reflection records.

Fenéla does not require health, medical, diagnostic or other special-category information to work.

Free-text fields are open input fields. You should not provide sensitive personal information unless it is necessary for what you want to write.

## Why Fenéla processes this data

Personal data is used only to operate Fenéla, including:

- authenticating your account;
- keeping your data associated with your account;
- preserving your goal and accountability history between sessions;
- generating or selecting small anchor suggestions;
- providing reminders when you enable them;
- producing deterministic weekly reflections from your recorded activity;
- allowing account deletion;
- applying the inactivity-retention policy;
- protecting the service against abuse.

Fenéla does not use your account data for advertising or general behavioral profiling.

## Legal basis

The operator of a public Fenéla deployment must determine and document the applicable lawful basis for each processing purpose before offering the application to external users.

This section must therefore be completed before a deployment is offered to external users.

At minimum, the final version must state the lawful basis for:

- account creation and operation of the core application;
- storage of goals, preferences and activity history;
- optional AI-assisted anchor generation;
- optional reminder and push-notification processing;
- security and abuse prevention;
- inactivity retention and account deletion.

Browser notification permission is a technical permission and should not automatically be described as the GDPR lawful basis for all reminder-related processing.

## AI-assisted anchor suggestions

OpenAI-assisted anchor generation is optional.

When enabled, Fenéla may send the following information to OpenAI:

- your goal;
- why that goal matters to you;
- the current struggle you entered during intake;
- selected guidance-preference categories.

Fenéla does not send OpenAI:

- your email address;
- your display name;
- raw friction-event history;
- action-event history;
- reflection facts;
- account activity timestamps;
- account-deletion or retention information.

If AI assistance is unavailable or not configured, Fenéla can use deterministic fallback anchor suggestions.

AI is not used to determine account ownership, factual activity history, retention eligibility or account deletion.

## Weekly reflections

Weekly reflections are generated deterministically from stored Fenéla activity.

The current reflection flow does not use an AI model to infer what happened or to generate the reflection wording.

## Reminders and Web Push

If you enable reminders, Fenéla stores the reminder preference associated with your account.

A browser or device may also have a PushSubscription used to deliver notifications.

Push delivery depends on external browser or operating-system push infrastructure.

Reminder preferences and push-subscription delivery state are separate concepts: disabling or changing a reminder does not make the push endpoint your identity.

## Service providers

Fenéla uses external services to operate the application.

These may include:

| Service                          | Purpose                                                 |
| -------------------------------- | ------------------------------------------------------- |
| Supabase                         | Authentication and PostgreSQL account-owned persistence |
| Vercel                           | Application hosting                                     |
| KV-compatible storage            | Operational reminder, delivery and rate-limit state     |
| OpenAI                           | Optional AI-assisted anchor generation                  |
| Browser / OS push infrastructure | Delivery of enabled Web Push notifications              |

The operator must verify the actual production providers, processing regions, contractual arrangements and international-transfer safeguards for their own deployment.

## International transfers

Some service providers may process personal data outside the Netherlands or European Economic Area depending on the production account and provider configuration.

The production operator must verify and document the actual transfer locations and applicable safeguards before a deployment is offered to external users.

## How long data is kept

Fenéla applies a 12-month inactivity-retention policy.

An account and its account-owned Fenéla data are deleted after 12 months without authenticated Fenéla product activity.

This is a Fenéla product-retention policy. It is not a retention period prescribed by the GDPR.

You may delete your account earlier from within Fenéla.

## Account deletion

User-initiated account deletion permanently removes the Fenéla account and canonical account-owned data.

Deletion includes the Supabase Auth identity and account-owned PostgreSQL data through the application's deletion lifecycle.

Operational reminder state associated with owned devices is cleaned up before the irreversible account deletion step.

There is no soft-delete recovery period.

## Your rights

Depending on the circumstances and the applicable lawful basis, you may have rights under the GDPR including:

- access to your personal data;
- correction of inaccurate personal data;
- deletion of personal data;
- restriction of processing;
- objection to certain processing;
- data portability where applicable;
- withdrawal of consent where processing is based on consent.

Requests can be sent to:

**[PRIVACY CONTACT EMAIL]**

You also have the right to lodge a complaint with the competent data-protection authority.

For users in the Netherlands, this is the Autoriteit Persoonsgegevens.

## Whether providing data is required

An email address is required to create and authenticate a Fenéla account.

Data needed for the core accountability flow is required only when the relevant product feature cannot function without it.

AI assistance and reminders are optional.

## Automated decision-making

Fenéla does not make legal or similarly significant decisions about users through automated decision-making.

AI-assisted anchors are suggestions that the user can keep, edit, regenerate or discard.

## Changes to this notice

This notice should be updated when Fenéla materially changes what personal data it processes, why it processes it, which service providers are involved or how long data is retained.
