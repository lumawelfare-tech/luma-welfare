import { render, screen } from '@testing-library/react'
import { ClaimTimeline } from '../../../components/ClaimTimeline'

describe('ClaimTimeline', () => {
  it('renders all 5 steps', () => {
    render(<ClaimTimeline status="Draft" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    expect(screen.getByText('Under Review')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('marks Paid step as active when status is Paid', () => {
    render(<ClaimTimeline status="Paid" />)
    const group = screen.getByRole('group')
    expect(group).toBeInTheDocument()
    expect(group).toHaveAttribute('aria-label', 'Claim status: Paid')
  })

  it('renders Rejected status with rejection indicator', () => {
    render(<ClaimTimeline status="Rejected" />)
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('renders Additional Information Required status', () => {
    render(<ClaimTimeline status="Additional Information Required" />)
    expect(screen.getByText('Additional Information Required')).toBeInTheDocument()
  })

  it('shows Draft as current step', () => {
    render(<ClaimTimeline status="Draft" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('shows Submitted as active when status is Submitted', () => {
    render(<ClaimTimeline status="Submitted" />)
    expect(screen.getByText('Submitted')).toBeInTheDocument()
  })

  it('handles unknown status by rendering base timeline with no active steps', () => {
    render(<ClaimTimeline status="Unknown Status" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    expect(screen.getByText('Under Review')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Claim status: Unknown Status')
  })

  it('uses aria-label with correct status', () => {
    render(<ClaimTimeline status="Approved" />)
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Claim status: Approved')
  })
})
