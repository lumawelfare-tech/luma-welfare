import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'
import { PageHero } from '../components/PageHero'
import { LegalDraftBanner, LegalContactBlock } from '../components/LegalDraftBanner'
import { legalConfig, displayLegalValue } from '../config/legal'

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-bold text-gray-900">
        {number}. {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-600">
        {children}
      </div>
    </section>
  )
}

/**
 * Terms & Conditions — aligned to current product behaviour for lawyer review.
 */
export function Terms() {
  const entity = displayLegalValue(legalConfig.legalEntityName) ?? legalConfig.tradingName
  const effective = displayLegalValue(legalConfig.effectiveDateDisplay)
  const forum = displayLegalValue(legalConfig.disputeForum)
  const meta = [
    `Version ${legalConfig.termsVersion}`,
    effective ? `Effective ${effective}` : 'Effective date pending legal confirmation',
  ].join(' · ')

  useHead('Terms & Conditions', 'Terms and Conditions for using the Luma Welfare community welfare management platform.', {
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Terms & Conditions', path: '/terms' },
    ],
  })

  return (
    <div>
      <PageHero
        eyebrow="Legal"
        title="Terms & Conditions"
        description={`Rules for using the ${legalConfig.tradingName} platform.`}
        meta={meta}
      />

      <div className="container-luma py-14">
        <div className="glass-card mx-auto max-w-3xl p-8 sm:p-10">
          <LegalDraftBanner documentLabel="Terms & Conditions" />

          <Section number={1} title="Acceptance">
            <p>
              By accessing or using the Platform operated by {entity} (trading as {legalConfig.tradingName}),
              you agree to these Terms (version {legalConfig.termsVersion}) and the Privacy Policy.
              Registration requires affirmative acceptance. Updated versions may require re-acceptance while signed in.
            </p>
          </Section>

          <Section number={2} title="The Service">
            <p>
              {legalConfig.tradingName} provides a web application for community welfare membership: registration,
              package subscriptions, contribution tracking, claim submission/review, notifications, and related admin tools.
              It is not a bank, insurer, or investment product.
            </p>
          </Section>

          <Section number={3} title="Eligibility and Accounts">
            <p>You must provide accurate registration information and keep credentials confidential. You are responsible for activity under your account.</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Email verification (OTP) is required before full access.</li>
              <li>Google Sign-In is available only for already-registered emails; it does not create new accounts.</li>
              <li>A one-time activation fee of KSh 300 applies after verification before package access (as implemented today).</li>
            </ul>
          </Section>

          <Section number={4} title="Packages, Contributions, and Claims">
            <ul className="list-disc space-y-2 pl-6">
              <li>Each package has its own contribution rules, waiting period, and eligibility logic.</li>
              <li>You may hold multiple packages; each is tracked separately.</li>
              <li>Contributions are recorded in-app and verified by administrators. Online M-Pesa checkout remains disabled unless payments are enabled by operators.</li>
              <li>Submitting a claim does not guarantee approval or payout. You must provide accurate information and required documents.</li>
            </ul>
          </Section>

          <Section number={5} title="Acceptable Use">
            <p>You must not misuse the Platform, including unauthorised access, fraud, false claims, interference with security controls, or abusive automation.</p>
          </Section>

          <Section number={6} title="Suspension and Closure">
            <p>
              We may suspend or close accounts for security, misuse, legal compliance, or operational reasons.
              We will notify you where practicable.
            </p>
          </Section>

          <Section number={7} title="Content and Intellectual Property">
            <p>
              Platform branding and site content belong to {entity} / {legalConfig.tradingName}.
              You retain responsibility for content you upload; you grant us rights needed to operate membership, claims, and administration.
            </p>
          </Section>

          <Section number={8} title="Third-Party Infrastructure">
            <p>
              The Platform depends on providers including Supabase, Vercel, Resend (email), optional Sentry, and optional Google OAuth.
              Their availability and practices are governed by their terms.
            </p>
          </Section>

          <Section number={9} title="Disclaimers">
            <p>
              The Platform is provided to support community welfare operations. Except as required by law, we do not provide warranties beyond what these Terms expressly state.
              Package rules and community decisions govern benefits; these Terms do not replace package-specific rules.
            </p>
          </Section>

          <Section number={10} title="Changes">
            <p>
              Material updates receive a new terms version. Continued use after re-consent (when prompted) constitutes acceptance of the updated Terms.
            </p>
          </Section>

          <Section number={11} title="Governing Law">
            <p>
              These Terms are governed by {legalConfig.governingLaw}.
              {forum
                ? ` Disputes shall be subject to ${forum}.`
                : ' The competent courts or dispute forum will be confirmed by legal counsel (placeholder pending review).'}
            </p>
          </Section>

          <Section number={12} title="Contact">
            <p>Questions about these Terms:</p>
            <LegalContactBlock />
          </Section>

          <div className="mt-12 rounded-xl border border-luma-200 bg-luma-50 p-6 text-center">
            <p className="text-sm text-gray-600">
              Document version <strong>{legalConfig.termsVersion}</strong>. Not legal advice.
            </p>
            <div className="mt-4 flex justify-center gap-4">
              <Link to="/privacy" className="text-sm font-medium text-luma-700 hover:text-luma-800">Privacy Policy →</Link>
              <Link to="/faq" className="text-sm font-medium text-luma-700 hover:text-luma-800">FAQ →</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
