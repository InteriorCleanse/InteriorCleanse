import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'
import { SITE } from '@/lib/site-config'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function Privacy() {
  return (
    <>
      <PageHero eyebrow="Legal" title={<em>Privacy policy.</em>} />
      <section className="section" style={{ background: 'var(--ink)', paddingTop: 0 }}>
        <div className="prose">
          <p className="lead">
            We collect only information you choose to submit through hosted email or
            contact forms, such as your name, email address, and message.
          </p>
          <h2>Analytics</h2>
          <p>
            Analytics and pixel tools are off by default and are only enabled once the
            appropriate provider settings and notices have been added.
          </p>
          <h2>Third-party checkout</h2>
          <p>
            Purchases complete on Amazon, Etsy, or TikTok Shop. Those platforms handle
            your payment information under their own privacy policies; we never receive
            or store payment details.
          </p>
          <h2>Contact</h2>
          <p>
            Write to <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> with
            any privacy question, including a request to delete an address from our list.
          </p>
          <p>
            This policy should be reviewed by a qualified professional before launch to
            confirm it meets the requirements that apply to your jurisdiction.
          </p>
        </div>
      </section>
    </>
  )
}
