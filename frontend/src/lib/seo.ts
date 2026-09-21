import { useEffect } from 'react'

export const SITE_NAME = 'Luma Welfare'
export const BASE_URL = 'https://luma-welfare.vercel.app'
/** OG/Twitter share image (1200×630 preferred when available). */
export const DEFAULT_IMAGE = `${BASE_URL}/brand/luma-logo.jpeg`

/**
 * Build document title without duplicating the site name.
 */
export function formatPageTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return SITE_NAME
  if (trimmed === SITE_NAME) return SITE_NAME
  if (trimmed.includes(SITE_NAME)) return trimmed
  return `${trimmed} | ${SITE_NAME}`
}

/**
 * Canonical path: strip query/hash, collapse trailing slash (except root).
 */
export function canonicalPath(pathname: string): string {
  const raw = (pathname.split('?')[0] ?? '/').split('#')[0] || '/'
  if (raw === '/') return '/'
  return raw.replace(/\/+$/, '') || '/'
}

export function canonicalUrl(pathname: string = typeof window !== 'undefined' ? window.location.pathname : '/'): string {
  return `${BASE_URL}${canonicalPath(pathname)}`
}

function setMeta(name: string, content: string, property = false) {
  const attr = property ? 'property' : 'name'
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.content = content
}

function upsertJsonLd(id: string, data: Record<string, unknown>) {
  let el = document.getElementById(id) as HTMLScriptElement | null
  if (!el) {
    el = document.createElement('script')
    el.id = id
    el.type = 'application/ld+json'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

function removeJsonLd(id: string) {
  document.getElementById(id)?.remove()
}

export type BreadcrumbItem = { name: string; path: string }

/**
 * Lightweight SEO hook — title, description, OG/Twitter, robots, canonical.
 * Optional BreadcrumbList JSON-LD for public pages.
 */
export function useHead(
  title: string,
  description?: string,
  opts?: {
    noindex?: boolean
    image?: string
    breadcrumbs?: BreadcrumbItem[]
    ogType?: string
  },
) {
  const crumbsKey = opts?.breadcrumbs?.map((b) => `${b.name}\0${b.path}`).join('\n') ?? ''

  useEffect(() => {
    const fullTitle = formatPageTitle(title)
    document.title = fullTitle
    const path = canonicalPath(window.location.pathname)
    const url = `${BASE_URL}${path}`
    const img = opts?.image ?? DEFAULT_IMAGE

    if (description) {
      setMeta('description', description)
      setMeta('og:description', description, true)
      setMeta('twitter:description', description)
    }

    setMeta('og:title', fullTitle, true)
    setMeta('og:type', opts?.ogType ?? 'website', true)
    setMeta('og:site_name', SITE_NAME, true)
    setMeta('og:url', url, true)
    setMeta('og:locale', 'en_KE', true)
    setMeta('og:image', img, true)
    setMeta('og:image:width', '1200', true)
    setMeta('og:image:height', '630', true)
    setMeta('og:image:alt', `${SITE_NAME} — Community welfare in Kenya`, true)

    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', fullTitle)
    setMeta('twitter:image', img)
    setMeta('twitter:image:alt', `${SITE_NAME} — Community welfare in Kenya`)

    setMeta('robots', opts?.noindex ? 'noindex, nofollow' : 'index, follow')

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = url

    if (opts?.breadcrumbs && opts.breadcrumbs.length > 0 && !opts.noindex) {
      upsertJsonLd('luma-breadcrumb-jsonld', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: opts.breadcrumbs.map((b, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: b.name,
          item: `${BASE_URL}${canonicalPath(b.path)}`,
        })),
      })
    } else {
      removeJsonLd('luma-breadcrumb-jsonld')
    }

    return () => {
      document.title = `${SITE_NAME} — Community Welfare Platform in Kenya`
      const r = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
      if (r) r.content = 'index, follow'
      removeJsonLd('luma-breadcrumb-jsonld')
    }
    // crumbsKey serializes breadcrumbs for stable effect deps
  }, [title, description, opts?.noindex, opts?.image, opts?.ogType, crumbsKey, opts?.breadcrumbs])
}
