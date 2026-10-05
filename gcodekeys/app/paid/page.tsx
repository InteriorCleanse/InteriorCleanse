import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Payment — GCode Keys',
  robots: { index: false, follow: false },
}

// Landing page after a Stripe hosted-checkout outcome. Stripe redirects here
// with ?ref= and, on cancel, &canceled=1. The order is marked paid by the
// signature-verified webhook, not by this page, so this is purely a receipt.
export default function Paid({ searchParams }: { searchParams: { ref?: string; canceled?: string } }) {
  const ref = searchParams.ref ?? ''
  const canceled = searchParams.canceled === '1'

  return (
    <main className="wrap" style={{ paddingBlock: '48px 60px', maxWidth: 640 }}>
      <div className="panel" style={{ textAlign: 'center' }}>
        {canceled ? (
          <>
            <div className="bigcheck" style={{ color: 'var(--amber)' }}>↺</div>
            <h1 className="pstep" style={{ justifyContent: 'center', fontSize: 'clamp(1.5rem,3.6vw,2rem)' }}>Payment not completed</h1>
            <p className="sub" style={{ margin: '12px auto 0' }}>
              No charge was made{ref ? <> on <b style={{ color: 'var(--bright)' }}>{ref}</b></> : ''}. Your payment link is still valid — reopen it when you&apos;re ready, or reply to our message and we&apos;ll resend it.
            </p>
          </>
        ) : (
          <>
            <div className="bigcheck">✓</div>
            <h1 className="pstep" style={{ justifyContent: 'center', fontSize: 'clamp(1.5rem,3.6vw,2rem)' }}>Payment received</h1>
            {ref ? <p className="muted" style={{ fontFamily: 'var(--mono)' }}>Reference <b style={{ color: 'var(--bright)' }}>{ref}</b></p> : null}
            <p className="sub" style={{ margin: '12px auto 0' }}>
              Thank you. Your payment is confirmed and we&apos;re scheduling the cut. Programming happens at the vehicle. We&apos;ll be in touch with the time and details — a Stripe receipt is on its way to your email.
            </p>
          </>
        )}
        <Link className="btn" href="/" style={{ marginTop: 22, display: 'inline-block' }}>BACK TO STORE</Link>
      </div>
    </main>
  )
}
