import type { Metadata } from 'next'
import { Section } from '@/components/Section'
import { Faq } from '@/components/Faq'
import { InquiryForm } from '@/components/InquiryForm'

export const metadata: Metadata = {
  title: 'Freehold Build. Your app, in your repo, on your key',
  description:
    'Describe it once. Get a Next.js repo in your GitHub, a Postgres database in your account, a deployment on your Vercel, on your own Anthropic key. Never charged for a build the AI could not finish. Waitlist open.',
  alternates: { canonical: '/build/' },
}

const faq = [
  {
    q: 'Do I need to know how to code?',
    a: 'No, but you need four accounts: GitHub, a Postgres provider, Vercel, and Anthropic. We walk you through each. It is more setup than a hosted builder asks for, and it is the reason you own the result.',
  },
  {
    q: 'What happens when the AI breaks something?',
    a: 'It will, sometimes. The break is a commit you can see, any developer can read, and we can retry. A build we cannot finish is not billed by us. Your Anthropic key is still charged for the tokens; we do not control that meter and will not pretend to.',
  },
  {
    q: 'Can you import my Base44 app?',
    a: 'Not fully, and neither can anyone. Base44 exports the frontend; authentication and database logic stay behind its SDK. We audit what came out, rebuild what did not, and tell you the difference in writing before you pay.',
  },
  {
    q: 'What does it cost?',
    a: 'A flat monthly fee to us, set when the waitlist opens, plus whatever your own Anthropic usage costs on your own bill. No credits and no integration meter. The fee is not published until it is final; we do not announce a number and change it.',
  },
  {
    q: 'What if Freehold disappears?',
    a: 'Your app keeps running. It is on your Vercel, your database, your repo. You would lose the tool that builds the next version, not the version you have.',
  },
  {
    q: 'What do you not do?',
    a: 'Email sending, SMS, native mobile, an integration store, or a hosted runtime. If you need those, a hosted builder has them and we do not.',
  },
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
      <section className="page pt-10 sm:pt-20 reveal">
        <p className="kicker">Freehold Build</p>
        <h1 className="mt-4 text-5xl sm:text-7xl max-w-4xl">Your app, in your repo, on your key.</h1>
        <p className="measure mt-8 text-lg text-stone">
          Describe it once. Get a Next.js repository in your GitHub, a Postgres database in your
          account, a deployment on your Vercel, generated on your own Anthropic key.
        </p>
        <p className="measure mt-4 text-sm text-stone">
          Not launched yet. The waitlist below is the only thing this page collects.
        </p>
      </section>

      <Section n="01" title="Three things that are true by construction">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h3 className="text-xl">Your repo</h3>
            <p className="text-stone mt-2">The first commit is in your GitHub before you have paid anything.</p>
          </div>
          <div>
            <h3 className="text-xl">Your bill</h3>
            <p className="text-stone mt-2">The model runs on your Anthropic key. You read that bill, not us.</p>
          </div>
          <div>
            <h3 className="text-xl">Your database and deployment</h3>
            <p className="text-stone mt-2">Nothing runs on our servers, so our bad day is not yours.</p>
          </div>
        </div>
      </Section>

      <Section n="02" title="The billing rule">
        <div className="measure space-y-4">
          <p className="text-2xl serif">You are never charged for a build the AI could not finish.</p>
          <p className="text-stone">
            Hosted builders charge credits while their model fixes its own mistakes. We cannot, because
            our fee is flat and the model cost is on your key. A build that does not reach a working
            commit costs you nothing from us. The tokens it used are on your Anthropic bill, which we
            do not control and do not mark up.
          </p>
        </div>
      </Section>

      <Section n="03" title="How a build runs">
        <ol className="measure space-y-4 list-none">
          {steps.map(([t, d], i) => (
            <li key={t} className="rule pt-4 grid grid-cols-[3rem_1fr] gap-2">
              <span className="kicker pt-1">0{i + 1}</span>
              <div>
                <p className="font-medium">{t}</p>
                <p className="text-stone mt-1">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section n="04" title="Questions a burned builder asks">
        <Faq items={faq} />
      </Section>

      <Section n="05" title="Waitlist" id="waitlist">
        <p className="measure text-stone mb-6">
          One email when Build opens, one when the price is final. Nothing else. If you tell us what
          you tried to build and where it stopped, we will reply with what a hosted export usually
          leaves behind, free, so you know what you are walking into.
        </p>
        <InquiryForm kind="build-waitlist" cta="Join the waitlist" />
      </Section>
    </>
  )
}
