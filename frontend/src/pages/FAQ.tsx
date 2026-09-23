import { useState, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'
import { MotionSection } from '../components/MotionSection'

type FAQItem = { q: string; a: string }

type FAQCategory = { label: string; items: FAQItem[] }

const categories: FAQCategory[] = [
  {
    label: 'General',
    items: [
      {
        q: 'What is LUMA Welfare and when was it founded?',
        a: 'LUMA Welfare is a community-oriented welfare organisation founded in Kitengela, Kenya, in 2021 under Chairman Boss Williams. Its guiding mission is to stand with everyone through the Mission of Mercy. Members contribute to one or more welfare packages so families can prepare for life’s uncertainties and support one another — from bereavement and outpatient care to education, business, farming, and other important moments. The organisation’s public story is “Together We Are Stronger.”',
      },
      {
        q: 'What are LUMA Welfare’s core values?',
        a: 'The organisational framework lists eight core values: Unity (together we are stronger); Mercy (we respond to need with compassion and dignity); Trust (we protect confidence through honesty and responsible management); Responsibility (members and leaders each have duties toward the welfare community); Dignity (every person deserves respect); Accountability (decisions, funds, and records should be properly documented); Community (we seek positive impact beyond individual interests); and Sustainability (welfare commitments should be designed around realistic and responsible resources).',
      },
      {
        q: 'What is the Mission of Mercy?',
        a: 'The Mission of Mercy is described as the heart of LUMA Welfare: to stand with everyone. It encourages compassion toward members, families, vulnerable people, children, and communities. It may include appropriate support for children’s homes, education initiatives, emergency assistance, food and essential-item drives, bereavement support, and community outreach — where resources and approved arrangements permit. As a joinable package, Mission of Mercy is one programme (listed at KSh 500 per month with a 12-month waiting period in the organisational framework) with three nested sub-categories: Children’s Orphanage/Vulnerables, Widows, and Single Mothers — not three separate packages.',
      },
      {
        q: 'How does Luma Welfare work?',
        a: 'You register an account and verify your email with a one-time passcode (OTP) sent to your inbox. Once verified, sign in and complete the one-time KSh 300 activation fee used on this platform today (online M-Pesa is being prepared; administrators can verify the fee meanwhile), then choose one or more welfare packages. Each package has its own monthly contribution amount and waiting period. Once you qualify under that package’s rules, you can submit claims. Official onboarding in the organisational framework is: application → eligibility review → registration → member number → beneficiary registration → package selection → contribution record → confirmation of active membership.',
      },
      {
        q: 'Who can join?',
        a: 'LUMA Welfare is designed for people who want to join an organised welfare community. Membership is open to eligible applicants who agree to the approved constitution, package terms, contribution rules, and code of conduct. On this website anyone can create an account, verify email, and submit a membership application. After approval and the KSh 300 activation fee is verified, you can explore and subscribe to available welfare packages.',
      },
      {
        q: 'How do I create an account?',
        a: 'Click "Join Luma" on the website and fill in your name, email, phone number, and create a password. After registering, you will receive a one-time passcode (OTP) via email. Enter this code on the verification page to confirm your address. Once verified, sign in and complete the one-time KSh 300 activation fee to unlock package access. Online payment is launching soon; administrators can verify fees in the meantime.',
      },
      {
        q: 'Is registration free?',
        a: 'Creating an account is free. A one-time KSh 300 activation fee is required to activate your membership and access welfare packages. This fee is separate from package contributions. Online M-Pesa is not live yet — see the Payments section for how fees are verified today.',
      },
      {
        q: 'How do I confirm my email?',
        a: 'After registering, a one-time passcode (OTP) is sent to your registered email address. Enter this 6-digit code on the verification page to confirm your account. The code expires after 10 minutes. If it expires, use the resend link on the verification page to request a new one. Check your spam folder if you do not see the email.',
      },
      {
        q: 'Can I use Google to sign in?',
        a: 'Yes. If you have already registered with Luma Welfare using your email, you can use Google Sign-In with the same email address as an alternative login method. Google Sign-In does not create a new account — it must match your existing registered email.',
      },
      {
        q: 'What happens if I forget my password?',
        a: 'Click "Forgot Password" on the login page, enter your email address, and follow the instructions sent to your inbox to reset your password.',
      },
    ],
  },
  {
    label: 'Packages',
    items: [
      {
        q: 'What packages/programs can I join?',
        a: 'The official organisational framework lists these packages: Welfare Package / Burial Support; Outpatient Hospital Support (listed in the framework as Hospital Insurance — Outpatient); Education Support; Business Support; Building Support; Land Purchase Support; Farming Support; Wedding Support; Dowry/Ruracio Support; Disaster Relief Support; Youth Empowerment Support; Senior Citizen Support; and Mission of Mercy (one package with three nested sub-categories: Children’s Orphanage/Vulnerables, Widows, and Single Mothers). The public Our Story page also groups some of these as Welfare & Bereavement, Outpatient Hospital, Education, Business, Building & Land, Farming, Senior Citizen, and other member-focused programmes. Programmes and benefits are always subject to the constitution, contribution rules, eligibility, and procedures. Specific claim amounts are only those in a final approved package schedule — this FAQ does not promise a payout figure.',
      },
      {
        q: 'How much do I contribute and are there waiting periods?',
        a: 'Amounts and waiting periods below come from the organisational framework’s package table. They describe published schedule figures; the amount you pay is the contribution shown for the package and tier you actually enroll in on this site. Welfare Package / Burial Support: no fixed waiting period. The framework publishes separate age-band figures (79 and below KSh 100/month; 80 and above KSh 400/month) and separate family-coverage figures (Nuclear Family KSh 300/month; Extended Family KSh 500/month). Those dimensions are listed independently — this site does not treat them as a single combined formula. Welfare contributions vary by the applicable age band and family coverage; the final monthly amount is the one attached to your enrolled package/tier. Outpatient hospital support: KSh 1,200/month, 12-month wait. Education Support: KSh 1,200/month, 6-month wait. Business, Building, Land Purchase, Farming, Wedding, Dowry/Ruracio, Disaster Relief, Youth Empowerment, and Senior Citizen Support: KSh 2,000/month, 12-month wait. Mission of Mercy: KSh 500/month, 12-month wait. Package benefits, exclusions, and any payout limits must be in the final approved schedule before anyone is promised a specific benefit.',
      },
      {
        q: 'How do I compare packages?',
        a: 'Visit the Packages page on the website to see all available packages, their monthly contribution amounts, and waiting periods. Each package is designed for a different type of life event or need.',
      },
      {
        q: 'How do I join?',
        a: 'On this website: create an account, verify your email, complete the one-time KSh 300 activation fee (administrators can verify it while online M-Pesa is launching), then subscribe to packages from your dashboard. The official membership path in the organisational framework is application → eligibility review → registration → member number → beneficiary registration → package selection → contribution record → confirmation of active membership. Submitting an application does not automatically guarantee every benefit or claim; support is provided according to applicable LUMA Welfare rules.',
      },
      {
        q: 'How do I join a package?',
        a: 'Sign in to your member dashboard, go to "Explore Packages," browse the available options, and click to subscribe to the package(s) you want. You must have completed the KSh 300 activation fee (verified by an administrator while online M-Pesa is launching) before you can subscribe.',
      },
      {
        q: 'Can I belong to more than one package?',
        a: 'Yes. You can subscribe to multiple packages at the same time. Each package is tracked independently — its own contributions, its own waiting period, and its own qualification status.',
      },
      {
        q: 'How do package contributions work?',
        a: 'Each package has a specific monthly contribution amount. Every enrolled package requires its applicable monthly contribution. Monthly payments cannot be skipped for any package. You record payments through the platform, and they are reviewed and verified by administrators. Your contribution history and payment status are visible on your dashboard.',
      },
      {
        q: 'Can package rules differ between packages?',
        a: 'Yes. Each package may have different contribution amounts, waiting periods, and eligibility requirements. Review the details of each package before subscribing.',
      },
      {
        q: 'Where can I see my package status?',
        a: 'Your member dashboard shows all your active packages, monthly contributions, payment history, waiting-period progress, and qualification status for each package.',
      },
    ],
  },
  {
    label: 'Contributions',
    items: [
      {
        q: 'Must I pay every month for every package?',
        a: 'Yes. Every enrolled package requires its applicable monthly contribution. Monthly payments cannot be skipped for any package. You cannot selectively skip one package while remaining enrolled in it. This applies to every Luma package, not only the Welfare Package. The amount is the contribution for the package and tier you enrolled in on this site — not a single organisation-wide Welfare figure. This rule does not add late fees, penalties, automatic suspension, or cancellation; those are not stated here as adopted rules.',
      },
      {
        q: 'How do I make a contribution?',
        a: 'From your member dashboard, go to the Contributions section. You can record a manual payment by selecting the package, entering the amount, payment method, and transaction reference. Your contribution will be submitted for admin verification. Contributions should be recorded against your unique membership number and the package you selected.',
      },
      {
        q: 'How do I pay safely?',
        a: 'Use only official LUMA Welfare payment instructions shown on this portal or given by the organisation. Confirm the approved payment details before you pay. Do not use unofficial payment channels, private numbers, or anyone claiming to collect on LUMA’s behalf outside official instructions.',
      },
      {
        q: 'Is my contribution refundable?',
        a: 'The organisational framework does not treat a non-refund rule as automatically in force. It says that if LUMA adopts a non-refundable contribution rule, that rule must be clearly stated in the final constitution and package terms and communicated before you enroll. Until that is adopted and communicated, do not assume contributions are refundable or non-refundable — ask the office and read the terms you accept at registration.',
      },
      {
        q: 'When are contributions due?',
        a: 'Members should contribute according to the selected package and the approved schedule. Contributions are due on the date specified by the organisation. The current proposed late-payment deadline in the organisational framework is the 10th of the relevant month, subject to the final approved rules — it is not stated here as a settled obligation. Separately, the framework’s current proposed renewal is KSh 300 every two months; that is also proposed, not a final adopted rule. This website today uses a one-time KSh 300 activation fee after email verification, which is a different, implemented step — not the same as that proposed renewal.',
      },
      {
        q: 'How can I see my contribution history?',
        a: 'Your dashboard and the Contributions page show your full payment history, including dates, amounts, status (pending, verified, rejected), and transaction references. You can also download receipts and statements.',
      },
      {
        q: 'What happens when a contribution is recorded?',
        a: 'When you record a contribution, it is submitted as pending. An administrator reviews the payment details and either verifies or rejects it. Once verified, the contribution is marked as complete and counted toward your package qualification.',
      },
      {
        q: 'What happens if a contribution needs verification?',
        a: 'Contributions are submitted as pending and must be reviewed by an administrator. If additional information is needed, the admin may request it. You will receive a notification when your contribution status changes.',
      },
    ],
  },
  {
    label: 'Claims & Benefits',
    items: [
      {
        q: 'How do I submit a claim?',
        a: 'On the website, open Claims from your member dashboard, choose the package, describe the event, upload supporting documents, and submit. An administrator reviews the claim. The official eight-step process in the organisational framework is: (1) you or an authorised representative report the event; (2) the official claim form is completed; (3) supporting documents are submitted; (4) membership and contribution status are checked; (5) the claim is reviewed against that package’s terms; (6) an authorised committee or official approves or declines according to the rules; (7) you receive an official decision; (8) if payment is approved, it is recorded and a receipt or payment record is kept. A claim is not approved merely because an event occurred — eligibility and package terms must be checked. Submitting a form does not guarantee approval.',
      },
      {
        q: 'What documents might I need for a claim?',
        a: 'It depends on the package and the event. The organisational framework lists, where relevant: identification, membership details, beneficiary information, medical documents, school documents, receipts, death or burial documentation, police or official reports, and any other documents that package specifies. The claim form on this site will also guide you on what to upload.',
      },
      {
        q: 'What claim statuses can I expect?',
        a: 'Claims go through several stages: Draft, Submitted, Under Review, Additional Information Required, Approved, Rejected, or Paid. You will receive notifications as your claim progresses through these stages.',
      },
      {
        q: 'How long does claim review take?',
        a: 'Claim review times depend on the package and the complexity of the claim. You will be notified at each stage. If additional information is required, you will be asked to provide it before the review can continue.',
      },
      {
        q: 'Can I track my claims?',
        a: 'Yes. Your member dashboard and the Claims page show all your submitted claims, their current status, and any messages from the administrator reviewing your claim.',
      },
      {
        q: 'What supporting documents do I need?',
        a: 'Required documents depend on the package. For example, hospital claims may require medical bills, disaster relief may require receipts or a police report, and bereavement claims may require relevant documentation. The claim submission form will guide you on what is needed.',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        q: 'How do I update my profile?',
        a: 'Sign in and go to the Profile page from your dashboard. You can update your name, phone number, profile photo, and other account details.',
      },
      {
        q: 'How do I manage family members?',
        a: 'From your dashboard, go to the Family section. You can add, view, and manage family member information that is linked to your account.',
      },
      {
        q: 'How do I reset my password?',
        a: 'Click "Forgot Password" on the login page, enter your email, and follow the instructions sent to your inbox. You can also change your password from the Profile page after signing in.',
      },
      {
        q: 'How do I sign out?',
        a: 'Click "Sign Out" in the navigation menu or sidebar. Your session will be ended and you will be redirected to the home page.',
      },
      {
        q: 'What happens if my account is suspended or closed?',
        a: 'If your account is suspended or closed, you will not be able to access member features. Contact Luma Welfare support for more information about your account status.',
      },
    ],
  },
  {
    label: 'Security & Privacy',
    items: [
      {
        q: 'How is my information protected?',
        a: 'The organisational framework says LUMA should collect only information needed for membership, administration, payments, claims, and lawful community activities; protect records against unauthorised access; limit access by role; and not disclose member information publicly without a lawful basis or appropriate consent. A final privacy and data-protection policy should still be prepared in line with Kenyan requirements. On this platform we also use encrypted connections, secure authentication, role-based admin access, and row-level security so members generally see only their own records. Admin actions are logged. See the Privacy Policy (marked draft pending legal review) for details.',
      },
      {
        q: 'What if I have a complaint?',
        a: 'You should have a clear route to raise a concern without retaliation. The organisational process is: submit the complaint in writing or through an approved official channel (on this site, use Complaints after you sign in, or Contact); it is logged with a date and reference number; a responsible officer acknowledges receipt; relevant records are reviewed; a decision or response is communicated; and where appropriate you may request committee review or appeal under the constitution. Urgent safeguarding or criminal matters should be referred to the appropriate authorities.',
      },
      {
        q: 'Does Luma Welfare store my password?',
        a: 'No. Passwords are handled securely through Supabase Auth and are never stored in plain text in our application database.',
      },
      {
        q: 'Who can access my information?',
        a: 'Only you can access your personal member data. Administrators can access member information only when necessary for their administrative role, and all admin actions are logged. See our Privacy Policy for full details.',
      },
      {
        q: 'How does Luma Welfare use my information?',
        a: 'Your information is used to manage your membership, process contributions, handle claims, and communicate important service updates. We do not sell or share your personal information with third parties for marketing purposes. See our Privacy Policy for complete details.',
      },
    ],
  },
  {
    label: 'Payments',
    items: [
      {
        q: 'How do I pay my activation fee?',
        a: 'After signing in, you will see a prompt to pay the one-time KSh 300 activation fee. Currently, payment processing is being set up. In the meantime, administrators can manually verify activation fees. You will be notified when online payment becomes available.',
      },
      {
        q: 'Is M-Pesa available for payments?',
        a: 'M-Pesa integration is being prepared for the platform. When activated, you will be able to make payments directly through M-Pesa STK Push from your dashboard. Currently, contributions are recorded manually and verified by administrators.',
      },
      {
        q: 'Can I get a receipt for my payments?',
        a: 'Yes. Once a contribution or payment is verified, you can view and download receipts from the Receipts & Statements section of your dashboard. Receipts are available in multiple formats.',
      },
    ],
  },
]

function FaqItem({ item, isOpen, onToggle, id }: { item: FAQItem; isOpen: boolean; onToggle: () => void; id: string }) {
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <div className={`glass-card transition-all ${isOpen ? 'border-luma-200/80 shadow-sm' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={isOpen}
        aria-controls={id}
      >
        <span className={`text-sm font-semibold ${isOpen ? 'text-luma-800' : 'text-gray-900'}`}>{item.q}</span>
        <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-bold transition-all ${isOpen ? 'bg-luma-600 text-white rotate-45' : 'bg-luma-50 text-gray-600'}`}>+</span>
      </button>
      <div
        ref={contentRef}
        id={id}
        role="region"
        aria-labelledby={`btn-${id}`}
        className={`overflow-hidden transition-[max-height,opacity] duration-[var(--motion-fast)] ease-[var(--luma-ease-out)] motion-reduce:transition-none ${isOpen ? 'max-h-[80vh] overflow-y-auto opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <p className="border-t border-white/50 px-5 py-4 text-sm leading-relaxed text-gray-600">{item.a}</p>
      </div>
    </div>
  )
}

export function FAQ() {
  useHead('FAQ', 'Frequently asked questions about Luma Welfare membership, packages, contributions, claims, and more.', {
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'FAQ', path: '/faq' },
    ],
  })

  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q && !activeCategory) return categories

    return categories
      .filter(cat => !activeCategory || cat.label === activeCategory)
      .map(cat => ({
        ...cat,
        items: q
          ? cat.items.filter(item => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q))
          : cat.items,
      }))
      .filter(cat => cat.items.length > 0)
  }, [search, activeCategory])

  const toggle = useCallback((id: string) => {
    setOpenId(prev => prev === id ? null : id)
  }, [])

  const totalQuestions = categories.reduce((s, c) => s + c.items.length, 0)

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.08),_transparent_50%)]" />
        <div className="container-luma relative">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-200">Support</span>
          <h1 className="mt-2 text-3xl font-bold text-white min-[360px]:text-4xl sm:text-5xl">Frequently Asked Questions</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Find answers to common questions about membership, packages, contributions, and claims.
          </p>
          <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />

          <div className="mt-8 max-w-xl">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search questions…"
                className="w-full rounded-xl border border-white/25 bg-white/15 py-3 pl-12 pr-4 text-sm text-white placeholder-white/60 outline-none focus:border-white/40 focus:bg-white/20 transition-all backdrop-blur-sm"
                aria-label="Search frequently asked questions"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white">✕</button>
              )}
            </div>
          </div>
        </div>
      </section>

      <MotionSection as="div" className="container-luma py-12">
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${!activeCategory ? 'bg-luma-700 text-white shadow-sm' : 'glass text-gray-700 hover:bg-white/80'}`}
          >
            All ({totalQuestions})
          </button>
          {categories.map(cat => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${activeCategory === cat.label ? 'bg-luma-700 text-white shadow-sm' : 'glass text-gray-700 hover:bg-white/80'}`}
            >
              {cat.label} ({cat.items.length})
            </button>
          ))}
        </div>

        {/* FAQ sections */}
        {filteredCategories.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center">
            <p className="text-lg font-semibold text-gray-900">No matching questions</p>
            <p className="mt-2 text-sm text-gray-500">Try a different search term or category.</p>
            <button onClick={() => { setSearch(''); setActiveCategory(null) }} className="mt-4 text-sm font-medium text-luma-700 hover:text-luma-800">Clear filters</button>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredCategories.map(cat => (
              <div key={cat.label}>
                <h2 className="mb-4 text-lg font-bold text-gray-900">
                  {cat.label}
                </h2>
                <div className="space-y-2">
                  {cat.items.map((item, i) => {
                    const id = `${cat.label}-${i}`
                    return (
                      <FaqItem
                        key={id}
                        item={item}
                        isOpen={openId === id}
                        onToggle={() => toggle(id)}
                        id={id}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contact CTA */}
        <div className="glass-card mt-12 border-luma-200/60 p-8">
          <h2 className="text-xl font-bold text-gray-900">Still have a question?</h2>
          <p className="mt-2 text-sm text-gray-600">
            Visit the contact page for phone, WhatsApp, email, or a written message.
          </p>
          <div className="mt-4">
            <Link to="/contact" className="inline-block rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-all">
              Contact us
            </Link>
          </div>
        </div>
      </MotionSection>
    </div>
  )
}
