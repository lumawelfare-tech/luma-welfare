/**
 * Smallest allowed size for membership / claim / KB document uploads.
 * Keep in sync with frontend/src/lib/uploadLimits.ts
 */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_LABEL = '5MB'

export function documentTooLargeMessage(kind = 'Document'): string {
  return `${kind} must be ${MAX_DOCUMENT_LABEL} or smaller.`
}
