import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Simpulx",
  description: "The terms that govern your use of the Simpulx platform.",
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

export default function TermsOfServicePage() {
  return (
    <main className="min-h-dvh bg-neutral-50 text-neutral-800">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <a href="/" className="text-[13px] font-semibold text-emerald-700 hover:underline">← Simpulx</a>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-neutral-900">Terms of Service</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Effective {EFFECTIVE}</p>

        <p className="mt-6 text-[15px] leading-relaxed text-neutral-700">
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Simpulx
          (&ldquo;Simpulx&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), a customer engagement and lead management
          platform. By creating an account or using the service, you agree to these Terms.
        </p>

        <Section title="1. The service">
          <p>
            Simpulx provides tools to manage conversations, leads, campaigns, and reporting, and to connect third-party
            channels and analytics (such as WhatsApp Business, Meta, Google Ads, and Google Analytics 4). We may add,
            change, or remove features over time.
          </p>
        </Section>

        <Section title="2. Accounts">
          <p>
            You are responsible for your account, your users, and keeping credentials secure. You must provide accurate
            information and are responsible for all activity under your account. You must be authorized to act on behalf
            of the organization you register.
          </p>
        </Section>

        <Section title="3. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>use the service for unlawful, harmful, misleading, or abusive purposes;</li>
            <li>send spam or messages that violate WhatsApp, Meta, or Google policies;</li>
            <li>attempt to disrupt, reverse-engineer, or gain unauthorized access to the service;</li>
            <li>upload content or data you do not have the right to use.</li>
          </ul>
          <p>You are responsible for obtaining any consents required to message your contacts and to process their data.</p>
        </Section>

        <Section title="4. Third-party services">
          <p>
            The service integrates with third-party platforms. Your use of those platforms is subject to their own
            terms and policies, and their availability is outside our control. Data accessed through connected accounts
            (including Google user data) is handled as described in our{" "}
            <a href="/privacy" className="text-emerald-700 underline">Privacy Policy</a>.
          </p>
        </Section>

        <Section title="5. Your data">
          <p>
            You retain ownership of the data you provide. You grant us the rights needed to host and process it to
            operate the service. We handle personal data in accordance with our{" "}
            <a href="/privacy" className="text-emerald-700 underline">Privacy Policy</a>.
          </p>
        </Section>

        <Section title="6. Fees">
          <p>
            Paid plans and usage-based charges (where applicable) are billed as described at signup or in your order.
            Fees are non-refundable except where required by law.
          </p>
        </Section>

        <Section title="7. Disclaimers">
          <p>
            The service is provided &ldquo;as is&rdquo; without warranties of any kind, to the maximum extent permitted
            by law. We do not guarantee that the service will be uninterrupted, error-free, or that connected
            third-party data will always be accurate or available.
          </p>
        </Section>

        <Section title="8. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Simpulx will not be liable for any indirect, incidental, special,
            or consequential damages, or for lost profits or data, arising from your use of the service.
          </p>
        </Section>

        <Section title="9. Termination">
          <p>
            You may stop using the service at any time. We may suspend or terminate access if you breach these Terms or
            to protect the service and its users. On termination, your right to use the service ends; we handle your
            data as described in the Privacy Policy.
          </p>
        </Section>

        <Section title="10. Changes">
          <p>
            We may update these Terms from time to time. Material changes will be reflected by updating the effective
            date above and, where appropriate, notifying you in the product. Continued use after changes take effect
            constitutes acceptance.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            Questions about these Terms? Email{" "}
            <a className="text-emerald-700 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>

        <div className="mt-12 border-t border-neutral-200 pt-6 text-[13px] text-neutral-500">
          <a href="/privacy" className="font-semibold text-emerald-700 hover:underline">Privacy Policy</a>
          <span className="mx-2">·</span>
          <span>© {new Date().getFullYear()} Simpulx</span>
        </div>
      </div>
    </main>
  );
}
