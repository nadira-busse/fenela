# Privacy Notice

Last updated: 14 August 2026

Fenéla is an accountability application that helps users move from
overwhelm to one small action.

This privacy notice applies to the hosted Fenéla deployment operated by
Nadira Büsse. It explains what personal data this deployment processes,
why it is processed, how long it is kept and what rights users have.

The Fenéla source code is also publicly available under the MIT License.
Anyone who deploys their own copy is responsible for the privacy and
data-protection obligations of that deployment and must provide their
own privacy information.

## Who is responsible

Data controller:

**Nadira Büsse**

Privacy contact:

**privacy@nadirabusse.com**

## Personal data Fenéla processes

Fenéla may process the following information when you use the
application:

- your email address and authentication session;
- your display name;
- guidance preferences you choose during setup;
- your goal and related anchor actions;
- action history, such as starting, completing, postponing or parking
  an anchor;
- friction text you deliberately enter when describing what makes a
  step difficult;
- reminder preferences;
- device and Web Push subscription information when reminders are
  enabled;
- account activity timestamps used for the inactivity-retention
  policy;
- deterministic weekly reflection records.

Fenéla does not require health, medical, diagnostic or other
special-category information to work.

Free-text fields are open input fields. Please do not provide sensitive
personal information unless it is necessary for what you want to write.

## Why Fenéla processes this data

Personal data is used only to operate Fenéla, including:

- authenticating your account;
- keeping your data associated with your account;
- preserving your goal and accountability history between sessions;
- generating or selecting small anchor suggestions;
- providing reminders when you enable them;
- producing deterministic weekly reflections from your recorded
  activity;
- allowing account deletion;
- applying the inactivity-retention policy;
- protecting the hosted deployment against abuse and maintaining its
  security and reliability.

Fenéla does not use your account data for advertising or general
behavioral profiling.

## Legal basis

The hosted Fenéla deployment uses different GDPR legal bases depending
on the processing purpose.

### Core account and accountability functionality

Fenéla relies on **legitimate interests** for processing that is
necessary to operate the hosted application you choose to use. This
includes authentication, associating data with your account, storing the
goals, preferences and activity records needed for the accountability
flow, generating deterministic reflections, maintaining account activity
timestamps, and supporting account deletion.

The legitimate interest is to provide and maintain the requested Fenéla
functionality while keeping processing limited to what the application
needs. Fenéla is designed around data minimisation, account ownership
and user-controlled deletion.

### Optional AI-assisted anchor suggestions

Fenéla relies on **consent** for sending the relevant input data to
OpenAI for optional AI-assisted anchor suggestions.

AI assistance can be turned off. When it is off, Fenéla does not use
OpenAI to generate anchor suggestions and can use deterministic fallback
suggestions instead.

You may withdraw this consent by turning AI assistance off in your
account settings. Turning it off does not prevent you from using the
core accountability flow.

### Optional reminders and Web Push

Fenéla relies on **consent** for optional reminder and Web Push
processing.

You choose whether to enable reminders. Browser or operating-system
notification permission is also required for push delivery, but that
technical permission is separate from the GDPR legal basis.

You may withdraw this consent by disabling reminders. You can also
revoke notification permission in your browser or operating-system
settings.

### Security and abuse prevention

Fenéla relies on **legitimate interests** where personal data must be
processed to protect the hosted deployment, enforce operational limits,
investigate failures and prevent abuse.

The legitimate interest is maintaining the security, availability and
reliable operation of the application.

### Inactivity retention and deletion

Fenéla relies on **legitimate interests** to apply its
inactivity-retention policy and remove accounts that have been inactive
for 12 months.

The purpose is to avoid keeping personal data indefinitely when an
account is no longer being used. You may delete your account earlier
from within Fenéla.

Where processing is based on legitimate interests, you may have the
right to object as described under **Your rights** below.

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

If AI assistance is unavailable, disabled or not configured, Fenéla can
use deterministic fallback anchor suggestions.

