import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icon } from './Icon'
import { lumaHero, lumaDuration, lumaTransition, lumaDistance } from '../lib/lumaMotion'
import { MotionImage } from './MotionSection'
import { buttonClassName } from './ui'

const HERO_COPY =
  'Affordable welfare packages for key life events — hospital, education, business, building, and more. Track contributions and eligibility in one place.'

/**
 * Public homepage hero: brand-forward headline, one supporting line,
 * one primary CTA (Join) and one subordinate packages link.
 */
export function HomeHero() {
  const reduceMotion = useReducedMotion()

  return (
    <section
      aria-labelledby="home-hero-heading"
      className="relative overflow-hidden bg-white"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 top-8 h-64 w-64 rounded-full bg-luma-100/80 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-luma-200/50 blur-2xl" />
      </div>

      <div className="container-luma relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-12 lg:py-20">
        <motion.div
          className="relative z-10 min-w-0 max-w-xl"
          initial={reduceMotion ? false : lumaHero.initial}
          animate={lumaHero.animate}
          transition={lumaHero.transition(Boolean(reduceMotion))}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-luma-700">
            Luma Welfare
          </p>

          <h1
            id="home-hero-heading"
            className="mt-3 text-[1.85rem] font-extrabold leading-[1.08] tracking-tight text-luma-900 min-[375px]:text-4xl sm:text-5xl lg:text-[3.25rem]"
          >
            Together we build
            <br />
            <span className="text-luma-500">better lives</span>
          </h1>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-gray-600 sm:text-base">
            {HERO_COPY}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/register"
              className={buttonClassName({
                variant: 'primary',
                size: 'lg',
                className: 'px-6 font-bold',
              })}
            >
              Join Luma
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <Link
              to="/packages"
              className="text-sm font-semibold text-luma-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600 focus-visible:ring-offset-2 rounded"
            >
              View packages
            </Link>
          </div>
        </motion.div>

        <motion.div
          className="relative z-10 mx-auto w-full max-w-lg lg:max-w-none"
          initial={reduceMotion ? false : { opacity: 0, y: lumaDistance.enterY + 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={lumaTransition(lumaDuration.hero, Boolean(reduceMotion), {
            delay: reduceMotion ? 0 : 0.06,
          })}
        >
          <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl bg-luma-50 sm:max-w-lg lg:max-w-none">
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
        </motion.div>
      </div>
    </section>
  )
}
