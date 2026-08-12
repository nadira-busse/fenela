// Public, unauthenticated privacy notice page.
//
// docs/product/privacy-notice.md is the canonical, repository-level privacy
// notice. This file is a hand-maintained React copy of that same content for
// in-app display, kept as plain server-rendered markup (no client JS
// required to read it, no Markdown-rendering dependency). Both must stay
// aligned whenever privacy content changes — update the Markdown file first,
// then mirror the change here.
//
// Controller/contact details are intentionally left as placeholders: the
// person or organization operating a public Fenéla deployment must fill
// these in with their own details before offering that deployment to
// external users. Do not replace them with personal contact information.

import Link from "next/link";

function Placeholder({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-[var(--badge-bg)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--text-main)]">
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-[var(--text-main)]">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-[var(--text-soft)]">
        {children}
      </div>
    </section>
  );
}

const SERVICE_PROVIDERS: Array<{ service: string; purpose: string }> = [
  { service: "Supabase", purpose: "Authentication and PostgreSQL account-owned persistence" },
  { service: "Vercel", purpose: "Application hosting" },
  {
    service: "KV-compatible storage",
    purpose: "Operational reminder, delivery and rate-limit state",
  },
  { service: "OpenAI", purpose: "Optional AI-assisted anchor generation" },
  {
    service: "Browser / OS push infrastructure",
    purpose: "Delivery of enabled Web Push notifications",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-[100dvh] w-full bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="mx-auto w-full max-w-[420px] px-6 py-12">
        <Link href="/" className="text-sm font-medium text-[var(--text-soft)] underline">
          ← Back to Fenéla
        </Link>

        <h1 className="mt-6 text-2xl font-bold">Privacy Notice</h1>
        <p className="mt-2 text-sm text-[var(--text-soft)]">Last updated: 12 August 2026</p>

        <p className="mt-6 text-sm leading-relaxed text-[var(--text-soft)]">
          Fenéla is an accountability application that helps users move from overwhelm to one small
          action.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
          This privacy notice explains what personal data Fenéla processes, why it is processed, how
          long it is kept and what rights users have.
        </p>

        <Section title="Who is responsible">
          <p>
            The person or organization operating a public Fenéla deployment is responsible for
            completing this section with their own controller and privacy contact details.
          </p>
          <p>
            Data controller: <Placeholder>[CONTROLLER NAME]</Placeholder>
          </p>
          <p>
            Contact: <Placeholder>[PRIVACY CONTACT EMAIL]</Placeholder>
          </p>
          <p>
            These placeholders are intentionally left unset in the repository. They must be replaced
            before a deployment is offered to external users and processes their personal data.
          </p>
        </Section>

        <Section title="Personal data Fenéla processes">
          <p>Fenéla may process the following information when you use the application:</p>
          <ul className="list-disc pl-5">
            <li>your email address and authentication session;</li>
            <li>your display name;</li>
            <li>guidance preferences you choose during setup;</li>
            <li>your goal and related anchor actions;</li>
            <li>action history, such as starting, completing, postponing or parking an anchor;</li>
            <li>
              friction text you deliberately enter when describing what makes a step difficult;
            </li>
            <li>reminder preferences;</li>
            <li>device and Web Push subscription information when reminders are enabled;</li>
            <li>account activity timestamps used for the inactivity-retention policy;</li>
            <li>deterministic weekly reflection records.</li>
          </ul>
          <p>
            Fenéla does not require health, medical, diagnostic or other special-category
            information to work.
          </p>
          <p>
            Free-text fields are open input fields. You should not provide sensitive personal
            information unless it is necessary for what you want to write.
          </p>
        </Section>

        <Section title="Why Fenéla processes this data">
          <p>Personal data is used only to operate Fenéla, including:</p>
          <ul className="list-disc pl-5">
            <li>authenticating your account;</li>
            <li>keeping your data associated with your account;</li>
            <li>preserving your goal and accountability history between sessions;</li>
            <li>generating or selecting small anchor suggestions;</li>
            <li>providing reminders when you enable them;</li>
            <li>producing deterministic weekly reflections from your recorded activity;</li>
            <li>allowing account deletion;</li>
            <li>applying the inactivity-retention policy;</li>
            <li>protecting the service against abuse.</li>
          </ul>
          <p>
            Fenéla does not use your account data for advertising or general behavioral profiling.
          </p>
        </Section>

        <Section title="Legal basis">
          <p>
            The operator of a public Fenéla deployment must determine and document the applicable
            lawful basis for each processing purpose before offering the application to external
            users.
          </p>
          <p>
            This section must therefore be completed before a deployment is offered to external
            users.
          </p>
          <p>At minimum, the final version must state the lawful basis for:</p>
          <ul className="list-disc pl-5">
            <li>account creation and operation of the core application;</li>
            <li>storage of goals, preferences and activity history;</li>
            <li>optional AI-assisted anchor generation;</li>
            <li>optional reminder and push-notification processing;</li>
            <li>security and abuse prevention;</li>
            <li>inactivity retention and account deletion.</li>
          </ul>
          <p>
            Browser notification permission is a technical permission and should not automatically
            be described as the GDPR lawful basis for all reminder-related processing.
          </p>
        </Section>

        <Section title="AI-assisted anchor suggestions">
          <p>OpenAI-assisted anchor generation is optional.</p>
          <p>When enabled, Fenéla may send the following information to OpenAI:</p>
          <ul className="list-disc pl-5">
            <li>your goal;</li>
            <li>why that goal matters to you;</li>
            <li>the current struggle you entered during intake;</li>
            <li>selected guidance-preference categories.</li>
          </ul>
          <p>Fenéla does not send OpenAI:</p>
          <ul className="list-disc pl-5">
            <li>your email address;</li>
            <li>your display name;</li>
            <li>raw friction-event history;</li>
            <li>action-event history;</li>
            <li>reflection facts;</li>
            <li>account activity timestamps;</li>
            <li>account-deletion or retention information.</li>
          </ul>
          <p>
            If AI assistance is unavailable or not configured, Fenéla can use deterministic fallback
            anchor suggestions.
          </p>
          <p>
            AI is not used to determine account ownership, factual activity history, retention
            eligibility or account deletion.
          </p>
        </Section>

        <Section title="Weekly reflections">
          <p>Weekly reflections are generated deterministically from stored Fenéla activity.</p>
          <p>
            The current reflection flow does not use an AI model to infer what happened or to
            generate the reflection wording.
          </p>
        </Section>

        <Section title="Reminders and Web Push">
          <p>
            If you enable reminders, Fenéla stores the reminder preference associated with your
            account.
          </p>
          <p>A browser or device may also have a PushSubscription used to deliver notifications.</p>
          <p>Push delivery depends on external browser or operating-system push infrastructure.</p>
          <p>
            Reminder preferences and push-subscription delivery state are separate concepts:
            disabling or changing a reminder does not make the push endpoint your identity.
          </p>
        </Section>

        <Section title="Service providers">
          <p>Fenéla uses external services to operate the application.</p>
          <p>These may include:</p>
          <div className="overflow-x-auto rounded-2xl border border-black/5">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="px-3 py-2 font-bold text-[var(--text-main)]">Service</th>
                  <th className="px-3 py-2 font-bold text-[var(--text-main)]">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {SERVICE_PROVIDERS.map((row) => (
                  <tr key={row.service} className="border-b border-black/5 last:border-b-0">
                    <td className="px-3 py-2 align-top">{row.service}</td>
                    <td className="px-3 py-2 align-top">{row.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            The operator must verify the actual production providers, processing regions,
            contractual arrangements and international-transfer safeguards for their own deployment.
          </p>
        </Section>

        <Section title="International transfers">
          <p>
            Some service providers may process personal data outside the Netherlands or European
            Economic Area depending on the production account and provider configuration.
          </p>
          <p>
            The production operator must verify and document the actual transfer locations and
            applicable safeguards before a deployment is offered to external users.
          </p>
        </Section>

        <Section title="How long data is kept">
          <p>Fenéla applies a 12-month inactivity-retention policy.</p>
          <p>
            An account and its account-owned Fenéla data are deleted after 12 months without
            authenticated Fenéla product activity.
          </p>
          <p>
            This is a Fenéla product-retention policy. It is not a retention period prescribed by
            the GDPR.
          </p>
          <p>You may delete your account earlier from within Fenéla.</p>
        </Section>

        <Section title="Account deletion">
          <p>
            User-initiated account deletion permanently removes the Fenéla account and canonical
            account-owned data.
          </p>
          <p>
            Deletion includes the Supabase Auth identity and account-owned PostgreSQL data through
            the application&rsquo;s deletion lifecycle.
          </p>
          <p>
            Operational reminder state associated with owned devices is cleaned up before the
            irreversible account deletion step.
          </p>
          <p>There is no soft-delete recovery period.</p>
        </Section>

        <Section title="Your rights">
          <p>
            Depending on the circumstances and the applicable lawful basis, you may have rights
            under the GDPR including:
          </p>
          <ul className="list-disc pl-5">
            <li>access to your personal data;</li>
            <li>correction of inaccurate personal data;</li>
            <li>deletion of personal data;</li>
            <li>restriction of processing;</li>
            <li>objection to certain processing;</li>
            <li>data portability where applicable;</li>
            <li>withdrawal of consent where processing is based on consent.</li>
          </ul>
          <p>
            Requests can be sent to: <Placeholder>[PRIVACY CONTACT EMAIL]</Placeholder>
          </p>
          <p>
            You also have the right to lodge a complaint with the competent data-protection
            authority.
          </p>
          <p>For users in the Netherlands, this is the Autoriteit Persoonsgegevens.</p>
        </Section>

        <Section title="Whether providing data is required">
          <p>An email address is required to create and authenticate a Fenéla account.</p>
          <p>
            Data needed for the core accountability flow is required only when the relevant product
            feature cannot function without it.
          </p>
          <p>AI assistance and reminders are optional.</p>
        </Section>

        <Section title="Automated decision-making">
          <p>
            Fenéla does not make legal or similarly significant decisions about users through
            automated decision-making.
          </p>
          <p>
            AI-assisted anchors are suggestions that the user can keep, edit, regenerate or discard.
          </p>
        </Section>

        <Section title="Changes to this notice">
          <p>
            This notice should be updated when Fenéla materially changes what personal data it
            processes, why it processes it, which service providers are involved or how long data is
            retained.
          </p>
        </Section>
      </div>
    </main>
  );
}
