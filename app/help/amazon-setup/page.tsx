import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Connect candles to Amazon',
  robots: { index: false, follow: false },
}

export default function AmazonSetup() {
  return (
    <>
      <PageHero
        eyebrow="Owner field guide / private"
        title={
          <>
            Connect candles
            <br />
            <em>to Amazon.</em>
          </>
        }
        sub="A plain-English route from your candle shelf to a live Amazon listing."
      />
      <section className="section" style={{ background: 'var(--ink)', paddingTop: 0 }}>
        <ol className="step-list">
          <li>
            <div>
              <b>Enter Seller Central.</b>
              <span>
                Go to <a href="https://sellercentral.amazon.com">sellercentral.amazon.com</a>{' '}
                and sign in to the selling account.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>Add the product.</b>
              <span>
                Choose &ldquo;Add a product.&rdquo; Search for an existing listing first;
                if none exists, create a new product.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>Choose the category.</b>
              <span>
                Candles commonly sit in Beauty &amp; Personal Care or Home &amp; Kitchen.
                Choose the closest accurate category.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>Prepare the details.</b>
              <span>
                Have at least six product images, packed weight and dimensions, an
                ingredients/materials list, and required candle safety warnings ready.
              </span>
            </div>
          </li>
          <li>
            <div>
              <b>Connect this site.</b>
              <span>
                Once Amazon assigns the ASIN, copy the full listing URL into{' '}
                <code>content/products.json</code> under <code>channels.amazonUrl</code>.
              </span>
            </div>
          </li>
        </ol>
      </section>
    </>
  )
}
