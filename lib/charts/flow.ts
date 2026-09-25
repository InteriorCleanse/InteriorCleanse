/**
 * Layout maths for the two custom diagrams that carry real arithmetic:
 * the Profit Engine Sankey and the Cash Flow Waterfall.
 *
 * Both are pure so the numbers can be verified without rendering. The
 * arithmetic is the point — a Sankey whose outflows do not sum to its inflow,
 * or a waterfall whose closing balance is not opening plus movement, is not a
 * stylistic problem, it is a wrong financial statement drawn confidently.
 */

// ── Profit Engine Sankey ────────────────────────────────────────────────────

export type SankeyOutflow = {
  key: string
  label: string
  /** Minor units. Must be >= 0; a negative outflow is a modelling error. */
  amount: number
  /** Cost buckets read as leakage; retained profit is what survives. */
  tone: 'cost' | 'retained'
}

export type SankeyInput = {
  inflowLabel: string
  /** Net revenue entering the engine, in minor units. */
  inflow: number
  outflows: readonly SankeyOutflow[]
}

export type SankeyNode = {
  key: string
  label: string
  amount: number
  tone: 'inflow' | 'cost' | 'retained'
  x: number
  y: number
  width: number
  height: number
}

export type SankeyLink = {
  key: string
  path: string
  amount: number
  tone: 'cost' | 'retained'
  /** Vertical thickness of the ribbon where it meets the target. */
  thickness: number
}

export type SankeyLayout = {
  nodes: SankeyNode[]
  links: SankeyLink[]
  width: number
  height: number
  /** inflow − Σ outflows. Non-zero means the model does not balance. */
  residual: number
  balanced: boolean
}

export class SankeyImbalanceError extends Error {
  constructor(public readonly residual: number) {
    super(
      `Profit engine does not balance: ${residual} minor units unaccounted for. ` +
        'Every unit of revenue must be assigned to a cost bucket or to retained profit.',
    )
    this.name = 'SankeyImbalanceError'
  }
}

/**
 * Lays out a one-hop Sankey: revenue on the left, cost buckets and retained
 * profit stacked on the right, ribbons scaled by amount.
 *
 * Refuses to lay out an unbalanced model rather than drawing ribbons that sum
 * to something other than the inflow.
 */
export function layoutProfitSankey(
  input: SankeyInput,
  options: {
    width?: number
    height?: number
    nodeWidth?: number
    gap?: number
  } = {},
): SankeyLayout {
  const width = options.width ?? 720
  const height = options.height ?? 320
  const nodeWidth = options.nodeWidth ?? 14
  const gap = options.gap ?? 6

  const outflows = input.outflows.filter((o) => o.amount > 0)
  const totalOut = outflows.reduce((sum, o) => sum + o.amount, 0)
  const residual = input.inflow - totalOut

  if (input.outflows.some((o) => o.amount < 0)) {
    throw new SankeyImbalanceError(residual)
  }
  if (residual !== 0) throw new SankeyImbalanceError(residual)

  if (input.inflow <= 0 || outflows.length === 0) {
    return { nodes: [], links: [], width, height, residual, balanced: residual === 0 }
  }

  const totalGap = gap * Math.max(0, outflows.length - 1)
  const usable = Math.max(1, height - totalGap)
  const scale = usable / input.inflow

  const nodes: SankeyNode[] = [
    {
      key: 'inflow',
      label: input.inflowLabel,
      amount: input.inflow,
      tone: 'inflow',
      x: 0,
      y: 0,
      width: nodeWidth,
      height: usable,
    },
  ]

  const links: SankeyLink[] = []
  const rightX = width - nodeWidth

  // Ribbons leave the source stacked in the same order the targets appear, so
  // they do not cross — crossing ribbons in a one-hop diagram are pure noise.
  let sourceCursor = 0
  let targetCursor = 0

  for (const outflow of outflows) {
    const thickness = outflow.amount * scale

    nodes.push({
      key: outflow.key,
      label: outflow.label,
      amount: outflow.amount,
      tone: outflow.tone,
      x: rightX,
      y: targetCursor,
      width: nodeWidth,
      height: thickness,
    })

    const y0 = sourceCursor
    const y1 = targetCursor
    const x0 = nodeWidth
    const x1 = rightX
    const midX = (x0 + x1) / 2

    // Cubic ribbon: top edge across, down the target face, bottom edge back.
    links.push({
      key: outflow.key,
      amount: outflow.amount,
      tone: outflow.tone,
      thickness,
      path: [
        `M${x0.toFixed(2)} ${y0.toFixed(2)}`,
        `C${midX.toFixed(2)} ${y0.toFixed(2)} ${midX.toFixed(2)} ${y1.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`,
        `L${x1.toFixed(2)} ${(y1 + thickness).toFixed(2)}`,
        `C${midX.toFixed(2)} ${(y1 + thickness).toFixed(2)} ${midX.toFixed(2)} ${(y0 + thickness).toFixed(2)} ${x0.toFixed(2)} ${(y0 + thickness).toFixed(2)}`,
        'Z',
      ].join(' '),
    })

    sourceCursor += thickness
    targetCursor += thickness + gap
  }

  return { nodes, links, width, height, residual, balanced: true }
}

