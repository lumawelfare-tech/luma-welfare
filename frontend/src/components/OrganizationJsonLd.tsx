import { useEffect } from 'react'

/**
 * Inject Organization + WebSite JSON-LD without inline scripts
 * (CSP script-src 'self' — fetch static JSON then insert).
 */
export function OrganizationJsonLd() {
  useEffect(() => {
    let cancelled = false
    const ids = ['luma-org-jsonld', 'luma-website-jsonld'] as const
    const paths = ['/ld-organization.json', '/ld-website.json'] as const

    async function load() {
      for (let i = 0; i < paths.length; i++) {
        const id = ids[i]
        const path = paths[i]
        if (document.getElementById(id)) continue
        try {
          const res = await fetch(path)
          if (!res.ok || cancelled) continue
          const data = await res.json()
          if (cancelled) return
          const script = document.createElement('script')
          script.id = id
          script.type = 'application/ld+json'
          script.textContent = JSON.stringify(data)
          document.head.appendChild(script)
        } catch {
          /* non-critical SEO enrichment */
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return null
}
