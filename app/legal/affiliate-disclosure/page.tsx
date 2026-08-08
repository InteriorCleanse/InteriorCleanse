import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'
import { SITE } from '@/lib/site-config'

export const metadata: Metadata = { title: 'Affiliate Disclosure' }

export default function Affiliate() {
  return (
    <>
      <PageHero eyebrow="Legal" title={<em>Affiliate disclosure.</em>} />
      <section className="section" style={{ background: 'var(--ink)', paddingTop: 0 }}>
        <div className="prose">
          <p className="lead">{SITE.affiliateDisclosure}</p>
          <p>
            Product purchases are completed on third-party platforms, including TikTok
            Shop and Amazon. We do not collect payment details on this website.
          </p>
          <p>
            As an Amazon Associate, we may earn from qualifying purchases. Commission
            terms and platform policies are set by those platforms and can change; review
            the current terms on each platform before purchasing.
          </p>
        </div>
      </section>
    </>
  )
}
