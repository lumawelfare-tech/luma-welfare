import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { scrollWindowToTop } from './ScrollToTop'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { SiteFooter } from './SiteFooter'
import { PageTransition } from './PageTransition'
import { lumaEase, lumaHover, lumaInstant, lumaMenuItem, lumaPress } from '../lib/lumaMotion'

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About Us' },
  { to: '/packages', label: 'Packages' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/news', label: 'News & Events' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/media', label: 'Media' },
  { to: '/contact', label: 'Contact Us' },
]

export function Layout() {
  const { member, isAdmin, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const mobileMenuRef = useRef<HTMLElement>(null)
  useFocusTrap(mobileMenuRef, open)

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim()) navigate(`/packages?q=${encodeURIComponent(q.trim())}`)
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      setOpen(false)
    }
  }, [open])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const menuTransition = reduceMotion ? lumaInstant : lumaEase.menuSpring

  return (
    <div className="flex min-h-dvh w-full max-w-[100vw] flex-col overflow-x-clip">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-luma-700 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg">
        Skip to main content
      </a>

      {/* Main navigation */}
      <header
        className={`glass-header sticky top-0 z-40 pt-safe transition-[box-shadow,background-color] duration-[var(--motion-normal)] ease-[var(--luma-ease-out)] ${
          scrolled ? 'glass-header-scrolled' : ''
        }`}
      >
        <div
          className={`container-luma flex min-w-0 items-center justify-between gap-2 sm:gap-4 transition-[height] duration-[var(--motion-normal)] ease-[var(--luma-ease-out)] ${
            scrolled ? 'h-14' : 'h-16'
          }`}
        >
          <Link to="/" onClick={scrollWindowToTop} className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-luma-700 font-bold text-white text-sm shadow-sm shadow-luma-700/25">
              LW
            </span>
            <div className="hidden min-w-0 sm:block">
              <span className="block truncate text-lg font-bold tracking-tight text-luma-800">
                Luma Welfare
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-wider text-luma-600">
                Community Welfare
              </span>
            </div>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
            {navLinks.map((l) => (
              <NavLink
                key={l.label}
                to={l.to}
                onClick={l.to === '/' ? scrollWindowToTop : undefined}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-luma-50/80 text-luma-800 border-b-2 border-luma-600'
                      : 'text-gray-700 hover:text-luma-700 hover:bg-white/50'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <form onSubmit={submitSearch} className="hidden md:block">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search packages…"
                  className="glass-input w-44 rounded-full pl-9 pr-3 py-2 text-sm text-gray-800 placeholder:text-gray-500"
                />
              </div>
            </form>

            {member ? (
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                        isActive ? 'text-luma-800 bg-luma-50/80' : 'text-gray-700 hover:text-luma-700 hover:bg-white/50'
                      }`
                    }
                  >
                    Admin
                  </NavLink>
                )}
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      isActive ? 'text-luma-800 bg-luma-50/80' : 'text-gray-700 hover:text-luma-700 hover:bg-white/50'
                    }`
                  }
                >
                  Dashboard
                </NavLink>
                <span className="hidden text-sm text-gray-600 sm:block">{member.full_name}</span>
                <motion.button
                  type="button"
                  onClick={logout}
                  whileHover={lumaHover.cta(Boolean(reduceMotion))}
                  whileTap={lumaPress.default(Boolean(reduceMotion))}
                  className="rounded-lg border border-white/60 bg-white/50 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white/80"
                >
                  Sign out
                </motion.button>
              </div>
            ) : (
              <motion.div whileHover={lumaHover.ctaStrong(Boolean(reduceMotion))} whileTap={lumaPress.default(Boolean(reduceMotion))}>
                <Link
                  to="/register"
                  className="inline-block rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-luma-700/30 hover:bg-luma-800"
                >
                  Join Now
                </Link>
              </motion.div>
            )}

            <motion.button
              type="button"
              className="touch-target rounded-lg text-gray-700 hover:bg-white/60 lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
              aria-expanded={open}
              aria-controls="mobile-nav"
              whileTap={lumaPress.icon(Boolean(reduceMotion))}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </motion.button>
          </div>
        </div>

        {/* Glass mobile menu */}
        <AnimatePresence>
          {open && (
            <motion.nav
              ref={mobileMenuRef}
              id="mobile-nav"
              key="mobile-menu"
              aria-label="Mobile navigation"
              initial={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={menuTransition}
              className="overflow-hidden border-t border-white/50 lg:hidden"
            >
              <div className="glass-strong">
                <div className="container-luma flex flex-col py-3">
                  {navLinks.map((l, i) => (
                    <motion.div
                      key={l.label}
                      initial={reduceMotion ? false : lumaMenuItem.initial}
                      animate={lumaMenuItem.animate}
                      transition={lumaMenuItem.transition(Boolean(reduceMotion), i)}
                    >
                      <NavLink
                        to={l.to}
                        onClick={() => {
                          setOpen(false)
                          if (l.to === '/') scrollWindowToTop()
                        }}
                        className={({ isActive }) =>
                          `flex min-h-11 items-center rounded-lg px-4 py-3 text-sm font-medium ${
                            isActive
                              ? 'bg-luma-50 text-luma-800'
                              : 'text-gray-800 hover:bg-white/70 hover:text-luma-700'
                          }`
                        }
                      >
                        {l.label}
                      </NavLink>
                    </motion.div>
                  ))}
                  {member && isAdmin && (
                    <NavLink
                      to="/admin"
                      onClick={() => setOpen(false)}
                      className="flex min-h-11 items-center rounded-lg px-4 py-3 text-sm font-semibold text-luma-800 hover:bg-luma-50"
                    >
                      Admin Panel
                    </NavLink>
                  )}
                  {!member && (
                    <Link
                      to="/register"
                      onClick={() => setOpen(false)}
                      className="mt-2 flex min-h-11 items-center justify-center rounded-lg bg-luma-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-luma-800"
                    >
                      Join Now
                    </Link>
                  )}
                </div>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main id="main-content" className="min-w-0 flex-1" role="main">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <SiteFooter />
    </div>
  )
}

