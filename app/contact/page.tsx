import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'
import { SITE } from '@/lib/site-config'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with InteriorCleanse: order questions, corrections, press, and collaboration notes. We read everything and reply within two working days.',
  alternates: { canonical: '/contact/' },
}

// The form appears only once a hosted form endpoint is configured; until then
// email is the one way in, rather than a form that posts nowhere.
const FORM_ENDPOINT = process.env.NEXT_PUBLIC_CONTACT_FORM_ENDPOINT

export default function Contact() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Questions, corrections,
            <br />
            <em>or collaboration notes.</em>
          </>
        }
      />

      <section className="section" style={{ background: 'var(--ink)', paddingTop: 0 }}>
        <div className="section-inner">
          <div className="prose">
            <p>
              Write to <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
              Order questions, corrections, press and collaborations all come to the same
              inbox, and every note is read. We reply within two working days.
            </p>
          </div>

          {FORM_ENDPOINT && (
            <form action={FORM_ENDPOINT} method="post" className="contact-form">
              <input required name="name" placeholder="Name" aria-label="Name" />
              <input
                required
                type="email"
                name="email"
                placeholder="Email"
                aria-label="Email"
              />
              <textarea
                required
                name="message"
                placeholder="Message"
                rows={6}
                aria-label="Message"
              />
              <button type="submit">Send</button>
            </form>
          )}
        </div>
      </section>
    </>
  )
}
