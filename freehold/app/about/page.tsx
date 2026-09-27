import type { Metadata } from 'next'
import { Section } from '@/components/Section'

export const metadata: Metadata = {
  title: 'About',
  description: 'Freehold is a one-person software firm built on a single principle: the client owns everything it makes.',
  alternates: { canonical: '/about/' },
}

export default function AboutPage() {
  return (
    <>
      <section className="page pt-10 sm:pt-20 reveal">
        <p className="kicker">About</p>
        <h1 className="mt-4 text-5xl sm:text-7xl max-w-4xl">A firm built on one word.</h1>
        <p className="measure mt-8 text-lg text-stone">
          Freehold is the property-law word for owning something outright, with no landlord and no
          lease that can end. It is the opposite of how most software is sold today, and it is the
          only way we sell it.
        </p>
      </section>

      <Section n="01" title="Why it exists">
        <div className="measure space-y-4 text-stone">
          <p>
            Hosted app builders keep the backend, the database, and the meter. The people who use them
            find out when they try to leave. Family offices buy software the same way most people do,
            and then depend on a vendor they would never have chosen for anything else that matters.
          </p>
          <p>
            Freehold takes the other side of that trade. Everything it builds lives in accounts the
            client owns. The fee is flat. The model cost is on the client&rsquo;s own key. There is
            nothing to hold hostage because nothing is held.
          </p>
        </div>
      </Section>

      <Section n="02" title="Who runs it">
        <div className="measure space-y-4 text-stone">
          <p>
            One person, who builds with modern tooling and says so plainly. That is a limit on how
            much work Freehold takes on and a guarantee about who answers the phone.
          </p>
          <p>
            No client names appear on this site and none will. No testimonials either. What we can
            show is the work itself, in a repository you can read, and the way we handle information,
            in a policy you can hold us to.
          </p>
        </div>
      </Section>
    </>
  )
}
