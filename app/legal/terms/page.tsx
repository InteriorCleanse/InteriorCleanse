import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'

export const metadata: Metadata = { title: 'Terms of Service' }

export default function Terms() {
  return (
    <>
      <PageHero eyebrow="Legal" title={<em>Terms of service.</em>} />
      <section className="section" style={{ background: 'var(--ink)', paddingTop: 0 }}>
        <div className="prose">
          <p className="lead">
            This website provides editorial content, product recommendations, and links to
            third-party checkout platforms.
          </p>
          <h2>Products and pricing</h2>
          <p>
            Prices, availability, and platform policies may change without notice. We are
            not responsible for third-party checkout experiences, fulfillment, shipping
            times, or returns handled by those platforms.
          </p>
          <h2>Content</h2>
          <p>
            Editorial content is offered in good faith for general guidance. It is not
            professional advice for your specific home, health, or circumstances.
          </p>
          <p>
            These terms should be reviewed by a qualified professional before launch to
            confirm they meet the requirements that apply to your jurisdiction.
          </p>
        </div>
      </section>
    </>
  )
}
