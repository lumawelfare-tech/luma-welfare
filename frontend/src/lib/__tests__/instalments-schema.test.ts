import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')
const sql = readFileSync(resolve(root, 'supabase/migrations/20260923090000_contribution_instalments.sql'), 'utf-8')
const memberFn = readFileSync(resolve(root, 'supabase/functions/member-contributions/index.ts'), 'utf-8')
const adminFn = readFileSync(resolve(root, 'supabase/functions/admin-contributions/index.ts'), 'utf-8')

describe('Lipa Pole Pole schema and server guards', () => {
  it('creates an instalment ledger and keeps one contribution envelope per period', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.contribution_instalments')
    expect(sql).toContain('amount_paid')
    expect(sql).toContain('record_contribution_instalment')
    expect(sql).toContain('REGISTRATION_FEE_REQUIRED')
    expect(sql).toContain('SUBSCRIPTION_INACTIVE')
    expect(sql).toContain('OVERPAYMENT')
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.record_contribution_instalment")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_contribution_instalment')
    expect(sql).toContain('TO service_role')
    expect(sql).toContain('instalments_select_own')
    expect(sql).toContain("status = 'Pending'")
    expect(sql).toContain('recorded_as_admin = false')
  })

  it('does not grant instalment RPCs to authenticated members', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_contribution_instalment[\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.record_contribution_instalment[\s\S]*TO authenticated/)
  })

  it('member and admin contribution functions call the instalment RPC', () => {
    expect(memberFn).toContain('record_contribution_instalment')
    expect(memberFn).toContain('mapInstalmentRpcError')
    expect(adminFn).toContain('record_contribution_instalment')
    expect(adminFn).toContain("requirePermission(session, 'contributions'")
  })
})
