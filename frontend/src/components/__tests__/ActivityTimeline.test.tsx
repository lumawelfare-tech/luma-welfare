import { describe, expect, it } from 'vitest'
import { activityToneFromStatus } from '../ActivityTimeline'
import { render, screen } from '@testing-library/react'
import { ActivityTimeline } from '../ActivityTimeline'

describe('ActivityTimeline', () => {
  it('groups items by day label', () => {
    const now = new Date()
    render(
      <ActivityTimeline
        items={[
          { id: '1', title: 'Contribution received', at: now.toISOString(), tone: 'success' },
          { id: '2', title: 'Claim submitted', at: now.toISOString(), tone: 'info' },
        ]}
      />,
    )
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Contribution received')).toBeInTheDocument()
    expect(screen.getByText('Claim submitted')).toBeInTheDocument()
  })

  it('shows empty message when no items', () => {
    render(<ActivityTimeline items={[]} emptyMessage="Nothing yet." />)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
  })
})

describe('activityToneFromStatus', () => {
  it('maps common statuses', () => {
    expect(activityToneFromStatus('queued')).toBe('warning')
    expect(activityToneFromStatus('sent')).toBe('success')
    expect(activityToneFromStatus('failed')).toBe('error')
  })
})
