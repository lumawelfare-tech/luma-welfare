import { useState, useEffect } from 'react'

type Shortcut = { keys: string; description: string }

const defaultShortcuts: Shortcut[] = [
  { keys: 'Ctrl+R', description: 'Refresh data' },
  { keys: 'Ctrl+K', description: 'Focus search' },
  { keys: 'Ctrl+Shift+E', description: 'Export' },
  { keys: 'Ctrl+N', description: 'New item' },
  { keys: 'Esc', description: 'Close modal / panel' },
]

export function ShortcutHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-bold text-gray-900">Keyboard Shortcuts</h3>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          {defaultShortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{s.description}</span>
              <kbd className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-mono text-gray-500">{s.keys}</kbd>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 px-6 py-3 text-center">
          <p className="text-xs text-gray-400">Press <kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-[10px] font-mono">?</kbd> to toggle this panel</p>
        </div>
      </div>
    </div>
  )
}
