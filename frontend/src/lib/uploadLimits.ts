/**
 * Smallest allowed size for membership / claim / KB document uploads.
 * Keep in sync with supabase/functions/shared/upload-limits.ts
 */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_LABEL = '5MB'

export function isDocumentTooLarge(sizeBytes: number): boolean {
  return sizeBytes > MAX_DOCUMENT_BYTES
}

export function documentTooLargeMessage(kind = 'Document'): string {
  return `${kind} must be ${MAX_DOCUMENT_LABEL} or smaller.`
}
