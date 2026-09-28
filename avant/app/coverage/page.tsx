import type { Metadata } from 'next'
import Link from 'next/link'
import { ButtonLink, Notice } from '@/components/ui'
import { COVERAGE_PLANS, COVERAGE_TERMS_FINAL } from '@/lib/catalog'
import { POLICIES } from '@/lib/ai/knowledge'
import { money } from '@/lib/format'

export const metadata: Metadata = { title: 'Coverage, explained', description: 'Car sharing insurance in thirty seconds: pick the most you would pay if the car is damaged. Liability is included on every trip.' }

const FAQ: [string, string][] = [
  ['Is third-party liability included?', 'Yes, on every trip. If you injure someone or damage their property, the trip’s liability insurance responds up to the limit shown on your plan. Your plan choice only changes what you pay if the car you are driving is damaged.'],
  ['Will my own car insurance or credit card cover this?', 'Usually not. Most personal auto policies and most credit-card rental benefits exclude peer-to-peer car sharing, and several large card issuers say so explicitly. Check your policy wording before relying on it; if in doubt, pick Plus or Zero.'],
  ['What is the refundable hold?', 'A temporary authorisation on your card at pickup, not a charge. It is released within 48 hours after the trip unless something needs sorting out, and it can never exceed your plan’s maximum.'],
  ['What happens if the car is damaged?', POLICIES.damage_claims],
  ['What if I have an accident?', POLICIES.accident],
  ['Why does the price differ between cars?', 'Coverage is a percentage of the trip price, with a small daily minimum, so it scales with the value of the car and the length of the trip. You always see the exact figure before you choose.'],
]

export default function CoveragePage() {
  return (
    <div className="page">
      <div className="page-narrow">
        <p className="eyebrow">Coverage</p>
        <h1 className="page-title" style={{ margin: '10px 0 16px' }}>
          Insurance in <em>thirty seconds.</em>
        </h1>
        <p className="lead">
          Every trip includes liability insurance for other people and their property. The only decision is how much you&apos;d pay if the car you&apos;re
          driving gets damaged. Pick your number.
        </p>
        {!COVERAGE_TERMS_FINAL ? (
          <div style={{ marginTop: 20 }}>
            <Notice tone="warn">These are preview terms. Final limits and prices are set with AVANT&apos;s insurance partner, and the policy documents govern.</Notice>
          </div>
        ) : null}
      </div>

      <div className="wrap">
        <div className="grid-3" style={{ marginTop: 36 }}>
          {COVERAGE_PLANS.map((p) => (
            <div key={p.id} className="panel stack" style={{ gap: 10, borderColor: p.id === 'plus' ? 'var(--lime)' : undefined }}>
              <div className="between">
                <span className="plan-name">{p.name}</span>
                {p.id === 'plus' ? <span className="badge badge-lime">Most chosen</span> : null}
              </div>
              <p className="display" style={{ fontSize: 'clamp(3.6rem,7vw,5rem)', color: p.id === 'plus' ? 'var(--lime)' : undefined }}>
                {money(p.maxOutOfPocketCents)}
              </p>
              <p>{p.oneLiner}</p>
              <dl className="kv small">
                <div><dt>Costs</dt><dd>{p.pctOfTrip}% of trip, min {money(p.minPerDayCents)}/day</dd></div>
                <div><dt>Refundable hold</dt><dd>{p.depositCents ? money(p.depositCents) : 'None'}</dd></div>
                <div><dt>Liability</dt><dd>{p.liability}</dd></div>
              </dl>
              <ul className="small muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
                {p.includes.map((i) => <li key={i}>{i}</li>)}
              </ul>
              <p className="small dim">Best for: {p.recommendedFor}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="page-narrow section">
        <div className="section-head">
          <h2>
            The <em>fine print,</em> in plain English
          </h2>
        </div>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <div className="row" style={{ marginTop: 28 }}>
          <ButtonLink href="/search" iconAfter="arrow-right">Find a car</ButtonLink>
          <Link href="/concierge" className="btn btn-secondary btn-md">Ask the concierge</Link>
        </div>
      </div>
    </div>
  )
}
