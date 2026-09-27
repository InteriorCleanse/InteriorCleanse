import type { Metadata } from 'next'
import { Plat } from '@/components/Plat'

export const metadata: Metadata = {
  title: 'About',
  description: 'Freehold is a one-person software firm built on a single principle: the client owns everything it makes.',
  alternates: { canonical: '/about/' },
  openGraph: { url: '/about/' },
}

export default function AboutPage() {
  return (
    <>
      <section className="page pt-14 sm:pt-20 lg:pt-24">
        <h1 className="text-[3.2rem] leading-[0.98] sm:text-7xl lg:text-[5.6rem] max-w-[12ch] rv">A firm built on one word.</h1>
        <p className="mt-8 text-lg sm:text-xl text-stone max-w-[44ch] rv" data-i={1}>
          Freehold is the property-law word for owning something outright, with no landlord and no lease that can end.
        </p>
      </section>

      <section className="page mt-24 sm:mt-32 grid gap-12 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-6 space-y-6 text-lg text-stone max-w-[60ch] rv">
          <h2 className="text-4xl sm:text-5xl text-graphite">Why it exists.</h2>
          <p>Hosted app builders keep the backend, the database, and the meter. The people who use them find out when they try to leave. Family offices buy software the same way most people do, and then depend on a vendor they would never have chosen for anything else that matters.</p>
          <p>Freehold takes the other side of that trade. Everything it builds lives in accounts the client owns. The fee is flat. The model cost is on the client&rsquo;s own key. There is nothing to hold hostage because nothing is held.</p>
          <h2 className="text-4xl sm:text-5xl text-graphite pt-6">Who runs it.</h2>
          <p>One person, who builds with modern tooling and says so plainly. That is a limit on how much work Freehold takes on and a guarantee about who answers the phone.</p>
          <p>No client names appear on this site and none will. No testimonials either. What we can show is the work itself, in a repository you can read, and the way we handle information, in a policy you can hold us to.</p>
        </div>
        <div className="lg:col-span-6 lg:pl-8 rv" data-i={2}>
          <div className="bg-plate p-4 sm:p-8">
            <Plat />
          </div>
        </div>
      </section>
    </>
  )
}
