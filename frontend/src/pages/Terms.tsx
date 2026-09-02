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

export function Terms() {
  useHead('Terms & Conditions | Luma Welfare', 'Terms and Conditions for using the Luma Welfare community welfare management platform.')

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="container-luma">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-300">Legal</span>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">Terms & Conditions</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            The terms governing your use of the Luma Welfare platform and services.
          </p>
          <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />
          <p className="mt-4 text-sm text-white/50">Last updated: August 2026</p>
        </div>
      </section>

      <div className="container-luma py-14">
        <div className="mx-auto max-w-3xl">
          <Section number={1} title="Acceptance of Terms">
            <p>
              By accessing or using the Luma Welfare platform ("the Service"), you agree to be bound by these Terms & Conditions. If you do not agree to these terms, please do not use the Service.
            </p>
          </Section>

          <Section number={2} title="About Luma Welfare">
            <p>
              Luma Welfare is a community welfare platform that enables members to contribute monthly to welfare packages and submit claims when eligible. The platform manages membership, package subscriptions, contribution tracking, claim processing, and related administrative functions.
            </p>
          </Section>

          <Section number={3} title="Eligibility">
            <p>
              To use Luma Welfare, you must create an account and provide accurate registration information. You are responsible for maintaining the accuracy of your account information.
            </p>
          </Section>

          <Section number={4} title="Account Registration">
            <p>When you create an account, you agree to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain the security of your password and login credentials</li>
              <li>Not share your account credentials with others</li>
              <li>Not allow others to use your account</li>
              <li>Promptly update your information if it changes</li>
              <li>Accept responsibility for all activity that occurs under your account</li>
            </ul>
          </Section>

          <Section number={5} title="Email Verification">
            <p>
              New accounts require email verification. You must verify your email address before you can access full platform features. A one-time passcode (OTP) is sent to the email address you provided during registration — enter this code on the verification page to confirm your address.
            </p>
          </Section>

          <Section number={6} title="Google Authentication">
            <p>
              Luma Welfare supports Google Sign-In as an alternative authentication method. Google Sign-In is only available for accounts that have already been registered through the standard registration process with a matching email address. Google Sign-In does not create new accounts.
            </p>
          </Section>

          <Section number={7} title="Membership Activation">
            <p>
              After registration and email verification (via a one-time passcode), a one-time activation fee of KSh 300 is required to activate your membership and access welfare packages. This fee is separate from package contributions and is non-recurring.
            </p>
          </Section>

          <Section number={8} title="Packages">
            <p>Luma Welfare offers various welfare packages. When you subscribe to a package:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Each package has its own contribution amount, waiting period, and eligibility rules</li>
              <li>You should review the specific package details before subscribing</li>
              <li>Eligibility and qualification depend on package-specific rules and your contribution history</li>
              <li>You may subscribe to multiple packages simultaneously</li>
              <li>Each package subscription is tracked independently</li>
            </ul>
            <p>
              Package details, including contribution amounts and waiting periods, are available on the Packages page and may be updated from time to time.
            </p>
          </Section>

          <Section number={9} title="Contributions">
            <p>
              Contributions are payments you make toward your package subscriptions. You may record contributions through the platform. Currently, contributions are recorded manually and verified by administrators.
            </p>
            <p>
              Online payment functionality may be introduced in the future. When available, additional terms may apply to payment processing.
            </p>
          </Section>

          <Section number={10} title="Claims">
            <p>
              When you are eligible, you may submit claims against your subscribed packages. Claims are reviewed and processed by administrators. Submission of a claim does not guarantee approval or payment.
            </p>
            <p>
              You are responsible for providing accurate and complete information when submitting claims, including any required supporting documents.
            </p>
          </Section>

          <Section number={11} title="Prohibited Use">
            <p>You must not:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Attempt to gain unauthorised access to the platform or other users' accounts</li>
              <li>Use the platform for any unlawful purpose</li>
              <li>Submit false, misleading, or fraudulent information</li>
              <li>Interfere with or disrupt the platform's operation</li>
              <li>Attempt to bypass security controls or access restrictions</li>
              <li>Upload malicious content or code</li>
              <li>Abuse communication or notification features</li>
              <li>Use automated tools to access the platform without permission</li>
              <li>Impersonate another person or entity</li>
            </ul>
          </Section>

          <Section number={12} title="Account Suspension and Closure">
            <p>
              Luma Welfare reserves the right to suspend or close accounts where necessary for security reasons, to address misuse, to comply with applicable obligations, or for other legitimate operational reasons. Affected members will be notified where practicable.
            </p>
          </Section>

          <Section number={13} title="Content">
            <p>
              Website content, branding, images, and text are the property of Luma Welfare and may not be reproduced without permission. User-submitted content (including profile information, claims, and documents) remains your responsibility, but you grant Luma Welfare the right to use such content as necessary to operate the service.
            </p>
          </Section>

          <Section number={14} title="Third-Party Services">
            <p>
              The platform relies on third-party infrastructure and services (including Supabase, Vercel, and Resend) to operate. Luma Welfare is not responsible for the availability, performance, or practices of these third-party services.
            </p>
          </Section>

          <Section number={15} title="Service Availability">
            <p>
              We aim to provide reliable access to the platform, but we do not guarantee uninterrupted availability. The service may be temporarily unavailable due to maintenance, technical issues, or circumstances beyond our control.
            </p>
          </Section>

          <Section number={16} title="Disclaimers">
            <p>
              The Luma Welfare platform is provided to support community welfare management. While we work to ensure the accuracy and reliability of the platform, we make no representations or warranties beyond what is expressly stated in these terms.
            </p>
            <p>
              Luma Welfare is not a financial institution, insurer, or registered investment entity. Package contributions and benefits are governed by the rules established by the Luma Welfare community, not by these Terms & Conditions alone.
            </p>
          </Section>

          <Section number={17} title="Changes to Terms">
            <p>
              We may update these Terms & Conditions from time to time. Significant changes will be communicated through appropriate channels. Continued use of the platform after changes are posted constitutes acceptance of the updated terms.
            </p>
          </Section>

          <Section number={18} title="Governing Law">
            <p>
              These Terms & Conditions are governed by the laws applicable to the operations of Luma Welfare in Kenya. Any disputes arising from the use of the platform shall be resolved in accordance with applicable Kenyan law.
            </p>
            <p className="text-xs text-gray-400 italic">
              Note: The specific governing law and jurisdiction details should be confirmed by Luma Welfare's legal advisors.
            </p>
          </Section>

          <Section number={19} title="Contact">
            <p>If you have questions about these Terms & Conditions, please contact us:</p>
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
              These Terms & Conditions are for informational purposes and do not constitute legal advice.
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
