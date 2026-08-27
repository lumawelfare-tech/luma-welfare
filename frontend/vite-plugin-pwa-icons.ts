/**
 * Vite Plugin: PWA Icon Generator
 *
 * Generates PWA icons in multiple sizes from a single source image.
 * Creates 192x192 and 512x512 PNG icons optimized for maskable display.
 *
 * Usage in vite.config.ts:
 *   import { pwaIcons } from './vite-plugin-pwa-icons'
 *   plugins: [react(), tailwindcss(), pwaIcons()]
 */

import type { Plugin } from 'vite'
import path from 'node:path'
import fs from 'node:fs'

/** Icon sizes to generate */
const ICON_SIZES = [192, 512] as const

/** Source icon path (relative to frontend root) */
const SOURCE_ICON = 'public/brand/luma-icon.jpeg'

/** Output directory for generated icons */
const OUTPUT_DIR = 'public/icons'

/** Background color for maskable icons (must match manifest) */
const BACKGROUND_COLOR = '#6D9B3A'

interface PwaIconsOptions {
  /** Source icon path (relative to frontend root) */
  sourceIcon?: string
  /** Output directory for generated icons */
  outputDir?: string
  /** Icon sizes to generate */
  sizes?: readonly number[]
  /** Background color for maskable padding */
  backgroundColor?: string
}

export function pwaIcons(options: PwaIconsOptions = {}): Plugin {
  const sourceIcon = options.sourceIcon ?? SOURCE_ICON
  const outputDir = options.outputDir ?? OUTPUT_DIR
  const sizes = options.sizes ?? ICON_SIZES
  const bgColor = options.backgroundColor ?? BACKGROUND_COLOR

  return {
    name: 'vite-plugin-pwa-icons',
    apply: 'build',

    async buildStart() {
      const sourcePath = path.resolve(process.cwd(), sourceIcon)
      const outPath = path.resolve(process.cwd(), outputDir)

      // Check if source icon exists
      if (!fs.existsSync(sourcePath)) {
        console.warn(`[pwa-icons] Source icon not found: ${sourceIcon}`)
        return
      }

      try {
        // Dynamic import sharp (ESM compatible)
        const sharp = (await import('sharp')).default

        // Ensure output directory exists
        fs.mkdirSync(outPath, { recursive: true })

        console.log(`[pwa-icons] Generating PWA icons from ${sourceIcon}...`)

        for (const size of sizes) {
          const outputPath = path.join(outPath, `icon-${size}x${size}.png`)

          await sharp(sourcePath)
            .resize(size, size, {
              fit: 'contain',
              background: bgColor,
              withoutEnlargement: false,
            })
            .png({
              quality: 90,
              compressionLevel: 6,
              effort: 7,
            })
            .toFile(outputPath)

          const stats = fs.statSync(outputPath)
          const kb = (stats.size / 1024).toFixed(1)
          console.log(`[pwa-icons] Generated ${size}x${size} (${kb}KB)`)
        }

        // Also generate apple-touch-icon (180x180)
        const appleIconPath = path.join(outPath, 'apple-touch-icon.png')
        await sharp(sourcePath)
          .resize(180, 180, {
            fit: 'contain',
            background: bgColor,
            withoutEnlargement: false,
          })
          .png({
            quality: 90,
            compressionLevel: 6,
          })
          .toFile(appleIconPath)

        const appleStats = fs.statSync(appleIconPath)
        console.log(`[pwa-icons] Generated apple-touch-icon 180x180 (${(appleStats.size / 1024).toFixed(1)}KB)`)

        // Generate favicon.ico (32x32 for modern browsers)
        const faviconPath = path.join(outPath, 'favicon.png')
        await sharp(sourcePath)
          .resize(32, 32, {
            fit: 'contain',
            background: bgColor,
            withoutEnlargement: false,
          })
          .png({
            quality: 90,
          })
          .toFile(faviconPath)

        const faviconStats = fs.statSync(faviconPath)
        console.log(`[pwa-icons] Generated favicon 32x32 (${(faviconStats.size / 1024).toFixed(1)}KB)`)

        console.log(`[pwa-icons] ✅ All PWA icons generated in ${outputDir}/`)

      } catch (err) {
        console.error(`[pwa-icons] Failed to generate icons:`, err instanceof Error ? err.message : err)
      }
    },
  }
}

export default pwaIcons
