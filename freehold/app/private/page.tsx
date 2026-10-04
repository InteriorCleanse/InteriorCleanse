import type { Metadata } from 'next'
import { Faq } from '@/components/Faq'
import { InquiryForm } from '@/components/InquiryForm'
import { QuietCta } from '@/components/Cta'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: { absolute: 'Freehold Private. Bespoke software for family offices' },
  description: 'Private software for family offices and the people who run them, delivered into your own infrastructure. Begins with a fixed-fee digital footprint and email security review, two weeks, in writing.',
  alternates: { canonical: '/private/' },
  openGraph: { url: '/private/' },
}

const faq = [
  { q: 'Who is this for?', a: 'Single and multi-family offices, the chiefs of staff and estate managers who run a household, wealth advisers who serve them, and the founders behind them. If you are not one of those, Freehold Build is probably the right door.' },
  { q: 'What does it cost?', a: 'The review is a fixed fee quoted after a twenty-minute call, once we know the number of domains, mailboxes, and people involved. Bespoke software is scoped and priced in writing before any work starts. We do not publish a price list, and we do not quote one on the first call without the facts.' },
  { q: 'What have you built for people like us?', a: 'Freehold is new and one person. We will show you real work, not a client list, and we will tell you before you ask that there is no family office reference yet. What we can put in writing is how we handle your information, and that is where most conversations start.' },
  { q: 'How do you handle confidentiality?', a: 'A mutual NDA before any document changes hands. Work happens inside accounts you own, so nothing of yours sits on our machines longer than the session. Our written security and discretion policy is published on this site, and a signed copy is sent before the first call if you prefer.' },
  { q: 'Do you work with our existing advisers and IT?', a: 'Yes, and as peers. The review is written for them as much as for you, and the software we build is theirs to run, read, and replace.' },
  { q: 'What do you not do?', a: 'We do not manage money, give legal or tax advice, run your IT, or sell hardware. We build and review software, and we say when someone else should be in the room.' },
]

const conduct = [
  'A mutual NDA before any document changes hands.',
  'Brevity. Meetings are twenty minutes unless you extend them.',
  'No names. We do not cite clients, and we do not ask to.',
  'Written scope and price before work, written findings after.',
  'Your advisers and staff are peers, not obstacles.',
  'We say what we cannot do before you spend an hour finding out.',
]

export default function PrivatePage() {
  return (
    <>
      <section className="page pt-14 sm:pt-20 lg:pt-24">
        <p className="mono rv">Freehold Private</p>
        <h1 className="mt-5 text-[3.2rem] leading-[0.98] sm:text-7xl lg:text-[5.6rem] max-w-[14ch] rv" data-i={1}>Private software, on your own ground.</h1>
        <p className="mt-8 text-lg sm:text-xl text-stone max-w-[40ch] rv" data-i={2}>
          For family offices and the people who run them. Built into the accounts you own, read by the advisers you trust.
        </p>
      </section>

      {/* The review, as a document. */}
      <section className="page mt-24 sm:mt-32" aria-labelledby="review">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5 rv">
            <p className="mono mb-3">01</p>
            <h2 id="review" className="text-4xl sm:text-5xl">Where it starts.</h2>
            <p className="serif text-2xl mt-6">The footprint and email security review.</p>
          </div>
          <div className="lg:col-span-7 rule pt-6 lg:border-t-0 lg:border-l lg:border-hairline lg:pl-10 lg:pt-0 rv" data-i={1}>
            <p className="mono">Two weeks · {SITE.reviewFee ? `${SITE.reviewFee} fixed` : 'fixed fee'} · in writing</p>
            <p className="text-stone mt-5">
              A written report on what of the family and the office is exposed online and by email: domains and their records, mail authentication, stale pages, staff information that should not be public, and the small configuration gaps that most incidents begin with. Each finding comes with the fix, in order, and who should do it.
            </p>
            <p className="text-stone mt-5">
              Quoted after a twenty-minute call. Delivered as a document your existing IT or adviser can act on without us.
            </p>
            <div className="mt-6">
              <QuietCta href="/private/review/">What the review examines</QuietCta>
              <span className="block mt-2" />
              <QuietCta href="/check/">Run the free ten-second check first</QuietCta>
            </div>
          </div>
        </div>
      </section>

      {/* What it can become: a ruled list, not a card trio. */}
      <section className="page mt-24 sm:mt-32" aria-labelledby="become">
        <p className="mono mb-3">02</p>
        <h2 id="become" className="text-4xl sm:text-5xl max-w-[18ch] rv">What it can become.</h2>
        <ul className="mt-10 max-w-[64ch] list-none">
          {[
            ['Household operations', 'Staff, properties, vendors, and manuals in one private system, on your infrastructure.'],
            ['Collection and asset inventory', 'Art, vehicles, wine, or instruments, with provenance and documents where you can find them.'],
            ['Deal flow and diligence', 'A tracker that fits how your office actually decides, not a vendor’s template.'],
          ].map(([t, d], i) => (
            <li key={t} className="rule py-7 grid gap-2 sm:grid-cols-[16rem_1fr] rv" data-i={i}>
              <p className="serif text-2xl">{t}</p>
              <p className="text-stone">{d}</p>
            </li>
          ))}
        </ul>
        <p className="text-stone mt-8 max-w-[60ch] rv">Every system is delivered into your GitHub, your database, and your hosting. If Freehold stopped tomorrow, your software would not.</p>
      </section>

      <section className="page mt-24 sm:mt-32" aria-labelledby="conduct">
        <div className="rule pt-10 sm:pt-14">
          <p className="mono mb-3">03</p>
          <h2 id="conduct" className="text-4xl sm:text-5xl rv">How we conduct ourselves.</h2>
          <ol className="mt-8 grid gap-x-12 gap-y-4 sm:grid-cols-2 max-w-4xl list-none">
            {conduct.map((c, i) => (
              <li key={c} className="rule pt-4 text-stone rv" data-i={i}><span className="mono mr-4">{String(i + 1).padStart(2, '0')}</span>{c}</li>
            ))}
          </ol>
          <div className="mt-8">
            <QuietCta href="/discretion/">Read the security and discretion policy</QuietCta>
          </div>
        </div>
      </section>

      <section className="page mt-24 sm:mt-32" aria-labelledby="faq">
        <p className="mono mb-3">04</p>
        <h2 id="faq" className="text-4xl sm:text-5xl rv">Questions we expect.</h2>
        <div className="mt-8">
          <Faq items={faq} />
        </div>
      </section>

      <section className="page mt-24 sm:mt-32" id="call" aria-labelledby="req">
        <p className="mono mb-3">05</p>
        <h2 id="req" className="text-4xl sm:text-5xl rv">Request a call.</h2>
        <p className="text-stone mt-6 mb-8 max-w-[60ch] rv" data-i={1}>
          Twenty minutes with the person who does the work. You leave with a written note of what we heard, whether the review fits, and a fixed fee if it does.
        </p>
        {SITE.booking && (
          <p className="mb-8">
            <a className="cta" href={SITE.booking} target="_blank" rel="noopener noreferrer"><span>Choose a time</span><span className="glyph" aria-hidden="true" /></a>
            <span className="block text-sm text-stone mt-3">Or write below, if you would rather not book yet.</span>
          </p>
        )}
        <InquiryForm kind="private-call" cta="Request a call" />
      </section>
    </>
  )
}
