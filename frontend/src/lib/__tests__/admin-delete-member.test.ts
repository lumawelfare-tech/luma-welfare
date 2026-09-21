/**
 * Offline contracts for superadmin permanent member purge.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseDeleteMemberBody, ValidationError } from '../../../../supabase/functions/shared/validate.ts'
import { matchesDeleteConfirmation } from '../../pages/admin/AdminMembers'
import { pathToFunctionName } from '../api-routes'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('matchesDeleteConfirmation', () => {
  it('accepts DELETE or matching full name', () => {
    expect(matchesDeleteConfirmation('DELETE', 'Jane Doe')).toBe(true)
    expect(matchesDeleteConfirmation('delete', 'Jane Doe')).toBe(true)
    expect(matchesDeleteConfirmation('Jane Doe', 'Jane Doe')).toBe(true)
    expect(matchesDeleteConfirmation('jane doe', 'Jane Doe')).toBe(true)
    expect(matchesDeleteConfirmation('Jane', 'Jane Doe')).toBe(false)
    expect(matchesDeleteConfirmation('', 'Jane Doe')).toBe(false)
  })
})

describe('parseDeleteMemberBody', () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  it('accepts single and bulk UUIDs', () => {
    expect(parseDeleteMemberBody({ memberId: id }).memberIds).toEqual([id])
    expect(parseDeleteMemberBody({ memberIds: [id, id] }).memberIds).toEqual([id])
  })
  it('rejects invalid input', () => {
    expect(() => parseDeleteMemberBody({})).toThrow(ValidationError)
    expect(() => parseDeleteMemberBody({ memberId: 'nope' })).toThrow(ValidationError)
  })
})

describe('admin-delete-member contracts', () => {
  it('maps SPA path and enforces superadmin + RPC + audit', () => {
    expect(pathToFunctionName('admin/delete-member')).toBe('admin-delete-member')
    const src = read('supabase/functions/admin-delete-member/index.ts')
    expect(src).toContain('is_superadmin')
    expect(src).toContain('admin_purge_closed_member')
    expect(src).toContain("action: 'member.purged'")
    expect(src).toContain('rateLimitAsync')
    expect(src).toContain('never include name')
  })

  it('migration defines transactional purge RPC with financial paths', () => {
    expect(existsSync(resolve(root, 'supabase/migrations/20260921190000_admin_purge_closed_member.sql'))).toBe(true)
    const mig = read('supabase/migrations/20260921190000_admin_purge_closed_member.sql')
    expect(mig).toContain('hard_delete')
    expect(mig).toContain('anonymize')
    expect(mig).toContain('member_not_closed')
    expect(mig).toContain('REVOKE ALL ON FUNCTION public.admin_purge_closed_member')
  })
})