// ── Cash Flow Waterfall ─────────────────────────────────────────────────────

export type WaterfallStep = {
  key: string
  label: string
  /** Signed minor units. Positive is an inflow, negative an outflow. */
  amount: number
}

export type WaterfallBar = {
  key: string
  label: string
  kind: 'total' | 'increase' | 'decrease'
  /** Signed movement, or the absolute balance for a total bar. */
  amount: number
  /** Cumulative balance after this bar. */
  balance: number
  /** Bar geometry in value space; the renderer maps these through a y scale. */
  from: number
  to: number
}

export type WaterfallLayout = {
  bars: WaterfallBar[]
  opening: number
  closing: number
  min: number
  max: number
}

/**
 * Builds an opening → movements → closing waterfall.
 *
 * The closing bar is computed from the opening balance and the steps, never
 * passed in. If a caller could supply it independently, a rounding slip would
 * render a closing balance that does not equal what the bars show.
 */
export function layoutWaterfall(opening: number, steps: readonly WaterfallStep[]): WaterfallLayout {
  const bars: WaterfallBar[] = [
    {
      key: 'opening',
      label: 'Opening balance',
      kind: 'total',
      amount: opening,
      balance: opening,
      from: 0,
      to: opening,
    },
  ]

  let balance = opening
  let min = Math.min(0, opening)
  let max = Math.max(0, opening)

  for (const step of steps) {
    const from = balance
    balance += step.amount
    bars.push({
      key: step.key,
      label: step.label,
      kind: step.amount >= 0 ? 'increase' : 'decrease',
      amount: step.amount,
      balance,
      from,
      to: balance,
    })
    min = Math.min(min, balance, from)
    max = Math.max(max, balance, from)
  }

  bars.push({
    key: 'closing',
    label: 'Closing balance',
    kind: 'total',
    amount: balance,
    balance,
    from: 0,
    to: balance,
  })

  return { bars, opening, closing: balance, min, max }
}

// ── Product Portfolio Matrix ────────────────────────────────────────────────

export type PortfolioPoint = {
  productId: string
  label: string
  /** Period-over-period growth as a fraction. */
  growth: number
  /** Contribution margin as a fraction. */
  margin: number
  /** Revenue in minor units; drives bubble area. */
  revenue: number
}

export type PlacedPoint = PortfolioPoint & {
  x: number
  y: number
  r: number
  quadrant: 'invest' | 'defend' | 'fix' | 'cut'
}

/**
 * Places products by growth (x) and margin (y), sized by revenue.
 *
 * Radius is scaled by the square root of revenue: area is what the eye reads,
 * so scaling the radius linearly overstates large products quadratically.
 */
export function layoutPortfolio(
  points: readonly PortfolioPoint[],
  options: { width?: number; height?: number; minR?: number; maxR?: number } = {},
): { points: PlacedPoint[]; width: number; height: number; xZero: number; yZero: number } {
  const width = options.width ?? 640
  const height = options.height ?? 360
  const minR = options.minR ?? 6
  const maxR = options.maxR ?? 34

  if (points.length === 0) {
    return { points: [], width, height, xZero: width / 2, yZero: height / 2 }
  }

  // Symmetric bounds around zero so the quadrant lines land in the middle and
  // a product at +10% growth is visually as far from centre as one at −10%.
  const growthBound = Math.max(0.1, ...points.map((p) => Math.abs(p.growth)))
  const marginBound = Math.max(0.1, ...points.map((p) => Math.abs(p.margin)))
  const maxRevenue = Math.max(...points.map((p) => p.revenue), 1)

  const xZero = width / 2
  const yZero = height / 2

  const placed = points.map((p) => {
    const x = xZero + (p.growth / growthBound) * (width / 2 - maxR)
    const y = yZero - (p.margin / marginBound) * (height / 2 - maxR)
    const r = minR + (maxR - minR) * Math.sqrt(Math.max(0, p.revenue) / maxRevenue)

    const quadrant: PlacedPoint['quadrant'] =
      p.margin >= 0
        ? p.growth >= 0
          ? 'invest' // profitable and growing
          : 'defend' // profitable but shrinking
        : p.growth >= 0
          ? 'fix' // growing but losing money
          : 'cut' // shrinking and losing money

    return { ...p, x, y, r, quadrant }
  })

  return { points: placed, width, height, xZero, yZero }
}

export const QUADRANT_LABELS: Record<PlacedPoint['quadrant'], string> = {
  invest: 'Growing and profitable',
  defend: 'Profitable but shrinking',
  fix: 'Growing but unprofitable',
  cut: 'Shrinking and unprofitable',
}
