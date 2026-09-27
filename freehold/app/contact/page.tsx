import type { Metadata } from 'next'
import { Section } from '@/components/Section'
import { InquiryForm } from '@/components/InquiryForm'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'One inbox, one person, two working days.',
  alternates: { canonical: '/contact/' },
}

export default function ContactPage() {
  return (
    <>
      <section className="page pt-10 sm:pt-20 reveal">
        <p className="kicker">Contact</p>
        <h1 className="mt-4 text-5xl sm:text-7xl max-w-4xl">One inbox. One person.</h1>
        <p className="measure mt-8 text-lg text-stone">
          Write to <a className="link" href={`mailto:${SITE.email}`}>{SITE.email}</a> or use the form.
          Replies come from a person within two working days. No autoresponder, no sequence.
        </p>
      </section>
      <Section n="01" title="Write to us">
        <InquiryForm kind="general" cta="Send" />
      </Section>
    </>
  )
}
