import { useHead } from '../lib/seo'

const details = [
  { label: 'Phone / WhatsApp', value: '0798635024', href: 'tel:0798635024' },
  { label: 'Email', value: 'info@lumawelfare.or.ke', href: 'mailto:info@lumawelfare.or.ke' },
  { label: 'Address', value: 'P.O. Box 12345 – 00100, Nairobi, Kenya' },
  { label: 'Website', value: 'www.lumawelfare.or.ke', href: 'https://www.lumawelfare.or.ke' },
]

export function Contact() {
  useHead('Contact', 'Contact Luma Welfare — phone, WhatsApp, email, and address. Reach the welfare office for membership, payment, and claim questions.')
  return (
    <div className="container-luma py-14">
      <h1 className="text-3xl font-bold text-luma-900 sm:text-4xl">Contact us</h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        Call, WhatsApp or email the welfare office. If your question is about your own
        contributions or a claim, sign in and check your dashboard first — most answers are there.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {details.map((d) => (
          <div key={d.label} className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="text-sm font-medium text-luma-900">{d.label}</div>
            {d.href ? (
              <a href={d.href} className="mt-1 text-lg font-semibold text-luma-700 hover:underline">
                {d.value}
              </a>
            ) : (
              <div className="mt-1 text-lg font-semibold text-stone-800">{d.value}</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 max-w-2xl rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="font-semibold text-luma-900">What to have ready when you call</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
          <li>Your full name as registered</li>
          <li>Your membership number, if you have one</li>
          <li>For a payment question: the M-Pesa transaction ID</li>
        </ul>
      </div>

      <div className="mt-6 max-w-2xl rounded-xl border border-gold-400/50 bg-gold-400/10 p-6">
        <h2 className="font-semibold text-stone-800">Before you contact us</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          The office answers hundreds of WhatsApp messages, so it helps everyone if you first
          check your member dashboard. It shows your contributions per package, your waiting
          period progress, and whether a package is eligible for a claim. If the answer is not
          there, then message us.
        </p>
      </div>
    </div>
  )
}