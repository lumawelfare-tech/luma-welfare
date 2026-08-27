import { type JSX, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatBar } from '../components/StatBar'
import { useHead } from '../lib/seo'

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
  { title: 'Transparent Operations', description: 'Every contribution, waiting period, and payout is tracked and visible to you. No hidden terms.', icon: '🔍' },
  { title: 'M-Pesa Integration', description: 'Pay contributions directly via M-Pesa. Fast, secure, and familiar.', icon: '📱' },
  { title: '12 Welfare Packages', description: 'Choose from hospital, education, business, building, bereavement, wedding, and more.', icon: '📦' },
  { title: 'Community First', description: 'Members help each other. Your contributions directly support families in need.', icon: '🤝' },
]

const trustFeatures = [
  { title: 'Secure Payments', description: 'All transactions are processed through encrypted channels. Your money is handled with care.', icon: '🔒' },
  { title: 'Audit Trail', description: 'Every financial transaction is recorded in an immutable ledger for complete accountability.', icon: '📋' },
  { title: 'Data Protection', description: 'Your personal information is encrypted and never shared with third parties.', icon: '🛡️' },
  { title: 'Verified Claims', description: 'Every claim is reviewed and verified before approval. Fair and consistent process.', icon: '✅' },
]

const faqItems = [
  { q: 'What is Luma Welfare?', a: 'Luma Welfare is a community welfare organisation that helps members support each other through key life events — hospital bills, education costs, business support, and more.' },
  { q: 'How do I join?', a: 'Click "Join Now", create a free account, verify your email, pay the KSh 300 activation fee, then choose a welfare package that suits your needs.' },
  { q: 'How do contributions work?', a: 'Each package has a monthly contribution amount. Pay via M-Pesa. Your payments are tracked automatically and you can see your history anytime.' },
  { q: 'When can I submit a claim?', a: 'Each package has a waiting period. Once you have made enough contributions and the waiting period has passed, you become eligible to submit claims.' },
  { q: 'Is my money safe?', a: 'Yes. All payments are processed through secure M-Pesa integration. Every transaction is recorded in an immutable audit ledger.' },
  { q: 'Can I have multiple packages?', a: 'Yes. You can subscribe to multiple welfare packages simultaneously. Each package tracks contributions and eligibility independently.' },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-gray-900 pr-4">{q}</span>
        <svg className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <p className="pb-4 text-sm leading-relaxed text-gray-600">{a}</p>}
    </div>
  )
}

