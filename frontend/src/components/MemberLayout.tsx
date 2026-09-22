import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { NotificationBell } from './NotificationBell'
import { useHead } from '../lib/seo'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { PageTransition } from './PageTransition'
import { lumaDistance, lumaEase, lumaInstant, lumaMenuItem, lumaModal } from '../lib/lumaMotion'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
  )},
  { to: '/join', label: 'Programs', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
  )},
  { to: '/contributions', label: 'Contributions', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
  )},
  { to: '/family', label: 'Family & beneficiaries', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
  )},
  { to: '/documents', label: 'Documents', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
  )},
  { to: '/profile', label: 'Profile', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
  )},
  { to: '/receipts-statements', label: 'Receipts & Statements', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
  )},
  { to: '/claims', label: 'Claims', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )},
  { to: '/notifications', label: 'Notifications', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
  )},
  { to: '/notification-preferences', label: 'Notification Settings', icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  )},
]

const bottomNavItems = [
  {
    to: '/dashboard',
    label: 'Home',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    to: '/contributions',
    label: 'Contribute',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    to: '/claims',
    label: 'Claims',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
]

function navClass(isActive: boolean) {
  return `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-[var(--motion-fast)] ${
    isActive
      ? 'bg-luma-50/90 text-luma-800 shadow-sm'
      : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
  }`
}

export function MemberLayout() {
  const { member, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const mobileDrawerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(mobileDrawerRef, mobileOpen)
  useHead('Member Portal', undefined, { noindex: true })

  function handleLogout() {
    logout()
    navigate('/')
  }

  useEffect(() => {
    // eslint-disable-next-line oxc/react/set-state-in-effect — router pathname sync: close mobile nav on navigation
    setMobileOpen(false)
  }, [location.pathname])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && mobileOpen) setMobileOpen(false)
  }, [mobileOpen])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const memberName = member?.full_name ?? 'Member'
  const initials = memberName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const avatarUrl = (member as { photo_url?: string } | null)?.photo_url

  const sidebarInner = (
    <>
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-white/50">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-luma-700 font-bold text-white text-xs shadow-sm shadow-luma-700/25">
          LW
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900">Luma Welfare</div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-luma-700">Member Portal</div>
        </div>
      </div>

      <nav aria-label="Member sidebar" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => navClass(isActive)}>
            {item.icon}
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/50 px-4 py-4 pb-safe">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-luma-100 text-sm font-bold text-luma-800 overflow-hidden">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{memberName}</div>
            <div className="text-xs text-gray-600 truncate">{member?.email ?? ''}</div>
          </div>
        </div>
        {isAdmin && (
          <Link to="/admin" className="mt-3 flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-luma-800 hover:bg-luma-50/80 transition-colors">
            Admin Panel
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white/60 hover:text-gray-900 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-dvh max-w-[100vw] overflow-x-clip">
      <a href="#member-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-luma-700 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg">
        Skip to main content
      </a>

      <aside className="glass-sidebar hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-30">
        {sidebarInner}
      </aside>

      <div className="lg:hidden glass-header fixed top-0 inset-x-0 z-40 pt-safe">
        <div className="flex min-w-0 items-center justify-between px-4 h-14">
          <button type="button" onClick={() => setMobileOpen(true)} className="touch-target -ml-2 rounded-lg text-gray-700 hover:bg-white/60" aria-label="Open menu" aria-expanded={mobileOpen} aria-controls="member-mobile-nav">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-luma-700 font-bold text-white text-[10px]">LW</span>
            <span className="truncate text-sm font-bold text-gray-900">Luma Welfare</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-luma-100 text-xs font-bold text-luma-800 overflow-hidden">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex" id="member-mobile-nav">
            <motion.div
              className="fixed inset-0 bg-black/35 backdrop-blur-[2px]"
              initial={reduceMotion ? false : lumaModal.backdrop.initial}
              animate={lumaModal.backdrop.animate}
              exit={lumaModal.backdrop.exit}
              transition={lumaModal.backdrop.transition(Boolean(reduceMotion))}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              ref={mobileDrawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Member navigation"
              className="glass-sidebar relative flex w-[min(18rem,100vw)] max-w-full flex-col shadow-xl"
              initial={reduceMotion ? false : { x: lumaDistance.drawerXWide }}
              animate={{ x: 0 }}
              exit={reduceMotion ? undefined : { x: lumaDistance.drawerXWide }}
              transition={reduceMotion ? lumaInstant : lumaEase.drawerSpring}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/50 pt-safe">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-luma-700 font-bold text-white text-xs">LW</span>
                  <div className="truncate text-sm font-bold text-gray-900">Member Portal</div>
                </div>
                <button type="button" onClick={() => setMobileOpen(false)} className="touch-target rounded-lg text-gray-500 hover:bg-white/60" aria-label="Close menu">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <nav aria-label="Member sidebar" className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
                {navItems.map((item, i) => (
                  <motion.div
                    key={item.to}
                    initial={reduceMotion ? false : lumaMenuItem.initial}
                    animate={lumaMenuItem.animate}
                    transition={lumaMenuItem.transition(Boolean(reduceMotion), i)}
                  >
                    <NavLink
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) => navClass(isActive)}
                    >
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </motion.div>
                ))}
              </nav>
              <div className="border-t border-white/50 px-4 py-4 pb-safe">
                <button
                  type="button"
                  onClick={() => { setMobileOpen(false); handleLogout() }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-white/60"
                >
                  Sign Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main id="member-main" className="min-w-0 flex-1 lg:pl-64" role="main">
        <div className="pt-[calc(3.5rem+env(safe-area-inset-top,0px))] pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:pt-0 lg:pb-0">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>

      {/* Primary mobile bottom tabs — secondary routes stay in the drawer */}
      <nav
        aria-label="Primary member navigation"
        className="glass-header lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/60 pb-safe"
      >
        <ul className="grid grid-cols-4 h-[3.5rem]">
          {bottomNavItems.map((item) => (
            <li key={item.to} className="min-w-0">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex h-full min-h-11 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold transition-colors duration-[var(--motion-fast)] ${
                    isActive ? 'text-luma-800' : 'text-gray-500 hover:text-gray-800'
                  }`
                }
              >
                {item.icon}
                <span className="truncate max-w-full">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
