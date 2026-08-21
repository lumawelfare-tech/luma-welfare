import { Link } from 'react-router-dom'
import { StatBar } from '../components/StatBar'

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

export function Home() {
  return (
    <div>
      {/* Hero — kept close to the existing copy */}
      <section className="bg-luma-950 text-white">
        <div className="container-luma grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-luma-500/50 bg-luma-900 px-3 py-1 text-xs font-medium text-luma-200">
              Trusted — Secure • Transparent
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Welcome to Luma Welfare — Together We Build Better Lives
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-luma-100">
              Empowering families through affordable welfare packages that provide financial
              support during key life events.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="rounded-md bg-gold-500 px-6 py-3 text-sm font-semibold text-luma-950 hover:bg-gold-400"
              >
                Join Now
              </Link>
              <Link
                to="/packages"
                className="rounded-md border border-luma-400 px-6 py-3 text-sm font-semibold text-luma-100 hover:bg-luma-800"
              >
                View Packages
              </Link>
            </div>
          </div>
          <div className="hidden justify-end lg:flex">
            <img
              src="/brand/luma-logo.jpeg"
              alt="Luma Welfare"
              className="max-h-80 rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      </section>

      <StatBar />

      {/* What We Offer */}
      <section className="container-luma py-14">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-luma-900 sm:text-3xl">What We Offer</h2>
            <p className="mt-2 text-stone-600">
              Six of the twelve support packages Luma members contribute to monthly.
            </p>
          </div>
          <Link to="/packages" className="hidden text-sm font-semibold text-luma-700 hover:underline sm:block">
            All packages →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offerCodes.map((code) => (
            <Link
              key={code}
              to="/packages"
              className="group rounded-xl border border-stone-200 bg-white p-6 transition hover:border-luma-300 hover:shadow-md"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-luma-50 text-luma-700">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
                </svg>
              </div>
              <h3 className="font-semibold text-luma-900">{offerNames[code]}</h3>
              <p className="mt-1 text-sm text-stone-600">{offerDescriptions[code]}</p>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center sm:hidden">
          <Link to="/packages" className="text-sm font-semibold text-luma-700 hover:underline">
            View all packages →
          </Link>
        </div>
      </section>

      {/* How it works teaser */}
      <section className="border-t border-stone-200 bg-white">
        <div className="container-luma grid gap-8 py-14 sm:grid-cols-3">
          {[
            { step: '1', title: 'Register', text: 'Create your account. An admin approves your membership before you join any package.' },
            { step: '2', title: 'Pay monthly', text: 'Contribute every month. Each package tracks its own contributions, on its own schedule.' },
            { step: '3', title: 'Access benefits', text: 'Once your waiting period is met, you can submit a claim against that package.' },
          ].map((s) => (
            <div key={s.step} className="flex gap-4">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-luma-600 font-bold text-white">
                {s.step}
              </div>
              <div>
                <h3 className="font-semibold text-luma-900">{s.title}</h3>
                <p className="mt-1 text-sm text-stone-600">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}