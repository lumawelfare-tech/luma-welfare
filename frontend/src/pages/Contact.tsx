import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'
import {
  PageHero,
  fieldClass,
  alertErrorClass,
  alertSuccessClass,
} from '../components/PageHero'
import { MotionSection } from '../components/MotionSection'
import { Icon } from '../components/Icon'
import { api, ApiError } from '../lib/api'

const PHONE_DISPLAY = '0798 635 024'
const PHONE_TEL = '0798635024'
const EMAIL = 'info@lumawelfare.or.ke'
const WHATSAPP = 'https://wa.me/254798635024'
const WEBSITE = 'https://www.lumawelfare.or.ke'

function WhatsAppGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

type ChannelIcon = 'phone' | 'mail' | 'globe' | 'whatsapp'

const channels: {
  label: string
  value: string
  href: string | null
  icon: ChannelIcon
  hint: string
  external?: boolean
}[] = [
  {
    label: 'Phone',
    value: PHONE_DISPLAY,
    href: `tel:${PHONE_TEL}`,
    icon: 'phone',
    hint: 'Office line',
  },
  {
    label: 'WhatsApp',
    value: PHONE_DISPLAY,
    href: WHATSAPP,
    icon: 'whatsapp',
    hint: 'Fastest for quick questions',
    external: true,
  },
  {
    label: 'Email',
    value: EMAIL,
    href: `mailto:${EMAIL}`,
    icon: 'mail',
    hint: 'Membership & documentation',
  },
  {
    label: 'Website',
    value: 'www.lumawelfare.or.ke',
    href: WEBSITE,
    icon: 'globe',
    hint: 'Official site',
    external: true,
  },
]

const readyItems = [
  'Your full name as registered',
  'Your membership number, if you have one',
  'For a payment question: the M-Pesa transaction ID',
]

type FormState = {
  name: string
  email: string
  phone: string
  subject: string
  message: string
  company: string
}

const emptyForm: FormState = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
  company: '',
}

export function Contact() {
  useHead('Contact', 'Contact Luma Welfare — phone, WhatsApp, and email. Reach the welfare office for membership, payment, and claim questions.', {
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Contact', path: '/contact' },
    ],
  })

  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      const res = await api<{ message?: string }>('/contact', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          subject: form.subject.trim(),
          message: form.message.trim(),
          company: form.company,
        },
      })
      setSuccess(res.message ?? 'Thank you. Your message has been sent.')
      setForm(emptyForm)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Unable to send your message. Please try WhatsApp or email instead.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      <PageHero
        eyebrow="Get in Touch"
        title="Contact Us"
        description="Call, WhatsApp or email the welfare office. If your question is about your own contributions or a claim, sign in and check your dashboard first — most answers are there."
      />

      <MotionSection as="div" className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-20 top-10 h-56 w-56 rounded-full bg-luma-100/70 blur-3xl" />
          <div className="absolute right-0 top-40 h-64 w-64 rounded-full bg-luma-50 blur-3xl" />
        </div>

        <div className="container-luma relative py-12 sm:py-16">
          <div className="flex flex-wrap gap-3">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1ebe57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600 focus-visible:ring-offset-2"
            >
              <WhatsAppGlyph className="h-4 w-4" />
              Chat on WhatsApp
            </a>
            <a
              href={`tel:${PHONE_TEL}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-luma-700 px-6 py-3 text-sm font-bold text-white shadow-sm shadow-luma-700/20 transition-colors hover:bg-luma-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600 focus-visible:ring-offset-2"
            >
              <Icon name="phone" className="h-4 w-4" />
              Call {PHONE_DISPLAY}
            </a>
            <a
              href={`mailto:${EMAIL}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-luma-600 bg-white px-6 py-3 text-sm font-bold text-luma-700 transition-colors hover:bg-luma-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600 focus-visible:ring-offset-2"
            >
              <Icon name="mail" className="h-4 w-4" />
              Email us
            </a>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-5 lg:gap-10">
            <div className="lg:col-span-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-luma-700">
                Contact channels
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {channels.map((c) => {
                  const icon =
                    c.icon === 'whatsapp' ? (
                      <WhatsAppGlyph className="h-5 w-5" />
                    ) : (
                      <Icon name={c.icon} className="h-5 w-5" />
                    )

                  const body = (
                    <>
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-luma-50 text-luma-700 ring-1 ring-luma-100">
                        {icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                          {c.label}
                        </span>
                        <span className="mt-0.5 block break-words text-base font-bold text-luma-900">
                          {c.value}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">{c.hint}</span>
                      </span>
                    </>
                  )

                  const className =
                    'flex items-start gap-3 rounded-2xl border border-luma-100/80 bg-white p-4 shadow-sm transition-colors hover:border-luma-200 hover:bg-luma-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600'

                  return (
                    <li key={c.label}>
                      {c.href ? (
                        <a
                          href={c.href}
                          className={className}
                          {...(c.external
                            ? { target: '_blank', rel: 'noopener noreferrer' }
                            : {})}
                        >
                          {body}
                        </a>
                      ) : (
                        <div className={className}>{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="flex flex-col gap-4 lg:col-span-2">
              <div className="rounded-2xl border border-luma-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-luma-900">
                  What to have ready when you call
                </h2>
                <ul className="mt-4 space-y-3">
                  {readyItems.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-gray-600">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-luma-500"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-luma-200/80 bg-luma-50/60 p-6">
                <h2 className="text-lg font-bold text-luma-900">Before you contact us</h2>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  The office answers hundreds of WhatsApp messages, so it helps everyone if you first
                  check your member dashboard. It shows your contributions per package, your waiting
                  period progress, and whether a package is eligible for a claim. If the answer is not
                  there, then message us.
                </p>
                <Link
                  to="/login"
                  className="mt-5 inline-flex min-h-10 items-center justify-center rounded-full bg-luma-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-luma-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600 focus-visible:ring-offset-2"
                >
                  Sign in to dashboard
                </Link>
              </div>
            </div>
          </div>

          {/* Contact form — added without altering channels above */}
          <div className="mt-12 max-w-2xl rounded-2xl border border-luma-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold text-luma-900">Send us a message</h2>
            <p className="mt-2 text-sm text-gray-600">
              Prefer writing? Send a message and we will reply by email.
            </p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
              {/* Honeypot — hidden from users */}
              <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                <label htmlFor="contact-company">Company</label>
                <input
                  id="contact-company"
                  name="company"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.company}
                  onChange={(e) => update('company', e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Full name
                  </label>
                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    required
                    maxLength={100}
                    autoComplete="name"
                    className={fieldClass}
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    className={fieldClass}
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-phone" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Phone <span className="font-normal text-gray-500">(optional)</span>
                  </label>
                  <input
                    id="contact-phone"
                    name="phone"
                    type="tel"
                    maxLength={30}
                    autoComplete="tel"
                    className={fieldClass}
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="contact-subject" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Subject
                  </label>
                  <input
                    id="contact-subject"
                    name="subject"
                    type="text"
                    required
                    maxLength={120}
                    className={fieldClass}
                    value={form.subject}
                    onChange={(e) => update('subject', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  rows={5}
                  maxLength={2000}
                  className={`${fieldClass} min-h-[120px] resize-y`}
                  value={form.message}
                  onChange={(e) => update('message', e.target.value)}
                />
              </div>

              {error && (
                <div className={alertErrorClass} role="alert">
                  {error}
                </div>
              )}
              {success && (
                <div className={alertSuccessClass} role="status">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-luma-700 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-luma-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send message'}
              </button>
            </form>
          </div>
        </div>
      </MotionSection>
    </div>
  )
}

