/**
 * Post-build prerender for PUBLIC routes only.
 * Injects per-route title/meta/canonical/OG/Twitter/JSON-LD and a crawler-visible
 * body shell into dist/{path}/index.html. Member/admin stay SPA-only (noindex).
 *
 * Uses createRoot on the client (no hydrate) so dynamic SPA content cannot cause
 * hydration mismatches; crawlers still receive correct head + static content.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_ROUTES, resolveSiteUrl } from '../frontend/src/lib/public-routes.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = resolve(__dirname, '../frontend/dist')
const site = resolveSiteUrl(process.env as Record<string, string | undefined>)
const ogImage = `${site}/brand/og-default.png`

function formatTitle(title: string): string {
  if (!title.trim() || title.includes('Luma Welfare')) return title
  return `${title} | Luma Welfare`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function upsertMeta(html: string, attr: 'name' | 'property', key: string, content: string): string {
  const re = new RegExp(`<meta\\s+${attr}=["']${key}["']\\s+content=["'][^"']*["']\\s*/?>`, 'i')
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`
  if (re.test(html)) return html.replace(re, tag)
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`)
}

function upsertLinkCanonical(html: string, href: string): string {
  const re = /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i
  const tag = `<link rel="canonical" href="${escapeHtml(href)}" />`
  if (re.test(html)) return html.replace(re, tag)
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`)
}

function upsertTitle(html: string, title: string): string {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
  }
  return html.replace(/<\/head>/i, `    <title>${escapeHtml(title)}</title>\n  </head>`)
}

function injectJsonLd(html: string, id: string, data: Record<string, unknown>): string {
  const json = JSON.stringify(data)
  const tag = `<script type="application/ld+json" id="${id}">${json}</script>`
  const re = new RegExp(`<script[^>]*id=["']${id}["'][^>]*>[\\s\\S]*?<\\/script>`, 'i')
  if (re.test(html)) return html.replace(re, tag)
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`)
}

function injectPrerenderBody(html: string, title: string, description: string, path: string): string {
  const shell = `<div id="root"><main data-prerender="true" style="font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:1rem">
  <p style="letter-spacing:.08em;text-transform:uppercase;color:#1d7a58;font-size:.75rem;font-weight:600">Luma Welfare</p>
  <h1 style="font-size:1.75rem;line-height:1.25;color:#111827;margin:.5rem 0 1rem">${escapeHtml(title)}</h1>
  <p style="color:#475569;line-height:1.6">${escapeHtml(description)}</p>
  <p style="margin-top:1.5rem"><a href="${escapeHtml(path === '/' ? '/' : path)}" style="color:#006B2E">Continue to site</a></p>
</main></div>`

  if (/<div id="root"><\/div>/i.test(html)) {
    return html.replace(/<div id="root"><\/div>/i, shell)
  }
  if (/<div id="root">[\s\S]*?<\/div>/i.test(html)) {
    return html.replace(/<div id="root">[\s\S]*?<\/div>/i, shell)
  }
  return html
}

if (!existsSync(join(dist, 'index.html'))) {
  console.error('frontend/dist/index.html missing — run vite build first')
  process.exit(2)
}

const template = readFileSync(join(dist, 'index.html'), 'utf8')
let count = 0

for (const route of PUBLIC_ROUTES) {
  const fullTitle = formatTitle(route.title)
  const url = route.path === '/' ? `${site}/` : `${site}${route.path}`

  let html = template
  html = upsertTitle(html, fullTitle)
  html = upsertMeta(html, 'name', 'description', route.description)
  html = upsertMeta(html, 'name', 'robots', 'index, follow')
  html = upsertLinkCanonical(html, url)
  html = upsertMeta(html, 'property', 'og:title', fullTitle)
  html = upsertMeta(html, 'property', 'og:description', route.description)
  html = upsertMeta(html, 'property', 'og:url', url)
  html = upsertMeta(html, 'property', 'og:type', 'website')
  html = upsertMeta(html, 'property', 'og:site_name', 'Luma Welfare')
  html = upsertMeta(html, 'property', 'og:locale', 'en_KE')
  html = upsertMeta(html, 'property', 'og:image', ogImage)
  html = upsertMeta(html, 'property', 'og:image:width', '1200')
  html = upsertMeta(html, 'property', 'og:image:height', '630')
  html = upsertMeta(html, 'property', 'og:image:alt', 'Luma Welfare — Community welfare in Kenya')
  html = upsertMeta(html, 'name', 'twitter:card', 'summary_large_image')
  html = upsertMeta(html, 'name', 'twitter:title', fullTitle)
  html = upsertMeta(html, 'name', 'twitter:description', route.description)
  html = upsertMeta(html, 'name', 'twitter:image', ogImage)
  html = upsertMeta(html, 'name', 'twitter:image:alt', 'Luma Welfare — Community welfare in Kenya')

  html = injectJsonLd(html, 'luma-prerender-webpage', {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: fullTitle,
    description: route.description,
    url,
    isPartOf: { '@type': 'WebSite', name: 'Luma Welfare', url: `${site}/` },
  })

  if (route.path !== '/') {
    html = injectJsonLd(html, 'luma-prerender-breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` },
        { '@type': 'ListItem', position: 2, name: route.title, item: url },
      ],
    })
  }

  html = injectPrerenderBody(html, fullTitle, route.description, route.path)

  if (route.path === '/') {
    writeFileSync(join(dist, 'index.html'), html, 'utf8')
  } else {
    const dir = join(dist, route.path.replace(/^\//, ''))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), html, 'utf8')
  }
  count++
}

console.log(`Prerendered ${count} public routes into ${dist} (site=${site})`)
