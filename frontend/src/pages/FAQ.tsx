import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'

const faqs = [
  {
    q: 'How do I become a member?',
    a: 'Register on this site with your name, email and phone number. An admin approves your account, then you can join packages.',
  },
  {
    q: 'How much do I contribute, and how often?',
    a: 'Each package has its own monthly amount. The Welfare Package is KSh 100 a month for an individual, KSh 300 for a nuclear family, and KSh 500 for an extended family. Hospital Insurance and Education Support are KSh 1,200 a month. Most other packages are KSh 2,000 a month. The full list is on the Packages page.',
  },
  {
    q: 'What happens if I miss a Welfare Package payment?',
    a: 'Your burial and emergency cover is at risk until you catch up. If you miss more than two months, the cover is considered lapsed. Keep this package current if it matters to your family.',
  },
  {
    q: 'Can I hold more than one package?',
    a: 'Yes. Members can hold the Welfare Package, Hospital Insurance and Business Support at the same time, for example. Each package is tracked separately — its own contributions, its own waiting period, its own qualification.',
  },
  {
    q: 'How long do I wait before I can claim?',
    a: 'Most packages have a 12-month waiting period. Education Support has 6 months. The Welfare Package has no fixed waiting period, but your contributions must stay current.',
  },
  {
    q: 'How do I submit a claim?',
    a: 'From your member dashboard, open the package you want to claim against, then start a claim. You will upload the documents that package needs — a medical bill for hospital cover, receipts or a police report for disaster relief, documentation for a bereavement. An admin reviews it.',
  },
  {
    q: 'How much will I be paid out?',
    a: 'This is still being confirmed with the committee. Printed materials show two different benefit models, so we are not publishing a figure until Luma confirms which one applies. Ask us directly if you need to know for a decision.',
  },
  {
    q: 'Is my money and personal data safe?',
    a: 'Contributions go to the official M-Pesa Paybill (522522, account 454545#), the same paybill the welfare runs on. Access to member data is restricted by role, and every action an admin takes is recorded in an audit log.',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-stone-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-medium text-luma-900">{q}</span>
        <span className={`text-luma-600 transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && <p className="border-t border-stone-100 px-5 py-4 text-sm leading-relaxed text-stone-700">{a}</p>}
    </div>
  )
}

export function FAQ() {
  useHead('FAQ', 'Frequently asked questions about Luma Welfare membership, contributions, waiting periods, claims, and more.')
  return (
    <div className="container-luma py-14">
      <h1 className="text-3xl font-bold text-luma-900 sm:text-4xl">Frequently asked questions</h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        The answers members ask most. If your question is not here, call or WhatsApp 0798635024.
      </p>

      <div className="mt-8 max-w-3xl space-y-3">
        {faqs.map((f) => (
          <FaqItem key={f.q} q={f.q} a={f.a} />
        ))}
      </div>

      <div className="mt-10 max-w-3xl rounded-xl border border-luma-200 bg-luma-50 p-6">
        <h2 className="font-semibold text-luma-900">Still have a question?</h2>
        <p className="mt-2 text-sm text-stone-700">
          Contact us on WhatsApp or by phone, or visit the contact page.
        </p>
        <Link to="/contact" className="mt-3 inline-block text-sm font-semibold text-luma-700 hover:underline">
          Contact page →
        </Link>
      </div>
    </div>
  )
}