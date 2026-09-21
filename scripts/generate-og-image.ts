/**
 * Build /brand/og-default.png (1200×630).
 * REPLACEABLE: swap this file with a designed marketing asset when ready.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const out = resolve(__dirname, '../frontend/public/brand/og-default.png')

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#054a1f"/>
      <stop offset="55%" stop-color="#006B2E"/>
      <stop offset="100%" stop-color="#123B8C"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="980" cy="120" r="180" fill="#ffffff" fill-opacity="0.06"/>
  <circle cx="160" cy="520" r="220" fill="#ffffff" fill-opacity="0.05"/>
  <text x="80" y="250" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="700" fill="#ffffff">Luma Welfare</text>
  <text x="80" y="330" font-family="system-ui, Segoe UI, sans-serif" font-size="32" fill="#d6f0e3">Community welfare in Kenya</text>
  <text x="80" y="400" font-family="system-ui, Segoe UI, sans-serif" font-size="24" fill="#aee3c9">Members contribute monthly · Support when it matters</text>
  <text x="80" y="560" font-family="system-ui, Segoe UI, sans-serif" font-size="18" fill="#ffffff" fill-opacity="0.55">Replaceable OG image · 1200×630</text>
</svg>`

  mkdirSync(dirname(out), { recursive: true })
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  writeFileSync(out, png)
  console.log(`Wrote ${out}${existsSync(out) ? ` (${png.length} bytes)` : ''}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
