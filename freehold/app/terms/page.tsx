import type { Metadata } from 'next'
import { Section } from '@/components/Section'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Terms of use for this website.',
  alternates: { canonical: '/terms/' },
}

export default function TermsPage() {
  return (
    <>
      <section className="page pt-10 sm:pt-20 reveal">
        <p className="kicker">Terms</p>
        <h1 className="mt-4 text-5xl sm:text-6xl max-w-4xl">Terms of use.</h1>
        <p className="measure mt-6 text-sm text-stone">
          Draft for review by a qualified professional before the domain goes live. Last updated 27 September 2026.
        </p>
      </section>
      <Section n="01" title="This website">
        <div className="measure space-y-4 text-stone">
          <p>
            The content of this site is information about Freehold&rsquo;s services. It is not advice
            and does not form a contract. Engagements are governed by a written agreement signed by
            both parties.
          </p>
          <p>
            Freehold Build is not yet available. Joining the waitlist creates no obligation on either
            side.
          </p>
          <p>
            Nothing on this site should be read as a claim about clients, results, or availability that
            is not stated in plain words on the page.
          </p>
        </div>
      </Section>
    </>
  )
}
