import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'

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
  useHead('Privacy Policy | Luma Welfare', 'Privacy Policy for the Luma Welfare community welfare management platform.')

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="container-luma">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-300">Legal</span>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            How we collect, use, store, and protect your personal information.
          </p>
          <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />
          <p className="mt-4 text-sm text-white/50">Last updated: August 2026</p>
        </div>
      </section>

      <div className="container-luma py-14">
        <div className="mx-auto max-w-3xl">
          <Section number={1} title="Introduction">
            <p>
              Luma Welfare ("we," "our," or "us") is a community welfare organisation committed to protecting the privacy and security of our members' personal information. This Privacy Policy explains how we collect, use, store, and safeguard information when you use the Luma Welfare platform and services.
            </p>
            <p>
              By using our platform, you agree to the collection and use of information as described in this policy. If you do not agree with the practices described here, please do not use the service.
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
              We retain your personal information for as long as necessary to provide the services you use, maintain accurate records, comply with applicable obligations, resolve disputes, and protect the platform. Account and membership data may be retained after account closure where required for record-keeping purposes.
            </p>
          </Section>

          <Section number={10} title="Your Rights">
            <p>You have the right to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Request access to the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account and personal data, subject to applicable record-keeping requirements</li>
              <li>Ask questions about how your personal data is handled</li>
              <li>Contact us about any privacy concerns</li>
            </ul>
            <p>
              To exercise any of these rights, please contact us using the details provided below.
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
              This Privacy Policy is for informational purposes and does not constitute legal advice.
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
