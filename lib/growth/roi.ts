import { formatMoney, money } from '@/lib/money'

/**
 * The ROI calculator.
 *
 * Marketing ROI calculators are usually lies with a slider: pick a flattering
 * multiplier, multiply the visitor's revenue by it, print a number with a
 * currency symbol. This one is built to be defensible if a customer ever
 * quotes it back at us in a complaint.
 *
 * The rules it follows:
 *
 *   1. **It guarantees nothing, and says so in the output**, not in small print
 *      the caller can drop.
 *   2. **It reports a range, not a point.** The honest uncertainty here is
 *      large, and a single number invites someone to plan against it.
 *   3. **Every figure traces to a stated assumption** the visitor can see and
 *      disagree with.
 *   4. **It refuses rather than extrapolating** from inputs too small to mean
 *      anything.
 *   5. **It can return "this will not pay for itself"**, which is the test of
 *      whether a calculator is honest. If no input produces a negative answer,
 *      it is an advertisement wearing a spreadsheet's clothes.
 */

export type RoiInputs = {
  /** Monthly revenue in whole currency units. */
  monthlyRevenue: number
  /** Monthly advertising spend in whole currency units. */
  monthlyAdSpend: number
  /** Hours per month currently spent assembling reports by hand. */
  hoursOnReporting: number
  /** Blended hourly cost of the person doing it. */
  hourlyCost: number
  /** What the plan costs per month. */
  planCostPerMonth: number
  currency: string
}

export type Verdict = 'clearly_worth_it' | 'probably_worth_it' | 'marginal' | 'not_worth_it'

export type RoiResult =
  | { available: false; reason: string }
  | {
      available: true
      /** Conservative and optimistic monthly benefit, in whole units. */
      low: number
      high: number
      lowDisplay: string
      highDisplay: string
      costDisplay: string
      /** Net of the subscription. Negative is a real outcome, not an error. */
      netLow: number
      netHigh: number
      verdict: Verdict
      headline: string
      breakdown: { label: string; lowDisplay: string; highDisplay: string; basis: string }[]
      assumptions: string[]
      disclaimer: string
    }

/**
 * Bands rather than point estimates, and deliberately modest at the low end.
 *
 * These are not measured effects — we have no such study, and inventing one
 * would be the dishonest part. They are stated as what they are: a range wide
 * enough to include "barely anything".
 */
const TIME_RECOVERED_LOW = 0.4
const TIME_RECOVERED_HIGH = 0.8

/** Share of ad spend typically sitting in products that lose money per order. */
const WASTED_SPEND_LOW = 0.02
const WASTED_SPEND_HIGH = 0.08

/** Margin recovered by catching a costing or refund problem sooner. */
const MARGIN_RECOVERY_LOW = 0.001
const MARGIN_RECOVERY_HIGH = 0.005

export function calculateRoi(inputs: RoiInputs): RoiResult {
  const { monthlyRevenue, monthlyAdSpend, hoursOnReporting, hourlyCost, planCostPerMonth } = inputs

  if (!Number.isFinite(monthlyRevenue) || monthlyRevenue < 0) {
    return { available: false, reason: 'Enter your monthly revenue.' }
  }

  if (monthlyRevenue < 1_000) {
    // Below this, the answer is dominated by noise and the honest response is
    // to say so rather than print an encouraging number.
    return {
      available: false,
      reason:
        'Below about 1,000 a month, the figures here would be guesswork. Use the free plan and judge it on what it actually shows you.',
    }
  }

  const cash = (value: number) => formatMoney(money(Math.round(value * 100), inputs.currency))

  const timeLow = hoursOnReporting * hourlyCost * TIME_RECOVERED_LOW
  const timeHigh = hoursOnReporting * hourlyCost * TIME_RECOVERED_HIGH

  const spendLow = monthlyAdSpend * WASTED_SPEND_LOW
  const spendHigh = monthlyAdSpend * WASTED_SPEND_HIGH

  const marginLow = monthlyRevenue * MARGIN_RECOVERY_LOW
  const marginHigh = monthlyRevenue * MARGIN_RECOVERY_HIGH

  const low = timeLow + spendLow + marginLow
  const high = timeHigh + spendHigh + marginHigh

  const netLow = low - planCostPerMonth
  const netHigh = high - planCostPerMonth

  const verdict: Verdict = (() => {
    if (netLow > planCostPerMonth * 2) return 'clearly_worth_it' as const
    if (netLow > 0) return 'probably_worth_it' as const
    if (netHigh > 0) return 'marginal' as const
    return 'not_worth_it' as const
  })()

  return {
    available: true,
    low: Math.round(low),
    high: Math.round(high),
    lowDisplay: cash(low),
    highDisplay: cash(high),
    costDisplay: cash(planCostPerMonth),
    netLow: Math.round(netLow),
    netHigh: Math.round(netHigh),
    verdict,
    headline: headlineFor(verdict, cash(netLow), cash(netHigh), cash(planCostPerMonth)),
    breakdown: [
      {
        label: 'Time not spent assembling reports',
        lowDisplay: cash(timeLow),
        highDisplay: cash(timeHigh),
        basis: `${Math.round(TIME_RECOVERED_LOW * 100)}–${Math.round(TIME_RECOVERED_HIGH * 100)}% of ${hoursOnReporting} hours at ${cash(hourlyCost)} an hour.`,
      },
      {
        label: 'Advertising moved off products that lose money',
        lowDisplay: cash(spendLow),
        highDisplay: cash(spendHigh),
        basis: `${(WASTED_SPEND_LOW * 100).toFixed(0)}–${(WASTED_SPEND_HIGH * 100).toFixed(0)}% of ${cash(monthlyAdSpend)} monthly spend.`,
      },
      {
        label: 'Margin recovered by catching costing problems sooner',
        lowDisplay: cash(marginLow),
        highDisplay: cash(marginHigh),
        basis: `${(MARGIN_RECOVERY_LOW * 100).toFixed(1)}–${(MARGIN_RECOVERY_HIGH * 100).toFixed(1)}% of ${cash(monthlyRevenue)} monthly revenue.`,
      },
    ],
    assumptions: [
      'The bands above are illustrative ranges, not measured results from your business or anyone else’s.',
      'It assumes your cost and refund data is accurate enough to act on. If it is not, the first thing this product will do is tell you that.',
      'Time saved is only worth money if that time goes somewhere useful.',
      'Nothing here accounts for the effort of connecting your data in the first place.',
    ],
    disclaimer:
      'This is an estimate built from assumptions you can see and change. It is not a promise, a forecast, or a guarantee of any result.',
  }
}

function headlineFor(
  verdict: Verdict,
  netLow: string,
  netHigh: string,
  cost: string,
): string {
  switch (verdict) {
    case 'clearly_worth_it':
      return `Even on the conservative end, this looks like ${netLow} a month after the ${cost} subscription.`
    case 'probably_worth_it':
      return `On these numbers it covers its ${cost} cost, with ${netLow} to ${netHigh} a month left over.`
    case 'marginal':
      return `This is marginal: somewhere between ${netLow} and ${netHigh} a month after the ${cost} subscription. Try the free plan first.`
    case 'not_worth_it':
      // The test of an honest calculator is that it can say this.
      return `On these numbers it probably does not pay for itself yet. The free plan is genuinely free — use that, and come back when advertising or reporting time grows.`
  }
}
