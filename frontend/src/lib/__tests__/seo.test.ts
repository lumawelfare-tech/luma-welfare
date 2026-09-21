import { describe, expect, it } from 'vitest'
import { canonicalPath, formatPageTitle, SITE_NAME } from '../seo'

describe('formatPageTitle', () => {
  it('returns site name alone when empty or site-only', () => {
    expect(formatPageTitle('')).toBe(SITE_NAME)
    expect(formatPageTitle(SITE_NAME)).toBe(SITE_NAME)
  })

  it('does not duplicate site name', () => {
    expect(formatPageTitle(`About | ${SITE_NAME}`)).toBe(`About | ${SITE_NAME}`)
    expect(formatPageTitle(`${SITE_NAME} — Community Welfare Platform in Kenya`)).toBe(
      `${SITE_NAME} — Community Welfare Platform in Kenya`,
    )
  })

  it('appends site name for plain titles', () => {
    expect(formatPageTitle('Packages')).toBe(`Packages | ${SITE_NAME}`)
  })
})

describe('canonicalPath', () => {
  it('normalizes root and strips query/hash', () => {
    expect(canonicalPath('/')).toBe('/')
    expect(canonicalPath('/packages?q=hospital')).toBe('/packages')
    expect(canonicalPath('/about#team')).toBe('/about')
  })

  it('collapses trailing slashes', () => {
    expect(canonicalPath('/about/')).toBe('/about')
    expect(canonicalPath('/news/events/')).toBe('/news/events')
  })
})
