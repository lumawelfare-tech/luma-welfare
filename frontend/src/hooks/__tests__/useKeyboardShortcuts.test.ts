import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts, usePageShortcuts } from '../useKeyboardShortcuts'

const dispatchKeydown = (
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {},
) => {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
  )
}

const dispatchInInput = (key: string) => {
  const input = document.createElement('input')
  document.body.appendChild(input)
  input.focus()
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  Object.defineProperty(e, 'target', { value: input, writable: false })
  input.dispatchEvent(e)
  document.body.removeChild(input)
}

describe('useKeyboardShortcuts', () => {
  it('calls action when matching key is pressed', () => {
    const action = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'k', action, description: 'Open search' }]))
    dispatchKeydown('k')
    expect(action).toHaveBeenCalledOnce()
  })

  it('does not fire when ctrl modifier is missing', () => {
    const action = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'k', ctrl: true, action, description: 'Open search' }]))
    dispatchKeydown('k')
    expect(action).not.toHaveBeenCalled()
  })

  it('fires when ctrl key is held', () => {
    const action = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'k', ctrl: true, action, description: 'Open search' }]))
    dispatchKeydown('k', { ctrlKey: true })
    expect(action).toHaveBeenCalledOnce()
  })

  it('fires with shift+ctrl modifier combo', () => {
    const action = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'e', ctrl: true, shift: true, action, description: 'Export' }]))
    dispatchKeydown('e', { ctrlKey: true, shiftKey: true })
    expect(action).toHaveBeenCalledOnce()
  })

  it('does not fire when shift is missing', () => {
    const action = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'e', ctrl: true, shift: true, action, description: 'Export' }]))
    dispatchKeydown('e', { ctrlKey: true })
    expect(action).not.toHaveBeenCalled()
  })

  it('does not fire when typing in an input field (non-modifier key)', () => {
    const action = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'k', action, description: 'Open search' }]))
    dispatchInInput('k')
    expect(action).not.toHaveBeenCalled()
  })

  it('allows Escape shortcut even in input', () => {
    const action = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'Escape', action, description: 'Close' }]))
    dispatchInInput('Escape')
    expect(action).toHaveBeenCalledOnce()
  })

  it('case-insensitive key matching', () => {
    const action = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'K', action, description: 'Open search' }]))
    dispatchKeydown('k')
    expect(action).toHaveBeenCalledOnce()
  })
})

describe('usePageShortcuts', () => {
  it('registers refresh shortcut when onRefresh provided', () => {
    const action = vi.fn()
    renderHook(() => usePageShortcuts({ onRefresh: action }))
    dispatchKeydown('r', { ctrlKey: true })
    expect(action).toHaveBeenCalledOnce()
  })

  it('registers search shortcut when onSearch provided', () => {
    const action = vi.fn()
    renderHook(() => usePageShortcuts({ onSearch: action }))
    dispatchKeydown('k', { ctrlKey: true })
    expect(action).toHaveBeenCalledOnce()
  })

  it('registers export shortcut when onExport provided', () => {
    const action = vi.fn()
    renderHook(() => usePageShortcuts({ onExport: action }))
    dispatchKeydown('e', { ctrlKey: true, shiftKey: true })
    expect(action).toHaveBeenCalledOnce()
  })

  it('registers new shortcut when onNew provided', () => {
    const action = vi.fn()
    renderHook(() => usePageShortcuts({ onNew: action }))
    dispatchKeydown('n', { ctrlKey: true })
    expect(action).toHaveBeenCalledOnce()
  })

  it('registers multiple shortcuts simultaneously', () => {
    const onRefresh = vi.fn()
    const onSearch = vi.fn()
    renderHook(() => usePageShortcuts({ onRefresh, onSearch }))
    dispatchKeydown('r', { ctrlKey: true })
    dispatchKeydown('k', { ctrlKey: true })
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onSearch).toHaveBeenCalledOnce()
  })
})
