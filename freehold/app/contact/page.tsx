import type { Metadata } from 'next'
import { InquiryForm } from '@/components/InquiryForm'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'One inbox, one person, two working days.',
  alternates: { canonical: '/contact/' },
  openGraph: { url: '/contact/' },
}

export default function ContactPage() {
  return (
    <>
      <section className="page pt-14 sm:pt-20 lg:pt-24">
        <h1 className="text-[3.2rem] leading-[0.98] sm:text-7xl lg:text-[5.6rem] max-w-[12ch] rv">One inbox. One person.</h1>
        <p className="mt-8 text-lg sm:text-xl text-stone max-w-[44ch] rv" data-i={1}>
          Write to <a className="link" href={`mailto:${SITE.email}`}>{SITE.email}</a> or use the form. Replies come from a person within two working days. No autoresponder, no sequence.
        </p>
      </section>
      <section className="page mt-16 sm:mt-24">
        <InquiryForm kind="general" cta="Send" />
      </section>
    </>
  )
}
