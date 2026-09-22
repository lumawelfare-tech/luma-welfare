import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useHead } from '../../lib/seo'
import { PageHeader } from '../../components/PageHeader'
import { AI_ASSISTANT_DISABLED_COPY, isAiAssistantUiEnabled } from '../../lib/aiUi'

type Source = { type: string; id: string; title: string }

type AssistantResponse = {
  answer?: string
  sources?: Source[]
  mode?: string
  message?: string
  code?: string
}

/**
 * Member hybrid help assistant — FAQ + approved org KB only.
 * Cannot approve claims/payments or read private member data.
 */
export function MemberAssistant() {
  useHead('Help assistant', undefined, { noindex: true })
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [mode, setMode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const uiEnabled = isAiAssistantUiEnabled()

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAnswer(null)
    setSources([])
    setMode(null)
    if (query.trim().length < 3) {
      setError('Enter a short question (at least 3 characters).')
      return
    }
    setBusy(true)
    try {
      const d = await api<AssistantResponse>('/member/assistant', {
        method: 'POST',
        auth: true,
        body: { query: query.trim() },
      })
      setAnswer(d.answer ?? d.message ?? 'No answer returned.')
      setSources(d.sources ?? [])
      setMode(d.mode ?? null)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AI_DISABLED') {
        setError(AI_ASSISTANT_DISABLED_COPY)
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not reach the assistant.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
      <PageHeader
        title="Help assistant"
        description="General Luma Welfare guidance from FAQ and approved member documents. It cannot approve claims, verify payments, or view your private records."
        breadcrumbs={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Help assistant' },
        ]}
      />

      {!uiEnabled && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {AI_ASSISTANT_DISABLED_COPY}{' '}
          <Link to="/faq" className="font-medium underline">Open FAQ</Link>
          {' · '}
          <Link to="/documents" className="font-medium underline">Documents</Link>
        </p>
      )}

      <form onSubmit={ask} className="glass-panel space-y-3 p-5">
        <label htmlFor="assistant-query" className="block text-xs font-medium text-gray-600">Your question</label>
        <textarea
          id="assistant-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. How do I submit a claim? Is M-Pesa live?"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-luma-500 focus:bg-white"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-lg bg-luma-700 px-4 text-sm font-semibold text-white hover:bg-luma-800 disabled:opacity-50"
        >
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>
      )}

      {answer && (
        <section className="mt-6 rounded-xl border border-gray-100 bg-white p-5" aria-live="polite">
          {mode && (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Mode: {mode}
            </p>
          )}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{answer}</p>
          {sources.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500">Sources</p>
              <ul className="mt-1 space-y-1 text-xs text-gray-600">
                {sources.map((s) => (
                  <li key={`${s.type}-${s.id}`}>{s.title} <span className="text-gray-400">({s.type})</span></li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <p className="mt-8 text-xs text-gray-400">
        For account-specific actions, use Claims, Contributions, or contact support. This assistant never changes claim or payment status.
      </p>
    </div>
  )
}
