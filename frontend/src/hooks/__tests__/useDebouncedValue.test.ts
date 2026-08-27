import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from '../useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'initial' } },
    )

    // Update value
    rerender({ value: 'updated' })

    // Should still be the old value
    expect(result.current).toBe('initial')

    // Advance timer
    act(() => { vi.advanceTimersByTime(300) })

    // Should now be the new value
    expect(result.current).toBe('updated')
  })

  it('cancels pending timer on rapid updates', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    )

    rerender({ value: 'b' })
    act(() => { vi.advanceTimersByTime(200) }) // Not yet
    rerender({ value: 'c' })
    act(() => { vi.advanceTimersByTime(300) })

    expect(result.current).toBe('c')
  })

  it('uses custom delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'a', delay: 500 } },
    )

    rerender({ value: 'b', delay: 500 })
    act(() => { vi.advanceTimersByTime(400) })
    expect(result.current).toBe('a')

    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe('b')
  })
})
