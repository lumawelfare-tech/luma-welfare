import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { scrollWindowToTop } from './ScrollToTop'
import { useFocusTrap } from '../hooks/useFocusTrap'

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

  const menuTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 32 }

  return (
    <div className="flex min-h-dvh w-full max-w-[100vw] flex-col overflow-x-clip">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-luma-700 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg">
        Skip to main content
      </a>

      {/* Main navigation */}
      <header className="glass-header sticky top-0 z-40 pt-safe">
        <div className="container-luma flex h-16 min-w-0 items-center justify-between gap-2 sm:gap-4">
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
                  whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  className="rounded-lg border border-white/60 bg-white/50 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white/80"
                >
                  Sign out
                </motion.button>
              </div>
            ) : (
              <motion.div whileHover={reduceMotion ? undefined : { scale: 1.03 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }}>
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
              whileTap={reduceMotion ? undefined : { scale: 0.92 }}
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
                      initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={reduceMotion ? { duration: 0 } : { delay: 0.03 * i, duration: 0.2 }}
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
        <Outlet />
      </main>

      {/* Footer — unchanged this step */}
      <footer className="bg-luma-950 text-white">
        <div className="container-luma">
          <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-luma-700 font-bold text-white text-sm">
                  LW
                </span>
                <div>
                  <span className="block text-lg font-bold text-white">Luma Welfare</span>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-luma-300">Community Welfare</span>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-luma-200">
                A community welfare organization in Kenya. Members contribute monthly to support each other through key life events.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <a href="https://wa.me/254798635024" target="_blank" rel="noopener noreferrer" className="text-luma-300 hover:text-white" aria-label="WhatsApp">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </a>
              </div>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Quick Links</h3>
              <ul className="space-y-2.5 text-sm">
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/about">About Us</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/packages">Our Packages</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/how-it-works">How It Works</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/faq">FAQ</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/register">Join Now</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Information</h3>
              <ul className="space-y-2.5 text-sm">
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/faq">FAQ</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/privacy">Privacy Policy</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/terms">Terms & Conditions</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/contact">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Packages</h3>
              <ul className="space-y-2.5 text-sm">
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/packages">Hospital Insurance</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/packages">Education Support</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/packages">Business Support</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/packages">Building Support</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/packages">Welfare Package</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Contact Us</h3>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 flex-none text-luma-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className="text-luma-200">0798 635 024</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 flex-none text-luma-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-luma-200">info@lumawelfare.or.ke</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-luma-800 py-5 text-center text-xs text-luma-300">
            © {new Date().getFullYear()} Luma Welfare. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