export function Home() {
  useHead('Home', 'Luma Welfare is a community welfare organization in Kenya. Members contribute monthly to support each other through key life events.')
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-luma-800 via-luma-700 to-luma-900">
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-luma-600/20" />
        <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-luma-500/10" />
        <div className="container-luma relative grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div className="relative z-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              WELCOME TO LUMA WELFARE
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              TOGETHER WE
              <br />
              <span className="text-green-300">BUILD BETTER</span>
              <br />
              LIVES
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/80">
              Empowering families through affordable welfare packages that provide financial
              support during key life events — hospital, education, business, building and more.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/register"
                className="rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-luma-800 shadow-lg hover:bg-gray-100 hover:shadow-xl transition-all"
              >
                Join Luma — It&apos;s Free to Start
              </Link>
              <Link
                to="/packages"
                className="rounded-xl border-2 border-white/30 px-8 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-all"
              >
                View Packages
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-white/80">Trusted by Kenyan families</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="text-sm font-medium text-white/80">Secure &amp; Transparent</span>
              </div>
            </div>
          </div>
          <div className="hidden justify-center lg:flex">
            <div className="relative">
              <img
                src="/brand/luma-logo.jpeg"
                alt="Luma Welfare — Community Welfare Organization"
                className="max-h-80 rounded-3xl object-contain shadow-2xl"
              />
              <div className="absolute -bottom-4 -left-4 rounded-2xl bg-white px-4 py-3 shadow-xl">
                <div className="text-2xl font-bold text-luma-700">12+</div>
                <div className="text-xs font-medium text-gray-500">Welfare Packages</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Statistics Bar */}
      <StatBar />

      {/* What We Offer */}
      <section className="bg-gray-50 py-16 lg:py-20">
        <div className="container-luma">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-luma-600">What We Offer</span>
              <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Our Welfare Packages</h2>
              <div className="mt-3 h-1 w-12 rounded-full bg-luma-500" />
            </div>
            <Link to="/packages" className="hidden rounded-lg border border-luma-200 px-5 py-2.5 text-sm font-semibold text-luma-700 hover:bg-luma-50 transition-all sm:block">
              View All Packages →
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {offerCodes.map((code) => (
              <Link
                key={code}
                to="/packages"
                className="group rounded-2xl border border-gray-200 bg-white p-7 transition-all hover:border-luma-300 hover:shadow-lg hover:-translate-y-1"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-luma-50 text-luma-600 group-hover:bg-luma-100 transition-colors">
                  {offerIcons[code]}
                </div>
                <h3 className="text-lg font-bold text-gray-900">{offerNames[code]}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{offerDescriptions[code]}</p>
                <div className="mt-4 text-sm font-semibold text-luma-600 group-hover:text-luma-700">
                  Learn more →
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center sm:hidden">
            <Link to="/packages" className="rounded-lg bg-luma-700 px-6 py-3 text-sm font-semibold text-white hover:bg-luma-800">
              View all packages
            </Link>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="bg-white py-16 lg:py-20">
        <div className="container-luma">
          <div className="text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-luma-600">How It Works</span>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Four Simple Steps</h2>
            <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-luma-500" />
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: '01', title: 'Register', text: 'Create your account with your name, email and phone number. It\'s free.' },
              { step: '02', title: 'Choose a Package', text: 'Browse 12 welfare packages and pick the ones that fit your family needs.' },
              { step: '03', title: 'Contribute Monthly', text: 'Pay your monthly contribution via M-Pesa. Each package is tracked separately.' },
              { step: '04', title: 'Access Benefits', text: 'Once your waiting period is met, submit a claim and receive support.' },
            ].map((s) => (
              <div key={s.step} className="relative rounded-2xl border border-gray-100 bg-gray-50 p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-luma-700 text-lg font-bold text-white">
                  {s.step}
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Luma */}
      <section className="bg-gray-50 py-16 lg:py-20">
        <div className="container-luma">
          <div className="text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-luma-600">Why Luma</span>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Why Choose Luma Welfare</h2>
            <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-luma-500" />
            <p className="mx-auto mt-4 max-w-2xl text-gray-500">We combine community values with modern technology to deliver welfare services you can trust.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {whyChooseUs.map((item) => (
              <div key={item.title} className="rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:shadow-lg hover:-translate-y-1">
                <div className="mb-4 text-3xl">{item.icon}</div>
                <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Security */}
      <section className="bg-white py-16 lg:py-20">
        <div className="container-luma">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-luma-600">Your Security</span>
              <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Built on Trust &amp; Security</h2>
              <div className="mt-3 h-1 w-12 rounded-full bg-luma-500" />
              <p className="mt-4 text-gray-500 leading-relaxed">
                Your contributions and personal data are protected by industry-standard security.
                Every transaction is recorded in an immutable audit ledger. No shortcuts, no compromises.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {trustFeatures.map((item) => (
                <div key={item.title} className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <div className="mb-2 text-2xl">{item.icon}</div>
                  <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-16 lg:py-20">
        <div className="container-luma">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-luma-600">FAQ</span>
              <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">Frequently Asked Questions</h2>
              <div className="mt-3 h-1 w-12 rounded-full bg-luma-500" />
              <p className="mt-4 text-gray-500">Everything you need to know about joining and using Luma Welfare.</p>
              <Link to="/faq" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-luma-600 hover:text-luma-700">
                View all FAQs →
              </Link>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              {faqItems.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-luma-700 py-16 lg:py-20">
        <div className="container-luma text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to Secure Your Family&apos;s Future?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
            Join Kenyan families who trust Luma Welfare for affordable, transparent community support.
            Registration is free — pay only when you choose a package.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/register"
              className="rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-luma-800 shadow-lg hover:bg-gray-100 transition-all"
            >
              Join Now — Free Registration
            </Link>
            <Link
              to="/packages"
              className="rounded-xl border-2 border-white/30 px-8 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-all"
            >
              Explore Packages
            </Link>
          </div>
          <p className="mt-4 text-xs text-white/60">One-time KSh 300 activation fee after registration</p>
        </div>
      </section>
    </div>
  )
}
