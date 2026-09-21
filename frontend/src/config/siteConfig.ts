/**
 * Public site contact / brand / social configuration.
 * Footer, contact surfaces, and Organization JSON-LD read from here.
 * Optional fields must stay empty or PLACEHOLDER_* — unset values must not render.
 */
import { displayLegalValue, legalConfig } from './legal'

export type SiteSocialKey = 'whatsapp' | 'facebook' | 'instagram' | 'x' | 'youtube'

export type SiteSocialUrls = Partial<Record<SiteSocialKey, string>>

export type SiteConfig = {
  name: string
  tagline: string
  description: string
  /** Display phone, e.g. "0798 635 024" */
  phoneDisplay: string | null
  /** Digits for tel: links */
  phoneTel: string | null
  /** E.164 for schema.org telephone */
  phoneE164: string | null
  email: string | null
  whatsappUrl: string | null
  address: string | null
  officeHours: string | null
  social: SiteSocialUrls
  legalEntityName: string | null
  registrationNumber: string | null
  odpcRegistrationNumber: string | null
  websiteUrl: string | null
}

function optionalUrl(value: string | null | undefined): string | null {
  const shown = displayLegalValue(value ?? '')
  if (!shown) return null
  if (shown === '#' || shown.startsWith('PLACEHOLDER_')) return null
  return shown
}

const whatsapp = optionalUrl(legalConfig.whatsappUrl)

/** Fill social URLs when real profiles exist. Leave unset to hide icons. */
const socialUrls: SiteSocialUrls = {
  ...(whatsapp ? { whatsapp } : {}),
  // facebook: 'https://facebook.com/...',
  // instagram: 'https://instagram.com/...',
  // x: 'https://x.com/...',
  // youtube: 'https://youtube.com/...',
}

export const siteConfig: SiteConfig = {
  name: legalConfig.tradingName || 'Luma Welfare',
  tagline: 'Community Welfare',
  description:
    'A community welfare organization in Kenya. Members contribute monthly to support each other through key life events.',
  phoneDisplay: displayLegalValue(legalConfig.contactPhoneDisplay),
  phoneTel: displayLegalValue(legalConfig.contactPhoneTel),
  phoneE164: '+254798635024',
  email: displayLegalValue(legalConfig.privacyContactEmail),
  whatsappUrl: whatsapp,
  address: displayLegalValue(legalConfig.physicalAddress),
  /** Set when confirmed, e.g. "Mon–Fri 8:00–17:00 EAT" */
  officeHours: null,
  social: socialUrls,
  legalEntityName: displayLegalValue(legalConfig.legalEntityName),
  registrationNumber: displayLegalValue(legalConfig.registrationNumber),
  odpcRegistrationNumber: displayLegalValue(legalConfig.odpcRegistrationNumber),
  websiteUrl: 'https://www.lumawelfare.or.ke',
}

const SOCIAL_LABELS: Record<SiteSocialKey, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X (formerly Twitter)',
  youtube: 'YouTube',
}

export type SiteSocialLink = {
  key: SiteSocialKey
  label: string
  href: string
}

/** Social links with real URLs only (no placeholders, no "#"). */
export function getConfiguredSocialLinks(cfg: SiteConfig = siteConfig): SiteSocialLink[] {
  const keys: SiteSocialKey[] = ['whatsapp', 'facebook', 'instagram', 'x', 'youtube']
  return keys.flatMap((key) => {
    const href = optionalUrl(cfg.social[key])
    if (!href) return []
    return [{ key, label: SOCIAL_LABELS[key], href }]
  })
}

/** Discreet bottom-bar legal line; null when nothing verified. */
export function getFooterLegalLine(cfg: SiteConfig = siteConfig): string | null {
  const parts: string[] = []
  if (cfg.legalEntityName) parts.push(cfg.legalEntityName)
  if (cfg.registrationNumber) parts.push(`Reg. No. ${cfg.registrationNumber}`)
  if (cfg.odpcRegistrationNumber) parts.push(`ODPC ${cfg.odpcRegistrationNumber}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** schema.org sameAs — website + configured social only. */
export function getOrganizationSameAs(cfg: SiteConfig = siteConfig): string[] {
  const urls: string[] = []
  if (cfg.websiteUrl) urls.push(cfg.websiteUrl)
  for (const link of getConfiguredSocialLinks(cfg)) {
    if (!urls.includes(link.href)) urls.push(link.href)
  }
  return urls
}

/** schema.org contactPoint entries from configured channels. */
export function getOrganizationContactPoints(
  cfg: SiteConfig = siteConfig,
): Array<Record<string, string>> {
  const points: Array<Record<string, string>> = []
  if (cfg.phoneE164 || cfg.phoneTel) {
    points.push({
      '@type': 'ContactPoint',
      contactType: 'customer support',
      telephone: cfg.phoneE164 ?? `+${cfg.phoneTel}`,
      areaServed: 'KE',
      availableLanguage: 'en',
    })
  }
  if (cfg.email) {
    points.push({
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: cfg.email,
      areaServed: 'KE',
      availableLanguage: 'en',
    })
  }
  return points
}
