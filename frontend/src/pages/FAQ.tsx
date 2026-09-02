import { useState, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'

type FAQItem = { q: string; a: string }

type FAQCategory = { label: string; icon: string; items: FAQItem[] }

const categories: FAQCategory[] = [
  {
    label: 'General',
    icon: 'ℹ️',
    items: [
      {
        q: 'What is Luma Welfare?',
        a: 'Luma Welfare is a community welfare organisation that helps members support each other through key life events — from hospital bills and education costs to bereavement, building, farming, weddings, and more. Members contribute monthly to one or more packages and can submit claims when eligible.',
      },
      {
        q: 'How does Luma Welfare work?',
        a: 'You register an account and verify your email with a one-time passcode (OTP) sent to your inbox. Once verified, sign in and pay the one-time KSh 300 activation fee, then choose one or more welfare packages. Each package has its own monthly contribution amount and waiting period. Once you qualify, you can submit claims according to the rules of that package.',
      },
      {
        q: 'Who can join?',
        a: 'Anyone can register for a Luma Welfare account. After registration, you verify your email using a one-time passcode (OTP) sent to your inbox. Once verified and after payment of the KSh 300 activation fee, you can explore and subscribe to available welfare packages.',
      },
      {
        q: 'How do I create an account?',
        a: 'Click "Join Now" on the website and fill in your name, email, phone number, and create a password. After registering, you will receive a one-time passcode (OTP) via email. Enter this code on the verification page to confirm your address. Once verified, sign in and complete the one-time KSh 300 activation fee to unlock package access.',
      },
      {
        q: 'Is registration free?',
        a: 'Creating an account is free. However, a one-time KSh 300 activation fee is required to activate your membership and access welfare packages. This fee is separate from package contributions.',
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
    icon: '📦',
    items: [
      {
        q: 'What are Luma Welfare packages?',
        a: 'Packages are specific welfare categories you can subscribe to, such as Welfare & Burial Support, Hospital Insurance, Education Support, Business Support, Building Support, Land Purchase Support, Farming Support, Wedding Support, Dowry/Ruracio Support, Disaster Relief, Youth Empowerment, and Senior Citizen Support. Each package has its own contribution amount and rules.',
      },
      {
        q: 'How do I compare packages?',
        a: 'Visit the Packages page on the website to see all available packages, their monthly contribution amounts, and waiting periods. Each package is designed for a different type of life event or need.',
      },
      {
        q: 'How do I join a package?',
        a: 'Sign in to your member dashboard, go to "Explore Packages," browse the available options, and click to subscribe to the package(s) you want. You must have paid the KSh 300 activation fee before you can subscribe.',
      },
      {
        q: 'Can I belong to more than one package?',
        a: 'Yes. You can subscribe to multiple packages at the same time. Each package is tracked independently — its own contributions, its own waiting period, and its own qualification status.',
      },
      {
        q: 'How do package contributions work?',
        a: 'Each package has a specific monthly contribution amount. You record your payments through the platform, and they are reviewed and verified by administrators. Your contribution history and payment status are visible on your dashboard.',
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
    icon: '💰',
    items: [
      {
        q: 'How do I make a contribution?',
        a: 'From your member dashboard, go to the Contributions section. You can record a manual payment by selecting the package, entering the amount, payment method, and transaction reference. Your contribution will be submitted for admin verification.',
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
    icon: '✅',
    items: [
      {
        q: 'How do I submit a claim?',
        a: 'From your member dashboard, go to the Claims section and click "Submit Claim." Select the package you are claiming against, provide a description, upload any required supporting documents, and submit. An administrator will review your claim.',
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
    icon: '👤',
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
    icon: '🔒',
    items: [
      {
        q: 'How is my information protected?',
        a: 'Luma Welfare uses industry-standard security measures including encrypted data transmission, secure authentication, role-based access controls, and row-level security to protect your personal information. Admin actions are recorded in audit logs.',
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
    icon: '💳',
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
    <div className={`rounded-xl border transition-all ${isOpen ? 'border-luma-200 bg-luma-50/50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={isOpen}
        aria-controls={id}
      >
        <span className={`text-sm font-semibold ${isOpen ? 'text-luma-800' : 'text-gray-900'}`}>{item.q}</span>
        <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-bold transition-all ${isOpen ? 'bg-luma-600 text-white rotate-45' : 'bg-gray-100 text-gray-500'}`}>+</span>
      </button>
      <div
        ref={contentRef}
        id={id}
        role="region"
        aria-labelledby={`btn-${id}`}
        className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <p className="border-t border-gray-100 px-5 py-4 text-sm leading-relaxed text-gray-600">{item.a}</p>
      </div>
    </div>
  )
}

export function FAQ() {
  useHead('FAQ | Luma Welfare', 'Frequently asked questions about Luma Welfare membership, packages, contributions, claims, and more.')

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
      {/* Page Hero */}
      <section className="bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="container-luma">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-300">Support</span>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">Frequently Asked Questions</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Find answers to common questions about membership, packages, contributions, and claims.
          </p>
          <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />

          {/* Search */}
          <div className="mt-8 max-w-xl">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search questions…"
                className="w-full rounded-xl border border-white/20 bg-white/10 py-3 pl-12 pr-4 text-sm text-white placeholder-white/50 outline-none focus:border-white/40 focus:bg-white/15 transition-all"
                aria-label="Search frequently asked questions"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">✕</button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container-luma py-12">
        {/* Category filters */}
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${!activeCategory ? 'bg-luma-700 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All ({totalQuestions})
          </button>
          {categories.map(cat => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${activeCategory === cat.label ? 'bg-luma-700 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {cat.icon} {cat.label} ({cat.items.length})
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
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
                  <span>{cat.icon}</span> {cat.label}
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
        <div className="mt-12 rounded-2xl border border-luma-200 bg-luma-50 p-8">
          <h2 className="text-xl font-bold text-gray-900">Still have a question?</h2>
          <p className="mt-2 text-sm text-gray-600">
            Contact us on WhatsApp, by phone, or visit the contact page. We are happy to help.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/contact" className="inline-block rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-all">
              Contact page →
            </Link>
            <a href="tel:0798635024" className="inline-block rounded-lg border border-luma-300 bg-white px-5 py-2.5 text-sm font-semibold text-luma-700 hover:bg-luma-50 transition-all">
              📞 0798 635 024
            </a>
            <a href="https://wa.me/254798635024" target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-green-300 bg-white px-5 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-50 transition-all">
              💬 WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
