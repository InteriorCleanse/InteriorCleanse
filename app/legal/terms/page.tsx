import { branding } from '@/lib/env'
import { DELETION_GRACE_DAYS, LEGAL_STATUS } from '@/lib/legal'

export const metadata = { title: 'Terms', robots: { index: false, follow: false } }

/**
 * Terms, as far as a codebase can write them.
 *
 * The one sentence the original placeholder insisted on is here and first:
 * the product reports on your data and guarantees no commercial outcome. The
 * rest states what the software actually does — read-only integrations,
 * export that is never switched off, deletion with a grace period — so that a
 * reviewer is checking facts rather than inventing them. The draft banner is
 * the first element on the page.
 */
export default function TermsPage() {
  const name = branding.appName()

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-16">
      {LEGAL_STATUS.reviewedAt === null ? (
        <p
          role="status"
          className="rounded-panel border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-ink"
        >
          {LEGAL_STATUS.banner}
        </p>
      ) : null}

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-ink">Terms</h1>
        <p className="text-sm text-muted">What {name} does, and what it does not promise.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">No guaranteed outcome</h2>
        <p className="text-sm leading-relaxed text-muted">
          {name} reports on your business using the data you import or connect. It does not
          guarantee revenue, profit, growth, or any commercial result. Every figure it shows
          states the formula and the source it came from; every forecast states its uncertainty;
          the pricing calculator can and does say that the product will not pay for itself. Any
          decision you make on the basis of what it shows is yours.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Your data stays yours</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
          <li>You can export everything in your workspace, in full, at any time — including while a subscription is in arrears and the workspace is read-only.</li>
          <li>You can delete your workspace. Stored credentials are destroyed immediately; business records are kept for {DELETION_GRACE_DAYS} days and then removed.</li>
          <li>Connections to other services are read-only. {name} asks for no permission to change anything in Stripe, Shopify, or your calendar, and has no code path that would.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Accuracy depends on the source</h2>
        <p className="text-sm leading-relaxed text-muted">
          A connected service reports what it knows and nothing more. Stripe does not know what a
          product cost you; Shopify does not know what the payment processor kept. Each connector
          states on the integrations screen what it does not provide, and a figure that cannot be
          computed from the data available is shown as unavailable with the reason, never as zero.
          Demonstration workspaces use synthetic figures and are labelled everywhere they appear.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">The assistant</h2>
        <p className="text-sm leading-relaxed text-muted">
          The assistant answers from your workspace’s own records and cites them. It can propose
          changes but cannot make one without your explicit approval of the exact action, and it
          never has access to a stored credential. It is a tool that can be wrong, and it says so
          when it is uncertain.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Plans and billing</h2>
        <p className="text-sm leading-relaxed text-muted">
          What each plan includes and excludes is stated on the pricing page with equal
          prominence. Prices are set in Stripe and confirmed at checkout; if a displayed figure
          ever disagrees with the checkout figure, the checkout figure is the one charged and the
          display is a bug we will fix. Downgrades show what will be lost before they are
          confirmed. Cancelling drops the workspace to the free plan with its data intact.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Availability</h2>
        <p className="text-sm leading-relaxed text-muted">
          The product depends on third-party services listed in the privacy notice. When one is
          unavailable, the parts of the product that need it say so rather than showing stale or
          fabricated figures; the parts that do not need it keep working.
        </p>
      </section>
    </main>
  )
}
