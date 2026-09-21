import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'
import { PageHero } from '../components/PageHero'
import { MotionSection } from '../components/MotionSection'
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
 * Privacy Policy — regenerated from what the codebase actually does.
 * Organisation-specific facts come from frontend/src/config/legal.ts (placeholders omitted on render).
 */
export function Privacy() {
  const entity = displayLegalValue(legalConfig.legalEntityName) ?? legalConfig.tradingName
  const effective = displayLegalValue(legalConfig.effectiveDateDisplay)
  const meta = [
    `Version ${legalConfig.privacyPolicyVersion}`,
    effective ? `Effective ${effective}` : 'Effective date pending legal confirmation',
  ].join(' · ')

  useHead('Privacy Policy', 'Privacy Policy for the Luma Welfare community welfare management platform.', {
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Privacy Policy', path: '/privacy' },
    ],
  })

  return (
    <div>
      <PageHero
        eyebrow="Legal"
        title="Privacy Policy"
        description={`How ${entity} collects, uses, stores, and protects personal information on this platform.`}
        meta={meta}
      />

      <MotionSection as="div" className="container-luma py-14">
        <div className="glass-card mx-auto max-w-3xl p-8 sm:p-10">
          <LegalDraftBanner documentLabel="Privacy Policy" />

          <Section number={1} title="Introduction">
            <p>
              This Privacy Policy describes how {entity} (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), trading as {legalConfig.tradingName},
              processes personal data when you use the Luma Welfare web application (the &quot;Platform&quot;).
            </p>
            <p>
              The Platform is built for community welfare membership in Kenya. We intend processing to align with the
              Kenya Data Protection Act, 2019. This document is prepared for legal review; it does not by itself
              constitute registration with the Office of the Data Protection Commissioner (ODPC) or a compliance certificate.
            </p>
            <p>
              Creating an account requires accepting this Privacy Policy (version {legalConfig.privacyPolicyVersion}) and our Terms.
              If we publish a new version, signed-in members may be asked to re-accept before continuing.
            </p>
          </Section>

          <Section number={2} title="Information We Collect">
            <p>Based on current product behaviour, we process:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Account &amp; identity:</strong> full name, email, phone, optional national ID number, membership number, profile photo, and profile fields you choose to add (for example county, location, occupation, alternate phone).</li>
              <li><strong>Authentication data:</strong> passwords (handled by Supabase Auth; not stored in plain text by the app), session tokens, and email one-time passcodes (hashed) for verification.</li>
              <li><strong>Family / next of kin:</strong> details you add under Family Members.</li>
              <li><strong>Subscriptions &amp; qualification:</strong> package selections, subscription status, and qualification state.</li>
              <li><strong>Contributions:</strong> amounts, periods, status, notes, and references you or admins record. Online M-Pesa collection exists in code but remains disabled unless payments are explicitly enabled.</li>
              <li><strong>Claims &amp; evidence:</strong> claim details and supporting files stored in a private Storage bucket, accessed via short-lived signed URLs.</li>
              <li><strong>Communications:</strong> in-app notifications, notification preferences, optional web-push subscription endpoints, and messages you submit via the public contact form.</li>
              <li><strong>Technical / security:</strong> request metadata needed to operate and secure the service (for example IP-related rate limiting, browser/user-agent where logged for security or consent records).</li>
              <li><strong>Admin &amp; audit:</strong> administrative actions recorded in audit logs; admin accounts may use step-up 2FA.</li>
            </ul>
          </Section>

          <Section number={3} title="Purposes">
            <ul className="list-disc space-y-2 pl-6">
              <li>Registering and authenticating members</li>
              <li>Managing packages, contributions, claims, and eligibility</li>
              <li>Member support and service messages</li>
              <li>Security, abuse prevention, and troubleshooting</li>
              <li>Admin reporting and operational oversight</li>
              <li>Meeting record-keeping and legal obligations where applicable</li>
            </ul>
          </Section>

          <Section number={4} title="Where Data Is Stored and Who Processes It">
            <p>
              Application data is stored primarily on <strong>Supabase</strong> (authentication, Postgres with row-level security, Edge Functions, and Storage).
              The public website is hosted on <strong>Vercel</strong> (including optional cron routes that call Edge Functions).
            </p>
            <p>Other processors used by the current codebase when configured:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Resend:</strong> transactional email (OTP, notifications) when <code className="text-xs">RESEND_API_KEY</code> is set.</li>
              <li><strong>Sentry:</strong> optional error monitoring when a DSN is set. Browser events scrub sensitive fields; session replay (if enabled) masks text and blocks media. Only a user id (not email/phone) is attached when signed in.</li>
              <li><strong>Google:</strong> optional Sign-In for existing members (OAuth). Google does not create new memberships.</li>
            </ul>
            <p>
              Payment processors (M-Pesa / Daraja) are integrated in code but gated off; related payment fields are not actively collected through online checkout while payments remain disabled.
            </p>
          </Section>

          <Section number={5} title="Cookies, Local Storage, and Similar Technologies">
            <p>
              The Platform uses <strong>browser local storage / session storage</strong> for authentication session material and related UX state required to keep you signed in. A <strong>service worker</strong> may cache assets and support offline/background sync and push delivery where you allow notifications.
            </p>
            <p>
              We do <strong>not</strong> use advertising cookies or third-party marketing analytics pixels. If Sentry is enabled in production, it may set its own first-party storage needed for error/replay SDKs as described above — not for advertising.
            </p>
          </Section>

          <Section number={6} title="Security Measures (as implemented)">
            <ul className="list-disc space-y-2 pl-6">
              <li>HTTPS/TLS in transit</li>
              <li>Supabase Auth password hashing and JWTs</li>
              <li>Row-level security so members generally see only their own records</li>
              <li>Role-based admin permissions and audit logging</li>
              <li>Rate limiting on sensitive Edge Function routes</li>
              <li>PII scrubbing in client and Edge logging / Sentry pipelines</li>
            </ul>
            <p>No system is perfectly secure; please use a strong unique password and protect your device.</p>
          </Section>

          <Section number={7} title="Retention (as coded)">
            <ul className="list-disc space-y-2 pl-6">
              <li>Membership and financial history: retained while needed for operations and record-keeping; closed accounts may still retain contribution/claim history.</li>
              <li>In-app notifications: cleanup jobs target roughly 90 days (read) / 180 days (unread).</li>
              <li>Non-financial audit logs: cleanup may remove older entries after about 2 years; financially relevant audit events are retained longer.</li>
              <li>Claim documents: retained as needed to decide and document claims.</li>
              <li>Deletion requests: tracked until processed; fulfilment is manual and may retain records required by law or legitimate interests.</li>
            </ul>
            <p>Exact statutory retention periods should be confirmed with counsel.</p>
          </Section>

          <Section number={8} title="Your Rights under Kenyan Data Protection Law">
            <p>Subject to the Data Protection Act, 2019 and applicable exceptions, you may:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Access / portability:</strong> Profile → Download my data (application JSON export; claim file bytes are metadata-listed).</li>
              <li><strong>Rectification:</strong> update profile fields in Profile.</li>
              <li><strong>Erasure (request):</strong> submit a deletion request from Profile for admin review.</li>
              <li><strong>Objection / restriction / complaint:</strong> contact us using the details below; you may also complain to the ODPC where applicable.</li>
            </ul>
          </Section>

          <Section number={9} title="Children">
            <p>
              The Platform is not designed for children to create accounts. If you believe a child provided personal data without appropriate authority, contact us so we can review.
            </p>
          </Section>

          <Section number={10} title="Changes">
            <p>
              Material updates receive a new <strong>policy version</strong> ({legalConfig.privacyPolicyVersion} is current).
              Members who accepted an older version may be required to re-consent in the member portal.
            </p>
          </Section>

          <Section number={11} title="Contact">
            <p>Questions about this Privacy Policy or personal data:</p>
            <LegalContactBlock />
          </Section>

          <div className="mt-12 rounded-xl border border-luma-200 bg-luma-50 p-6 text-center">
            <p className="text-sm text-gray-600">
              Document version <strong>{legalConfig.privacyPolicyVersion}</strong>. Not legal advice.
            </p>
            <div className="mt-4 flex justify-center gap-4">
              <Link to="/terms" className="text-sm font-medium text-luma-700 hover:text-luma-800">Terms &amp; Conditions →</Link>
              <Link to="/faq" className="text-sm font-medium text-luma-700 hover:text-luma-800">FAQ →</Link>
            </div>
          </div>
        </div>
      </MotionSection>
    </div>
  )
}
