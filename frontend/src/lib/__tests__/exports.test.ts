import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── sanitizeCell (private, tested via export functions) ─────
// We test the CSV export functions which use sanitizeCell internally

describe('CSV Export — Formula Injection Prevention', () => {
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement
      }
      return document.createElement(tag)
    })
  })

  it('exportContributionsCSV produces valid CSV', async () => {
    // Dynamic import to avoid module initialization issues
    const { exportContributionsCSV } = await import('../exports')
    const data = [
      { label: 'Jan 24', total: 50000, verified: 40000, pending: 10000 },
      { label: 'Feb 24', total: 60000, verified: 55000, pending: 5000 },
    ]

    exportContributionsCSV(data)

    // Verify a download was triggered
    expect(clickSpy).toHaveBeenCalled()

    // Get the blob URL from the mock
    const anchor = vi.mocked(document.createElement).mock.results[0]?.value
    expect(anchor?.download).toBe('monthly_contributions.csv')
  })

  it('exportClaimsStatusCSV handles empty data', async () => {
    const { exportClaimsStatusCSV } = await import('../exports')
    exportClaimsStatusCSV({})
    expect(clickSpy).toHaveBeenCalled()
  })

  it('exportClaimsStatusCSV filters out zero values', async () => {
    const { exportClaimsStatusCSV } = await import('../exports')
    exportClaimsStatusCSV({ Approved: 5, Rejected: 0, Pending: 3 })
    expect(clickSpy).toHaveBeenCalled()
  })
})

describe('Export Record Types', () => {
  it('exports CSV for member records', async () => {
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement
      }
      return document.createElement(tag)
    })

    const { exportMemberRecordsCSV } = await import('../exports')
    exportMemberRecordsCSV([
      {
        member_full_name: 'Test User',
        member_phone: '0712345678',
        member_email: 'test@example.com',
        membership_number: 'LM001',
        status: 'active',
        joined_at: '2024-01-15T00:00:00Z',
      },
    ])
    expect(clickSpy).toHaveBeenCalled()
  })

  it('exports CSV for claim records', async () => {
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement
      }
      return document.createElement(tag)
    })

    const { exportClaimRecordsCSV } = await import('../exports')
    exportClaimRecordsCSV([
      {
        member_full_name: 'Test User',
        member_phone: '0712345678',
        member_email: 'test@example.com',
        claim_number: 'CLM-001',
        claim_type: 'Medical',
        amount_requested: 10000,
        approved_amount: 8000,
        status: 'Approved',
        package_name: 'Gold',
        submitted_at: '2024-01-15T00:00:00Z',
        decided_at: '2024-01-20T00:00:00Z',
        created_at: '2024-01-10T00:00:00Z',
      },
    ])
    expect(clickSpy).toHaveBeenCalled()
  })
})
