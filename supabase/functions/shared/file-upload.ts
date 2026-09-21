/**
 * File content validation for Edge uploads (magic bytes + allowlist).
 * Do not trust client-supplied MIME or extension alone.
 */

export type AllowedUploadKind = 'image' | 'pdf' | 'docx'

export type DetectedFile = {
  kind: AllowedUploadKind
  mime: string
  ext: string
}

const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47]
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]
const PDF = [0x25, 0x50, 0x44, 0x46] // %PDF
const ZIP = [0x50, 0x4b, 0x03, 0x04] // docx is zip

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false
  return sig.every((b, i) => bytes[i] === b)
}

function isWebp(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, WEBP_RIFF) || bytes.length < 12) return false
  return (
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
}

/** Detect allowlisted claim-document types from raw bytes. */
export function detectAllowedUpload(bytes: Uint8Array): DetectedFile | null {
  if (startsWith(bytes, JPEG)) {
    return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' }
  }
  if (startsWith(bytes, PNG)) {
    return { kind: 'image', mime: 'image/png', ext: 'png' }
  }
  if (isWebp(bytes)) {
    return { kind: 'image', mime: 'image/webp', ext: 'webp' }
  }
  if (startsWith(bytes, PDF)) {
    return { kind: 'pdf', mime: 'application/pdf', ext: 'pdf' }
  }
  // DOCX: ZIP that contains word/ — lightweight check
  if (startsWith(bytes, ZIP)) {
    const head = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 4096)))
    if (head.includes('word/')) {
      return {
        kind: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: 'docx',
      }
    }
  }
  return null
}

/** Reject SVG / HTML / script-like payloads even if mislabeled. */
export function looksLikeScriptableMarkup(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, Math.min(bytes.length, 512)))
    .trimStart()
    .toLowerCase()
  return (
    head.startsWith('<svg') ||
    head.startsWith('<?xml') && head.includes('<svg') ||
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.includes('<script')
  )
}
