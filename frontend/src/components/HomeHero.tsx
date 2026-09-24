import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icon } from './Icon'
import { lumaHero, lumaDuration, lumaTransition, lumaDistance } from '../lib/lumaMotion'
import { MotionImage } from './MotionSection'
import { buttonClassName } from './ui'
import { siteConfig } from '../config/siteConfig'

const HERO_COPY =
  'Empowering families through affordable welfare packages that provide financial support during key life events — outpatient hospital, education, business, building, and more.'

const HIGHLIGHTS = [
  { label: 'Outpatient Hospital', icon: 'plus' as const, circle: 'bg-luma-100 text-luma-700' },
  { label: 'Education Support', icon: 'academic' as const, circle: 'bg-brand-blue-light text-brand-blue' },
  { label: 'Business Support', icon: 'chart' as const, circle: 'bg-amber-50 text-gold-600' },
  { label: 'Building Support', icon: 'home' as const, circle: 'bg-violet-100 text-violet-700' },
  { label: 'And more', icon: 'users' as const, circle: 'bg-luma-100 text-luma-700' },
] as const

function AcademicCapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
    </svg>
  )
}

/**
 * Public homepage hero only. Do not import these layout classes elsewhere.
 */
export function HomeHero() {
  const reduceMotion = useReducedMotion()

  return (
    <section
      aria-labelledby="home-hero-heading"
      className="home-hero relative overflow-hidden bg-gradient-to-br from-white via-luma-50 to-luma-100"
    >
      <div className="container-luma relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-12 lg:py-20">
        <motion.div
          className="relative z-10 min-w-0 max-w-xl"
          initial={reduceMotion ? false : lumaHero.initial}
          animate={lumaHero.animate}
          transition={lumaHero.transition(Boolean(reduceMotion))}
        >
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-luma-800 shadow-sm ring-1 ring-luma-100">
            <span className="h-1.5 w-1.5 rounded-full bg-luma-600" aria-hidden="true" />
            Welcome to Luma Welfare
          </p>

          <h1
            id="home-hero-heading"
            className="mt-4 text-[1.85rem] font-extrabold leading-[1.08] tracking-tight text-luma-900 min-[375px]:text-4xl sm:text-5xl lg:text-[3.25rem]"
          >
            Together We
            <br />
            <span className="text-luma-500">Build Better Lives</span>
          </h1>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-gray-600 sm:text-base">
            {HERO_COPY}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              to="/register"
              className={buttonClassName({
                variant: 'primary',
                size: 'lg',
                className: 'w-full px-6 font-bold sm:w-auto',
              })}
            >
              <Icon name="users" className="h-4 w-4" />
              Join Luma
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <Link
              to="/packages"
              className={buttonClassName({
                variant: 'secondary',
                size: 'lg',
                className: 'w-full px-6 font-bold sm:w-auto',
              })}
            >
              View Packages
            </Link>
          </div>

          <ul className="mt-8 flex gap-4 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {HIGHLIGHTS.map((item) => (
              <li key={item.label} className="flex w-[4.75rem] shrink-0 flex-col items-center text-center sm:w-20">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${item.circle}`}>
                  {item.icon === 'academic'
                    ? <AcademicCapIcon className="h-5 w-5" />
                    : <Icon name={item.icon} className="h-5 w-5" />}
                </span>
                <span className="mt-2 text-[11px] font-bold leading-tight text-luma-900">{item.label}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className="relative z-10 mx-auto w-full max-w-lg lg:max-w-none"
          initial={reduceMotion ? false : { opacity: 0, y: lumaDistance.enterY + 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={lumaTransition(lumaDuration.hero, Boolean(reduceMotion), {
            delay: reduceMotion ? 0 : 0.06,
          })}
        >
          <svg
            className="pointer-events-none absolute -right-6 -top-8 h-[118%] w-[118%] text-luma-200/80"
            viewBox="0 0 200 180"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M28 86 L100 28 L172 86 V156 H132 V118 H68 V156 H28 Z"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path d="M68 156 V118 H132 V156" stroke="currentColor" strokeWidth="5" />
          </svg>

          <div className="relative z-10 mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl bg-luma-100 ring-1 ring-luma-200/70 sm:max-w-lg lg:max-w-none">
            {/* Photo: existing /brand/hero-family until a licensed/approved Luma Welfare member or family photo is provided. */}
            <MotionImage className="absolute inset-0 h-full w-full">
              <picture>
                <source srcSet="/brand/hero-family.webp" type="image/webp" />
                <img
                  src="/brand/hero-family.jpeg"
                  alt="A smiling Kenyan family — the community Luma Welfare supports"
                  width={533}
                  height={405}
                  decoding="async"
                  fetchPriority="high"
                  className="h-full w-full object-cover object-[center_25%]"
                />
              </picture>
            </MotionImage>
          </div>

          <div className="absolute right-2 top-2 z-20 flex items-center gap-2 rounded-xl bg-white/90 px-2.5 py-1.5 shadow-sm ring-1 ring-luma-100 backdrop-blur-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-luma-700 text-[10px] font-bold text-white">
              LW
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-xs font-bold tracking-tight text-luma-800">{siteConfig.name}</p>
              <p className="text-[9px] font-medium uppercase tracking-wider text-luma-600">{siteConfig.tagline}</p>
            </div>
          </div>

          <div className="pointer-events-none absolute -bottom-1 -right-4 z-20 w-[min(100%,18rem)] sm:-right-2" aria-hidden="true">
            <svg className="h-24 w-full text-luma-800" viewBox="0 0 320 96" preserveAspectRatio="none">
              <path d="M0 72 C80 24 160 96 320 16 V96 H0 Z" fill="currentColor" />
            </svg>
            <p className="absolute inset-x-4 bottom-4 font-serif text-sm italic leading-tight text-white sm:text-base">
              Stronger Families
              <br />
              Brighter Futures
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
