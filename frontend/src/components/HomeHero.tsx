import { Link } from 'react-router-dom'
import { Icon } from './Icon'

const HERO_COPY =
  'Empowering families through affordable welfare packages that provide financial support during key life events — hospital, education, business, building and more.'

const BENEFITS = [
  { label: 'Hospital Support', icon: 'heart', tone: 'bg-luma-600' },
  { label: 'Education Support', icon: 'document', tone: 'bg-brand-blue' },
  { label: 'Business Growth', icon: 'chart', tone: 'bg-gold-500' },
  { label: 'Building Support', icon: 'home', tone: 'bg-[#6B4C9A]' },
  { label: 'And More Benefits', icon: 'users', tone: 'bg-luma-700' },
] as const

/**
 * Premium public homepage hero — HTML content + family visual.
 * Routes: /register (Join Luma), /packages (View Packages).
 * Live stats (StatBar) render only confirmed figures from platform settings.
 */
export function HomeHero() {
  return (
    <section
      aria-labelledby="home-hero-heading"
      className="relative overflow-hidden bg-white"
    >
      {/* Soft organic backdrop — CSS only, non-interactive */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 top-8 h-64 w-64 rounded-full bg-luma-100/80 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-luma-200/50 blur-2xl" />
        <div className="absolute -right-16 top-1/3 h-72 w-72 rounded-full bg-luma-50 blur-3xl lg:hidden" />
        <svg
          className="absolute -left-6 bottom-16 h-36 w-28 text-luma-200/70 sm:h-44 sm:w-36"
          viewBox="0 0 120 160"
          fill="currentColor"
        >
          <ellipse cx="40" cy="90" rx="28" ry="48" transform="rotate(-25 40 90)" />
          <ellipse cx="78" cy="70" rx="22" ry="40" transform="rotate(18 78 70)" />
          <ellipse cx="58" cy="120" rx="18" ry="34" transform="rotate(-8 58 120)" />
        </svg>
      </div>

      <div className="container-luma relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-12 lg:py-20">
        {/* LEFT — content */}
        <div className="relative z-10 min-w-0 max-w-xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-luma-800 shadow-sm sm:text-xs">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-luma-500" aria-hidden="true" />
            Welcome to Luma Welfare
          </div>

          <h1
            id="home-hero-heading"
            className="text-[1.85rem] font-extrabold leading-[1.08] tracking-tight text-luma-900 min-[375px]:text-4xl sm:text-5xl lg:text-[3.25rem]"
          >
            TOGETHER WE
            <br />
            <span className="text-luma-500">BUILD BETTER</span>
            <br />
            LIVES
          </h1>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-gray-600 sm:text-base">
            {HERO_COPY}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-luma-600 px-6 py-3 text-sm font-bold text-white shadow-sm shadow-luma-700/20 transition-colors hover:bg-luma-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600 focus-visible:ring-offset-2"
            >
              <Icon name="user" className="h-4 w-4" />
              Join Luma
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <Link
              to="/packages"
              className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-luma-600 bg-white px-6 py-3 text-sm font-bold text-luma-700 transition-colors hover:bg-luma-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600 focus-visible:ring-offset-2"
            >
              View Packages
            </Link>
          </div>

          <ul className="mt-9 flex gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
            {BENEFITS.map((b) => (
              <li
                key={b.label}
                className="flex w-[4.75rem] flex-none flex-col items-center gap-2 text-center sm:w-auto sm:min-w-[5.25rem]"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-sm ${b.tone}`}
                  aria-hidden="true"
                >
                  <Icon name={b.icon} className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-semibold leading-tight text-luma-900 sm:text-[11px]">
                  {b.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* RIGHT — family visual + logo */}
        <div className="relative z-10 mx-auto w-full max-w-lg lg:max-w-none">
          <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-[2rem] bg-luma-50 sm:max-w-lg lg:max-w-none">
            {/* Soft green curve accents */}
            <div
              className="pointer-events-none absolute -left-8 top-6 z-[1] h-28 w-28 rounded-full border-[6px] border-luma-400/50 sm:h-36 sm:w-36"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-8 -right-10 z-[1] h-40 w-56 rounded-[45%] bg-luma-700 sm:h-48 sm:w-64"
              aria-hidden="true"
            />
            <p
              className="pointer-events-none absolute bottom-5 right-5 z-[2] max-w-[9.5rem] text-right font-serif text-sm italic leading-snug text-white sm:bottom-7 sm:right-7 sm:max-w-[11rem] sm:text-base"
              aria-hidden="true"
            >
              Stronger Families
              <br />
              Brighter Futures
            </p>

            <picture>
              <source srcSet="/brand/hero-family.webp" type="image/webp" />
              <img
                src="/brand/hero-family.jpeg"
                alt="A smiling Kenyan family — the community Luma Welfare supports"
                width={533}
                height={405}
                decoding="async"
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover object-[center_25%]"
              />
            </picture>
          </div>

          <div className="absolute -top-2 right-2 z-[3] rounded-2xl bg-white/95 p-2 shadow-sm ring-1 ring-gray-100 sm:top-0 sm:right-4 sm:p-2.5">
            <img
              src="/brand/luma-logo.jpeg"
              alt="Luma Welfare logo"
              width={112}
              height={112}
              decoding="async"
              className="h-14 w-14 object-contain sm:h-16 sm:w-16"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
