import Link from 'next/link'
import { branding } from '@/lib/env'
import { Eyebrow, Panel } from '@/components/ui'
import { RoiCalculator } from '@/components/growth/RoiCalculator'
import { PLANS, PLAN_ORDER, formatPlanPrice } from '@/lib/billing/plans'

export const metadata = {
  title: 'Pricing',
  description:
    'Plans for AURELIS OS. Every plan shows what it does not include, and the calculator can tell you not to buy.',
}

/**
 * Pricing.
 *
 * Each plan states what it excludes with the same prominence as what it
 * includes, and the calculator below is capable of saying "this will not pay
 * for itself". Both are commercial choices, not just honest ones: the cost of
 * a customer who bought the wrong tier is a refund, a support thread and a
 * bad review, and it exceeds the revenue from selling it to them.
 */
export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-12 px-6 py-16">
      <header className="max-w-2xl space-y-3">
        <Eyebrow>Pricing</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Priced so the free plan is genuinely useful
        </h1>
        <p className="text-sm text-muted">
          The free plan calculates profit properly rather than teasing it. Paid plans add seats,
          sources, and how much you can ask {branding.assistantName()}. Cancel from the billing
          portal; your data stays yours and export is never switched off, even in arrears.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((key) => {
          const plan = PLANS[key]
          return (
            <Panel key={key}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-ink">{plan.name}</h2>
                <span className="text-sm text-muted">{formatPlanPrice(plan)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{plan.audience}</p>

              <ul className="mt-4 space-y-1.5 text-sm text-ink">
                {plan.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              {plan.limitations.length > 0 ? (
                <div className="mt-4 border-t border-hairline pt-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber">
                    Not included
                  </h3>
                  <ul className="mt-1.5 space-y-1 text-sm text-muted">
                    {plan.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Link
                href="/signup"
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-hairline text-sm text-ink transition hover:border-signal"
              >
                {plan.key === 'free' ? 'Start free' : `Choose ${plan.name}`}
              </Link>
            </Panel>
          )
        })}
      </div>

      <section className="space-y-4">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            Work out whether it is worth it
          </h2>
          <p className="text-sm text-muted">
            This calculator can tell you not to buy, and sometimes does. The bands are illustrative
            ranges we have written down, not measured results — you can see every assumption and
            disagree with it.
          </p>
        </div>

        <Panel>
          <RoiCalculator planCostPerMonth={PLANS.growth.displayPriceMinor / 100} />
        </Panel>
      </section>

      <section className="max-w-2xl space-y-3">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Questions people ask</h2>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-ink">What happens if my payment fails?</dt>
            <dd className="mt-1 text-muted">
              Everything keeps working for 14 days while we tell you clearly what is about to
              happen. After that the workspace becomes read-only. Nothing is deleted, and export
              still works.
            </dd>
          </div>
          <div>
            <dt className="text-ink">What happens to my data if I cancel?</dt>
            <dd className="mt-1 text-muted">
              The workspace drops to the Free plan and the data stays. Holding your own numbers
              hostage is not a retention strategy.
            </dd>
          </div>
          <div>
            <dt className="text-ink">Do you use my business data to train models?</dt>
            <dd className="mt-1 text-muted">
              No. See the <Link href="/legal/privacy" className="text-signal hover:underline">privacy policy</Link>.
            </dd>
          </div>
          <div>
            <dt className="text-ink">Do I need to connect anything to try it?</dt>
            <dd className="mt-1 text-muted">
              No. Every workspace starts with a demonstration dataset that is clearly labelled as
              such, so you can see exactly what the product does before handing over a key.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
