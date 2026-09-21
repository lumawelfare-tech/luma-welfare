import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { Icon } from './Icon'

const REVEAL_MS = 15_000

type IdRevealCellProps = {
  memberId: string
  masked: string
}

/**
 * Shows masked national ID with an admin-only reveal control.
 * Full ID is fetched on demand (never from the list payload) and auto-hides.
 */
export function IdRevealCell({ memberId, masked }: IdRevealCellProps) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hide = useCallback(() => {
    setRevealed(null)
    setError(null)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => hide(), [hide, memberId])

  async function reveal() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const d = await api<{ id_number: string }>(
        `/admin/reveal-member-id?member_id=${encodeURIComponent(memberId)}`,
        { method: 'POST', auth: true, body: {} },
      )
      setRevealed(d.id_number)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(hide, REVEAL_MS)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reveal ID.')
      setRevealed(null)
    } finally {
      setBusy(false)
    }
  }

  const display = revealed ?? (masked && masked !== '—' ? masked : '—')
  const incomplete = !masked || masked === '—'

  return (
    <div className="flex min-h-[44px] items-center gap-2">
      <span className={`font-mono text-xs ${incomplete ? 'text-gray-400' : 'text-gray-800'}`}>
        {display}
      </span>
      {!incomplete && (
        <button
          type="button"
          onClick={() => (revealed ? hide() : void reveal())}
          disabled={busy}
          className="touch-target inline-flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          aria-label={revealed ? 'Hide national ID' : 'Reveal national ID'}
          title={revealed ? 'Hide' : 'Reveal for 15 seconds'}
        >
          <Icon name={revealed ? 'eye-off' : 'eye'} className="h-4 w-4" />
        </button>
      )}
      {error && (
        <span className="text-[10px] text-red-600" role="alert">{error}</span>
      )}
    </div>
  )
}
