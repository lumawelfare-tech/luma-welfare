import { useEffect } from 'react'

const SITE_NAME = 'Luma Welfare'
const BASE_URL = 'https://luma-welfare.vercel.app'
const DEFAULT_IMAGE = `${BASE_URL}/brand/luma-logo.jpeg`

/**
 * Lightweight SEO hook — sets document.title, meta description, OG tags, Twitter cards, and robots.
 * For an SPA this is the practical approach without a heavy library.
 */
export function useHead(title: string, description?: string, opts?: { noindex?: boolean; image?: string }) {
  useEffect(() => {
    const fullTitle = `${title} | ${SITE_NAME}`
    document.title = fullTitle

    // Helper to set or create a meta tag
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

    // Description
    if (description) {
      setMeta('description', description)
      setMeta('og:description', description, true)
    }

    // Title
    setMeta('og:title', fullTitle, true)
    setMeta('og:type', 'website', true)
    setMeta('og:site_name', SITE_NAME, true)
    setMeta('og:url', BASE_URL + window.location.pathname, true)

    // Image
    const img = opts?.image ?? DEFAULT_IMAGE
    setMeta('og:image', img, true)
    setMeta('og:image:width', '1200', true)
    setMeta('og:image:height', '630', true)

    // Twitter
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', fullTitle)
    if (description) setMeta('twitter:description', description)
    setMeta('twitter:image', img)

    // Robots
    setMeta('robots', opts?.noindex ? 'noindex, nofollow' : 'index, follow')

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = BASE_URL + window.location.pathname

    return () => {
      document.title = `${SITE_NAME} — Community Welfare Platform in Kenya`
      const r = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
      if (r) r.content = 'index, follow'
    }
  }, [title, description, opts?.noindex, opts?.image])
}
