'use client'

import { COVERAGE_PLANS, COVERAGE_TERMS_FINAL } from '@/lib/catalog'
import { money } from '@/lib/format'
import { pct } from '@/lib/pricing'
import type { CoverageId } from '@/lib/types'
import { Icon } from './Icons'

export function CoveragePicker({ value, onChange, tripCents, days }: { value: CoverageId; onChange: (id: CoverageId) => void; tripCents: number; days: number }) {
  return (
    <div>
      <div className="plans" role="radiogroup" aria-label="Coverage: the most you would pay if the car is damaged">
        {COVERAGE_PLANS.map((p) => {
          const cost = Math.max(pct(tripCents, p.pctOfTrip), p.minPerDayCents * Math.max(1, days))
          const on = p.id === value
          return (
            <label key={p.id} className="plan" data-checked={on ? 'true' : undefined}>
              {p.id === 'plus' ? <span className="badge badge-lime plan-tag">Most chosen</span> : null}
              <input type="radio" name="coverage" value={p.id} checked={on} onChange={() => onChange(p.id)} />
              <span>
                <span className="plan-name">{p.name}</span>
                <span className="plan-number" style={{ display: 'block' }}>
                  {money(p.maxOutOfPocketCents)}
                </span>
                <span className="small muted">max you pay if damaged</span>
              </span>
              <span className="plan-price">
                +{money(cost)}
                <small>{p.depositCents ? `${money(p.depositCents)} hold` : 'no hold'}</small>
              </span>
              <span className="plan-detail">
                {p.liability}. {p.recommendedFor}
                <ul>
                  {p.includes.map((i) => (
                    <li key={i}>
                      <Icon name="check" size={12} /> {i}
                    </li>
                  ))}
                </ul>
              </span>
            </label>
          )
        })}
      </div>
      {!COVERAGE_TERMS_FINAL ? (
        <p className="small dim" style={{ marginTop: 10 }}>
          Preview terms. Final limits and pricing are set with AVANT&apos;s insurance partner before launch.
        </p>
      ) : null}
    </div>
  )
}
