import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { useFocusTrap } from '../useFocusTrap'

describe('useFocusTrap', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('focuses the first focusable element when active', () => {
    const container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'One'
    const btn2 = document.createElement('button')
    btn2.textContent = 'Two'
    container.append(btn1, btn2)
    document.body.append(container)

    const ref = createRef<HTMLElement>()
    Object.defineProperty(ref, 'current', { value: container, writable: true })

    renderHook(() => useFocusTrap(ref, true))
    expect(document.activeElement).toBe(btn1)
  })

  it('does nothing when inactive', () => {
    const outside = document.createElement('button')
    outside.textContent = 'Outside'
    document.body.append(outside)
    outside.focus()

    const container = document.createElement('div')
    const btn = document.createElement('button')
    btn.textContent = 'Inside'
    container.append(btn)
    document.body.append(container)

    const ref = createRef<HTMLElement>()
    Object.defineProperty(ref, 'current', { value: container, writable: true })

    renderHook(() => useFocusTrap(ref, false))
    expect(document.activeElement).toBe(outside)
  })
})
