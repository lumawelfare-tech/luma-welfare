import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SkeletonCard, SkeletonTable, SkeletonStat } from '../Skeleton'

describe('SkeletonCard', () => {
  it('renders with default lines', () => {
    const { container } = render(<SkeletonCard />)

    // Should render a card with skeleton rows
    const card = container.querySelector('.rounded-xl')
    expect(card).toBeInTheDocument()
  })

  it('renders custom number of lines', () => {
    const { container } = render(<SkeletonCard lines={5} />)

    const card = container.querySelector('.rounded-xl')
    expect(card).toBeInTheDocument()
  })
})

describe('SkeletonTable', () => {
  it('renders with default rows and cols', () => {
    const { container } = render(<SkeletonTable />)

    const table = container.querySelector('.space-y-3')
    expect(table).toBeInTheDocument()
  })

  it('renders custom rows and cols', () => {
    const { container } = render(<SkeletonTable rows={10} cols={6} />)

    const table = container.querySelector('.space-y-3')
    expect(table).toBeInTheDocument()
  })
})

describe('SkeletonStat', () => {
  it('renders a stat skeleton', () => {
    const { container } = render(<SkeletonStat />)

    const stat = container.querySelector('.rounded-2xl')
    expect(stat).toBeInTheDocument()
  })
})
