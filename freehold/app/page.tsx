import type { Metadata } from 'next'
import { Cta, QuietCta } from '@/components/Cta'
import { Plat } from '@/components/Plat'
import { Mark } from '@/components/Mark'

export const metadata: Metadata = { alternates: { canonical: '/' }, openGraph: { url: '/' } }

const chapters = [
  ['Your repository', 'The first commit lands in your GitHub before you have paid anything. Any developer can read it. You can leave with it.'],
  ['Your database', 'The schema and the data sit in a Postgres you own. We hold no copy.'],
  ['Your deployment', 'Your app runs on your Vercel. Our bad day is not your outage.'],
  ['Your key, your bill', 'The model runs on your own Anthropic key. You read that bill, not us. No credits, no integration meter.'],
  ['Your name', 'Nothing we build carries our badge, our tracking, or our terms. Discretion is the default, not a tier.'],
]

export default function Home() {
  return (
    <>
      {/* Hero: editorial split. Type left, the plat right. Stacks on phones. */}
      <section className="page pt-14 sm:pt-20 lg:pt-24 grid gap-12 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6 rv">
          <h1 className="text-[3.4rem] leading-[0.98] sm:text-7xl lg:text-[6.2rem] max-w-[11ch]">Software you own outright.</h1>
          <p className="measure mt-8 text-lg sm:text-xl text-stone max-w-[36ch]">
            Built into accounts you own, on infrastructure you control. If we disappeared tomorrow, what we built would not.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Cta href="/private/#call">Request a call</Cta>
            <QuietCta href="/build/">Freehold Build waitlist</QuietCta>
          </div>
        </div>
        <div className="lg:col-span-6 lg:pl-8 rv" data-i={2}>
          <div className="bg-plate p-4 sm:p-8">
            <Plat />
          </div>
        </div>
      </section>

      {/* Two lines of work: asymmetric pair, different treatments. */}
      <section className="page mt-28 sm:mt-40" aria-labelledby="work">
        <h2 id="work" className="text-4xl sm:text-5xl max-w-[18ch] rv">Two lines of work, one principle.</h2>
        <div className="mt-12 grid gap-px bg-hairline md:grid-cols-[3fr_2fr]">
          <div className="bg-paper py-10 md:pr-12 rv" data-i={1}>
            <p className="mono">Freehold Build</p>
            <h3 className="text-3xl sm:text-4xl mt-4">Your app, in your repo, on your key.</h3>
            <p className="text-stone mt-5 max-w-[52ch]">
              An app builder for people who have been burned by hosted ones. Describe the app; it is generated as a Next.js repository in your GitHub, a Postgres database in your account, a deployment on your Vercel. You are never charged for a build the AI could not finish.
            </p>
            <div className="mt-8">
              <QuietCta href="/build/">Join the waitlist</QuietCta>
            </div>
          </div>
          <div className="bg-plate py-10 md:pl-12 md:pr-4 px-0 rv" data-i={2}>
            <div className="px-6 md:px-0">
              <p className="mono">Freehold Private</p>
              <h3 className="text-3xl sm:text-4xl mt-4">Private software, on your own ground.</h3>
              <p className="text-stone mt-5 max-w-[40ch]">
                Bespoke software for family offices and the people who run them. It begins with a fixed-fee review of the family&rsquo;s digital footprint and email security. Two weeks, in writing.
              </p>
              <div className="mt-8">
                <QuietCta href="/private/">Request a call</QuietCta>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What ownership means: sticky chapters that stack as you scroll. */}
      <section className="page mt-28 sm:mt-40" aria-labelledby="own">
        <h2 id="own" className="text-4xl sm:text-5xl max-w-[18ch] rv">What ownership means here.</h2>
        <div className="mt-12">
          {chapters.map(([t, d], i) => (
            <article key={t} className="chapter py-10 sm:py-14 grid gap-4 sm:grid-cols-[1fr_2fr]" style={{ zIndex: i + 1 }}>
              <h3 className="text-3xl sm:text-4xl">{t}</h3>
              <p className="text-stone text-lg max-w-[48ch] sm:pt-2">{d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How we work: one measure, manifesto. */}
      <section className="page mt-28 sm:mt-40" aria-labelledby="how">
        <div className="max-w-[66ch]">
          <h2 id="how" className="text-4xl sm:text-5xl rv">How we work.</h2>
          <div className="mt-8 space-y-6 text-lg text-stone rv" data-i={1}>
            <p>Freehold is a one-person firm, and says so on the first call. That is the reason it can be discreet, direct, and unhurried, and the reason it does not take on more than it can do well.</p>
            <p>We state limits as plainly as capabilities. We do not publish testimonials, name clients, or quote figures we cannot show. We do not send marketing email. A form on this site goes to one inbox and is answered by a person within two working days.</p>
            <p>If what you need is a hosted platform with email, SMS, and a native mobile app built in, we are not it, and we will say so before you spend an hour.</p>
          </div>
        </div>
      </section>

      {/* Close. */}
      <section className="page mt-28 sm:mt-40">
        <div className="rule pt-12 flex flex-col items-start gap-8 rv">
          <Mark size={44} />
          <h2 className="text-4xl sm:text-6xl max-w-[16ch]">Start with the thing that is smallest and yours.</h2>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <Cta href="/private/#call">Request a call</Cta>
            <QuietCta href="/build/#waitlist">Join the waitlist</QuietCta>
          </div>
        </div>
      </section>
    </>
  )
}
