import { useState, useEffect, useCallback } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About Us' },
  { to: '/packages', label: 'Packages' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/news', label: 'News & Events' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/contact', label: 'Contact Us' },
]

export function Layout() {
  const { member, isAdmin, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim()) navigate(`/packages?q=${encodeURIComponent(q.trim())}`)
  }

  // ESC key closes mobile menu
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      setOpen(false)
    }
  }, [open])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <div className="flex min-h-screen flex-col">
      {/* Skip navigation link for accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-luma-700 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg">
        Skip to main content
      </a>
      {/* Top Info Bar */}
      <div className="bg-luma-700 text-white">
        <div className="container-luma flex items-center justify-between py-2 text-xs">
          <div className="flex items-center gap-4 md:gap-6">
            <a href="tel:0798635024" className="flex items-center gap-1.5 hover:text-luma-200">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="hidden sm:inline">0798 635 024</span>
            </a>
            <a href="mailto:info@lumawelfare.or.ke" className="flex items-center gap-1.5 hover:text-luma-200">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="hidden md:inline">info@lumawelfare.or.ke</span>
            </a>
            <span className="hidden items-center gap-1.5 lg:flex">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              P.O. Box 12345 – 00100, Nairobi
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-white/70 sm:inline">Building stronger communities together</span>
            <div className="flex items-center gap-2">
              <a href="#" className="text-white/70 hover:text-white" aria-label="Facebook">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="#" className="text-white/70 hover:text-white" aria-label="Twitter">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
              </a>
              <a href="https://wa.me/254798635024" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white" aria-label="WhatsApp">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white shadow-sm">
        <div className="container-luma flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-luma-700 font-bold text-white text-sm">
              LW
            </span>
            <div className="hidden sm:block">
              <span className="block text-lg font-bold tracking-tight text-luma-800">
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
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'text-luma-700 border-b-2 border-luma-600'
                      : 'text-gray-600 hover:text-luma-700 hover:bg-luma-50'
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
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search packages…"
                  className="w-44 rounded-full border border-gray-200 bg-gray-50 pl-9 pr-3 py-2 text-sm outline-none focus:border-luma-500 focus:bg-white transition-all"
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
                        isActive ? 'text-luma-700 bg-luma-50' : 'text-gray-600 hover:text-luma-700 hover:bg-luma-50'
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
                      isActive ? 'text-luma-700 bg-luma-50' : 'text-gray-600 hover:text-luma-700 hover:bg-luma-50'
                    }`
                  }
                >
                  Dashboard
                </NavLink>
                <span className="hidden text-sm text-gray-500 sm:block">{member.full_name}</span>
                <button
                  onClick={logout}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/register"
                className="rounded-lg bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-luma-800 shadow-sm"
              >
                Join Now
              </Link>
            )}

            <button
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {open && (
          <nav className="border-t border-gray-100 bg-white shadow-lg lg:hidden">
            <div className="container-luma flex flex-col py-3">
              {navLinks.map((l) => (
                <NavLink
                  key={l.label}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-luma-50 hover:text-luma-700"
                >
                  {l.label}
                </NavLink>
              ))}
              {member && isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-luma-700 hover:bg-luma-50"
                >
                  Admin Panel
                </NavLink>
              )}
              {!member && (
                <Link
                  to="/register"
                  onClick={() => setOpen(false)}
                  className="mt-2 rounded-lg bg-luma-700 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-luma-800"
                >
                  Join Now
                </Link>
              )}
            </div>
          </nav>
        )}
      </header>

      <main id="main-content" className="flex-1" role="main">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-luma-950 text-white">
        <div className="container-luma">
          <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
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
                <a href="#" className="text-luma-300 hover:text-white" aria-label="Facebook">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a href="#" className="text-luma-300 hover:text-white" aria-label="Twitter">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                </a>
                <a href="https://wa.me/254798635024" target="_blank" rel="noopener noreferrer" className="text-luma-300 hover:text-white" aria-label="WhatsApp">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </a>
              </div>
            </div>

            {/* Quick Links */}
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

            {/* Information */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Information</h3>
              <ul className="space-y-2.5 text-sm">
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/faq">FAQ</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/privacy">Privacy Policy</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/terms">Terms & Conditions</Link></li>
                <li><Link className="text-luma-200 hover:text-white transition-colors" to="/contact">Contact</Link></li>
              </ul>
            </div>

            {/* Packages */}
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

            {/* Contact */}
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
                <li className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 flex-none text-luma-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-luma-200">P.O. Box 12345 – 00100, Nairobi, Kenya</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-luma-800 py-5 text-center text-xs text-luma-300">
            © {new Date().getFullYear()} Luma Welfare. All rights reserved. | Built with care for our community.
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/254798635024"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition-all hover:scale-110"
        aria-label="Chat on WhatsApp"
      >
        <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>
    </div>
  )
}
