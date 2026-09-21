/**
 * Security hardening — pure rate-limit core tests
 */
import { describe, it, expect } from 'vitest'
import {
  memoryConsume,
  resolveRateLimitSubject,
  isFailClosedIdentifier,
  FAIL_CLOSED_IDENTIFIERS,
} from '../../../../supabase/functions/shared/rate-limit-core.ts'

describe('resolveRateLimitSubject', () => {
  it('prefers authenticated user id', () => {
    const req = new Request('https://example.com', {
      headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' },
    })
    expect(resolveRateLimitSubject(req, 'user-abc')).toBe('user:user-abc')
  })

  it('uses cf-connecting-ip when unauthenticated', () => {
    const req = new Request('https://example.com', {
      headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' },
    })
    expect(resolveRateLimitSubject(req)).toBe('ip:1.2.3.4')
  })

  it('ignores X-Forwarded-For and uses untrusted bucket', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '9.9.9.9' },
    })
    expect(resolveRateLimitSubject(req)).toBe('ip:untrusted')
  })
})

describe('fail-closed identifiers', () => {
  it('covers auth, payments, and admin mutations', () => {
    expect(isFailClosedIdentifier('login')).toBe(true)
    expect(isFailClosedIdentifier('payments-initiate')).toBe(true)
    expect(isFailClosedIdentifier('admin-members-mutation')).toBe(true)
    expect(FAIL_CLOSED_IDENTIFIERS.size).toBeGreaterThan(10)
  })
})

describe('memoryConsume', () => {
  it('allows first requests then enforces threshold', () => {
    const store = new Map()
    const now = 1_000_000
    expect(memoryConsume(store, 'k', 60_000, 2, now).ok).toBe(true)
    expect(memoryConsume(store, 'k', 60_000, 2, now + 1).ok).toBe(true)
    expect(memoryConsume(store, 'k', 60_000, 2, now + 2).ok).toBe(false)
  })

  it('isolates subjects', () => {
    const store = new Map()
    const now = 1_000_000
    expect(memoryConsume(store, 'a', 60_000, 1, now).ok).toBe(true)
    expect(memoryConsume(store, 'b', 60_000, 1, now).ok).toBe(true)
    expect(memoryConsume(store, 'a', 60_000, 1, now + 1).ok).toBe(false)
  })

  it('resets after window expiry', () => {
    const store = new Map()
    const now = 1_000_000
    expect(memoryConsume(store, 'k', 1000, 1, now).ok).toBe(true)
    expect(memoryConsume(store, 'k', 1000, 1, now + 500).ok).toBe(false)
    expect(memoryConsume(store, 'k', 1000, 1, now + 1001).ok).toBe(true)
  })

  it('serial concurrent-style bursts cannot exceed max', () => {
    const store = new Map()
    const now = 1_000_000
    const max = 5
    let allowed = 0
    for (let i = 0; i < 20; i++) {
      if (memoryConsume(store, 'burst', 60_000, max, now).ok) allowed++
    }
    expect(allowed).toBe(max)
  })
})
