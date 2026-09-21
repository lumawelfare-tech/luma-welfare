import { describe, it, expect } from 'vitest'
import {
  maskPhone,
  maskIdNumber,
  maskIdNumberLast4,
  maskEmail,
  displayEmail,
  formatKenyanPhone,
  toTelHref,
} from '../pii'

describe('PII masking', () => {
  it('masks Kenyan phone numbers showing last 4 digits', () => {
    expect(maskPhone('0712345678')).toBe('••••••5678')
    expect(maskPhone('+254712345678')).toMatch(/5678$/)
  })

  it('masks national ID numbers (detail style)', () => {
    expect(maskIdNumber('12345678')).toBe('12••••78')
  })

  it('masks national ID to last 4 for list display', () => {
    expect(maskIdNumberLast4('12345678')).toBe('••••5678')
    expect(maskIdNumberLast4('1234567')).toBe('••••4567')
    expect(maskIdNumberLast4(null)).toBe('—')
    expect(maskIdNumberLast4('')).toBe('—')
  })

  it('masks email local part', () => {
    expect(maskEmail('jane@example.com')).toBe('ja••@example.com')
  })

  it('handles empty values', () => {
    expect(maskPhone(null)).toBe('—')
    expect(maskIdNumber('')).toBe('—')
  })
})

describe('displayEmail', () => {
  it('renders a muted dash for empty/nullish emails', () => {
    expect(displayEmail(null)).toBe('—')
    expect(displayEmail(undefined)).toBe('—')
    expect(displayEmail('')).toBe('—')
    expect(displayEmail('  ')).toBe('—')
    expect(displayEmail('null')).toBe('—')
    expect(displayEmail('undefined')).toBe('—')
  })

  it('returns trimmed email when present', () => {
    expect(displayEmail('  a@b.co ')).toBe('a@b.co')
  })
})

describe('formatKenyanPhone / toTelHref', () => {
  it('formats canonical Kenyan mobiles', () => {
    expect(formatKenyanPhone('0712345678')).toBe('+254 712 345 678')
    expect(formatKenyanPhone('+254712345678')).toBe('+254 712 345 678')
  })

  it('builds tel: hrefs', () => {
    expect(toTelHref('0712345678')).toBe('tel:+254712345678')
    expect(toTelHref('+254712345678')).toBe('tel:+254712345678')
    expect(toTelHref(null)).toBeNull()
  })

  it('returns dash for empty phone display', () => {
    expect(formatKenyanPhone(null)).toBe('—')
    expect(formatKenyanPhone('')).toBe('—')
  })
})
