/**
 * Spot-check that public FAQ / Privacy / Terms carry official org-doc phrases
 * and keep the draft-legal banner flag.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('Official document phrases on public legal/FAQ pages', () => {
  const faq = read('frontend/src/pages/FAQ.tsx')
  const privacy = read('frontend/src/pages/Privacy.tsx')
  const terms = read('frontend/src/pages/Terms.tsx')
  const legal = read('frontend/src/config/legal.ts')
  const banner = read('frontend/src/components/LegalDraftBanner.tsx')

  it('FAQ includes founding, Mission of Mercy, values, and proposed-rule caution', () => {
    expect(faq).toMatch(/Founded in Kitengela|founded in Kitengela/)
    expect(faq).toContain('Boss Williams')
    expect(faq).toContain('Mission of Mercy')
    expect(faq).toContain('Unity')
    expect(faq).toContain('proposed late-payment deadline')
    expect(faq).toContain('non-refundable contribution rule')
    expect(faq).toContain('Children’s Orphanage/Vulnerables')
    expect(faq).toContain('Every enrolled package requires its applicable monthly contribution.')
    expect(faq).toContain('Monthly payments cannot be skipped for any package.')
    expect(faq).toContain('does not treat them as a single combined formula')
  })

  it('Privacy and Terms keep the draft banner and Kenyan-review caveat', () => {
    expect(legal).toContain('draftPendingLegalReview: true')
    expect(banner).toContain('DRAFT — pending legal review')
    expect(privacy).toContain('LegalDraftBanner')
    expect(terms).toContain('LegalDraftBanner')
    expect(privacy).toMatch(/final privacy|Kenya Data Protection Act|Kenyan requirements/)
    expect(privacy).toContain('legitimate welfare activities')
    expect(privacy).toContain('children')
    expect(terms).toContain('does not automatically guarantee')
    expect(terms).toContain('proposed late-payment deadline')
    expect(terms).toContain('Code of Conduct')
    expect(terms).toContain('Every enrolled package requires its applicable monthly contribution.')
    expect(terms).toContain('Monthly payments cannot be skipped for any package.')
    expect(terms).not.toMatch(/non-refundable\./)
    expect(faq).not.toMatch(/contributions are non-refundable/i)
  })
})
