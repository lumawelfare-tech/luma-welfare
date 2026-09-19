import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Scroll window to top on every pathname change (BrowserRouter has no built-in restoration). */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return null
}

/** Use on logo / Home links so same-route clicks still reset scroll. */
export function scrollWindowToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}
