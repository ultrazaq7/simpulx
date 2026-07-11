import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Simpulx",
  description: "How Simpulx collects, uses, and protects your data, including Google user data.",
};

const EFFECTIVE = "July 12, 2026";
const CONTACT = "support@simpulx.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-dvh bg-neutral-50 text-neutral-800">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <a href="/" className="text-[13px] font-semibold text-emerald-700 hover:underline">← Simpulx</a>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-neutral-900">Privacy Policy</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Effective {EFFECTIVE}</p>

        <p className="mt-6 text-[15px] leading-relaxed text-neutral-700">
          Simpulx (&ldquo;Simpulx&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides a customer engagement and lead
          management platform for businesses. This Privacy Policy explains what information we collect, how we use and
          protect it, and the choices you have. By using Simpulx you agree to this policy.
        </p>

        <Section title="Information we collect">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Account data</strong> — name, email, organization, and role of users you invite.</li>
            <li><strong>Customer &amp; conversation data</strong> — contacts, messages, and lead details you manage in the platform (e.g. via connected WhatsApp Business accounts).</li>
            <li><strong>Advertising &amp; analytics data</strong> — performance metrics from ad and analytics accounts you connect (Meta, Google Ads, Google Analytics 4).</li>
            <li><strong>Usage &amp; device data</strong> — log data, IP address, and basic device/browser information used to operate and secure the service.</li>
          </ul>
        </Section>

        <Section title="How we use information">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>To provide, maintain, and improve the platform and its features.</li>
            <li>To display your leads, conversations, reports, and connected analytics.</li>
            <li>To secure the service, prevent abuse, and comply with legal obligations.</li>
            <li>To communicate with you about your account and support requests.</li>
          </ul>
        </Section>

        <Section title="Google user data">
          <p>
            When you connect a Google account (for example, Google Analytics 4 or Google Ads), Simpulx requests only the
            access needed to show your reporting, using scopes such as <code className="rounded bg-neutral-200 px-1 py-0.5 text-[13px]">analytics.readonly</code>.
            We use this access solely to read and display the analytics/advertising metrics for the property or account
            you choose to connect, within your Simpulx reports.
          </p>
          <p>
            Simpulx&apos;s use and transfer of information received from Google APIs adheres to the{" "}
            <a className="text-emerald-700 underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>, including the Limited Use requirements. Specifically, we do <strong>not</strong>:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>use Google user data for advertising, or transfer it to data brokers;</li>
            <li>sell Google user data;</li>
            <li>use it for any purpose other than providing or improving the user-facing features you connected it for;</li>
            <li>allow humans to read it, except with your consent for support, for security, to comply with law, or when the data is aggregated and anonymized.</li>
          </ul>
          <p>
            You can disconnect a Google account at any time from Simpulx (Settings → Channel &amp; Integrations →
            Analytics), or revoke access from your{" "}
            <a className="text-emerald-700 underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google account permissions</a>.
            On disconnect, we stop accessing the data and delete the stored authorization token.
          </p>
        </Section>

        <Section title="How we share information">
          <p>We do not sell your data. We share it only with:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Service providers</strong> that host and operate the platform on our behalf, under confidentiality obligations.</li>
            <li><strong>Platforms you connect</strong> (e.g. WhatsApp/Meta, Google) as required to deliver the features you enabled.</li>
            <li><strong>Legal</strong> — when required by law or to protect our rights and users&apos; safety.</li>
          </ul>
        </Section>

        <Section title="Data retention &amp; security">
          <p>
            We retain data for as long as your account is active or as needed to provide the service, then delete or
            anonymize it in line with our retention practices and legal obligations. We use industry-standard measures
            (encryption in transit, access controls) to protect your information.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You may access, correct, export, or delete your data, and withdraw connected-account access at any time.
            To exercise these rights, contact us at{" "}
            <a className="text-emerald-700 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. Material changes will be reflected by updating the effective
            date above and, where appropriate, notifying you in the product.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data? Email{" "}
            <a className="text-emerald-700 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>

        <div className="mt-12 border-t border-neutral-200 pt-6 text-[13px] text-neutral-500">
          <a href="/terms" className="font-semibold text-emerald-700 hover:underline">Terms of Service</a>
          <span className="mx-2">·</span>
          <span>© {new Date().getFullYear()} Simpulx</span>
        </div>
      </div>
    </main>
  );
}
