/**
 * Document uploads use the smallest product cap (5MB).
 * Existing larger files stay readable — only new uploads are rejected.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_LABEL,
  isDocumentTooLarge,
  documentTooLargeMessage,
} from '../uploadLimits'

const root = resolve(import.meta.dirname, '../../../../')
const FIVE_MB = 5 * 1024 * 1024

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('document upload size', () => {
  it('is the smallest product cap (5MB)', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(FIVE_MB)
    expect(MAX_DOCUMENT_LABEL).toBe('5MB')
    expect(isDocumentTooLarge(FIVE_MB)).toBe(false)
    expect(isDocumentTooLarge(FIVE_MB + 1)).toBe(true)
    expect(documentTooLargeMessage('PDF')).toBe('PDF must be 5MB or smaller.')
  })

  it('keeps frontend and edge constants in sync', () => {
    const edge = read('supabase/functions/shared/upload-limits.ts')
    expect(edge).toContain('export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024')
    expect(edge).toContain("export const MAX_DOCUMENT_LABEL = '5MB'")
  })

  it('document upload UIs use the shared helper and do not hardcode 10MB/20MB', () => {
    const files = [
      'frontend/src/pages/member/Profile.tsx',
      'frontend/src/pages/member/Family.tsx',
      'frontend/src/pages/member/Claims.tsx',
      'frontend/src/pages/admin/AdminDocuments.tsx',
    ]
    for (const rel of files) {
      const src = read(rel)
      expect(src).toContain("from '../../lib/uploadLimits'")
      expect(src).toContain('isDocumentTooLarge')
      expect(src).not.toMatch(/10 \* 1024 \* 1024/)
      expect(src).not.toMatch(/20 \* 1024 \* 1024/)
    }
  })

  it('document Edge functions enforce the shared cap', () => {
    const files = [
      'supabase/functions/member-identity-docs/index.ts',
      'supabase/functions/member-claims/index.ts',
      'supabase/functions/admin-documents/index.ts',
    ]
    for (const rel of files) {
      const src = read(rel)
      expect(src).toContain("from '../shared/upload-limits.ts'")
      expect(src).toContain('MAX_DOCUMENT_BYTES')
      expect(src).not.toMatch(/10 \* 1024 \* 1024/)
      expect(src).not.toMatch(/20 \* 1024 \* 1024/)
    }
  })

  it('does not shrink historical storage CHECKs so existing files stay readable', () => {
    expect(read('supabase/migrations/20260924120000_member_identity_documents.sql')).toContain('10485760')
    expect(read('supabase/migrations/20260825140000_create_claim_documents_bucket.sql')).toContain('10485760')
    expect(read('supabase/migrations/20260922200000_phase6_kb_documents.sql')).toContain('20971520')
  })

  it('leaves media library videos and profile avatars on their own limits', () => {
    expect(read('frontend/src/pages/admin/AdminMedia.tsx')).toContain('50 * 1024 * 1024')
    expect(read('supabase/functions/admin-media/index.ts')).toContain('50 * 1024 * 1024')
    expect(read('frontend/src/pages/member/Profile.tsx')).toMatch(/file\.size > 5 \* 1024 \* 1024/)
  })

  it('persists a Cursor rule so new document paths keep the 5MB cap', () => {
    const rule = '.cursor/rules/document-upload-size.mdc'
    expect(existsSync(resolve(root, rule))).toBe(true)
    const src = read(rule)
    expect(src).toContain('MAX_DOCUMENT_BYTES')
    expect(src).toContain('5MB')
    expect(src).toContain('Do not raise this cap')
  })
})
