import { type JSX, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { StatBar } from '../components/StatBar'
import { HomeHero } from '../components/HomeHero'
import { OrganizationJsonLd } from '../components/OrganizationJsonLd'
import { MotionSection, MotionCard } from '../components/MotionSection'
import { SectionHeading } from '../components/SectionHeading'
import { Icon } from '../components/Icon'
import { useHead } from '../lib/seo'
import { lumaHover, lumaPress } from '../lib/lumaMotion'

const offerCodes = ['hospital', 'education', 'business', 'building', 'dowry', 'wedding']

const offerNames: Record<string, string> = {
  hospital: 'Hospital Insurance',
  education: 'Education Support',
  business: 'Business Support',
  building: 'Building Support',
  dowry: 'Dowry/Ruracio Support',
  wedding: 'Wedding Support',
}

const offerDescriptions: Record<string, string> = {
  hospital: 'Outpatient cover for consultation, lab tests and medicine.',
  education: 'School, college and university fees for you and your dependents.',
  business: 'Stock, equipment and expansion capital for your business.',
  building: 'Materials and labour help for building and improving your home.',
  dowry: 'Help with the costs of the traditional marriage ceremony.',
  wedding: 'Support with wedding expenses and event preparation.',
}

const offerIcons: Record<string, JSX.Element> = {
  hospital: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
    </svg>
  ),
  education: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
    </svg>
  ),
  business: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  ),
  building: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  dowry: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  ),
  wedding: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  ),
}

const whyChooseUs = [
  { title: 'Transparent Operations', description: 'Every contribution, waiting period, and payout is tracked and visible to you. No hidden terms.', icon: 'eye' as const },
  { title: 'Clear contribution records', description: 'Record monthly contributions in your account; administrators verify them against your packages.', icon: 'document' as const },
  { title: '12 Welfare Packages', description: 'Choose from hospital, education, business, building, bereavement, wedding, and more.', icon: 'folder' as const },
  { title: 'Community First', description: 'Members help each other. Your contributions directly support families in need.', icon: 'users' as const },
]

const trustFeatures = [
  { title: 'Account security', description: 'Sessions use encrypted connections and secure authentication. Keep your password private.', icon: 'lock' as const },
  { title: 'Audit Trail', description: 'Administrative actions are recorded so membership changes can be reviewed.', icon: 'document' as const },
  { title: 'Data Protection', description: 'Personal data is protected with access controls; see our Privacy Policy for details.', icon: 'shield' as const },
  { title: 'Verified Claims', description: 'Every claim is reviewed before approval. Fair and consistent process.', icon: 'check-circle' as const },
]

