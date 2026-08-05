import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Connect candles to Etsy',
  robots: { index: false, follow: false },
}

export default function EtsySetup() {
  return (
    <>
      <PageHero
        eyebrow="Owner field guide / private"
        title={
          <>
            Connect candles
            <br />
            <em>to Etsy.</em>
          </>
        }
        sub="Four considered steps to a shop customers can trust."
      />
      <section className="section" style={{ background: 'var(--ink)', paddingTop: 0 }}>
        <ol className="step-list">
          <li>
            <div>
              <b>Open the shop.</b>
              <span>
                Visit <a href="https://etsy.com/sell">etsy.com/sell</a>, choose &ldquo;Open
                a shop,&rdquo; and complete the account prompts.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>Choose the category.</b>
              <span>
                List candles as Handmade within Home &amp; Living, using the most specific
                candle subcategory offered.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>Build each listing.</b>
              <span>
                Create a separate listing per candle. Use clear, varied photographs and a
                natural, keyword-rich title and description.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>Connect this site.</b>
              <span>
                Copy each live Etsy listing URL into <code>content/products.json</code>{' '}
                under <code>channels.etsyUrl</code>.
              </span>
            </div>
          </li>
        </ol>
      </section>
    </>
  )
}
