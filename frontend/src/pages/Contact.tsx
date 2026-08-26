import { useHead } from '../lib/seo'

const details = [
  { label: 'Phone / WhatsApp', value: '0798635024', href: 'tel:0798635024', icon: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ) },
  { label: 'Email', value: 'info@lumawelfare.or.ke', href: 'mailto:info@lumawelfare.or.ke', icon: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ) },
  { label: 'Address', value: 'P.O. Box 12345 – 00100, Nairobi, Kenya', href: null, icon: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) },
  { label: 'Website', value: 'www.lumawelfare.or.ke', href: 'https://www.lumawelfare.or.ke', icon: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ) },
]

export function Contact() {
  useHead('Contact', 'Contact Luma Welfare — phone, WhatsApp, email, and address. Reach the welfare office for membership, payment, and claim questions.')
  return (
    <div>
      {/* Page Hero */}
      <section className="bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="container-luma">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-300">Get in Touch</span>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">Contact Us</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Call, WhatsApp or email the welfare office. If your question is about your own
            contributions or a claim, sign in and check your dashboard first — most answers are there.
          </p>
          <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />
        </div>
      </section>

      <div className="container-luma py-14">
        <div className="grid gap-5 sm:grid-cols-2">
          {details.map((d) => (
            <div key={d.label} className="rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:shadow-md hover:border-luma-200">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-luma-50 text-luma-600">
                  {d.icon}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">{d.label}</div>
                  {d.href ? (
                    <a href={d.href} className="mt-1 block text-lg font-bold text-luma-700 hover:underline">
                      {d.value}
                    </a>
                  ) : (
                    <div className="mt-1 text-lg font-bold text-gray-900">{d.value}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 max-w-2xl rounded-2xl border border-gray-200 bg-white p-8">
          <h2 className="text-xl font-bold text-gray-900">What to have ready when you call</h2>
          <ul className="mt-4 space-y-2">
            <li className="flex items-center gap-3 text-sm text-gray-600">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-luma-500" />
              Your full name as registered
            </li>
            <li className="flex items-center gap-3 text-sm text-gray-600">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-luma-500" />
              Your membership number, if you have one
            </li>
            <li className="flex items-center gap-3 text-sm text-gray-600">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-luma-500" />
              For a payment question: the M-Pesa transaction ID
            </li>
          </ul>
        </div>

        <div className="mt-6 max-w-2xl rounded-2xl border border-gold-400/50 bg-gold-400/10 p-8">
          <h2 className="text-xl font-bold text-gray-900">Before you contact us</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            The office answers hundreds of WhatsApp messages, so it helps everyone if you first
            check your member dashboard. It shows your contributions per package, your waiting
            period progress, and whether a package is eligible for a claim. If the answer is not
            there, then message us.
          </p>
        </div>
      </div>
    </div>
  )
}
