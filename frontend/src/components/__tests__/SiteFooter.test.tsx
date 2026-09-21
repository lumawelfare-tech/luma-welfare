import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SiteFooter } from '../SiteFooter'
import {
  getConfiguredSocialLinks,
  getFooterLegalLine,
  getOrganizationSameAs,
  type SiteConfig,
} from '../../config/siteConfig'
import { siteConfig } from '../../config/siteConfig'

function bareConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    name: 'Luma Welfare',
    tagline: 'Community Welfare',
    description: 'Test description.',
    phoneDisplay: null,
    phoneTel: null,
    phoneE164: null,
    email: null,
    whatsappUrl: null,
    address: null,
    officeHours: null,
    social: {},
    legalEntityName: null,
    registrationNumber: null,
    odpcRegistrationNumber: null,
    websiteUrl: null,
    ...overrides,
  }
}

describe('siteConfig helpers', () => {
  it('omits empty and placeholder social URLs', () => {
    expect(
      getConfiguredSocialLinks(
        bareConfig({
          social: {
            whatsapp: 'https://wa.me/254798635024',
            facebook: '#',
            instagram: 'PLACEHOLDER_INSTAGRAM',
          },
        }),
      ),
    ).toEqual([{ key: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/254798635024' }])
  })

  it('returns null legal line when entity details are unset', () => {
    expect(getFooterLegalLine(bareConfig())).toBeNull()
  })

  it('builds legal line only from verified fields', () => {
    expect(
      getFooterLegalLine(
        bareConfig({
          legalEntityName: 'Example Welfare Ltd',
          registrationNumber: 'PVT-123',
          odpcRegistrationNumber: 'ODPC/123',
        }),
      ),
    ).toBe('Example Welfare Ltd · Reg. No. PVT-123 · ODPC ODPC/123')
  })

  it('sameAs includes website and configured social only', () => {
    expect(
      getOrganizationSameAs(
        bareConfig({
          websiteUrl: 'https://www.lumawelfare.or.ke',
          social: { whatsapp: 'https://wa.me/254798635024' },
        }),
      ),
    ).toEqual(['https://www.lumawelfare.or.ke', 'https://wa.me/254798635024'])
  })
})

describe('SiteFooter', () => {
  function renderFooter() {
    return render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    )
  }

  it('renders as the contentinfo landmark with brand', () => {
    renderFooter()
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveAttribute('data-testid', 'site-footer')
    expect(within(footer).getByText('Luma Welfare')).toBeInTheDocument()
    expect(within(footer).getByText('Community Welfare')).toBeInTheDocument()
  })

  it('has no duplicate FAQ link and no placeholder or hash links', () => {
    renderFooter()
    const footer = screen.getByTestId('site-footer')
    const faqLinks = within(footer).getAllByRole('link', { name: 'FAQ' })
    expect(faqLinks).toHaveLength(1)

    const anchors = footer.querySelectorAll('a[href]')
    for (const a of anchors) {
      const href = a.getAttribute('href') ?? ''
      expect(href).not.toBe('#')
      expect(href).not.toMatch(/^PLACEHOLDER_/)
      expect(a.textContent ?? '').not.toMatch(/PLACEHOLDER_/)
    }
  })

  it('hides unset optional contact fields and unverified legal line', () => {
    renderFooter()
    const footer = screen.getByTestId('site-footer')
    expect(within(footer).queryByText(/PLACEHOLDER_/)).not.toBeInTheDocument()
    expect(within(footer).queryByText(/Reg\. No\./)).not.toBeInTheDocument()
    expect(within(footer).queryByText(/ODPC/)).not.toBeInTheDocument()
    expect(within(footer).queryByLabelText(/Facebook/i)).not.toBeInTheDocument()
    expect(within(footer).queryByLabelText(/Instagram/i)).not.toBeInTheDocument()
    expect(within(footer).queryByLabelText(/^X /i)).not.toBeInTheDocument()
    expect(within(footer).queryByLabelText(/YouTube/i)).not.toBeInTheDocument()
  })

  it('exposes real tel, mailto, and WhatsApp contact links when configured', () => {
    renderFooter()
    const footer = screen.getByTestId('site-footer')
    if (siteConfig.phoneTel && siteConfig.phoneDisplay) {
      const phone = within(footer).getByRole('link', { name: siteConfig.phoneDisplay })
      expect(phone).toHaveAttribute('href', `tel:${siteConfig.phoneTel}`)
    }
    if (siteConfig.email) {
      const mail = within(footer).getByRole('link', { name: siteConfig.email })
      expect(mail).toHaveAttribute('href', `mailto:${siteConfig.email}`)
    }
    if (siteConfig.whatsappUrl) {
      const wa = within(footer).getByRole('link', { name: /WhatsApp chat/i })
      expect(wa).toHaveAttribute('href', siteConfig.whatsappUrl)
      expect(wa).toHaveAttribute('rel', 'noopener noreferrer')
      expect(wa).toHaveAttribute('target', '_blank')
    }
  })

  it('includes a single Join Now CTA in the top band', () => {
    renderFooter()
    const footer = screen.getByTestId('site-footer')
    const joins = within(footer).getAllByRole('link', { name: 'Join Now' })
    // CTA band + Quick links
    expect(joins.length).toBe(2)
    expect(joins[0]).toHaveAttribute('href', '/register')
  })
})
