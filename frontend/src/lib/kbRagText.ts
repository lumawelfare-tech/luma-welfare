/**
 * Pure KB text helpers — mirrors supabase/functions/shared/kb-rag.ts chunking.
 * Used by unit tests; Edge Functions keep the Deno copy for runtime.
 */

export const CHUNK_SIZE = 1200
export const CHUNK_OVERLAP = 150

export function normalizeKbText(raw: string): string {
  return raw
    .split('')
    .filter((ch) => ch.charCodeAt(0) !== 0)
    .join('')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function chunkKbText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const normalized = normalizeKbText(text)
  if (!normalized) return []
  if (normalized.length <= size) return [normalized.slice(0, 8000)]

  const chunks: string[] = []
  let start = 0
  const maxStartGuard = normalized.length + size
  let guard = 0
  while (start < normalized.length && guard++ < maxStartGuard) {
    let end = Math.min(start + size, normalized.length)
    if (end < normalized.length) {
      const slice = normalized.slice(start, end)
      const breakAt = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf(' '))
      if (breakAt > size * 0.4) end = start + breakAt + 1
    }
    const piece = normalizeKbText(normalized.slice(start, end)).slice(0, 8000)
    if (piece) chunks.push(piece)
    if (end >= normalized.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}

export function hashContent(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return `h${(h >>> 0).toString(16)}`
}
