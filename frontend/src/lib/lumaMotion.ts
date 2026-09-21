/**
 * Luma Motion System — single source of truth for motion across the app.
 *
 * Timing standard (CSS: --motion-*):
 *   micro   150ms   — micro-interactions (press, backdrop, toast exit)
 *   fast    200ms   — menus, buttons, controls, hover
 *   normal  300ms   — page / modal / toast enter (250–350ms band)
 *   section 450ms   — scroll reveals (400–500ms)
 *   hero    600ms   — hero entrances (500–650ms)
 *   data   1000ms   — statistics / progress (800–1200ms)
 *
 * Prefer transform + opacity. Avoid layout props (width/height/top/left)
 * unless there is a specific UX reason (e.g. progress fill, nav shrink).
 *
 * Honour prefers-reduced-motion (callers pass `reduce` / use presets).
 */

import type { Transition, Variants } from 'framer-motion'

/** Cubic bezier shared by UI / page / reveal motion (CSS + Framer). */
export const LUMA_EASE_OUT = [0.22, 1, 0.36, 1] as const

export type LumaEaseOut = typeof LUMA_EASE_OUT

/** Durations in seconds (Framer Motion). Canonical names match CSS tokens. */
export const lumaDuration = {
  /** 150ms — micro-interactions */
  micro: 0.15,
  /** 200ms — menus, buttons, controls, hover */
  fast: 0.2,
  /** 300ms — page/modal/toast enter */
  normal: 0.3,
  /** 450ms — scroll reveals */
  section: 0.45,
  /** 600ms — hero entrances */
  hero: 0.6,
  /** 1000ms — statistics / progress */
  data: 1,

  // Aliases (prefer canonical names above)
  /** @deprecated use `normal` */
  ui: 0.3,
  /** @deprecated use `fast` */
  hover: 0.2,
  /** @deprecated use `section` */
  reveal: 0.45,
  /** @deprecated use `data` */
  countUp: 1,

  /** Indeterminate loaders only — continuous motion exception */
  loader: 1.15,
  loaderPulse: 2.2,
  loaderDot: 0.9,
} as const

/** Durations in milliseconds (CSS custom properties / Tailwind). */
export const lumaDurationMs = {
  micro: 150,
  fast: 200,
  normal: 300,
  section: 450,
  hero: 600,
  data: 1000,
  /** Aliases */
  ui: 300,
  hover: 200,
  reveal: 450,
} as const

/** Movement distances in px (transform only). */
export const lumaDistance = {
  /** Micro lift / nudge */
  microY: 2,
  enterY: 16,
  exitY: 8,
  revealY: 24,
  pageEnterY: 8,
  pageExitY: 4,
  modalY: 8,
  hoverY: -3,
  toastX: 40,
  toastExitX: 24,
  menuItemX: -8,
  dropdownY: -6,
  drawerX: -256,
  /** Member portal drawer is 18rem wide */
  drawerXWide: -288,
  /** Image reveal starts slightly scaled */
  imageScaleFrom: 1.03,
} as const

/** Scale feedback for press / soft press / CTA hover / modal. */
export const lumaScale = {
  press: 0.98,
  pressSoft: 0.985,
  pressIcon: 0.92,
  hoverCta: 1.02,
  hoverCtaStrong: 1.03,
  /** Card / media hover zoom (keep ≤ 1.05) */
  hoverImage: 1.03,
  /** Modal enter from */
  modalFrom: 0.97,
} as const

/**
 * Stagger delays (seconds): ~50–75ms between related elements,
 * capped so long lists never feel slow.
 */
export const lumaStagger = {
  /** ~60ms mid-band of 50–75ms */
  step: 0.06,
  menu: 0.05,
  max: 0.36,
} as const

export const lumaEase = {
  out: LUMA_EASE_OUT,
  cssOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  linear: 'linear' as const,
  inOut: 'easeInOut' as const,
  /** Shared drawer / sheet spring — damped for a stable, non-bouncy feel */
  drawerSpring: { type: 'spring' as const, stiffness: 380, damping: 38 },
  menuSpring: { type: 'spring' as const, stiffness: 380, damping: 36 },
}

/** Instant transition when reduced motion is preferred. */
export const lumaInstant: Transition = { duration: 0 }

export function lumaTransition(
  durationSec: number,
  reduce = false,
  extra?: Omit<Transition, 'duration' | 'ease'>,
): Transition {
  if (reduce) return { ...extra, duration: 0 }
  return { duration: durationSec, ease: LUMA_EASE_OUT, ...extra }
}

/** Stagger delay for list index `i`, capped at lumaStagger.max. */
export function lumaStaggerDelay(i: number, step = lumaStagger.step): number {
  return Math.min(i * step, lumaStagger.max)
}

// ─── Presets (transform + opacity) ──────────────────────────────────────────

export const lumaEntrance = {
  initial: { opacity: 0, y: lumaDistance.enterY },
  animate: { opacity: 1, y: 0 },
  transition: (reduce = false): Transition => lumaTransition(lumaDuration.section, reduce),
}

export const lumaHero = {
  initial: { opacity: 0, y: lumaDistance.enterY },
  animate: { opacity: 1, y: 0 },
  transition: (reduce = false, delay = 0): Transition =>
    lumaTransition(lumaDuration.hero, reduce, { delay }),
}