AI is not used to determine account ownership, factual activity history,
retention eligibility or account deletion.

## Weekly reflections

Weekly reflections are generated deterministically from stored Fenéla
activity.

The current reflection flow does not use an AI model to infer what
happened or to generate the reflection wording.

## Reminders and Web Push

If you enable reminders, Fenéla stores the reminder preference
associated with your account.

A browser or device may also have a PushSubscription used to deliver
notifications.

Push delivery depends on external browser or operating-system push
infrastructure.

Reminder preferences and push-subscription delivery state are separate
concepts: disabling or changing a reminder does not make the push
endpoint your identity.

## Service providers

Fenéla uses external services to operate the hosted deployment.

These include:

| Service                          | Purpose                                                 |
| -------------------------------- | ------------------------------------------------------- |
| Supabase                         | Authentication and PostgreSQL account-owned persistence |
| Vercel                           | Application hosting                                     |
| Upstash                          | Operational reminder, delivery and rate-limit state     |
| OpenAI                           | Optional AI-assisted anchor generation                  |
| Browser / OS push infrastructure | Delivery of enabled Web Push notifications              |

These providers process data only to the extent required for the
relevant Fenéla functionality and according to the configuration of the
hosted deployment.

## International transfers

Some service providers used by Fenéla may process personal data outside
the Netherlands or European Economic Area, depending on their
infrastructure and the applicable account configuration.

Where the GDPR requires safeguards for an international transfer, the
relevant provider arrangements and transfer mechanisms apply. Provider
infrastructure and contractual arrangements can change independently of
the Fenéla repository.

For questions about the current hosted deployment, contact
**privacy@nadirabusse.com**.

## How long data is kept

Fenéla applies a 12-month inactivity-retention policy.

An account and its account-owned Fenéla data are deleted after 12 months
without authenticated Fenéla product activity. The hosted deployment
runs scheduled retention processing daily, so deletion occurs through
that operational retention process after the account becomes eligible.

This is a Fenéla product-retention policy. It is not a retention period
prescribed by the GDPR.

You may delete your account earlier from within Fenéla.

Operational data may have shorter lifecycles where it is no longer
required for its purpose. External service providers may also maintain
limited technical records or backups according to their own applicable
retention and security processes.

## Account deletion

User-initiated account deletion permanently removes the Fenéla account
and canonical account-owned data.

Deletion includes the Supabase Auth identity and account-owned
PostgreSQL data through the application's deletion lifecycle.

Operational reminder state associated with owned devices is cleaned up
before the irreversible account deletion step.

There is no soft-delete recovery period.

Deletion from Fenéla does not necessarily mean that every infrastructure
provider instantly removes every technical backup or security record.
Those provider-level processes are governed by the relevant provider
configuration and terms.

## Your rights

Depending on the circumstances and the applicable legal basis, you may
have rights under the GDPR including:

- access to your personal data;
- correction of inaccurate personal data;
- deletion of personal data;
- restriction of processing;
- objection to processing based on legitimate interests;
- data portability where applicable;
- withdrawal of consent where processing is based on consent.

Withdrawing consent does not affect the lawfulness of processing that
took place before consent was withdrawn.

Requests can be sent to:

**privacy@nadirabusse.com**

You also have the right to lodge a complaint with a data-protection
authority.

For users in the Netherlands, the supervisory authority is the
Autoriteit Persoonsgegevens.

## Whether providing data is required

An email address is required to create and authenticate a Fenéla
account.

Data needed for the core accountability flow is required only when the
relevant product feature cannot function without it.

AI assistance and reminders are optional. You can use the core
accountability flow without enabling either feature.

## Automated decision-making

Fenéla does not make legal or similarly significant decisions about
users through automated decision-making.

AI-assisted anchors are suggestions. They do not determine account
access, retention, deletion or other legal or similarly significant
outcomes.

## Changes to this notice

This notice will be updated when the hosted Fenéla deployment materially
changes what personal data it processes, why it processes it, which
service providers are involved or how long data is retained.
