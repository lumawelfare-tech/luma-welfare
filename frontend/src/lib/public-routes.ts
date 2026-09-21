/**
 * Canonical public marketing routes (indexable).
 * Shared by SEO helpers, sitemap/robots generation, and prerender.
 */

export type PublicRoute = {
  path: string
  title: string
  description: string
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority: number
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  {
    path: '/',
    title: 'Luma Welfare — Community Welfare Platform in Kenya',
    description:
      'Luma Welfare is a community welfare organization in Kenya. Members contribute monthly to support each other through key life events — hospital costs, education, business, building, and more.',
    changefreq: 'weekly',
    priority: 1,
  },
  {
    path: '/about',
    title: 'About',
    description:
      'Learn about Luma Welfare — our mission, values, and how we provide accessible welfare services for all members in Kenya.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  {
    path: '/packages',
    title: 'Packages',
    description:
      'Explore Luma Welfare packages — affordable community welfare plans for hospital costs, education, business, building, and more.',
    changefreq: 'weekly',
    priority: 0.9,
  },
  {
    path: '/how-it-works',
    title: 'How It Works',
    description:
      'Four steps from joining Luma Welfare to claiming benefits. Register, contribute monthly, wait, and access your benefits.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  {
    path: '/faq',
    title: 'FAQ',
    description:
      'Frequently asked questions about Luma Welfare membership, packages, contributions, claims, and more.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy',
    description: 'Privacy Policy for the Luma Welfare community welfare management platform.',
    changefreq: 'yearly',
    priority: 0.5,
  },
  {
    path: '/terms',
    title: 'Terms & Conditions',
    description: 'Terms and Conditions for using the Luma Welfare community welfare management platform.',
    changefreq: 'yearly',
    priority: 0.5,
  },
  {
    path: '/contact',
    title: 'Contact',
    description:
      'Contact Luma Welfare — phone, WhatsApp, email, and address. Reach the welfare office for membership, payment, and claim questions.',
    changefreq: 'monthly',
    priority: 0.6,
  },
  {
    path: '/news',
    title: 'News & Events',
    description: 'Updates from the Luma Welfare office and upcoming member events.',
    changefreq: 'weekly',
    priority: 0.6,
  },
  {
    path: '/gallery',
    title: 'Gallery',
    description: 'Photos from Luma Welfare events and member activities.',
    changefreq: 'weekly',
    priority: 0.5,
  },
  {
    path: '/media',
    title: 'Media',
    description: "Explore Luma Welfare's latest photos, videos, publications and media content.",
    changefreq: 'weekly',
    priority: 0.5,
  },
]

/** Paths that must stay noindex / out of sitemap (auth + portals). */
export const NOINDEX_PREFIXES = [
  '/admin',
  '/dashboard',
  '/contributions',
  '/join',
  '/profile',
  '/family',
  '/claims',
  '/notifications',
  '/notification-preferences',
  '/receipts-statements',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
] as const

export function resolveSiteUrl(env: Record<string, string | undefined> = {}): string {
  const raw =
    env.VITE_SITE_URL
    || env.SITE_URL
    || env.VITE_PUBLIC_SITE_URL
    || 'https://luma-welfare.vercel.app'
  return raw.replace(/\/+$/, '')
}
