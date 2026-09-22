import { Link } from 'react-router-dom'
import { useHead } from '../lib/seo'
import { PageHero } from '../components/PageHero'
import { MotionSection, MotionCard } from '../components/MotionSection'
import { Icon } from '../components/Icon'
import { siteConfig } from '../config/siteConfig'
import { safeHref } from '../lib/sanitize'

/** Commitments from LUMA Welfare Our Story (official PDF). */
const commitments = [
  {
    name: 'Transparency',
    text: 'Members should understand the rules, contributions, eligibility requirements, and procedures of every program they join.',
    icon: 'eye' as const,
  },
  {
    name: 'Accountability',
    text: 'We aim to manage member contributions responsibly and maintain proper records.',
    icon: 'document' as const,
  },
  {
    name: 'Fairness',
    text: 'Support and benefits are provided according to the official rules and eligibility requirements of each program.',
    icon: 'shield' as const,
  },
  {
    name: 'Community',
    text: 'We encourage members to support one another and build a stronger welfare community.',
    icon: 'users' as const,
  },
  {
    name: 'Growth',
    text: 'We want LUMA Welfare to develop programs that respond to the changing needs of our members.',
    icon: 'plus' as const,
  },
]

const programs = [
  'Welfare & Bereavement Support',
  'Outpatient Hospital Support',
  'Education Support',
  'Business Support',
  'Building & Land Support',
  'Farming Support',
  'Senior Citizen Support',
  'Other member-focused programs',
]

/**
 * About / Our Story — aligned with docs/LUMA_Welfare_Our_Story.pdf.
 * Preserves existing layout components; content only.
 */
export function About() {
  useHead(
    'About',
    'Together We Are Stronger — learn about LUMA Welfare’s vision, mission, and member commitments.',
    {
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'About', path: '/about' },
      ],
    },
  )
  return (
    <div>
      <PageHero eyebrow="Our Story" title="Together We Are Stronger" />

      <MotionSection as="div" className="container-luma py-14">
        <section className="glass-card max-w-3xl p-8">
          <h2 className="text-2xl font-bold text-gray-900">Welcome to LUMA Welfare</h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            At LUMA Welfare, we believe that life is better when we face its challenges together.
            Every family experiences moments when financial support is needed most — whether it is
            during a bereavement, a medical challenge, education needs, business plans, farming
            activities, or other important moments in life. We created LUMA Welfare to bring people
            together through a structured, affordable, and member-focused welfare system.
          </p>
          <p className="mt-4 leading-relaxed text-gray-600">
            Our vision is simple: to build a community where members support one another, plan for
            the future, and have access to meaningful welfare opportunities when they need them.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-gray-500">
            LUMA Welfare was founded in 2021 in Kitengela, Kenya, under the leadership of Chairman
            Boss Williams. Guiding mission: to stand with everyone through the Mission of Mercy.
          </p>
        </section>

        <section className="glass-card mt-8 max-w-3xl p-8">
          <h2 className="text-2xl font-bold text-gray-900">From the Chairman</h2>
          <p className="mt-4 leading-relaxed text-gray-600">
            LUMA Welfare began in Kitengela in 2021 with a vision of creating a community where
            people can support one another through difficult moments. Our Mission of Mercy calls us
            to remember the vulnerable, support families, encourage education, care about children,
            and respond responsibly when people need help.
          </p>
          <p className="mt-4 text-sm font-medium text-gray-800">
            — Boss Williams, Chairman, LUMA Welfare
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-luma-700">
            Standing with everyone through the Mission of Mercy
          </p>
        </section>

        <section className="glass-card mt-8 max-w-3xl p-8">
          <h2 className="text-2xl font-bold text-gray-900">Why LUMA Welfare?</h2>
          <p className="mt-4 leading-relaxed text-gray-600">
            LUMA Welfare is built around the principle of <strong className="font-semibold text-gray-800">Together We Are Stronger</strong>.
            We believe that small, consistent contributions from members can create a stronger
            support system for individuals and families. Our programs are designed to help
            registered members prepare for different needs while encouraging financial discipline,
            unity, responsibility, and mutual support.
          </p>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {programs.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-luma-600" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            Programs and benefits are subject to the official LUMA Welfare constitution, rules,
            contribution requirements, eligibility conditions, and applicable procedures.
          </p>
        </section>

        <section className="mt-8 grid gap-6 max-w-3xl lg:grid-cols-2">
          <div className="glass-card p-8">
            <h2 className="text-xl font-bold text-gray-900">Our Vision</h2>
            <p className="mt-3 leading-relaxed text-gray-600">
              To become a trusted welfare community that empowers members and families to prepare
              for life&apos;s challenges and opportunities together.
            </p>
          </div>
          <div className="glass-card p-8">
            <h2 className="text-xl font-bold text-gray-900">Our Mission</h2>
            <p className="mt-3 leading-relaxed text-gray-600">
              To provide affordable, organized, and member-focused welfare programs that promote
              mutual support, financial responsibility, and community development.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900">Our Commitment to Members</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {commitments.map((c) => (
              <MotionCard key={c.name} className="glass-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-luma-50 text-luma-700" aria-hidden="true">
                  <Icon name={c.icon} className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-bold text-gray-900">{c.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{c.text}</p>
              </MotionCard>
            ))}
          </div>
        </section>

        <section className="glass-card mt-12 max-w-3xl p-8">
          <h2 className="text-2xl font-bold text-gray-900">Who Can Join?</h2>
          <p className="mt-4 leading-relaxed text-gray-600">
            LUMA Welfare is designed for people who want to become part of an organized welfare
            community. Membership is subject to the official LUMA Welfare constitution, membership
            requirements, contribution rules, and eligibility conditions.
          </p>
          <p className="mt-4 leading-relaxed text-gray-600">
            When you become a member, you become part of more than a welfare program — you become
            part of a community that believes in supporting one another.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-luma-700 px-5 text-sm font-semibold text-white hover:bg-luma-800"
          >
            Join LUMA Welfare
          </Link>
        </section>

        {(siteConfig.phoneDisplay || siteConfig.email || siteConfig.whatsappUrl) && (
          <section className="glass-card mt-12 max-w-3xl p-8">
            <h2 className="text-2xl font-bold text-gray-900">Contact</h2>
            <p className="mt-2 text-sm text-gray-600">
              Reach the welfare office with the same channels listed on our Contact page.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              {siteConfig.phoneDisplay && siteConfig.phoneTel && (
                <li>
                  <a className="font-medium text-luma-700 hover:underline" href={`tel:${siteConfig.phoneTel}`}>
                    {siteConfig.phoneDisplay}
                  </a>
                </li>
              )}
              {siteConfig.email && (
                <li>
                  <a className="font-medium text-luma-700 hover:underline" href={`mailto:${siteConfig.email}`}>
                    {siteConfig.email}
                  </a>
                </li>
              )}
              {siteConfig.whatsappUrl && (
                <li>
                  <a
                    className="font-medium text-luma-700 hover:underline"
                    href={safeHref(siteConfig.whatsappUrl) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp
                  </a>
                </li>
              )}
            </ul>
            <Link to="/contact" className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-luma-700 hover:underline">
              Full contact options →
            </Link>
          </section>
        )}
      </MotionSection>
    </div>
  )
}
