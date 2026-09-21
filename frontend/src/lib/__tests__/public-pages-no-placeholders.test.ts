/**
 * Guard: public marketing pages must not ship unverified placeholder copy.
 * Input placeholders on forms are allowed; marketing/hero/stat claims are not.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PUBLIC_PAGE_FILES = [
  'Home.tsx',
  'About.tsx',
  'Packages.tsx',
  'HowItWorks.tsx',
  'FAQ.tsx',
  'Contact.tsx',
  'News.tsx',
  'Gallery.tsx',
  'Media.tsx',
  'Privacy.tsx',
  'Terms.tsx',
  'NotFound.tsx',
]

const PUBLIC_COMPONENT_FILES = [
  'StatBar.tsx',
  'HomeHero.tsx',
  'OrganizationJsonLd.tsx',
  'Layout.tsx',
]

const FORBIDDEN = [
  /Awaiting confirmation/i,
  /\bComing soon\b/i,
  /\bTBD\b/,
  /lorem ipsum/i,
  /P\.?\s*O\.?\s*Box\s*12345/i,
  /\bTODO:\s*replace\b/i,
]

function walkTsx(dir: string, names: Set<string>, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkTsx(p, names, out)
    else if (names.has(name)) out.push(p)
  }
  return out
}

describe('public pages — no placeholder marketing copy', () => {
  const pagesDir = join(__dirname, '../../pages')
  const componentsDir = join(__dirname, '../../components')
  const files = [
    ...walkTsx(pagesDir, new Set(PUBLIC_PAGE_FILES)),
    ...PUBLIC_COMPONENT_FILES.map((n) => join(componentsDir, n)),
  ]

  it('scans known public surfaces', () => {
    expect(files.length).toBeGreaterThanOrEqual(PUBLIC_PAGE_FILES.length)
  })

  for (const file of files) {
    it(`has no forbidden placeholder text: ${file.split(/[/\\]/).slice(-2).join('/')}`, () => {
      const src = readFileSync(file, 'utf8')
      for (const re of FORBIDDEN) {
        expect(src, `${file} matched ${re}`).not.toMatch(re)
      }
    })
  }

  it('JSON-LD organization file has no fabricated postal box', () => {
    const ld = readFileSync(join(__dirname, '../../../public/ld-organization.json'), 'utf8')
    expect(ld).not.toMatch(/12345/)
    expect(ld).not.toMatch(/Awaiting confirmation/i)
  })
})