export const lumaExit = {
  exit: { opacity: 0, y: lumaDistance.exitY },
  transition: (reduce = false): Transition => lumaTransition(lumaDuration.micro, reduce),
}

export const lumaHover = {
  lift: (reduce = false) =>
    reduce ? undefined : { y: lumaDistance.hoverY, transition: { duration: lumaDuration.fast } },
  cta: (reduce = false) =>
    reduce ? undefined : { scale: lumaScale.hoverCta, transition: { duration: lumaDuration.fast } },
  ctaStrong: (reduce = false) =>
    reduce
      ? undefined
      : { scale: lumaScale.hoverCtaStrong, transition: { duration: lumaDuration.fast } },
}

export const lumaPress = {
  default: (reduce = false) => (reduce ? undefined : { scale: lumaScale.press }),
  soft: (reduce = false) => (reduce ? undefined : { scale: lumaScale.pressSoft }),
  icon: (reduce = false) => (reduce ? undefined : { scale: lumaScale.pressIcon }),
}

export const lumaPage = {
  initial: { opacity: 0, y: lumaDistance.pageEnterY },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: lumaDistance.pageExitY },
  transition: (reduce = false): Transition => lumaTransition(lumaDuration.normal, reduce),
}

export const lumaModal = {
  backdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: (reduce = false): Transition => lumaTransition(lumaDuration.micro, reduce),
  },
  panel: {
    initial: { opacity: 0, y: lumaDistance.modalY, scale: lumaScale.modalFrom },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: lumaDistance.exitY, scale: lumaScale.modalFrom },
    /** Slightly faster close than open */
    transition: (reduce = false, closing = false): Transition =>
      lumaTransition(closing ? lumaDuration.fast : lumaDuration.normal, reduce),
  },
}

export const lumaReveal = {
  initial: { opacity: 0, y: lumaDistance.revealY },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true as const, margin: '-48px 0px' },
  transition: (reduce = false, delay = 0): Transition =>
    lumaTransition(lumaDuration.section, reduce, { delay }),
}

/** Subtle image zoom-out reveal (overflow-hidden parent). */
export const lumaImage = {
  initial: { opacity: 0, scale: lumaDistance.imageScaleFrom },
  whileInView: { opacity: 1, scale: 1 },
  viewport: { once: true as const, margin: '-32px 0px' },
  transition: (reduce = false): Transition => lumaTransition(lumaDuration.hero, reduce),
}

export const lumaFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: (reduce = false): Transition => lumaTransition(lumaDuration.fast, reduce),
}

export const lumaToast = {
  initial: { opacity: 0, x: lumaDistance.toastX, y: 8 },
  animate: { opacity: 1, x: 0, y: 0 },
  exit: (reduce = false) =>
    reduce
      ? { opacity: 0 }
      : { opacity: 0, x: lumaDistance.toastExitX, transition: { duration: lumaDuration.micro } },
  transition: (reduce = false): Transition => lumaTransition(lumaDuration.normal, reduce),
}

export const lumaDropdown = {
  initial: { opacity: 0, y: lumaDistance.dropdownY },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: (reduce = false): Transition => lumaTransition(lumaDuration.micro, reduce),
}

export const lumaDrawer = {
  initial: { x: lumaDistance.drawerX },
  animate: { x: 0 },
  exit: { x: lumaDistance.drawerX },
  transition: (reduce = false): Transition =>
    reduce ? lumaInstant : lumaEase.drawerSpring,
}

export const lumaMenuItem = {
  initial: { opacity: 0, x: lumaDistance.menuItemX },
  animate: { opacity: 1, x: 0 },
  transition: (reduce = false, i = 0): Transition =>
    reduce
      ? lumaInstant
      : { delay: i * lumaStagger.menu, duration: lumaDuration.fast, ease: LUMA_EASE_OUT },
}

/** Fade-up variants for staggered list entrance (Packages, etc.). */
export function lumaListItemVariants(reduce = false): Variants {
  return {
    hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: lumaDistance.enterY },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: reduce
        ? lumaInstant
        : { delay: lumaStaggerDelay(i), duration: lumaDuration.normal, ease: LUMA_EASE_OUT },
    }),
  }
}

/**
 * Aggregate export for discoverability.
 * Prefer named exports (`lumaDuration`, `lumaPage`, …) in call sites.
 */
export const lumaMotion = {
  duration: lumaDuration,
  durationMs: lumaDurationMs,
  distance: lumaDistance,
  scale: lumaScale,
  stagger: lumaStagger,
  ease: lumaEase,
  entrance: lumaEntrance,
  hero: lumaHero,
  exit: lumaExit,
  hover: lumaHover,
  press: lumaPress,
  page: lumaPage,
  modal: lumaModal,
  reveal: lumaReveal,
  image: lumaImage,
  fade: lumaFade,
  toast: lumaToast,
  dropdown: lumaDropdown,
  drawer: lumaDrawer,
  menuItem: lumaMenuItem,
  listItemVariants: lumaListItemVariants,
  transition: lumaTransition,
  staggerDelay: lumaStaggerDelay,
  instant: lumaInstant,
} as const
