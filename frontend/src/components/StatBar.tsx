import { type JSX, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { api } from '../lib/api'
import { SkeletonRow } from './Skeleton'

type Stats = {
  members?: number | null
  successful_claims?: number | null
  lives_touched?: number | null
  commitment?: number | null
}

type StatItem = {
  label: string
  target: number
  suffix: string
  icon: JSX.Element
}

function isConfirmedNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function CountUpValue({
  target,
  suffix,
  active,
}: {
  target: number
  suffix: string
  active: boolean
}) {
  const reduceMotion = useReducedMotion()
  const skipAnim = Boolean(reduceMotion) || import.meta.env.MODE === 'test'
  const [display, setDisplay] = useState(() => (skipAnim ? target : 0))

  useEffect(() => {
    if (skipAnim) {
      setDisplay(target)
      return
    }
    if (!active) return

    let frame = 0
    const duration = 900
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration))
      const eased = 1 - (1 - t) ** 3
      setDisplay(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, active, skipAnim])

  return <>{`${display.toLocaleString()}${suffix}`}</>
}

/**
 * Homepage stats from platform_settings.stats (via public-data).
 * Only renders tiles with confirmed numeric values — never holding-state
 * copy or fabricated figures. Omits the whole bar when nothing confirmed
 * is available (or the request fails).
 */
export function StatBar() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading')
  const [inView, setInView] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api<Record<string, Stats>>('/settings?resource=settings')
      .then((s) => {
        if (cancelled) return
        setStats(s.stats ?? {})
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStats(null)
        setStatus('empty')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const el = sectionRef.current
    if (!el || status !== 'ready') return

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [status])

  if (status === 'loading') {
    return (
      <div className="relative overflow-hidden bg-luma-800" aria-busy="true" aria-label="Loading statistics">
        <div className="container-luma relative grid grid-cols-2 gap-6 py-12 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-3">
              <SkeletonRow className="h-14 w-14 rounded-full bg-white/15" />
              <SkeletonRow className="h-8 w-16 bg-white/20" />
              <SkeletonRow className="h-3 w-24 bg-white/15" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (status === 'empty' || !stats) return null

  const items: StatItem[] = []

  if (isConfirmedNumber(stats.members)) {
    items.push({
      label: 'Members',
      target: stats.members,
      suffix: '+',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    })
  }

  if (isConfirmedNumber(stats.successful_claims)) {
    items.push({
      label: 'Successful Claims',
      target: stats.successful_claims,
      suffix: '+',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    })
  }

  if (isConfirmedNumber(stats.lives_touched)) {
    items.push({
      label: 'Lives Touched',
      target: stats.lives_touched,
      suffix: '+',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      ),
    })
  }

  if (isConfirmedNumber(stats.commitment)) {
    items.push({
      label: 'Commitment',
      target: stats.commitment,
      suffix: '%',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ),
    })
  }

  if (items.length === 0) return null

  const cols =
    items.length === 1
      ? 'grid-cols-1'
      : items.length === 2
        ? 'grid-cols-2'
        : items.length === 3
          ? 'grid-cols-1 sm:grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-4'

  return (
    <div ref={sectionRef} className="relative overflow-hidden bg-luma-800">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
      <div className={`container-luma relative grid ${cols} gap-6 py-12`}>
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm">
              {item.icon}
            </div>
            <div className="text-2xl font-extrabold text-white sm:text-3xl tabular-nums">
              <CountUpValue target={item.target} suffix={item.suffix} active={inView} />
            </div>
            <div className="mt-1 text-sm font-medium text-white/80">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
