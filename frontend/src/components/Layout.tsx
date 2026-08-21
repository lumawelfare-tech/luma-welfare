import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About Us' },
  { to: '/packages', label: 'Packages' },
  { to: '/dashboard', label: 'Members' },
  { to: '/dashboard', label: 'Claims' },
  { to: '/news', label: 'News & Events' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/contact', label: 'Contact Us' },
]

export function Layout() {
  const { member, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim()) navigate(`/packages?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="container-luma flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-luma-600 font-bold text-white">
              LW
            </span>
            <span className="text-lg font-bold tracking-tight text-luma-900">
              Luma Welfare
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map((l) => (
              <NavLink
                key={l.label}
                to={l.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-luma-50 text-luma-800' : 'text-stone-600 hover:bg-stone-100'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <form onSubmit={submitSearch} className="hidden md:block">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search packages…"
                className="w-40 rounded-md border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-luma-500"
              />
            </form>

            {member ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-stone-500 sm:block">{member.full_name}</span>
                <button
                  onClick={logout}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/register"
                className="rounded-md bg-luma-600 px-4 py-2 text-sm font-semibold text-white hover:bg-luma-700"
              >
                Join Now
              </Link>
            )}

            <button
              className="rounded-md p-2 text-stone-600 hover:bg-stone-100 lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {open && (
          <nav className="border-t border-stone-200 bg-white lg:hidden">
            <div className="container-luma flex flex-col py-2">
              {navLinks.map((l) => (
                <NavLink
                  key={l.label}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
                >
                  {l.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-stone-200 bg-luma-950 text-luma-100">
        <div className="container-luma grid gap-8 py-10 sm:grid-cols-3">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-luma-300">
              Luma Welfare
            </h3>
            <p className="text-sm leading-relaxed text-luma-200">
              A community welfare organization in Kenya. Members contribute monthly to support
              each other through key life events.
            </p>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-luma-300">
              Contact
            </h3>
            <ul className="space-y-1 text-sm text-luma-200">
              <li>Phone / WhatsApp: 0798635024</li>
              <li>Email: info@lumawelfare.or.ke</li>
              <li>P.O. Box 12345 – 00100, Nairobi, Kenya</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-luma-300">
              Quick links
            </h3>
            <ul className="space-y-1 text-sm">
              <li><Link className="text-luma-200 hover:text-white" to="/packages">Packages</Link></li>
              <li><Link className="text-luma-200 hover:text-white" to="/how-it-works">How it works</Link></li>
              <li><Link className="text-luma-200 hover:text-white" to="/faq">FAQ</Link></li>
              <li><Link className="text-luma-200 hover:text-white" to="/register">Join now</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-luma-900 py-4 text-center text-xs text-luma-300">
          © {new Date().getFullYear()} Luma Welfare. All rights reserved.
        </div>
      </footer>
    </div>
  )
}