// Public, unauthenticated privacy notice page.
//
// docs/product/privacy-notice.md is the canonical, repository-level privacy
// notice. This file is a hand-maintained React copy of that same content for
// in-app display, kept as plain server-rendered markup (no client JS
// required to read it, no Markdown-rendering dependency). Both must stay
// aligned whenever privacy content changes — update the Markdown file first,
// then mirror the change here.

import Link from "next/link";

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
    service: "Upstash",
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
        <p className="mt-2 text-sm text-[var(--text-soft)]">Last updated: 14 August 2026</p>

        <p className="mt-6 text-sm leading-relaxed text-[var(--text-soft)]">
          Fenéla is an accountability application that helps users move from overwhelm to one small
          action.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
          This privacy notice applies to the hosted Fenéla deployment operated by Nadira Büsse. It
          explains what personal data this deployment processes, why it is processed, how long it is
          kept and what rights users have.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
          The Fenéla source code is also publicly available under the MIT License. Anyone who
          deploys their own copy is responsible for the privacy and data-protection obligations of
          that deployment and must provide their own privacy information.
        </p>

        <Section title="Who is responsible">
          <p>
            Data controller: <strong className="text-[var(--text-main)]">Nadira Büsse</strong>
          </p>
          <p>
            Privacy contact:{" "}
            <a
              href="mailto:privacy@nadirabusse.com"
              className="font-medium text-[var(--text-main)] underline underline-offset-2"
            >
              privacy@nadirabusse.com
            </a>
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
            Free-text fields are open input fields. Please do not provide sensitive personal
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
            <li>
              protecting the hosted deployment against abuse and maintaining its security and
              reliability.
            </li>
          </ul>

          <p>
            Fenéla does not use your account data for advertising or general behavioral profiling.
          </p>
        </Section>

        <Section title="Legal basis">
          <p>
            The hosted Fenéla deployment uses different GDPR legal bases depending on the processing
            purpose.
          </p>

          <h3 className="font-bold text-[var(--text-main)]">
            Core account and accountability functionality
          </h3>

          <p>
            Fenéla relies on{" "}
            <strong className="text-[var(--text-main)]">legitimate interests</strong> for processing
            that is necessary to operate the hosted application you choose to use. This includes
            authentication, associating data with your account, storing the goals, preferences and
            activity records needed for the accountability flow, generating deterministic
            reflections, maintaining account activity timestamps, and supporting account deletion.
          </p>

          <p>
            The legitimate interest is to provide and maintain the requested Fenéla functionality
            while keeping processing limited to what the application needs. Fenéla is designed
            around data minimisation, account ownership and user-controlled deletion.
          </p>

          <h3 className="font-bold text-[var(--text-main)]">
            Optional AI-assisted anchor suggestions
          </h3>

          <p>
            Fenéla relies on <strong className="text-[var(--text-main)]">consent</strong> for
            sending the relevant input data to OpenAI for optional AI-assisted anchor suggestions.
          </p>

          <p>
            AI assistance can be turned off. When it is off, Fenéla does not use OpenAI to generate
            anchor suggestions and can use deterministic fallback suggestions instead.
          </p>

          <p>
            You may withdraw this consent by turning AI assistance off in your account settings.
            Turning it off does not prevent you from using the core accountability flow.
          </p>

          <h3 className="font-bold text-[var(--text-main)]">Optional reminders and Web Push</h3>

          <p>
            Fenéla relies on <strong className="text-[var(--text-main)]">consent</strong> for
            optional reminder and Web Push processing.
          </p>

          <p>
            You choose whether to enable reminders. Browser or operating-system notification
            permission is also required for push delivery, but that technical permission is separate
            from the GDPR legal basis.
          </p>

          <p>
            You may withdraw this consent by disabling reminders. You can also revoke notification
            permission in your browser or operating-system settings.
          </p>

          <h3 className="font-bold text-[var(--text-main)]">Security and abuse prevention</h3>

          <p>
            Fenéla relies on{" "}
            <strong className="text-[var(--text-main)]">legitimate interests</strong> where personal
            data must be processed to protect the hosted deployment, enforce operational limits,
            investigate failures and prevent abuse.
          </p>

          <p>
            The legitimate interest is maintaining the security, availability and reliable operation
            of the application.
          </p>

          <h3 className="font-bold text-[var(--text-main)]">Inactivity retention and deletion</h3>

          <p>
            Fenéla relies on{" "}
            <strong className="text-[var(--text-main)]">legitimate interests</strong> to apply its
            inactivity-retention policy and remove accounts that have been inactive for 12 months.
          </p>

          <p>
            The purpose is to avoid keeping personal data indefinitely when an account is no longer
            being used. You may delete your account earlier from within Fenéla.
          </p>

          <p>
            Where processing is based on legitimate interests, you may have the right to object as
            described under <strong className="text-[var(--text-main)]">Your rights</strong> below.
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
            If AI assistance is unavailable, disabled or not configured, Fenéla can use
            deterministic fallback anchor suggestions.
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
          <p>Fenéla uses external services to operate the hosted deployment.</p>

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
            These providers process data only to the extent required for the relevant Fenéla
            functionality and according to the configuration of the hosted deployment.
          </p>
        </Section>

        <Section title="International transfers">
          <p>
            Some service providers used by Fenéla may process personal data outside the Netherlands
            or European Economic Area, depending on their infrastructure and the applicable account
            configuration.
          </p>

          <p>
            Where the GDPR requires safeguards for an international transfer, the relevant provider
            arrangements and transfer mechanisms apply. Provider infrastructure and contractual
            arrangements can change independently of the Fenéla repository.
          </p>

          <p>
            For questions about the current hosted deployment, contact{" "}
            <a
              href="mailto:privacy@nadirabusse.com"
              className="font-medium text-[var(--text-main)] underline underline-offset-2"
            >
              privacy@nadirabusse.com
            </a>
            .
          </p>
        </Section>

        <Section title="How long data is kept">
          <p>Fenéla applies a 12-month inactivity-retention policy.</p>

          <p>
            An account and its account-owned Fenéla data are deleted after 12 months without
            authenticated Fenéla product activity. The hosted deployment runs scheduled retention
            processing daily, so deletion occurs through that operational retention process after
            the account becomes eligible.
          </p>

          <p>
            This is a Fenéla product-retention policy. It is not a retention period prescribed by
            the GDPR.
          </p>

          <p>You may delete your account earlier from within Fenéla.</p>

          <p>
            Operational data may have shorter lifecycles where it is no longer required for its
            purpose. External service providers may also maintain limited technical records or
            backups according to their own applicable retention and security processes.
          </p>
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

          <p>
            Deletion from Fenéla does not necessarily mean that every infrastructure provider
            instantly removes every technical backup or security record. Those provider-level
            processes are governed by the relevant provider configuration and terms.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Depending on the circumstances and the applicable legal basis, you may have rights under
            the GDPR including:
          </p>

          <ul className="list-disc pl-5">
            <li>access to your personal data;</li>
            <li>correction of inaccurate personal data;</li>
            <li>deletion of personal data;</li>
            <li>restriction of processing;</li>
            <li>objection to processing based on legitimate interests;</li>
            <li>data portability where applicable;</li>
            <li>withdrawal of consent where processing is based on consent.</li>
          </ul>

          <p>
            Withdrawing consent does not affect the lawfulness of processing that took place before
            consent was withdrawn.
          </p>

          <p>
            Requests can be sent to{" "}
            <a
              href="mailto:privacy@nadirabusse.com"
              className="font-medium text-[var(--text-main)] underline underline-offset-2"
            >
              privacy@nadirabusse.com
            </a>
            .
          </p>

          <p>You also have the right to lodge a complaint with a data-protection authority.</p>

          <p>
            For users in the Netherlands, the supervisory authority is the Autoriteit
            Persoonsgegevens.
          </p>
        </Section>

        <Section title="Whether providing data is required">
          <p>An email address is required to create and authenticate a Fenéla account.</p>

          <p>
            Data needed for the core accountability flow is required only when the relevant product
            feature cannot function without it.
          </p>

          <p>
            AI assistance and reminders are optional. You can use the core accountability flow
            without enabling either feature.
          </p>
        </Section>

        <Section title="Automated decision-making">
          <p>
            Fenéla does not make legal or similarly significant decisions about users through
            automated decision-making.
          </p>

          <p>
            AI-assisted anchors are suggestions. They do not determine account access, retention,
            deletion or other legal or similarly significant outcomes.
          </p>
        </Section>

        <Section title="Changes to this notice">
          <p>
            This notice will be updated when the hosted Fenéla deployment materially changes what
            personal data it processes, why it processes it, which service providers are involved or
            how long data is retained.
          </p>
        </Section>
      </div>
    </main>
  );
}
