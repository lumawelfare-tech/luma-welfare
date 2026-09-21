import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  escapeXml,
  sanitizeExportCell,
  sanitizeSpreadsheetCell,
  safeInternalPath,
  safeHref,
} from '../sanitize'

describe('sanitizeExportCell', () => {
  it('neutralizes formula injection prefixes', () => {
    expect(sanitizeExportCell('=1+1')).toBe("'=1+1")
    expect(sanitizeExportCell('+cmd')).toBe("'+cmd")
    expect(sanitizeExportCell('-2')).toBe("'-2")
    expect(sanitizeExportCell('@sum')).toBe("'@sum")
  })

  it('quotes cells with commas', () => {
    expect(sanitizeExportCell('a,b')).toBe('"a,b"')
  })
})

describe('sanitizeSpreadsheetCell', () => {
  it('XML-escapes angle brackets after formula neutralize', () => {
    expect(sanitizeSpreadsheetCell('</Data><script>')).toContain('&lt;')
    expect(sanitizeSpreadsheetCell('</Data><script>')).not.toContain('<script')
  })

  it('neutralizes formulas', () => {
    expect(sanitizeSpreadsheetCell('=HYPERLINK("http://x")')).toBe('&apos;=HYPERLINK(&quot;http://x&quot;)')
  })
})

describe('escapeHtml / escapeXml', () => {
  it('escapes amp and quotes', () => {
    expect(escapeHtml(`a&<"'>`)).toBe('a&amp;&lt;&quot;&#39;&gt;')
    expect(escapeXml(`a&<"'>`)).toBe('a&amp;&lt;&quot;&apos;&gt;')
  })
})

describe('safeInternalPath', () => {
  it('allows relative same-origin paths', () => {
    expect(safeInternalPath('/dashboard')).toBe('/dashboard')
    expect(safeInternalPath('/admin/members')).toBe('/admin/members')
  })

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeInternalPath('https://evil.com')).toBe('/dashboard')
    expect(safeInternalPath('//evil.com')).toBe('/dashboard')
    expect(safeInternalPath('javascript:alert(1)')).toBe('/dashboard')
  })
})

describe('safeHref', () => {
  it('allows tel mailto https', () => {
    expect(safeHref('tel:0798635024')).toBe('tel:0798635024')
    expect(safeHref('mailto:info@lumawelfare.or.ke')).toBe('mailto:info@lumawelfare.or.ke')
    expect(safeHref('https://www.lumawelfare.or.ke')).toContain('https://')
  })

  it('rejects javascript and data URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>')).toBeNull()
  })
})
