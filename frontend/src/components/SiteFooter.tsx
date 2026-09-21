import { Link } from 'react-router-dom'
import {
  getConfiguredSocialLinks,
  getFooterLegalLine,
  siteConfig,
  type SiteSocialKey,
} from '../config/siteConfig'
import { scrollWindowToTop } from './ScrollToTop'

const QUICK_LINKS = [
  { to: '/about', label: 'About Us' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/packages', label: 'Our Packages' },
  { to: '/register', label: 'Join Now' },
] as const

const SUPPORT_LINKS = [
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms and Conditions' },
] as const

const linkClass =
  'inline-flex min-h-11 items-center text-sm text-luma-200 transition-colors duration-200 hover:text-white hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-300 focus-visible:ring-offset-2 focus-visible:ring-offset-luma-950 rounded-sm motion-reduce:transition-none'

const socialBtnClass =
  'inline-flex h-11 w-11 items-center justify-center rounded-xl text-luma-200 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-300 focus-visible:ring-offset-2 focus-visible:ring-offset-luma-950 motion-reduce:transition-none'

function SocialIcon({ name }: { name: SiteSocialKey }) {
  const common = 'h-5 w-5'
  switch (name) {
    case 'whatsapp':
      return (
        <svg className={common} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      )
    case 'facebook':
      return (
        <svg className={common} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.02H7.9v-2.91h2.4V9.41c0-2.37 1.41-3.68 3.57-3.68 1.04 0 2.12.18 2.12.18v2.34h-1.2c-1.18 0-1.55.73-1.55 1.48v1.78h2.64l-.42 2.91h-2.22V22c4.78-.75 8.44-4.91 8.44-9.93z" />
        </svg>
      )
    case 'instagram':
      return (
        <svg className={common} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zm8.75 1.75a1.125 1.125 0 110 2.25 1.125 1.125 0 010-2.25zM12 7a5 5 0 110 10 5 5 0 010-10zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
        </svg>
      )
    case 'x':
      return (
        <svg className={common} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.899L2.25 2.25h6.053l4.261 5.686 5.68-5.686zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )
    case 'youtube':
      return (
        <svg className={common} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M23.5 6.2a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.56A3.02 3.02 0 00.5 6.2 31.6 31.6 0 000 12a31.6 31.6 0 00.5 5.8 3.02 3.02 0 002.12 2.14C4.5 20.5 12 20.5 12 20.5s7.5 0 9.38-.56a3.02 3.02 0 002.12-2.14A31.6 31.6 0 0024 12a31.6 31.6 0 00-.5-5.8zM9.75 15.5v-7l6.5 3.5-6.5 3.5z" />
        </svg>
      )
    default:
      return null
  }
}

function FooterNavGroup({
  title,
  links,
}: {
  title: string
  links: ReadonlyArray<{ to: string; label: string }>
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-luma-300">{title}</h3>
      <nav aria-label={title}>
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.to + l.label}>
              <Link to={l.to} className={linkClass}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/**
 * Public site footer — last contentinfo landmark in the marketing layout.
 */
export function SiteFooter() {
  const year = new Date().getFullYear()
  const social = getConfiguredSocialLinks()
  const legalLine = getFooterLegalLine()
  const cfg = siteConfig

  return (
    <footer
      role="contentinfo"
      data-testid="site-footer"
      className="relative overflow-hidden bg-gradient-to-b from-luma-900 to-luma-950 text-white pb-safe"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, #7ccdaa 0.6px, transparent 0.7px), radial-gradient(circle at 80% 60%, #7ccdaa 0.6px, transparent 0.7px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Slim CTA band — single button-style Join Now */}
      <div className="relative border-b border-white/10">
        <div className="container-luma flex flex-col items-start justify-between gap-4 py-5 sm:flex-row sm:items-center">
          <p className="max-w-xl text-sm leading-relaxed text-luma-100">
            Join a community that supports each other through life&apos;s key moments.
          </p>
          <Link
            to="/register"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-luma-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-luma-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-300 focus-visible:ring-offset-2 focus-visible:ring-offset-luma-950 motion-reduce:transition-none"
          >
            Join Now
          </Link>
        </div>
      </div>

      <div className="relative container-luma">
        {/*
          Breakpoints:
          - default: stacked (brand → contact → link groups)
          - sm (640+): 2×2 with brand|contact then quick|support
          - lg (1024+): 4 equal columns brand | quick | support | contact
        */}
        <div className="grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="order-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-luma-700 text-sm font-bold text-white">
                LW
              </span>
              <div>
                <span className="block text-lg font-bold tracking-tight text-white">{cfg.name}</span>
                <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-luma-300">
                  {cfg.tagline}
                </span>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-luma-200">{cfg.description}</p>
            {social.length > 0 && (
              <ul className="mt-5 flex flex-wrap items-center gap-2" aria-label="Social links">
                {social.map((s) => (
                  <li key={s.key}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={socialBtnClass}
                      aria-label={`${s.label} (opens in a new tab)`}
                    >
                      <SocialIcon name={s.key} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="order-2 min-w-0 lg:order-4">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-luma-300">
              Contact
            </h3>
            <nav aria-label="Contact">
              <ul className="space-y-1 text-sm">
                {cfg.phoneDisplay && cfg.phoneTel && (
                  <li>
                    <a href={`tel:${cfg.phoneTel}`} className={linkClass}>
                      {cfg.phoneDisplay}
                    </a>
                  </li>
                )}
                {cfg.email && (
                  <li>
                    <a href={`mailto:${cfg.email}`} className={linkClass}>
                      {cfg.email}
                    </a>
                  </li>
                )}
                {cfg.whatsappUrl && (
                  <li>
                    <a
                      href={cfg.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                    >
                      WhatsApp chat
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                )}
                {cfg.address && (
                  <li className="pt-2 leading-relaxed text-luma-200">{cfg.address}</li>
                )}
                {cfg.officeHours && (
                  <li className="leading-relaxed text-luma-300">{cfg.officeHours}</li>
                )}
              </ul>
            </nav>
          </div>

          <div className="order-3 min-w-0 lg:order-2">
            <FooterNavGroup title="Quick links" links={QUICK_LINKS} />
          </div>

          <div className="order-4 min-w-0 lg:order-3">
            <FooterNavGroup title="Support and legal" links={SUPPORT_LINKS} />
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1.5 text-xs text-luma-300">
            <p>
              © {year} {cfg.name}. All rights reserved.
            </p>
            {legalLine && <p className="text-luma-400">{legalLine}</p>}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link to="/privacy" className={`${linkClass} !min-h-0 py-1`}>
                Privacy Policy
              </Link>
              <span aria-hidden="true">·</span>
              <Link to="/terms" className={`${linkClass} !min-h-0 py-1`}>
                Terms
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={scrollWindowToTop}
            className="inline-flex min-h-11 items-center justify-center self-start rounded-lg border border-white/15 px-3 text-xs font-medium text-luma-200 transition-colors duration-200 hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-300 focus-visible:ring-offset-2 focus-visible:ring-offset-luma-950 motion-reduce:transition-none sm:self-auto"
          >
            Back to top
          </button>
        </div>
      </div>
    </footer>
  )
}
