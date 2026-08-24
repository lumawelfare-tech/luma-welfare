import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'

const steps = [
  {
    step: '01',
    title: 'Register',
    text: 'Create an account with your name, email and phone number. Verify your email, and you\'re ready to explore packages and start contributing.',
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
    ),
  },
  {
    step: '02',
    title: 'Pay your monthly contribution',
    text: 'Join one or more packages, then contribute the package amount every month. Each package tracks its own contributions — the money for hospital cover does not count toward business support.',
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    step: '03',
    title: 'Wait for the required period',
    text: 'Most packages have a 12-month waiting period. Education Support has 6 months. The Welfare Package has no fixed waiting period, but your burial and emergency cover depends on your contributions staying current.',
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    step: '04',
    title: 'Access your benefits',
    text: "Once a package's waiting period is met and your contributions are up to date, you can submit a claim against that package. An admin reviews the claim, verifies the documents, and the payout is processed.",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

export function HowItWorks() {
  useHead('How It Works', 'Four steps from joining Luma Welfare to claiming benefits. Register, contribute monthly, wait, and access your benefits.')
  return (
    <div>
      {/* Page Hero */}
      <section className="bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="container-luma">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-300">Process</span>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">How It Works</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Four simple steps from joining to claiming. The exact waiting period and contribution for each
            package are on the Packages page.
          </p>
          <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />
        </div>
      </section>

      <div className="container-luma py-14">
        <ol className="space-y-6">
          {steps.map((s) => (
            <li key={s.title} className="flex gap-5 rounded-2xl border border-gray-100 bg-gray-50 p-6 transition-all hover:shadow-md hover:border-luma-200">
              <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-luma-700 text-white">
                {s.icon}
              </div>
              <div className="max-w-2xl">
                <div className="text-xs font-bold uppercase tracking-wider text-luma-500">Step {s.step}</div>
                <h2 className="mt-1 text-xl font-bold text-gray-900">{s.title}</h2>
                <p className="mt-2 leading-relaxed text-gray-600">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-2xl border border-luma-200 bg-luma-50 p-8 max-w-2xl">
          <h2 className="text-xl font-bold text-gray-900">A note on payouts</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            The exact payout amount per package is still being confirmed with the Luma committee.
            Two benefit models have appeared in printed materials — a flat KSh 100,000 after six
            months, and a payout tied to how much you contribute. The platform is built to support
            either rule; the final figure will be published here once confirmed.
          </p>
          <Link to="/contact" className="mt-4 inline-block rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 transition-all">
            Ask us a question →
          </Link>
        </div>
      </div>
    </div>
  )
}
