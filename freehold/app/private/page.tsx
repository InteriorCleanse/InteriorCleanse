import type { Metadata } from 'next'
import { Section } from '@/components/Section'
import { Faq } from '@/components/Faq'
import { InquiryForm } from '@/components/InquiryForm'

export const metadata: Metadata = {
  title: 'Freehold Private. Bespoke software for family offices',
  description:
    'Private software for family offices and the people who run them, delivered into your own infrastructure. Begins with a fixed-fee digital footprint and email security review, two weeks, in writing.',
  alternates: { canonical: '/private/' },
}

const faq = [
  {
    q: 'Who is this for?',
    a: 'Single and multi-family offices, the chiefs of staff and estate managers who run a household, wealth advisers who serve them, and the founders behind them. If you are not one of those, Freehold Build is probably the right door.',
  },
  {
    q: 'What does it cost?',
    a: 'The review is a fixed fee quoted after a twenty-minute call, once we know the number of domains, mailboxes, and people involved. Bespoke software is scoped and priced in writing before any work starts. We do not publish a price list, and we do not quote one on the first call without the facts.',
  },
  {
    q: 'What have you built for people like us?',
    a: 'Freehold is new and one person. We will show you real work, not a client list, and we will tell you before you ask that there is no family office reference yet. What we can put in writing is how we handle your information, and that is where most conversations start.',
  },
  {
    q: 'How do you handle confidentiality?',
    a: 'A mutual NDA before any document changes hands. Work happens inside accounts you own, so nothing of yours sits on our machines longer than the session. A written security and discretion policy is available on request and sent before the first call if you prefer.',
  },
  {
    q: 'Do you work with our existing advisers and IT?',
    a: 'Yes, and as peers. The review is written for them as much as for you, and the software we build is theirs to run, read, and replace.',
  },
  {
    q: 'What do you not do?',
    a: 'We do not manage money, give legal or tax advice, run your IT, or sell hardware. We build and review software, and we say when someone else should be in the room.',
  },
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
      <section className="page pt-10 sm:pt-20 reveal">
        <p className="kicker">Freehold Private</p>
        <h1 className="mt-4 text-5xl sm:text-7xl max-w-4xl">Private software, on your own ground.</h1>
        <p className="measure mt-8 text-lg text-stone">
          For family offices and the people who run them. Built into the accounts you own, read by the
          advisers you trust, and never dependent on us to keep running.
        </p>
      </section>

      <Section n="01" title="Where it starts">
        <div className="measure space-y-4">
          <h3 className="text-2xl">The footprint and email security review</h3>
          <p className="text-stone">
            Two weeks. A written report on what of the family and the office is exposed online and by
            email: domains and their records, mail authentication, stale pages, staff information that
            should not be public, and the small configuration gaps that most incidents begin with. Each
            finding comes with the fix, in order, and who should do it.
          </p>
          <p className="text-stone">
            Fixed fee, quoted after a twenty-minute call. Delivered as a document your existing IT or
            adviser can act on without us.
          </p>
        </div>
      </Section>

      <Section n="02" title="What it can become">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h3 className="text-xl">Household operations</h3>
            <p className="text-stone mt-2">Staff, properties, vendors, and manuals in one private system, on your infrastructure.</p>
          </div>
          <div>
            <h3 className="text-xl">Collection and asset inventory</h3>
            <p className="text-stone mt-2">Art, vehicles, wine, or instruments, with provenance and documents where you can find them.</p>
          </div>
          <div>
            <h3 className="text-xl">Deal flow and diligence</h3>
            <p className="text-stone mt-2">A tracker that fits how your office actually decides, not a vendor&rsquo;s template.</p>
          </div>
        </div>
        <p className="measure text-stone mt-8">
          Every system is delivered into your GitHub, your database, and your hosting. If Freehold
          stopped tomorrow, your software would not.
        </p>
      </Section>

      <Section n="03" title="How we conduct ourselves">
        <ul className="measure space-y-3 text-stone">
          {conduct.map((c) => (
            <li key={c} className="rule pt-3">{c}</li>
          ))}
        </ul>
      </Section>

      <Section n="04" title="Questions we expect">
        <Faq items={faq} />
      </Section>

      <Section n="05" title="Request a call" id="call">
        <p className="measure text-stone mb-6">
          Twenty minutes with the person who does the work. You will leave with a written note of what
          we heard, whether the review fits, and a fixed fee if it does.
        </p>
        <InquiryForm kind="private-call" cta="Request a twenty-minute call" />
      </Section>
    </>
  )
}
