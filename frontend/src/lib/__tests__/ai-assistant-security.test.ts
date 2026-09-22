/**
 * Phase 7 AI security contracts — kill switch + no PII/claim tables in assistant path.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf-8')
}

describe('AI assistant kill switch', () => {
  it('member-assistant and admin-kb-ingest require AI_ASSISTANT_ENABLED=true', () => {
    expect(read('supabase/functions/shared/faq-knowledge.ts')).toContain("AI_ASSISTANT_ENABLED') === 'true'")
    expect(read('supabase/functions/member-assistant/index.ts')).toContain('isAiAssistantEnabled')
    expect(read('supabase/functions/admin-kb-ingest/index.ts')).toContain('isAiAssistantEnabled')
  })
})

describe('AI never touches claims/payments/PII tables for RAG', () => {
  const assistant = read('supabase/functions/member-assistant/index.ts')
  const ingest = read('supabase/functions/admin-kb-ingest/index.ts')
  const faq = read('supabase/functions/shared/faq-knowledge.ts')

  it('assistant does not query claims, payments, or members for content', () => {
    expect(assistant).not.toMatch(/\.from\(['"]claims['"]\)/)
    expect(assistant).not.toMatch(/\.from\(['"]payments['"]\)/)
    expect(assistant).not.toMatch(/\.from\(['"]contributions['"]\)/)
    expect(assistant).not.toMatch(/\.from\(['"]family_members['"]\)/)
    expect(assistant).toContain(".from('members')")
    expect(assistant).toContain(".select('status')")
    expect(assistant).toContain('search_kb_chunks')
  })

  it('ingest only allows public/member approved KB', () => {
    expect(ingest).toContain(".in('access_level', ['public', 'member'])")
    expect(ingest).toContain(".eq('status', 'approved')")
    expect(ingest).not.toMatch(/\.from\(['"]claims['"]\)/)
    expect(ingest).not.toMatch(/\.from\(['"]payments['"]\)/)
  })

  it('refuses claim/payment approval style prompts', () => {
    expect(faq).toContain('approve')
    expect(faq).toContain('shouldRefuseQuery')
    expect(faq).toMatch(/approve\|reject\|verify/)
  })
})

describe('AI UI does not enable server alone', () => {
  it('aiUi documents server gate', () => {
    const ui = read('frontend/src/lib/aiUi.ts')
    expect(ui).toContain('AI_ASSISTANT_ENABLED')
    expect(ui).toContain('never enables RAG alone')
  })
})