const faqItems = [
  { q: 'What is Luma Welfare?', a: 'Luma Welfare is a community welfare organisation that helps members support each other through key life events — hospital bills, education costs, business support, and more.' },
  { q: 'How do I join?', a: 'Click "Join Luma", create a free account, verify your email, pay the KSh 300 activation fee, then choose a welfare package that suits your needs.' },
  { q: 'How do contributions work?', a: 'Each package has a monthly contribution amount. Record your payment in your account; administrators verify it. You can see your contribution history anytime.' },
  { q: 'When can I submit a claim?', a: 'Each package has a waiting period. Once you have made enough contributions and the waiting period has passed, you become eligible to submit claims.' },
  { q: 'Is my information protected?', a: 'Sessions use encrypted connections and secure authentication. Administrative actions are logged. See our Privacy Policy for details.' },
  { q: 'Can I have multiple packages?', a: 'Yes. You can subscribe to multiple welfare packages simultaneously. Each package tracks contributions and eligibility independently.' },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-200/80 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-gray-900 pr-4">{q}</span>
        <svg className={`h-5 w-5 flex-shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-gray-600">{a}</p>}
    </div>
  )
}

function CtaButton({
  to,
  children,
  variant = 'solid',
}: {
  to: string
  children: React.ReactNode
  variant?: 'solid' | 'outline' | 'light'
}) {
  const reduceMotion = useReducedMotion()
  const styles =
    variant === 'solid'
      ? 'bg-white text-luma-800 shadow-lg hover:bg-gray-100'
      : variant === 'light'
        ? 'bg-white text-luma-800 shadow-lg hover:bg-gray-100'
        : 'border-2 border-white/30 text-white hover:bg-white/10'

  return (
    <motion.div whileHover={lumaHover.ctaStrong(Boolean(reduceMotion))} whileTap={lumaPress.default(Boolean(reduceMotion))}>
      <Link to={to} className={`inline-block rounded-xl px-8 py-3.5 text-sm font-bold transition-all ${styles}`}>
        {children}
      </Link>
    </motion.div>
  )
}

export function Home() {
  useHead(
    'Luma Welfare — Community Welfare Platform in Kenya',
    'Luma Welfare is a community welfare organization in Kenya. Members contribute monthly to support each other through key life events.',
  )

  return (
    <div>
      <OrganizationJsonLd />
      <HomeHero />

      <StatBar />

      {/* What We Offer */}
      <MotionSection className="py-16 lg:py-20">
        <div className="container-luma">
          <SectionHeading
            eyebrow="What We Offer"
            title="Our Welfare Packages"
            action={{ label: 'View All Packages →', to: '/packages' }}
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {offerCodes.map((code) => (
              <MotionCard key={code}>
                <Link
                  to="/packages"
                  className="glass-card luma-card-interactive group block p-7 transition-colors hover:border-luma-300"
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-50/90 text-luma-700 group-hover:bg-luma-100 transition-colors">
                    {offerIcons[code]}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{offerNames[code]}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{offerDescriptions[code]}</p>
                  <div className="mt-4 text-sm font-semibold text-luma-700 group-hover:text-luma-800">
                    Learn more →
                  </div>
                </Link>
              </MotionCard>
            ))}
          </div>
        </div>
      </MotionSection>

      {/* How it Works */}
      <MotionSection className="py-16 lg:py-20">
        <div className="container-luma">
          <SectionHeading
            align="center"
            eyebrow="How It Works"
            title="Four Simple Steps"
          />
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: '01', title: 'Register', text: 'Create your account with your name, email and phone number. It\'s free.' },
              { step: '02', title: 'Choose a Package', text: 'Browse 12 welfare packages and pick the ones that fit your family needs.' },
              { step: '03', title: 'Contribute Monthly', text: 'Record your monthly contribution in your account. Each package is tracked separately.' },
              { step: '04', title: 'Access Benefits', text: 'Once your waiting period is met, submit a claim and receive support.' },
            ].map((s) => (
              <MotionCard key={s.step} className="glass-card relative p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-luma-700 text-lg font-bold text-white shadow-sm shadow-luma-700/30">
                  {s.step}
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.text}</p>
              </MotionCard>
            ))}
          </div>
        </div>
      </MotionSection>

      {/* Why Choose Luma */}
      <MotionSection className="py-16 lg:py-20">
        <div className="container-luma">
          <SectionHeading
            align="center"
            eyebrow="Why Luma"
            title="Why Choose Luma Welfare"
            description="We combine community values with modern technology to deliver welfare services you can trust."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {whyChooseUs.map((item) => (
              <MotionCard key={item.title} className="glass-card p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-luma-50 text-luma-700" aria-hidden="true">
                  <Icon name={item.icon} className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
              </MotionCard>
            ))}
          </div>
        </div>
      </MotionSection>

      {/* Trust & Security */}
      <MotionSection className="py-16 lg:py-20">
        <div className="container-luma">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-luma-700">Your Security</span>
              <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Built on Trust &amp; Security</h2>
              <div className="mt-3 h-1 w-12 rounded-full bg-luma-500" />
              <p className="mt-4 text-gray-600 leading-relaxed">
                Your account uses encrypted connections and secure authentication. Contribution and
                claim records are visible to you; administrative actions are logged for accountability.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {trustFeatures.map((item) => (
                <MotionCard key={item.title} className="glass-card p-5" hover={false}>
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-luma-50 text-luma-700" aria-hidden="true">
                    <Icon name={item.icon} className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{item.description}</p>
                </MotionCard>
              ))}
            </div>
          </div>
        </div>
      </MotionSection>

      {/* FAQ */}
      <MotionSection className="py-16 lg:py-20">
        <div className="container-luma">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-luma-700">FAQ</span>
              <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Frequently Asked Questions</h2>
              <div className="mt-3 h-1 w-12 rounded-full bg-luma-500" />
              <p className="mt-4 text-gray-600">Everything you need to know about joining and using Luma Welfare.</p>
              <Link to="/faq" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-luma-700 hover:text-luma-800">
                View all FAQs →
              </Link>
            </div>
            <div className="glass-card p-6">
              {faqItems.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </div>
      </MotionSection>

      {/* CTA */}
      <MotionSection className="bg-luma-700 py-16 lg:py-20">
        <div className="container-luma text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to Secure Your Family&apos;s Future?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90">
            Register for free, choose a welfare package that fits your family, and contribute monthly
            with transparent tracking for every package you hold.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <CtaButton to="/register" variant="light">Join Luma</CtaButton>
            <Link to="/packages" className="text-sm font-semibold text-white/90 underline-offset-4 hover:underline">
              Explore packages
            </Link>
          </div>
          <p className="mt-4 text-xs text-white/70">One-time KSh 300 activation fee after registration</p>
        </div>
      </MotionSection>
    </div>
  )
}
