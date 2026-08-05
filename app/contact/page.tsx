import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'
import { SITE } from '@/lib/site-config'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Questions, corrections, or collaboration notes — get in touch.',
}

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
              Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. The
              form below posts to a hosted form endpoint; set{' '}
              <code>NEXT_PUBLIC_CONTACT_FORM_ENDPOINT</code> before launch so submissions
              reach an inbox.
            </p>
          </div>

          <form
            action={process.env.NEXT_PUBLIC_CONTACT_FORM_ENDPOINT || '#'}
            method="post"
            className="contact-form"
          >
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
        </div>
      </section>
    </>
  )
}
