import type { Metadata } from 'next'
import { Button } from '@/components/ui'
import { ClearCartOnMount } from '@/components/ClearCartOnMount'

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
}

export default function CheckoutSuccess() {
  return (
    <section
      className="section"
      style={{ paddingTop: 'calc(var(--header-h) + 8rem)', minHeight: '70vh' }}
    >
      <ClearCartOnMount />
      <div className="section-inner">
        <p className="eyebrow">Order confirmed</p>
        <h1
          className="gsap-headline"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
            fontWeight: 320,
            lineHeight: 0.9,
            letterSpacing: '-0.04em',
            color: 'var(--bone)',
            margin: '1.5rem 0 2rem',
          }}
        >
          Thank you.
          <br />
          <em style={{ color: 'var(--brass)', fontStyle: 'italic' }}>
            It&rsquo;s on its way.
          </em>
        </h1>
        <p className="page-hero-sub" style={{ marginBottom: '3rem' }}>
          A receipt is on its way to your inbox, and a note from us will follow shortly.
          Made-to-order items ship in 2&ndash;5 business days.
        </p>
        <div className="hero-actions">
          <Button href="/shop/">Continue shopping</Button>
          <Button href="/" variant="ghost">
            Return home
          </Button>
        </div>
      </div>
    </section>
  )
}
