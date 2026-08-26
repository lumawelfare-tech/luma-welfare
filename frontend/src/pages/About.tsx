const values = [
  { name: 'Integrity', text: 'We do what we say, and we keep records members can check.', icon: '🤝' },
  { name: 'Compassion', text: 'Members help each other through difficult times without delay.', icon: '💚' },
  { name: 'Teamwork', text: 'Contributions pool together; support goes where it is needed.', icon: '👥' },
  { name: 'Transparency', text: 'Contributions, waiting periods and payouts are shown per member, per package.', icon: '🔍' },
  { name: 'Accountability', text: 'Money collected is accounted for, and every payout is recorded.', icon: '📋' },
  { name: 'Excellence', text: 'We run the welfare fund the way members deserve — properly.', icon: '⭐' },
]

import { useHead } from '../lib/seo'

export function About() {
  useHead('About', 'Learn about Luma Welfare — our mission, values, and how we provide accessible welfare services for all members in Kenya.')
  return (
    <div>
      {/* Page Hero */}
      <section className="bg-gradient-to-br from-luma-800 to-luma-900 py-16 lg:py-20">
        <div className="container-luma">
          <span className="text-sm font-semibold uppercase tracking-wider text-luma-300">About Us</span>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">About Luma Welfare</h1>
          <div className="mt-3 h-1 w-12 rounded-full bg-luma-400" />
        </div>
      </section>

      <div className="container-luma py-14">
        <section className="max-w-3xl">
          <h2 className="text-2xl font-bold text-gray-900">Our Mission</h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            To provide accessible, reliable, and compassionate welfare services that promote
            dignity, empowerment, and financial security for all members.
          </p>
        </section>

        <section className="mt-12 max-w-3xl">
          <h2 className="text-2xl font-bold text-gray-900">What Luma Welfare Is</h2>
          <p className="mt-4 leading-relaxed text-gray-600">
            Luma Welfare is a community welfare organization in Kenya. Members join one or more of
            twelve support packages — hospital costs, education, business capital, burial support,
            and others — and contribute monthly. Each package has its own contribution amount and
            its own waiting period. When a member meets the conditions, they can claim support.
          </p>
          <p className="mt-4 leading-relaxed text-gray-600">
            The platform exists so members can check their own position: how many months they have
            contributed, whether a package's waiting period is met, and whether their cover is
            current. You should not have to call the office to find out if you are covered.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900">Our Values</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {values.map((v) => (
              <div key={v.name} className="rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:shadow-md hover:border-luma-200">
                <div className="text-3xl">{v.icon}</div>
                <h3 className="mt-3 font-bold text-gray-900">{v.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{v.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
