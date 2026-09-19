import { useEffect } from 'react'

/**
 * Inject Organization JSON-LD without inline scripts (CSP script-src 'self').
 */
export function OrganizationJsonLd() {
  useEffect(() => {
    let cancelled = false
    const existing = document.getElementById('luma-org-jsonld')
    if (existing) return

    fetch('/ld-organization.json')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const script = document.createElement('script')
        script.id = 'luma-org-jsonld'
        script.type = 'application/ld+json'
        script.textContent = JSON.stringify(data)
        document.head.appendChild(script)
      })
      .catch(() => {
        /* non-critical SEO enrichment */
      })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
