/**
 * Crops the right-side family visual from public/hero.jpeg into optimized
 * brand assets for the Home hero (JPEG + WebP).
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const src = resolve(root, 'frontend/public/hero.jpeg')
  if (!existsSync(src)) {
    throw new Error(`Missing source image: ${src}`)
  }

  const jpegOut = resolve(root, 'frontend/public/brand/hero-family.jpeg')
  const webpOut = resolve(root, 'frontend/public/brand/hero-family.webp')
  mkdirSync(dirname(jpegOut), { recursive: true })

  const meta = await sharp(src).metadata()
  const w = meta.width ?? 1024
  const h = meta.height ?? 405
  const left = Math.floor(w * 0.48)
  const cropW = w - left

  const cropped = sharp(src)
    .extract({ left, top: 0, width: cropW, height: h })
    .resize({ width: 960, withoutEnlargement: true })

  await cropped.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(jpegOut)
  await cropped.clone().webp({ quality: 78 }).toFile(webpOut)

  const j = await sharp(jpegOut).metadata()
  const v = await sharp(webpOut).metadata()
  console.log(
    JSON.stringify(
      {
        source: { w, h },
        jpeg: { path: jpegOut, w: j.width, h: j.height },
        webp: { path: webpOut, w: v.width, h: v.height },
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
