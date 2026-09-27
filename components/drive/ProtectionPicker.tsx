'use client'

import { PROTECTION_PLANS } from '@/lib/drive/catalog'
import { money } from '@/lib/drive/format'
import { pct } from '@/lib/drive/pricing'
import type { ProtectionPlanId } from '@/lib/drive/types'
import { Icon } from './Icons'

/** Radio cards for the three plans, priced against the actual trip. */
export function ProtectionPicker({
  value,
  onChange,
  tripCents,
  name = 'protection',
}: {
  value: ProtectionPlanId
  onChange: (id: ProtectionPlanId) => void
  tripCents: number
  name?: string
}) {
  return (
    <div className="dr-plans" role="radiogroup" aria-label="Protection plan">
      {PROTECTION_PLANS.map((plan) => {
        const checked = plan.id === value
        return (
          <label key={plan.id} className="dr-plan" data-checked={checked ? 'true' : undefined}>
            <input type="radio" name={name} value={plan.id} checked={checked} onChange={() => onChange(plan.id)} />
            <span className="dr-plan-head">
              <strong>{plan.name}</strong>
              <span>
                {money(pct(tripCents, plan.pctOfTrip))} <small>({plan.pctOfTrip}% of trip)</small>
              </span>
            </span>
            <span className="dr-plan-summary">{plan.summary}</span>
            <ul className="dr-plan-list">
              {plan.includes.map((line) => (
                <li key={line}>
                  <Icon name="check" size={13} /> {line}
                </li>
              ))}
            </ul>
          </label>
        )
      })}
    </div>
  )
}
