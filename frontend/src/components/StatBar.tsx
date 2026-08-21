import { useEffect, useState } from 'react'
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
    api<Record<string, { members: number; successful_claims: number | null; lives_touched: number | null; commitment: number }>>('/settings')
      .then((s) => setStats(s.stats ?? {}))
      .catch(() => {})
  }, [])

  const items: { label: string; value: string | null }[] = [
    { label: 'Members', value: stats.members != null ? String(stats.members) : null },
    { label: 'Successful Claims', value: stats.successful_claims == null ? 'Awaiting confirmation' : String(stats.successful_claims) },
    { label: 'Lives Touched', value: stats.lives_touched == null ? 'Awaiting confirmation' : String(stats.lives_touched) },
    { label: 'Commitment', value: stats.commitment != null ? `${stats.commitment}%` : null },
  ]

  return (
    <div className="border-y border-luma-100 bg-luma-50">
      <div className="container-luma grid grid-cols-2 gap-6 py-8 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className="text-3xl font-bold text-luma-700">{item.value ?? '—'}</div>
            <div className="mt-1 text-sm font-medium text-luma-900">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}