import { Link } from 'react-router-dom'

const steps = [
  {
    title: 'Register',
    text: 'Create an account with your name, email and phone number. Your membership goes to an admin for approval. You cannot join packages until your account is approved.',
  },
  {
    title: 'Pay your monthly contribution',
    text: 'Join one or more packages, then contribute the package amount every month. Each package tracks its own contributions — the money for hospital cover does not count toward business support.',
  },
  {
    title: 'Wait for the required period',
    text: 'Most packages have a 12-month waiting period. Education Support has 6 months. The Welfare Package has no fixed waiting period, but your burial and emergency cover depends on your contributions staying current.',
  },
  {
    title: 'Access your benefits',
    text: "Once a package's waiting period is met and your contributions are up to date, you can submit a claim against that package. An admin reviews the claim, verifies the documents, and the payout is processed.",
  },
]

export function HowItWorks() {
  return (
    <div className="container-luma py-14">
      <h1 className="text-3xl font-bold text-luma-900 sm:text-4xl">How it works</h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        Four steps from joining to claiming. The exact waiting period and contribution for each
        package are on the Packages page.
      </p>

      <ol className="mt-10 space-y-8">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-5">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-luma-600 text-lg font-bold text-white">
              {i + 1}
            </div>
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold text-luma-900">{s.title}</h2>
              <p className="mt-1 leading-relaxed text-stone-700">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-12 rounded-xl border border-luma-200 bg-luma-50 p-6 max-w-2xl">
        <h2 className="font-semibold text-luma-900">A note on payouts</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          The exact payout amount per package is still being confirmed with the Luma committee.
          Two benefit models have appeared in printed materials — a flat KSh 100,000 after six
          months, and a payout tied to how much you contribute. The platform is built to support
          either rule; the final figure will be published here once confirmed.
        </p>
        <Link to="/contact" className="mt-4 inline-block text-sm font-semibold text-luma-700 hover:underline">
          Ask us a question →
        </Link>
      </div>
    </div>
  )
}