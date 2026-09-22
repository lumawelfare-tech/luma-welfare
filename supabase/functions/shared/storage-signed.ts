/**
 * Private storage helpers — claim evidence, KB documents, and other non-public files.
 * Prefer short-lived signed URLs; never rely on getPublicUrl for private buckets.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

/** Default TTL for private downloads (15 minutes). */
export const PRIVATE_SIGNED_URL_TTL_SECONDS = 15 * 60

/** @deprecated Use PRIVATE_SIGNED_URL_TTL_SECONDS */
export const CLAIM_DOC_SIGNED_URL_TTL_SECONDS = PRIVATE_SIGNED_URL_TTL_SECONDS

const CLAIM_DOC_BUCKET = 'claim-documents'
export const KB_DOC_BUCKET = 'kb-documents'

/**
 * Extract a storage object path from either a raw path or a full Supabase Storage URL.
 */
export function extractPrivateStoragePath(fileUrlOrPath: string, bucket: string): string | null {
  const raw = (fileUrlOrPath ?? '').trim()
  if (!raw) return null
  if (!raw.includes('://')) return raw.replace(/^\/+/, '')

  try {
    const u = new URL(raw)
    const marker = `/object/public/${bucket}/`
    const markerSign = `/object/sign/${bucket}/`
    const markerAuth = `/object/authenticated/${bucket}/`
    for (const m of [marker, markerSign, markerAuth]) {
      const idx = u.pathname.indexOf(m)
      if (idx >= 0) return decodeURIComponent(u.pathname.slice(idx + m.length))
    }
    const parts = u.pathname.split(`/${bucket}/`)
    if (parts.length === 2 && parts[1]) return decodeURIComponent(parts[1])
  } catch {
    return null
  }
  return null
}

export function extractClaimDocumentPath(fileUrlOrPath: string): string | null {
  return extractPrivateStoragePath(fileUrlOrPath, CLAIM_DOC_BUCKET)
}

export async function signPrivateStorageUrl(
  adminClient: SupabaseClient,
  bucket: string,
  fileUrlOrPath: string,
  ttlSeconds = PRIVATE_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const path = extractPrivateStoragePath(fileUrlOrPath, bucket)
  if (!path) return null
  const { data, error } = await adminClient.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function signClaimDocumentUrl(
  adminClient: SupabaseClient,
  fileUrlOrPath: string,
  ttlSeconds = PRIVATE_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  return signPrivateStorageUrl(adminClient, CLAIM_DOC_BUCKET, fileUrlOrPath, ttlSeconds)
}

export async function withSignedClaimDocumentUrls<T extends { file_url?: string | null }>(
  adminClient: SupabaseClient,
  documents: T[],
  ttlSeconds = PRIVATE_SIGNED_URL_TTL_SECONDS,
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

export async function withSignedKbDocumentUrls<T extends { storage_path?: string | null }>(
  adminClient: SupabaseClient,
  documents: T[],
  ttlSeconds = PRIVATE_SIGNED_URL_TTL_SECONDS,
): Promise<Array<T & { file_url: string; signed_url_expires_in: number }>> {
  const out: Array<T & { file_url: string; signed_url_expires_in: number }> = []
  for (const doc of documents) {
    const signed = doc.storage_path
      ? await signPrivateStorageUrl(adminClient, KB_DOC_BUCKET, doc.storage_path, ttlSeconds)
      : null
    out.push({
      ...doc,
      file_url: signed ?? '',
      signed_url_expires_in: ttlSeconds,
    })
  }
  return out
}
