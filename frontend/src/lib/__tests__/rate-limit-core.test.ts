/**
 * Pure rate-limit helpers — offline unit tests (no Deno / network).
 */
import { describe, it, expect } from 'vitest'
import {
  FAIL_CLOSED_IDENTIFIERS,
  memoryConsume,
  resolveRateLimitSubject,
} from '../../../../supabase/functions/shared/rate-limit-core.ts'

describe('resolveRateLimitSubject', () => {
  it('prefers authenticated user id', () => {
    const req = new Request('https://example.com', {
      headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' },
    })
    expect(resolveRateLimitSubject(req, 'user-abc')).toBe('user:user-abc')
  })

  it('uses CF-Connecting-IP for anonymous traffic and ignores X-Forwarded-For', () => {
    const req = new Request('https://example.com', {
      headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' },
    })
    expect(resolveRateLimitSubject(req)).toBe('ip:1.2.3.4')
  })

  it('falls back to untrusted when no CF IP', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '9.9.9.9' },
    })
    expect(resolveRateLimitSubject(req)).toBe('ip:untrusted')
  })
})

describe('memoryConsume', () => {
  it('allows up to max then blocks within the window', () => {
    const store = new Map()
    const now = 1_000_000
    expect(memoryConsume(store, 'k', 60_000, 2, now).ok).toBe(true)
    expect(memoryConsume(store, 'k', 60_000, 2, now + 1).ok).toBe(true)
    expect(memoryConsume(store, 'k', 60_000, 2, now + 2).ok).toBe(false)
  })

  it('resets after the window', () => {
    const store = new Map()
    const now = 1_000_000
    memoryConsume(store, 'k', 1000, 1, now)
    expect(memoryConsume(store, 'k', 1000, 1, now + 500).ok).toBe(false)
    expect(memoryConsume(store, 'k', 1000, 1, now + 1001).ok).toBe(true)
  })
})

describe('FAIL_CLOSED_IDENTIFIERS', () => {
  it('includes auth and admin mutation identifiers', () => {
    expect(FAIL_CLOSED_IDENTIFIERS.has('auth-login')).toBe(true)
    expect(FAIL_CLOSED_IDENTIFIERS.has('auth-register')).toBe(true)
    expect(FAIL_CLOSED_IDENTIFIERS.has('admin-claims-mutation')).toBe(true)
  })
})
