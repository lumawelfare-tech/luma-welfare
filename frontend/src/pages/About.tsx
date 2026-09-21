import { useHead } from '../lib/seo'
import { PageHero } from '../components/PageHero'
import { MotionSection, MotionCard } from '../components/MotionSection'
import { Icon } from '../components/Icon'

const values = [
  { name: 'Integrity', text: 'We do what we say, and we keep records members can check.', icon: 'check-circle' as const },
  { name: 'Compassion', text: 'Members help each other through difficult times without delay.', icon: 'heart' as const },
  { name: 'Teamwork', text: 'Contributions pool together; support goes where it is needed.', icon: 'users' as const },
  { name: 'Transparency', text: 'Contributions, waiting periods and payouts are shown per member, per package.', icon: 'eye' as const },
  { name: 'Accountability', text: 'Money collected is accounted for, and every payout is recorded.', icon: 'document' as const },
  { name: 'Excellence', text: 'We run the welfare fund the way members deserve — properly.', icon: 'star' as const },
]

export function About() {
  useHead('About', 'Learn about Luma Welfare — our mission, values, and how we provide accessible welfare services for all members in Kenya.', {
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'About', path: '/about' },
    ],
  })
  return (
    <div>
      <PageHero eyebrow="About Us" title="About Luma Welfare" />

      <MotionSection as="div" className="container-luma py-14">
        <section className="glass-card max-w-3xl p-8">
          <h2 className="text-2xl font-bold text-gray-900">Our Mission</h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            To provide accessible, reliable, and compassionate welfare services that promote
            dignity, empowerment, and financial security for all members.
          </p>
        </section>

        <section className="glass-card mt-8 max-w-3xl p-8">
          <h2 className="text-2xl font-bold text-gray-900">What Luma Welfare Is</h2>
          <p className="mt-4 leading-relaxed text-gray-600">
            Luma Welfare is a community welfare organization in Kenya. Members join one or more of
            twelve support packages — hospital costs, education, business capital, burial support,
            and others — and contribute monthly. Each package has its own contribution amount and
            its own waiting period. When a member meets the conditions, they can claim support.
          </p>
          <p className="mt-4 leading-relaxed text-gray-600">
            The platform exists so members can check their own position: how many months they have
            contributed, whether a package&apos;s waiting period is met, and whether their cover is
            current. You should not have to call the office to find out if you are covered.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900">Our Values</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {values.map((v) => (
              <MotionCard key={v.name} className="glass-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-luma-50 text-luma-700" aria-hidden="true">
                  <Icon name={v.icon} className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-bold text-gray-900">{v.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{v.text}</p>
              </MotionCard>
            ))}
          </div>
        </section>
      </MotionSection>
    </div>
  )
}
