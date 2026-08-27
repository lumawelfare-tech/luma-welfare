import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders message', () => {
    render(<EmptyState message="No items found" />)

    expect(screen.getByText('No items found')).toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(<EmptyState title="No Data" message="Nothing to show" />)

    expect(screen.getByText('No Data')).toBeInTheDocument()
    expect(screen.getByText('Nothing to show')).toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        message="No items"
        action={{ label: 'Create Item', onClick }}
      />,
    )

    const button = screen.getByText('Create Item')
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not render action button when not provided', () => {
    render(<EmptyState message="No items" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(
      <EmptyState
        message="No items"
        icon="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />,
    )

    // Icon SVG should be rendered
    const svg = document.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
