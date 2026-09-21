import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'
import { PageHero } from '../components/PageHero'

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

export function Privacy() {
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
        description="How we collect, use, store, and protect your personal information."
        meta="Last updated: September 2026"
      />

      <div className="container-luma py-14">
        <div className="glass-card mx-auto max-w-3xl p-8 sm:p-10">
          <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong>DRAFT:</strong> review by a legal professional before relying on this policy.
            It is written from what the platform currently collects and stores (see{' '}
            <code className="text-xs">docs/DATA_INVENTORY.md</code>). It does <em>not</em> claim ODPC certification or legal compliance.
          </div>

          <Section number={1} title="Introduction">
            <p>
              Luma Welfare ("we," "our," or "us") is a community welfare organisation committed to protecting the privacy and security of our members' personal information. This Privacy Policy explains how we collect, use, store, and safeguard information when you use the Luma Welfare platform and services.
            </p>
            <p>
              Processing is intended to align with Kenya&apos;s Data Protection Act, 2019. By creating an account you are asked to accept this policy and our Terms. If you do not agree, please do not use the service.
            </p>
          </Section>

          <Section number={2} title="Information We Collect">
            <p>We collect information that you provide directly to us and information necessary to operate the platform:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Account information:</strong> Full name, email address, phone number, and password (handled securely through authentication).</li>
              <li><strong>Profile information:</strong> Profile photo, identification number, and other profile details you choose to provide.</li>
              <li><strong>Family member information:</strong> Names and details of family members you add to your account.</li>
              <li><strong>Package and subscription information:</strong> Your package selections and subscription status.</li>
              <li><strong>Contribution information:</strong> Payment records, transaction references, amounts, and payment dates you submit.</li>
              <li><strong>Claim information:</strong> Claims you submit, supporting documents, and related correspondence.</li>
              <li><strong>Communication:</strong> Messages and information you send through forms or other platform features.</li>
              <li><strong>Technical information:</strong> Information automatically collected to operate and secure the service, such as browser type, device information, and IP address.</li>
            </ul>
          </Section>

          <Section number={3} title="How We Use Information">
            <p>We use the information we collect for the following purposes:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Creating and managing your membership account</li>
              <li>Authenticating your identity and securing your account</li>
              <li>Managing your package subscriptions and tracking qualification</li>
              <li>Recording and processing contributions</li>
              <li>Processing and reviewing claims</li>
              <li>Communicating important service updates, claim status changes, and payment notifications</li>
              <li>Providing customer and member support</li>
              <li>Maintaining platform security and preventing misuse</li>
              <li>Generating reports and improving the service</li>
              <li>Complying with applicable obligations</li>
            </ul>
          </Section>

          <Section number={4} title="Authentication">
            <p>
              Luma Welfare uses Supabase Auth for secure authentication. The following authentication methods are supported:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Email and password:</strong> You create an account with an email address and password. Passwords are securely hashed and never stored in plain text.</li>
              <li><strong>Email verification:</strong> New accounts require email verification before full access is granted.</li>
              <li><strong>Google Sign-In:</strong> You may use your Google account to sign in if you have already registered with a matching email address. Google Sign-In is an authentication method, not a registration method.</li>
            </ul>
            <p>
              Authentication tokens are used to maintain your session securely. You may sign out at any time.
            </p>
          </Section>

          <Section number={5} title="Data Storage">
            <p>
              Application data is stored using Supabase, a cloud-based platform that provides database, authentication, and storage services. Data is transmitted over encrypted connections (HTTPS/TLS).
            </p>
            <p>
              We take reasonable steps to protect your information, but no method of electronic storage or transmission is completely secure. We cannot guarantee absolute security.
            </p>
          </Section>

          <Section number={6} title="Service Providers">
            <p>
              We may use third-party infrastructure and service providers to operate the platform. These providers process data only as necessary to deliver their services:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Supabase:</strong> Database hosting, authentication, edge functions, and storage.</li>
              <li><strong>Vercel:</strong> Frontend hosting and deployment.</li>
              <li><strong>Resend:</strong> Transactional email delivery (when applicable).</li>
            </ul>
            <p>
              These providers are bound by their own privacy policies and terms of service.
            </p>
          </Section>

          <Section number={7} title="Cookies and Local Storage">
            <p>
              Luma Welfare uses browser local storage to maintain your authentication session. This is necessary for the platform to function and keep you signed in.
            </p>
            <p>
              We do not use analytics cookies, advertising trackers, or third-party tracking technologies. We do not use cookies for purposes beyond what is necessary to operate the service.
            </p>
          </Section>

          <Section number={8} title="Data Security">
            <p>
              We use reasonable technical and organisational measures designed to protect personal information, including:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Encrypted data transmission (HTTPS/TLS)</li>
              <li>Secure password hashing through Supabase Auth</li>
              <li>Role-based access controls limiting who can access member data</li>
              <li>Row-level security ensuring members can only access their own records</li>
              <li>Audit logging of administrative actions</li>
              <li>Secure server-side processing for sensitive operations</li>
            </ul>
            <p>
              While we strive to protect your information, no method of transmission or storage is 100% secure. We encourage you to use strong passwords and keep your login credentials confidential.
            </p>
          </Section>

          <Section number={9} title="Data Retention">
            <p>
              We retain personal information as needed to operate membership, contributions, and claims, and to meet record-keeping needs:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Account and membership data while your membership is active, and afterwards where financial or legal records require it</li>
              <li>In-app notifications: generally cleaned after about 90 days (read) or 180 days (unread)</li>
              <li>Non-financial audit logs: may be cleaned after about 2 years; financial audit events are retained longer</li>
              <li>Claim evidence in private storage for as long as needed to decide and document claims</li>
            </ul>
          </Section>

          <Section number={10} title="Your Rights">
            <p>Subject to applicable law, you may:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong>Access / export:</strong> download a copy of your application data from Profile → Download my data</li>
              <li><strong>Correct:</strong> update profile fields from your Profile page</li>
              <li><strong>Request deletion:</strong> submit a deletion request from Profile (fulfilment is reviewed; contribution, claim, and other records required by law or legitimate interests may be retained)</li>
              <li>Ask questions about how your personal data is handled</li>
            </ul>
            <p>
              You may also contact us using the details below. Complaints may be directed to the Office of the Data Protection Commissioner (ODPC) where applicable.
            </p>
          </Section>

          <Section number={11} title="Children's Privacy">
            <p>
              Luma Welfare is not specifically designed to collect information from children. If you believe a child has provided personal information to us without appropriate consent, please contact us so we can address the situation.
            </p>
          </Section>

          <Section number={12} title="Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we make significant changes, we will notify members through appropriate channels, such as platform notifications or email. The latest version will always be available on this page.
            </p>
          </Section>

          <Section number={13} title="Contact">
            <p>If you have questions about this Privacy Policy or how your information is handled, please contact us:</p>
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
              <div className="space-y-2 text-sm text-gray-700">
                <p><strong>Luma Welfare</strong></p>
                <p>📧 info@lumawelfare.or.ke</p>
                <p>📞 0798 635 024</p>
                <p>💬 <a href="https://wa.me/254798635024" target="_blank" rel="noopener noreferrer" className="text-luma-700 hover:text-luma-800 underline">WhatsApp</a></p>
              </div>
            </div>
          </Section>

          <div className="mt-12 rounded-xl border border-luma-200 bg-luma-50 p-6 text-center">
            <p className="text-sm text-gray-600">
              <strong>DRAFT</strong> — for informational purposes only; does not constitute legal advice or a compliance claim.
            </p>
            <div className="mt-4 flex justify-center gap-4">
              <Link to="/terms" className="text-sm font-medium text-luma-700 hover:text-luma-800">Terms & Conditions →</Link>
              <Link to="/faq" className="text-sm font-medium text-luma-700 hover:text-luma-800">FAQ →</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
