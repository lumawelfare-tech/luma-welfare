import { render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, vi, type Mock } from 'vitest'
import { StatBar } from '../StatBar'
import { api } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  api: vi.fn(),
}))

const mockedApi = api as Mock

beforeAll(() => {
  class MockIntersectionObserver {
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds: readonly number[] = []
    constructor(private readonly cb: IntersectionObserverCallback) {}
    observe() {
      this.cb(
        [{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      )
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('StatBar', () => {
  beforeEach(() => {
    mockedApi.mockReset()
  })

  it('shows a loading skeleton before stats resolve (no placeholder copy)', () => {
    mockedApi.mockReturnValue(new Promise(() => {}))
    const { container } = render(<StatBar />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('renders only confirmed numeric stats', async () => {
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
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getByText('Commitment')).toBeInTheDocument()
    expect(screen.queryByText('Successful Claims')).not.toBeInTheDocument()
    expect(screen.queryByText('Lives Touched')).not.toBeInTheDocument()
    expect(screen.queryByText('Awaiting confirmation')).not.toBeInTheDocument()
  })

  it('omits the entire bar when no stats are confirmed', async () => {
    mockedApi.mockResolvedValue({
      stats: {
        members: null,
        successful_claims: null,
        lives_touched: null,
        commitment: null,
      },
    })
    const { container } = render(<StatBar />)
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith('/settings?resource=settings')
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('omits the bar on empty settings payload', async () => {
    mockedApi.mockResolvedValue({})
    const { container } = render(<StatBar />)
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalled()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('omits the bar on API failure', async () => {
    mockedApi.mockRejectedValue(new Error('Network error'))
    const { container } = render(<StatBar />)
    await waitFor(() => {
      expect(mockedApi).toHaveBeenCalledWith('/settings?resource=settings')
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('formats large confirmed numbers with locale', async () => {
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
      expect(screen.getByText('100%')).toBeInTheDocument()
    })
  })
})
