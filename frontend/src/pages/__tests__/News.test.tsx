/**
 * Loading / empty / error / retry states for a data-driven public page.
 * Exercises SkeletonCard, EmptyState and the user-facing error mapper together.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError } from '../../lib/api'

const { mockApi } = vi.hoisted(() => ({ mockApi: vi.fn() }))

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return { ...actual, api: mockApi }
})

import { News } from '../News'

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const item = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'n1',
  title: 'AGM notice',
  body: 'The annual general meeting is on Friday.',
  type: 'news',
  event_date: null,
  published_at: '2026-09-01T00:00:00Z',
  ...over,
})

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mockApi.mockReset()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('News — loading state', () => {
  it('shows skeleton placeholders while the request is in flight', () => {
    mockApi.mockReturnValue(deferred<void>().promise)
    render(<News />)

    const skeletons = document.querySelectorAll('.luma-skeleton')
    expect(skeletons.length).toBeGreaterThan(0)
    expect(screen.queryByText('No announcements yet')).not.toBeInTheDocument()
    expect(screen.queryByText(/Couldn/)).not.toBeInTheDocument()
  })

  it('does not render the empty state before the request settles', () => {
    mockApi.mockReturnValue(deferred<void>().promise)
    render(<News />)

    expect(document.body.textContent).not.toContain('No announcements yet')
  })
})

describe('News — loaded state', () => {
  it('renders returned items with their type badge', async () => {
    mockApi.mockResolvedValue({
      items: [item(), item({ id: 'n2', type: 'event', title: 'Help drive', event_date: '2026-10-02' })],
    })
    render(<News />)

    expect(await screen.findByText('AGM notice')).toBeInTheDocument()
    expect(screen.getByText('Help drive')).toBeInTheDocument()
    expect(screen.getByText('News')).toBeInTheDocument()
    expect(screen.getByText('Event')).toBeInTheDocument()
    expect(screen.queryByText('No announcements yet')).not.toBeInTheDocument()
  })

  it('requests the news resource explicitly', async () => {
    mockApi.mockResolvedValue({ items: [] })
    render(<News />)

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/news?resource=news'))
  })
})

describe('News — empty state', () => {
  it('shows an empty state with a retry action when there are no items', async () => {
    mockApi.mockResolvedValue({ items: [] })
    render(<News />)

    expect(await screen.findByText('No announcements yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('degrades to the error state when a 200 response has no usable body', async () => {
    mockApi.mockResolvedValue(null)
    render(<News />)

    expect(await screen.findByText(/Couldn/)).toBeInTheDocument()
    expect(screen.getByText('Could not load news.')).toBeInTheDocument()
  })
})

describe('News — error state', () => {
  it('shows a friendly error and hides the list when the request fails', async () => {
    mockApi.mockRejectedValue(new ApiError(500, 'Internal', 'INTERNAL'))
    render(<News />)

    expect(await screen.findByText(/Couldn/)).toBeInTheDocument()
    expect(screen.getByText('Could not load news.')).toBeInTheDocument()
    expect(screen.queryByText('AGM notice')).not.toBeInTheDocument()
  })

  it('shows a connectivity message for network failures', async () => {
    mockApi.mockRejectedValue(new ApiError(0, 'Unable to reach the server. Check your connection and try again.', 'NETWORK'))
    render(<News />)

    expect(await screen.findByText(/Unable to reach the server/)).toBeInTheDocument()
  })

  it('never leaks SQL or infrastructure internals to the user', async () => {
    mockApi.mockRejectedValue(
      new ApiError(500, 'SELECT * FROM members failed: relation does not exist', 'INTERNAL'),
    )
    render(<News />)

    await screen.findByText(/Couldn/)
    expect(screen.getByText('Could not load news.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/SELECT \* FROM members/)
    expect(document.body.textContent).not.toMatch(/relation does not exist/)
    expect(document.body.textContent).not.toMatch(/postgres|postgrest/i)
  })

  it('surfaces a 4xx server message verbatim when it is safe', async () => {
    mockApi.mockRejectedValue(new ApiError(400, 'Rate limit exceeded', 'RATE_LIMITED'))
    render(<News />)

    expect(await screen.findByText('Rate limit exceeded')).toBeInTheDocument()
  })
})

describe('News — retry', () => {
  it('re-fetches when Retry is clicked and recovers', async () => {
    mockApi
      .mockRejectedValueOnce(new ApiError(500, 'Internal', 'INTERNAL'))
      .mockResolvedValueOnce({ items: [item()] })

    render(<News />)

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('AGM notice')).toBeInTheDocument()
    expect(screen.queryByText(/Couldn/)).not.toBeInTheDocument()
    expect(mockApi).toHaveBeenCalledTimes(2)
  })

  it('stays in the error state when the retry also fails', async () => {
    mockApi.mockRejectedValue(new ApiError(0, 'Unable to reach the server. Check your connection and try again.', 'NETWORK'))

    render(<News />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText(/Couldn/)).toBeInTheDocument()
    expect(mockApi).toHaveBeenCalledTimes(2)
  })
})
