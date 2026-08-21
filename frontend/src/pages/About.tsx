const values = [
  { name: 'Integrity', text: 'We do what we say, and we keep records members can check.' },
  { name: 'Compassion', text: 'Members help each other through difficult times without delay.' },
  { name: 'Teamwork', text: 'Contributions pool together; support goes where it is needed.' },
  { name: 'Transparency', text: 'Contributions, waiting periods and payouts are shown per member, per package.' },
  { name: 'Accountability', text: 'Money collected is accounted for, and every payout is recorded.' },
  { name: 'Excellence', text: 'We run the welfare fund the way members deserve — properly.' },
]

export function About() {
  return (
    <div className="container-luma py-14">
      <h1 className="text-3xl font-bold text-luma-900 sm:text-4xl">About Luma Welfare</h1>

      <section className="mt-8 max-w-3xl">
        <h2 className="text-xl font-semibold text-luma-900">Our mission</h2>
        <p className="mt-3 text-lg leading-relaxed text-stone-700">
          To provide accessible, reliable, and compassionate welfare services that promote
          dignity, empowerment, and financial security for all members.
        </p>
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="text-xl font-semibold text-luma-900">What Luma Welfare is</h2>
        <p className="mt-3 leading-relaxed text-stone-700">
          Luma Welfare is a community welfare organization in Kenya. Members join one or more of
          twelve support packages — hospital costs, education, business capital, burial support,
          and others — and contribute monthly. Each package has its own contribution amount and
          its own waiting period. When a member meets the conditions, they can claim support.
        </p>
        <p className="mt-3 leading-relaxed text-stone-700">
          The platform exists so members can check their own position: how many months they have
          contributed, whether a package's waiting period is met, and whether their cover is
          current. You should not have to call the office to find out if you are covered.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-luma-900">Our values</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((v) => (
            <div key={v.name} className="rounded-xl border border-stone-200 bg-white p-5">
              <h3 className="font-semibold text-luma-800">{v.name}</h3>
              <p className="mt-1 text-sm text-stone-600">{v.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}