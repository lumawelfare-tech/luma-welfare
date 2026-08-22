import { type JSX, useEffect, useState } from 'react'
import { api } from '../lib/api'

type Stats = {
  members?: number
  successful_claims?: number | null
  lives_touched?: number | null
  commitment?: number
}

// Stats pull from platform_settings. The two unconfirmed figures
// (successful_claims, lives_touched) render as a holding state, never a number,
// until Luma confirms them — see Section 9.
export function StatBar() {
  const [stats, setStats] = useState<Stats>({})

  useEffect(() => {
    api<Record<string, { members: number; successful_claims: number | null; lives_touched: number | null; commitment: number }>>('/settings?resource=settings')
      .then((s) => setStats(s.stats ?? {}))
      .catch(() => {})
  }, [])

  const items: { label: string; value: string | null; icon: JSX.Element }[] = [
    {
      label: 'Happy Members',
      value: stats.members != null ? `${stats.members.toLocaleString()}+` : null,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
    {
      label: 'Successful Claims',
      value: stats.successful_claims == null ? 'Awaiting confirmation' : `${stats.successful_claims.toLocaleString()}+`,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Lives Touched',
      value: stats.lives_touched == null ? 'Awaiting confirmation' : `${stats.lives_touched.toLocaleString()}+`,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      ),
    },
    {
      label: 'Commitment',
      value: stats.commitment != null ? `${stats.commitment}%` : null,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="bg-luma-800">
      <div className="container-luma grid grid-cols-2 gap-6 py-12 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 text-white">
              {item.icon}
            </div>
            <div className="text-3xl font-extrabold text-white">{item.value ?? '—'}</div>
            <div className="mt-1 text-sm font-medium text-white/70">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
