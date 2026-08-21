import { useEffect } from 'react'

const SITE_NAME = 'Luma Welfare'
const BASE_URL = 'https://luma-welfare.vercel.app'

/**
 * Lightweight SEO hook — sets document.title, meta description, and robots.
 * For an SPA this is the practical approach without a heavy library.
 */
export function useHead(title: string, description?: string, opts?: { noindex?: boolean }) {
  useEffect(() => {
    document.title = `${title} | ${SITE_NAME}`

    if (description) {
      let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'description'
        document.head.appendChild(meta)
      }
      meta.content = description
    }

    // Set robots (noindex for private pages)
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    robots.content = opts?.noindex ? 'noindex, nofollow' : 'index, follow'

    // Set canonical URL
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
  }, [title, description, opts?.noindex])
}
