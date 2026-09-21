/**
 * Security hardening — PostgREST search sanitizer / encoder tests
 */
import { describe, it, expect } from 'vitest'
import {
  sanitizeSearch,
  buildIlikeOrFilter,
  escapeLikeLiterals,
  encodePostgrestFilterValue,
} from '../../../../supabase/functions/shared/search.ts'

describe('sanitizeSearch', () => {
  it('preserves ordinary names, emails, phones, and identifiers', () => {
    expect(sanitizeSearch('john')).toBe('john')
    expect(sanitizeSearch('John Doe')).toBe('John Doe')
    expect(sanitizeSearch('member@example.com')).toBe('member@example.com')
    expect(sanitizeSearch('ABC-123')).toBe('ABC-123')
    expect(sanitizeSearch('+254712345678')).toBe('+254712345678')
    expect(sanitizeSearch('john.smith')).toBe('john.smith')
    expect(sanitizeSearch('claim-123')).toBe('claim-123')
    expect(sanitizeSearch('package_name')).toBe('package_name')
  })

  it('enforces max length and strips control chars', () => {
    expect(sanitizeSearch('a'.repeat(100), 10)).toHaveLength(10)
    expect(sanitizeSearch('ab\u0000c')).toBe('abc')
  })

  it('returns empty for empty/unusable input', () => {
    expect(sanitizeSearch('   ')).toBe('')
    expect(sanitizeSearch(null)).toBe('')
    expect(sanitizeSearch({ x: 1 })).toBe('')
  })
})

describe('PostgREST encoding', () => {
  it('escapes LIKE wildcards as literals', () => {
    expect(escapeLikeLiterals('100%_off')).toBe('100\\%\\_off')
  })

  it('double-quotes values so commas/parens cannot alter .or()', () => {
    expect(encodePostgrestFilterValue('a,b(c)')).toBe('"a,b(c)"')
    expect(encodePostgrestFilterValue('say "hi"')).toBe('"say ""hi"""')
  })
})

describe('buildIlikeOrFilter', () => {
  it('builds server-controlled column filters with quoted patterns', () => {
    expect(buildIlikeOrFilter(['title', 'body'], 'hello')).toBe(
      'title.ilike."%hello%",body.ilike."%hello%"',
    )
  })

  it('preserves email and phone in the filter value', () => {
    expect(buildIlikeOrFilter(['email'], 'member@example.com')).toBe(
      'email.ilike."%member@example.com%"',
    )
    expect(buildIlikeOrFilter(['phone'], '+254712345678')).toBe(
      'phone.ilike."%+254712345678%"',
    )
  })

  it('quotes malicious PostgREST metacharacters so structure stays fixed', () => {
    const filter = buildIlikeOrFilter(['name'], 'x,y(z).or=eq.true')
    expect(filter).toBe('name.ilike."%x,y(z).or=eq.true%"')
    // Server owns the filter shape: one column, quoted value (commas stay inside quotes)
    expect(filter!.startsWith('name.ilike."%')).toBe(true)
    expect(filter!.endsWith('%"')).toBe(true)
    expect(filter!.includes('name.ilike.')).toBe(true)
  })

  it('escapes wildcards inside the quoted pattern', () => {
    expect(buildIlikeOrFilter(['title'], '100%_off')).toBe(
      'title.ilike."%100\\%\\_off%"',
    )
  })

  it('returns null when nothing to search', () => {
    expect(buildIlikeOrFilter(['title'], '   ')).toBeNull()
  })

  it('rejects invalid column names', () => {
    expect(() => buildIlikeOrFilter(['title;drop'], 'x')).toThrow(/Invalid search column/)
  })
})
