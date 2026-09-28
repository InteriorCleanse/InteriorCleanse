import type { Metadata } from 'next'
import { Faq } from '@/components/Faq'
import { InquiryForm } from '@/components/InquiryForm'

export const metadata: Metadata = {
  title: { absolute: 'Freehold Build. Your app, in your repo, on your key' },
  description: 'Describe it once. Get a Next.js repo in your GitHub, a Postgres database in your account, a deployment on your Vercel, on your own Anthropic key. Never charged for a build the AI could not finish. Waitlist open.',
  alternates: { canonical: '/build/' },
  openGraph: { url: '/build/' },
}

const faq = [
  { q: 'Do I need to know how to code?', a: 'No, but you need four accounts: GitHub, a Postgres provider, Vercel, and Anthropic. We walk you through each. It is more setup than a hosted builder asks for, and it is the reason you own the result.' },
  { q: 'What happens when the AI breaks something?', a: 'It will, sometimes. The break is a commit you can see, any developer can read, and we can retry. A build we cannot finish is not billed by us. Your Anthropic key is still charged for the tokens; we do not control that meter and will not pretend to.' },
  { q: 'Can you import my Base44 app?', a: 'Not fully, and neither can anyone. Base44 exports the frontend; authentication and database logic stay behind its SDK. We audit what came out, rebuild what did not, and tell you the difference in writing before you pay.' },
  { q: 'What does it cost?', a: 'A flat monthly fee to us, set when the waitlist opens, plus whatever your own Anthropic usage costs on your own bill. No credits and no integration meter. The fee is not published until it is final; we do not announce a number and change it.' },
  { q: 'What if Freehold disappears?', a: 'Your app keeps running. It is on your Vercel, your database, your repo. You would lose the tool that builds the next version, not the version you have.' },
  { q: 'What do you not do?', a: 'Email sending, SMS, native mobile, an integration store, or a hosted runtime. If you need those, a hosted builder has them and we do not.' },
]

const steps = [
  ['Connect', 'GitHub, Postgres, Vercel, and your Anthropic key. Scoped as narrowly as each allows, revocable by you at any time.'],
  ['Describe', 'Plain language. We ask the questions a good engineer would ask before writing a line.'],
  ['Watch it land', 'Every step is a commit in your repository with a message you can read.'],
  ['Deploy', 'On your Vercel, under your domain. We never hold a copy.'],
]

export default function BuildPage() {
  return (
    <>
      <section className="page pt-14 sm:pt-20 lg:pt-24">
        <p className="mono rv">Freehold Build</p>
        <h1 className="mt-5 text-[3.2rem] leading-[0.98] sm:text-7xl lg:text-[5.6rem] max-w-[14ch] rv" data-i={1}>Your app, in your repo, on your key.</h1>
        <p className="mt-8 text-lg sm:text-xl text-stone max-w-[40ch] rv" data-i={2}>
          Describe it once. Get a Next.js repository in your GitHub, a Postgres database in your account, a deployment on your Vercel.
        </p>
        <p className="mt-4 text-sm text-stone rv" data-i={3}>Not launched yet. The waitlist below is the only thing this page collects.</p>
      </section>

      {/* Three truths as a ruled ledger, not cards. */}
      <section className="page mt-24 sm:mt-32" aria-labelledby="truths">
        <p className="mono mb-3">01</p>
        <h2 id="truths" className="text-4xl sm:text-5xl max-w-[18ch] rv">True by construction.</h2>
        <dl className="mt-10 grid gap-px bg-hairline sm:grid-cols-3">
          {[
            ['Your repo', 'The first commit is in your GitHub before you have paid anything.'],
            ['Your bill', 'The model runs on your Anthropic key. You read that bill, not us.'],
            ['Your runtime', 'Nothing runs on our servers, so our bad day is not yours.'],
          ].map(([t, d], i) => (
            <div key={t} className="bg-paper py-8 sm:px-8 sm:first:pl-0 sm:last:pr-0 rv" data-i={i}>
              <dt className="serif text-3xl">{t}</dt>
              <dd className="text-stone mt-3 max-w-[30ch]">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The billing rule, set large. */}
      <section className="page mt-24 sm:mt-32">
        <div className="rule pt-10 sm:pt-14 rv">
          <p className="mono mb-5">02</p>
          <p className="serif text-3xl sm:text-5xl lg:text-6xl max-w-[20ch]">You are never charged for a build the AI could not finish.</p>
          <p className="text-stone mt-8 max-w-[60ch]">
            Hosted builders charge credits while their model fixes its own mistakes. We cannot, because our fee is flat and the model cost is on your key. A build that does not reach a working commit costs you nothing from us. The tokens it used are on your Anthropic bill, which we do not control and do not mark up.
          </p>
        </div>
      </section>

      <section className="page mt-24 sm:mt-32" aria-labelledby="run">
        <p className="mono mb-3">03</p>
        <h2 id="run" className="text-4xl sm:text-5xl rv">How a build runs.</h2>
        <ol className="mt-10 max-w-[64ch] list-none">
          {steps.map(([t, d], i) => (
            <li key={t} className="rule py-6 grid grid-cols-[4rem_1fr] gap-3 rv" data-i={i}>
              <span className="mono pt-2">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <p className="serif text-2xl">{t}</p>
                <p className="text-stone mt-2">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="page mt-24 sm:mt-32" aria-labelledby="faq">
        <p className="mono mb-3">04</p>
        <h2 id="faq" className="text-4xl sm:text-5xl max-w-[18ch] rv">Questions a burned builder asks.</h2>
        <div className="mt-8">
          <Faq items={faq} />
        </div>
      </section>

      <section className="page mt-24 sm:mt-32" id="waitlist" aria-labelledby="wl">
        <p className="mono mb-3">05</p>
        <h2 id="wl" className="text-4xl sm:text-5xl rv">Join the waitlist.</h2>
        <p className="text-stone mt-6 mb-8 max-w-[60ch] rv" data-i={1}>
          One email when Build opens, one when the price is final. Nothing else. If you tell us what you tried to build and where it stopped, we will reply with what a hosted export usually leaves behind, free.
        </p>
        <InquiryForm kind="build-waitlist" cta="Join the waitlist" />
      </section>
    </>
  )
}
