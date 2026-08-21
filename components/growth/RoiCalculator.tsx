'use client'

import { useMemo, useState } from 'react'
import { calculateRoi } from '@/lib/growth/roi'

/**
 * The ROI calculator's UI.
 *
 * The design decision worth stating: the disclaimer and the assumptions are
 * rendered at the same visual weight as the number, not in grey six-point type
 * underneath. If the honest caveats make the pitch weaker, the pitch was
 * overstated.
 */

const VERDICT_CLASS = {
  clearly_worth_it: 'text-positive',
  probably_worth_it: 'text-positive',
  marginal: 'text-amber',
  not_worth_it: 'text-muted',
} as const

export function RoiCalculator({ planCostPerMonth = 149 }: { planCostPerMonth?: number }) {
  const [monthlyRevenue, setMonthlyRevenue] = useState(100_000)
  const [monthlyAdSpend, setMonthlyAdSpend] = useState(20_000)
  const [hoursOnReporting, setHoursOnReporting] = useState(12)
  const [hourlyCost, setHourlyCost] = useState(60)

  const result = useMemo(
    () =>
      calculateRoi({
        monthlyRevenue,
        monthlyAdSpend,
        hoursOnReporting,
        hourlyCost,
        planCostPerMonth,
        currency: 'USD',
      }),
    [monthlyRevenue, monthlyAdSpend, hoursOnReporting, hourlyCost, planCostPerMonth],
  )

  const fields = [
    { id: 'revenue', label: 'Monthly revenue', value: monthlyRevenue, set: setMonthlyRevenue, step: 1_000 },
    { id: 'spend', label: 'Monthly ad spend', value: monthlyAdSpend, set: setMonthlyAdSpend, step: 500 },
    { id: 'hours', label: 'Hours a month on reporting', value: hoursOnReporting, set: setHoursOnReporting, step: 1 },
    { id: 'cost', label: 'Cost of an hour of that time', value: hourlyCost, set: setHourlyCost, step: 5 },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
      <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
        {fields.map((field) => (
          <div key={field.id}>
            <label htmlFor={field.id} className="block text-sm text-muted">
              {field.label}
            </label>
            <input
              id={field.id}
              type="number"
              min={0}
              step={field.step}
              value={field.value}
              onChange={(event) => field.set(Math.max(0, Number(event.target.value) || 0))}
              className="mt-1 min-h-11 w-full rounded-lg border border-hairline bg-ground px-3 text-sm tabular-nums text-ink focus:border-signal focus:outline-none"
            />
          </div>
        ))}
      </form>

      <div className="space-y-4">
        {!result.available ? (
          <p className="text-sm text-muted">{result.reason}</p>
        ) : (
          <>
            <p className={`text-base ${VERDICT_CLASS[result.verdict]}`}>{result.headline}</p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-sm">
                <caption className="sr-only">Estimated monthly benefit by component</caption>
                <thead>
                  <tr className="border-b border-hairline text-left text-xs uppercase tracking-[0.14em] text-muted">
                    <th scope="col" className="py-2 font-medium">Where it comes from</th>
                    <th scope="col" className="py-2 text-right font-medium">Low</th>
                    <th scope="col" className="py-2 text-right font-medium">High</th>
                  </tr>
                </thead>
                <tbody>
                  {result.breakdown.map((line) => (
                    <tr key={line.label} className="border-b border-hairline/60 align-top">
                      <th scope="row" className="py-2 text-left font-normal">
                        <span className="text-ink">{line.label}</span>
                        <span className="mt-0.5 block text-xs text-muted">{line.basis}</span>
                      </th>
                      <td className="py-2 text-right tabular-nums text-ink">{line.lowDisplay}</td>
                      <td className="py-2 text-right tabular-nums text-ink">{line.highDisplay}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="py-2 text-left font-medium text-ink">
                      Less the subscription
                    </th>
                    <td colSpan={2} className="py-2 text-right tabular-nums text-muted">
                      −{result.costDisplay}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Same weight as the number. If the caveats weaken the pitch, the
                pitch was overstated. */}
            <div className="rounded-lg border border-hairline bg-panelRaised p-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                What this assumes
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {result.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink">{result.disclaimer}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
