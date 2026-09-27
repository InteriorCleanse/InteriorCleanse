import Link from 'next/link'
import { Section } from '@/components/Section'
import { Mark } from '@/components/Mark'

export default function Home() {
  return (
    <>
      <section className="page pt-10 sm:pt-20 pb-6 reveal">
        <p className="kicker">Freehold</p>
        <h1 className="mt-4 text-5xl sm:text-7xl lg:text-8xl max-w-5xl">Software you own outright.</h1>
        <p className="measure mt-8 text-lg sm:text-xl text-stone">
          Freehold builds software that lives in your accounts, on your infrastructure, under your
          name. Nothing runs on our servers. If we disappeared tomorrow, what we built would not.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/build/" className="btn btn-solid">Freehold Build</Link>
          <Link href="/private/" className="btn">Freehold Private</Link>
        </div>
      </section>

      <Section n="01" title="Two lines of work, one principle">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h3 className="text-2xl">Freehold Build</h3>
            <p className="text-stone mt-3">
              An app builder for people who have been burned by hosted ones. Describe the app; it is
              generated as a Next.js repository in your GitHub, a Postgres database in your account,
              a deployment on your Vercel, on your own API key. You are never charged for a build the
              AI could not finish.
            </p>
            <p className="mt-4">
              <Link className="link" href="/build/">Join the waitlist</Link>
            </p>
          </div>
          <div>
            <h3 className="text-2xl">Freehold Private</h3>
            <p className="text-stone mt-3">
              Bespoke software for family offices and the people who run them, delivered into the
              client&rsquo;s own infrastructure and never ours. It starts with a fixed-fee review of the
              family&rsquo;s digital footprint and email security, two weeks, in writing.
            </p>
            <p className="mt-4">
              <Link className="link" href="/private/">Request a twenty-minute call</Link>
            </p>
          </div>
        </div>
      </Section>

      <Section n="02" title="What ownership means here">
        <table className="doc">
          <tbody>
            <tr>
              <th className="w-40">Your repository</th>
              <td>The first commit lands in your GitHub before you have paid anything. Any developer can read it. You can leave with it.</td>
            </tr>
            <tr>
              <th>Your database</th>
              <td>The schema and the data sit in a Postgres you own. We hold no copy.</td>
            </tr>
            <tr>
              <th>Your deployment</th>
              <td>Your app runs on your Vercel. Our bad day is not your outage.</td>
            </tr>
            <tr>
              <th>Your key, your bill</th>
              <td>The model runs on your own Anthropic key. You read that bill, not us. No credits, no integration meter.</td>
            </tr>
            <tr>
              <th>Your name</th>
              <td>Nothing we build carries our badge, our tracking, or our terms. Discretion is the default, not a tier.</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section n="03" title="How we work">
        <div className="measure space-y-5 text-stone">
          <p>
            Freehold is a one-person firm, and says so on the first call. That is the reason it can be
            discreet, direct, and unhurried, and the reason it does not take on more than it can do
            well.
          </p>
          <p>
            We state limits as plainly as capabilities. We do not publish testimonials, name clients,
            or quote figures we cannot show. We do not send marketing email. A form on this site goes to
            one inbox and is answered by a person within two working days.
          </p>
          <p>
            If what you need is a hosted platform with email, SMS, and a native mobile app built in, we
            are not it, and we will say so before you spend an hour.
          </p>
        </div>
      </Section>

      <section className="page mt-24 reveal">
        <div className="rule pt-10 flex flex-col items-start gap-6">
          <Mark size={40} />
          <h2 className="text-3xl sm:text-4xl max-w-2xl">Start with the thing that is smallest and yours.</h2>
          <div className="flex flex-wrap gap-4">
            <Link href="/private/#call" className="btn btn-solid">Request a call</Link>
            <Link href="/build/#waitlist" className="btn">Waitlist for Build</Link>
          </div>
        </div>
      </section>
    </>
  )
}
