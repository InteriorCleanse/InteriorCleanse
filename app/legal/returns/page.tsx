import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHero } from '@/components/ui'
import { SITE } from '@/lib/site-config'

export const metadata: Metadata = {
  title: 'Returns',
  description:
    'How returns work for InteriorCleanse orders, and who handles them for products bought through Amazon or TikTok Shop.',
  alternates: { canonical: '/legal/returns/' },
}

export default function Returns() {
  return (
    <>
      <PageHero eyebrow="Legal" title={<em>Returns.</em>} />
      <section className="section" style={{ background: 'var(--ink)', paddingTop: 0 }}>
        <div className="prose">
          <p className="lead">
            Where a return goes depends on where the purchase happened. That is stated on
            every product page before you buy.
          </p>

          <h2>Ordered on this site</h2>
          <p>
            Physical products bought through our own checkout can be returned within 30
            days of delivery, unused and in their original packaging. Email{' '}
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> with your order
            number and we will send return instructions. Refunds are issued to the original
            payment method once the item arrives back with our fulfilment partner.
          </p>
          <p>
            Return shipping is at your cost unless the item arrived damaged, faulty, or
            incorrect — in which case we cover it. Tell us within 14 days of delivery and
            include a photograph so we can resolve it without sending the item back.
          </p>

          <h2>Made-to-order items</h2>
          <p>
            Printed and made-to-order goods are produced individually after you order, so
            they cannot be returned for a change of mind. They are still covered in full if
            they arrive damaged, misprinted, or defective.
          </p>

          <h2>Digital downloads</h2>
          <p>
            Digital files are non-refundable once downloaded, because they cannot be
            returned. If a file is corrupt, will not open, or is not what the listing
            described, contact us and we will fix it or refund it. See the{' '}
            <Link href="/legal/digital-license/">digital licence</Link> for what you may do
            with a file once you have it.
          </p>

          <h2>Bought on Amazon or TikTok Shop</h2>
          <p>
            Books and any item marked as an external purchase are sold and fulfilled by
            that platform, not by us. Their returns policy applies and their customer
            service handles it — we cannot process a refund for an order we never took
            payment for. Use the returns process in your Amazon or TikTok Shop account.
          </p>

          <h2>Questions</h2>
          <p>
            Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. Include
            your order number and we will get to it.
          </p>
        </div>
      </section>
    </>
  )
}
