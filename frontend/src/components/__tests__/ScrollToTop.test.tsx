import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { ScrollToTop, scrollWindowToTop } from '../ScrollToTop'

describe('ScrollToTop', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('scrolls to top on pathname change', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/about']}>
        <ScrollToTop />
        <Link to="/">Home</Link>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/about" element={<div>about</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
    vi.mocked(window.scrollTo).mockClear()

    await user.click(document.querySelector('a[href="/"]')!)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
  })

  it('scrollWindowToTop resets window scroll immediately', () => {
    scrollWindowToTop()
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
  })
})
