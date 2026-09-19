import { describe, it, expect } from 'vitest'
import { mapPaymentUiStatus } from '../../hooks/usePaymentTracker'

describe('mapPaymentUiStatus', () => {
  it('maps Completed to success', () => {
    expect(mapPaymentUiStatus('Completed')).toBe('success')
  })

  it('maps Failed to failed', () => {
    expect(mapPaymentUiStatus('Failed')).toBe('failed')
  })

  it('maps stale Pending to expired', () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    expect(mapPaymentUiStatus('Pending', old)).toBe('expired')
  })

  it('maps recent Pending to pending', () => {
    const recent = new Date().toISOString()
    expect(mapPaymentUiStatus('Pending', recent)).toBe('pending')
  })
})
