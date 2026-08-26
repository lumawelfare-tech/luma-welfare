import { useEffect, useCallback } from 'react'

type KeyBinding = {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description: string
}

/**
 * Register global keyboard shortcuts.
 *
 * Usage:
 *   useKeyboardShortcuts([
 *     { key: 'k', ctrl: true, action: () => setSearchOpen(true), description: 'Search' },
 *     { key: 'Escape', action: () => setOpen(false), description: 'Close' },
 *   ])
 */
export function useKeyboardShortcuts(bindings: KeyBinding[]) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      for (const binding of bindings) {
        const ctrlMatch = binding.ctrl ? (e.ctrlKey || e.metaKey) : true
        const metaMatch = binding.meta ? e.metaKey : true
        const shiftMatch = binding.shift ? e.shiftKey : true
        const altMatch = binding.alt ? e.altKey : true
        const keyMatch = e.key.toLowerCase() === binding.key.toLowerCase()

        if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
          // Don't intercept if user is typing in an input
          const target = e.target as HTMLElement
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
            // Only allow Escape and Ctrl/Cmd shortcuts in inputs
            if (binding.key !== 'Escape' && !binding.ctrl && !binding.meta) continue
          }
          e.preventDefault()
          binding.action()
          return
        }
      }
    },
    [bindings],
  )

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}

/**
 * Common keyboard shortcut presets for admin pages.
 */
export function usePageShortcuts(actions: {
  onRefresh?: () => void
  onSearch?: () => void
  onExport?: () => void
  onNew?: () => void
}) {
  useKeyboardShortcuts([
    ...(actions.onRefresh ? [{ key: 'r', ctrl: true, action: actions.onRefresh, description: 'Refresh data' }] : []),
    ...(actions.onSearch ? [{ key: 'k', ctrl: true, action: actions.onSearch, description: 'Search' }] : []),
    ...(actions.onExport ? [{ key: 'e', ctrl: true, shift: true, action: actions.onExport, description: 'Export' }] : []),
    ...(actions.onNew ? [{ key: 'n', ctrl: true, action: actions.onNew, description: 'New item' }] : []),
  ])
}
