import { render, screen, waitFor } from '@testing-library/react'
import { vi, type Mock } from 'vitest'
import { StatBar } from '../StatBar'
import { api } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  api: vi.fn(),
}))

const mockedApi = api as Mock

describe('StatBar', () => {
  beforeEach(() => {
    mockedApi.mockReset()
  })

  it('renders loading placeholder before stats load', () => {
    mockedApi.mockReturnValue(new Promise(() => {}))
    render(<StatBar />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('renders stat values from API response', async () => {
    mockedApi.mockResolvedValue({
      stats: {
        members: 142,
        successful_claims: null,
        lives_touched: null,
        commitment: 92,
      },
    })
    render(<StatBar />)
    await waitFor(() => {
      expect(screen.getByText('142+')).toBeInTheDocument()
    })
    expect(screen.getByText('92%')).toBeInTheDocument()
  })

  it('shows "Awaiting confirmation" for unconfirmed claims/lives', async () => {
    mockedApi.mockResolvedValue({
      stats: {
        members: 50,
        successful_claims: null,
        lives_touched: null,
        commitment: 80,
      },
    })
    render(<StatBar />)
    await waitFor(() => {
      expect(screen.getAllByText('Awaiting confirmation')).toHaveLength(2)
    })
  })

  it('shows "Awaiting confirmation" as single string for null unconfirmed values', async () => {
    mockedApi.mockResolvedValue({
      stats: { successful_claims: 12, lives_touched: 340 },
    })
    render(<StatBar />)
    await waitFor(() => {
      expect(screen.getByText('12+')).toBeInTheDocument()
      expect(screen.getByText('340+')).toBeInTheDocument()
    })
  })

  it('handles empty stats response', async () => {
    mockedApi.mockResolvedValue({})
    render(<StatBar />)
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith('/settings?resource=settings')
    })
  })

  it('does not crash on API failure', async () => {
    mockedApi.mockRejectedValue(new Error('Network error'))
    render(<StatBar />)
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith('/settings?resource=settings')
    })
  })

  it('formats large numbers with locale', async () => {
    mockedApi.mockResolvedValue({
      stats: {
        members: 12345,
        successful_claims: 67890,
        lives_touched: 120000,
        commitment: 100,
      },
    })
    render(<StatBar />)
    await waitFor(() => {
      expect(screen.getByText('12,345+')).toBeInTheDocument()
      expect(screen.getByText('67,890+')).toBeInTheDocument()
      expect(screen.getByText('120,000+')).toBeInTheDocument()
    })
  })

  it('renders all four stat labels', () => {
    mockedApi.mockReturnValue(new Promise(() => {}))
    render(<StatBar />)
    expect(screen.getByText('Happy Members')).toBeInTheDocument()
    expect(screen.getByText('Successful Claims')).toBeInTheDocument()
    expect(screen.getByText('Lives Touched')).toBeInTheDocument()
    expect(screen.getByText('Commitment')).toBeInTheDocument()
  })
})
