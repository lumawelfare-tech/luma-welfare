import { describe, it, expect } from 'vitest'
import { maskPhone, maskIdNumber, maskEmail } from '../pii'

describe('PII masking', () => {
  it('masks Kenyan phone numbers showing last 4 digits', () => {
    expect(maskPhone('0712345678')).toBe('••••••5678')
    expect(maskPhone('+254712345678')).toMatch(/5678$/)
  })

  it('masks national ID numbers', () => {
    expect(maskIdNumber('12345678')).toBe('12••••78')
  })

  it('masks email local part', () => {
    expect(maskEmail('jane@example.com')).toBe('ja••@example.com')
  })

  it('handles empty values', () => {
    expect(maskPhone(null)).toBe('—')
    expect(maskIdNumber('')).toBe('—')
  })
})
