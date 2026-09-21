/**
 * Generate frontend/public/sitemap.xml and robots.txt from PUBLIC_ROUTES + site URL env.
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_ROUTES, NOINDEX_PREFIXES, resolveSiteUrl } from '../frontend/src/lib/public-routes.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '../frontend/public')
const site = resolveSiteUrl(process.env as Record<string, string | undefined>)
const today = new Date().toISOString().slice(0, 10)

function loc(path: string): string {
  return path === '/' ? `${site}/` : `${site}${path}`
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PUBLIC_ROUTES.map((r) => `  <url>
    <loc>${loc(r.path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority.toFixed(1)}</priority>
  </url>`).join('\n')}
</urlset>
`

const robots = `User-agent: *
Allow: /
${PUBLIC_ROUTES.filter((r) => r.path !== '/').map((r) => `Allow: ${r.path}`).join('\n')}

${NOINDEX_PREFIXES.map((p) => `Disallow: ${p}`).join('\n')}

Sitemap: ${site}/sitemap.xml
`

writeFileSync(resolve(publicDir, 'sitemap.xml'), sitemap, 'utf8')
writeFileSync(resolve(publicDir, 'robots.txt'), robots, 'utf8')
console.log(`Sitemap + robots written for ${site} (${PUBLIC_ROUTES.length} urls)`)
