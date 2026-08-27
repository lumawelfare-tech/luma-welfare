import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from '../ConfirmDialog'

const defaultProps = {
  open: true,
  title: 'Delete Item',
  message: 'Are you sure you want to delete this item?',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

describe('ConfirmDialog', () => {
  it('renders when open', () => {
    render(<ConfirmDialog {...defaultProps} />)

    expect(screen.getByText('Delete Item')).toBeInTheDocument()
    expect(screen.getByText(/Are you sure/)).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />)

    expect(screen.queryByText('Delete Item')).not.toBeInTheDocument()
  })

  it('shows default confirm and cancel labels', () => {
    render(<ConfirmDialog {...defaultProps} />)

    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('shows custom confirm and cancel labels', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Delete"
        cancelLabel="Go Back"
      />,
    )

    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Go Back')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />)

    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape is pressed', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows loading state', () => {
    render(<ConfirmDialog {...defaultProps} loading />)

    expect(screen.getByText('Processing…')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeDisabled()
  })

  it('disables buttons when loading', () => {
    render(<ConfirmDialog {...defaultProps} loading />)

    const confirmBtn = screen.getByText('Processing…')
    const cancelBtn = screen.getByText('Cancel')
    expect(confirmBtn).toBeDisabled()
    expect(cancelBtn).toBeDisabled()
  })

  it('renders with danger variant by default', () => {
    render(<ConfirmDialog {...defaultProps} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('renders with warning variant', () => {
    render(<ConfirmDialog {...defaultProps} variant="warning" />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders with primary variant', () => {
    render(<ConfirmDialog {...defaultProps} variant="primary" />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('accepts ReactNode as message', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        message={<span data-testid="custom-message">Custom <strong>HTML</strong> message</span>}
      />,
    )

    expect(screen.getByTestId('custom-message')).toBeInTheDocument()
  })
})
