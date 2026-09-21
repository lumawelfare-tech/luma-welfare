/**
 * Private storage helpers — claim evidence and other non-public files.
 * Prefer short-lived signed URLs; never rely on getPublicUrl for private buckets.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Default TTL for claim-document downloads (15 minutes). */
export const CLAIM_DOC_SIGNED_URL_TTL_SECONDS = 15 * 60

const CLAIM_DOC_BUCKET = 'claim-documents'

/**
 * Extract a storage object path from either a raw path or a full Supabase Storage URL.
 */
export function extractClaimDocumentPath(fileUrlOrPath: string): string | null {
  const raw = (fileUrlOrPath ?? '').trim()
  if (!raw) return null
  if (!raw.includes('://')) return raw.replace(/^\/+/, '')

  try {
    const u = new URL(raw)
    const marker = `/object/public/${CLAIM_DOC_BUCKET}/`
    const markerSign = `/object/sign/${CLAIM_DOC_BUCKET}/`
    const markerAuth = `/object/authenticated/${CLAIM_DOC_BUCKET}/`
    for (const m of [marker, markerSign, markerAuth]) {
      const idx = u.pathname.indexOf(m)
      if (idx >= 0) return decodeURIComponent(u.pathname.slice(idx + m.length))
    }
    // /storage/v1/object/public/claim-documents/...
    const parts = u.pathname.split(`/${CLAIM_DOC_BUCKET}/`)
    if (parts.length === 2 && parts[1]) return decodeURIComponent(parts[1])
  } catch {
    return null
  }
  return null
}

export async function signClaimDocumentUrl(
  adminClient: SupabaseClient,
  fileUrlOrPath: string,
  ttlSeconds = CLAIM_DOC_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const path = extractClaimDocumentPath(fileUrlOrPath)
  if (!path) return null
  const { data, error } = await adminClient.storage
    .from(CLAIM_DOC_BUCKET)
    .createSignedUrl(path, ttlSeconds)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function withSignedClaimDocumentUrls<T extends { file_url?: string | null }>(
  adminClient: SupabaseClient,
  documents: T[],
  ttlSeconds = CLAIM_DOC_SIGNED_URL_TTL_SECONDS,
): Promise<Array<T & { file_url: string; signed_url_expires_in: number }>> {
  const out: Array<T & { file_url: string; signed_url_expires_in: number }> = []
  for (const doc of documents) {
    const signed = doc.file_url
      ? await signClaimDocumentUrl(adminClient, doc.file_url, ttlSeconds)
      : null
    out.push({
      ...doc,
      file_url: signed ?? '',
      signed_url_expires_in: ttlSeconds,
    })
  }
  return out
}
