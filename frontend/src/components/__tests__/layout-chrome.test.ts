/**
 * Guard: marketing layout must not reintroduce stacked chrome
 * (top info bar padding hooks, sticky guest CTA, WhatsApp FAB).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Layout marketing chrome', () => {
  const layoutSrc = readFileSync(join(__dirname, '../Layout.tsx'), 'utf8')
  const footerSrc = readFileSync(join(__dirname, '../SiteFooter.tsx'), 'utf8')
  const cssSrc = readFileSync(join(__dirname, '../../index.css'), 'utf8')

  it('does not include a fixed WhatsApp FAB', () => {
    expect(layoutSrc).not.toMatch(/fixed[^;{]*wa\.me/s)
    expect(footerSrc).not.toMatch(/fixed[^;{]*wa\.me/s)
    expect(layoutSrc).not.toMatch(/aria-label="Chat on WhatsApp"/)
    expect(footerSrc).not.toMatch(/aria-label="Chat on WhatsApp"/)
  })

  it('does not include a mobile sticky guest Join bar', () => {
    expect(layoutSrc).not.toMatch(/showGuestCta/)
    expect(layoutSrc).not.toMatch(/Join Luma — Free Registration/)
    expect(layoutSrc).not.toMatch(/main-pad-mobile-cta/)
    expect(cssSrc).not.toMatch(/main-pad-mobile-cta/)
  })

  it('does not include the removed top contact info bar markup', () => {
    expect(layoutSrc).not.toMatch(/bg-luma-900.*0798/)
    expect(layoutSrc).not.toMatch(/info@lumawelfare\.or\.ke.*pt-safe/)
  })

  it('delegates footer to SiteFooter as the sole contentinfo', () => {
    expect(layoutSrc).toMatch(/<SiteFooter\s*\/>/)
    expect(layoutSrc).not.toMatch(/role="contentinfo"/)
    expect(footerSrc).toMatch(/role="contentinfo"/)
  })
})
