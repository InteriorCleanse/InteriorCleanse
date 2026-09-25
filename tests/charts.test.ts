import { describe, expect, it } from 'vitest'
import {
  areaPath,
  bandScale,
  DEFAULT_PLOT,
  donutArc,
  extentOf,
  linePath,
  niceExtent,
  niceScale,
  pointScale,
  stackSeries,
  ticksFor,
  yScale,
} from '@/lib/charts/scale'
import {
  layoutPortfolio,
  layoutProfitSankey,
  layoutWaterfall,
  SankeyImbalanceError,
} from '@/lib/charts/flow'

describe('extentOf', () => {
  it('always includes zero by default', () => {
    // A truncated axis exaggerates change; on a profit dashboard that is
    // the difference between a trend and a decision.
    expect(extentOf([100, 120, 140])).toEqual({ min: 0, max: 140 })
    expect(extentOf([-50, -20])).toEqual({ min: -50, max: 0 })
  })

  it('can be told not to, for indexed series', () => {
    expect(extentOf([100, 120], false)).toEqual({ min: 100, max: 120 })
  })

  it('gives a flat series a usable range', () => {
    const e = extentOf([50, 50, 50], false)
    expect(e.min).toBeLessThan(e.max)
  })

  it('handles all-zero and empty input without collapsing', () => {
    expect(extentOf([0, 0])).toEqual({ min: 0, max: 1 })
    expect(extentOf([])).toEqual({ min: 0, max: 1 })
  })
})

describe('ticks', () => {
  it('rounds to human numbers', () => {
    expect(niceExtent({ min: 0, max: 9377 })).toEqual({ min: 0, max: 10000 })
    expect(ticksFor({ min: 0, max: 100 }, 5)).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('always includes the final tick despite float drift', () => {
    for (const max of [3, 7, 33, 97, 1234, 99999]) {
      const ticks = ticksFor({ min: 0, max })
      expect(ticks.length).toBeGreaterThan(1)
      expect(ticks[ticks.length - 1]!).toBeGreaterThanOrEqual(max)
    }
  })

  it('snaps a near-zero tick to exactly zero', () => {
    const ticks = ticksFor({ min: -50, max: 50 })
    expect(ticks).toContain(0)
  })
})

describe('scales', () => {
  it('puts larger values higher on screen', () => {
    const y = yScale({ min: 0, max: 100 }, DEFAULT_PLOT)
    expect(y(100)).toBeLessThan(y(0))
    expect(y(0)).toBeCloseTo(DEFAULT_PLOT.height - DEFAULT_PLOT.padding.bottom)
  })

  it('centres a single point rather than pinning it to the left edge', () => {
    const x = pointScale(1, DEFAULT_PLOT)
    expect(x(0)).toBeGreaterThan(DEFAULT_PLOT.padding.left)
  })

  it('spans the full inner width across points', () => {
    const x = pointScale(5, DEFAULT_PLOT)
    expect(x(0)).toBeCloseTo(DEFAULT_PLOT.padding.left)
    expect(x(4)).toBeCloseTo(DEFAULT_PLOT.width - DEFAULT_PLOT.padding.right)
  })

  it('keeps bands inside the plot', () => {
    const b = bandScale(4, DEFAULT_PLOT)
    expect(b.start(0)).toBeCloseTo(DEFAULT_PLOT.padding.left)
    expect(b.center(3)).toBeLessThan(DEFAULT_PLOT.width - DEFAULT_PLOT.padding.right)
  })
})

describe('paths', () => {
  it('builds a line path', () => {
    expect(linePath([{ x: 0, y: 10 }, { x: 5, y: 20 }])).toBe('M0.00 10.00 L5.00 20.00')
  })

  it('closes an area to the baseline so the fill cannot float', () => {
    const path = areaPath([{ x: 0, y: 10 }, { x: 5, y: 20 }], 100)
    expect(path.endsWith('Z')).toBe(true)
    expect(path).toContain('100.00')
  })

  it('returns empty for no points instead of malformed markup', () => {
    expect(linePath([])).toBe('')
    expect(areaPath([], 10)).toBe('')
  })
})

describe('stackSeries', () => {
  it('stacks cumulatively and reports totals', () => {
    const { bands, totals } = stackSeries([[10, 20], [5, 5]])
    expect(bands[0]).toEqual([{ start: 0, end: 10 }, { start: 0, end: 20 }])
    expect(bands[1]).toEqual([{ start: 10, end: 15 }, { start: 20, end: 25 }])
    expect(totals).toEqual([15, 25])
  })

  it('treats a missing value as zero rather than shifting the stack', () => {
    const { totals } = stackSeries([[10, 20], [5]])
    expect(totals).toEqual([15, 20])
  })
})

describe('donutArc', () => {
  it('splits a full circle into two arcs so it renders', () => {
    // One arc from 0 to 1 has coincident endpoints and draws nothing.
    const full = donutArc(50, 50, 40, 24, 0, 1)
    expect(full.match(/M/g)).toHaveLength(2)
  })

  it('sets the large-arc flag past a half turn', () => {
    expect(donutArc(50, 50, 40, 24, 0, 0.75)).toContain('0 1 1')
    expect(donutArc(50, 50, 40, 24, 0, 0.25)).toContain('0 0 1')
  })
})

// ── Profit Engine Sankey ────────────────────────────────────────────────────

const SANKEY = {
  inflowLabel: 'Net revenue',
  inflow: 100_000,
  outflows: [
    { key: 'cogs', label: 'COGS', amount: 40_000, tone: 'cost' as const },
    { key: 'ads', label: 'Advertising', amount: 25_000, tone: 'cost' as const },
    { key: 'fees', label: 'Fees', amount: 10_000, tone: 'cost' as const },
    { key: 'profit', label: 'Retained profit', amount: 25_000, tone: 'retained' as const },
  ],
}

describe('layoutProfitSankey', () => {
  it('lays out a balanced engine', () => {
    const layout = layoutProfitSankey(SANKEY)
    expect(layout.balanced).toBe(true)
    expect(layout.residual).toBe(0)
    expect(layout.links).toHaveLength(4)
    // One inflow node plus one per outflow.
    expect(layout.nodes).toHaveLength(5)
  })

  it('scales ribbon thickness by share of revenue', () => {
    const layout = layoutProfitSankey(SANKEY)
    const cogs = layout.links.find((l) => l.key === 'cogs')!
    const fees = layout.links.find((l) => l.key === 'fees')!
    // COGS is 4× fees, so its ribbon must be 4× as thick.
    expect(cogs.thickness / fees.thickness).toBeCloseTo(4, 5)
  })

  it('refuses to draw an unbalanced engine', () => {
    // Ribbons that do not sum to the inflow are a wrong financial statement
    // drawn confidently — better to fail than to render it.
    expect(() =>
      layoutProfitSankey({ ...SANKEY, inflow: 120_000 }),
    ).toThrow(SankeyImbalanceError)
  })

  it('rejects a negative outflow', () => {
    expect(() =>
      layoutProfitSankey({
        inflowLabel: 'Net revenue',
        inflow: 0,
        outflows: [{ key: 'x', label: 'X', amount: -10, tone: 'cost' }],
      }),
    ).toThrow(SankeyImbalanceError)
  })

  it('returns an empty layout for a period with no revenue', () => {
    const layout = layoutProfitSankey({ inflowLabel: 'Net revenue', inflow: 0, outflows: [] })
    expect(layout.nodes).toHaveLength(0)
    expect(layout.balanced).toBe(true)
  })

  it('orders ribbons without crossing', () => {
    const layout = layoutProfitSankey(SANKEY)
    const targets = layout.nodes.filter((n) => n.tone !== 'inflow')
    for (let i = 1; i < targets.length; i += 1) {
      expect(targets[i]!.y).toBeGreaterThan(targets[i - 1]!.y)
    }
  })
})

// ── Cash Flow Waterfall ─────────────────────────────────────────────────────

describe('layoutWaterfall', () => {
  const steps = [
    { key: 'sales', label: 'Sales', amount: 50_000 },
    { key: 'cogs', label: 'COGS', amount: -20_000 },
    { key: 'ads', label: 'Advertising', amount: -15_000 },
  ]

  it('derives closing from opening plus movement', () => {
    const layout = layoutWaterfall(10_000, steps)
    expect(layout.closing).toBe(25_000)
    const closing = layout.bars.find((b) => b.key === 'closing')!
    expect(closing.balance).toBe(25_000)
  })

  it('chains each bar from the previous balance', () => {
    const layout = layoutWaterfall(10_000, steps)
    const movement = layout.bars.filter((b) => b.kind !== 'total')
    expect(movement[0]!.from).toBe(10_000)
    expect(movement[0]!.to).toBe(60_000)
    expect(movement[1]!.from).toBe(60_000)
    expect(movement[1]!.to).toBe(40_000)
  })

  it('labels direction by sign', () => {
    const layout = layoutWaterfall(0, steps)
    expect(layout.bars.find((b) => b.key === 'sales')!.kind).toBe('increase')
    expect(layout.bars.find((b) => b.key === 'cogs')!.kind).toBe('decrease')
  })

  it('bounds the axis to include every intermediate balance', () => {
    // A dip below zero mid-period must be visible, not clipped.
    const layout = layoutWaterfall(1_000, [
      { key: 'big', label: 'Big outflow', amount: -5_000 },
      { key: 'recover', label: 'Recovery', amount: 9_000 },
    ])
    expect(layout.min).toBeLessThanOrEqual(-4_000)
    expect(layout.max).toBeGreaterThanOrEqual(5_000)
  })

  it('handles no movement', () => {
    const layout = layoutWaterfall(500, [])
    expect(layout.closing).toBe(500)
    expect(layout.bars).toHaveLength(2)
  })
})

// ── Product Portfolio Matrix ────────────────────────────────────────────────

describe('layoutPortfolio', () => {
  const points = [
    { productId: 'a', label: 'A', growth: 0.4, margin: 0.3, revenue: 100_000 },
    { productId: 'b', label: 'B', growth: -0.2, margin: 0.25, revenue: 50_000 },
    { productId: 'c', label: 'C', growth: 0.3, margin: -0.1, revenue: 20_000 },
    { productId: 'd', label: 'D', growth: -0.3, margin: -0.2, revenue: 10_000 },
  ]

  it('assigns each product to the right quadrant', () => {
    const { points: placed } = layoutPortfolio(points)
    const byId = Object.fromEntries(placed.map((p) => [p.productId, p.quadrant]))
    expect(byId.a).toBe('invest')
    expect(byId.b).toBe('defend')
    expect(byId.c).toBe('fix')
    expect(byId.d).toBe('cut')
  })

  it('scales bubble radius by the square root of revenue', () => {
    // Area is what the eye reads; linear radius overstates big products.
    const { points: placed } = layoutPortfolio([
      { productId: 'small', label: 'S', growth: 0, margin: 0, revenue: 25_000 },
      { productId: 'big', label: 'B', growth: 0, margin: 0, revenue: 100_000 },
    ], { minR: 0, maxR: 40 })
    const small = placed.find((p) => p.productId === 'small')!
    const big = placed.find((p) => p.productId === 'big')!
    expect(big.r / small.r).toBeCloseTo(2, 5)
  })

  it('keeps every bubble inside the canvas', () => {
    const { points: placed, width, height } = layoutPortfolio(points)
    for (const p of placed) {
      expect(p.x - p.r).toBeGreaterThanOrEqual(-1)
      expect(p.x + p.r).toBeLessThanOrEqual(width + 1)
      expect(p.y - p.r).toBeGreaterThanOrEqual(-1)
      expect(p.y + p.r).toBeLessThanOrEqual(height + 1)
    }
  })

  it('centres the axes so equal-magnitude opposites are equidistant', () => {
    const { points: placed, xZero } = layoutPortfolio([
      { productId: 'up', label: 'U', growth: 0.5, margin: 0, revenue: 1 },
      { productId: 'down', label: 'D', growth: -0.5, margin: 0, revenue: 1 },
    ])
    const up = placed.find((p) => p.productId === 'up')!
    const down = placed.find((p) => p.productId === 'down')!
    expect(up.x - xZero).toBeCloseTo(xZero - down.x, 5)
  })

  it('handles an empty portfolio', () => {
    expect(layoutPortfolio([]).points).toEqual([])
  })
})

describe('niceScale invariants', () => {
  it('always includes zero when the range spans it', () => {
    // Regression: bounds and ticks were derived from different steps, so a
    // range crossing zero could render with no zero gridline.
    for (const [min, max] of [
      [-50, 50], [-1, 3], [-999, 17], [-0.4, 0.9], [-12345, 6789],
    ] as const) {
      expect(ticksFor({ min, max })).toContain(0)
    }
  })

  it('produces ticks that are exact multiples of the step', () => {
    for (const [min, max] of [[-50, 50], [0, 9377], [-3, 7]] as const) {
      const { step, ticks } = niceScale({ min, max })
      for (const t of ticks) {
        expect(Math.abs(t / step - Math.round(t / step))).toBeLessThan(1e-9)
      }
    }
  })

  it('always brackets the input range', () => {
    for (const [min, max] of [[-50, 50], [3, 97], [-0.05, 0.02]] as const) {
      const s = niceScale({ min, max })
      expect(s.min).toBeLessThanOrEqual(min)
      expect(s.max).toBeGreaterThanOrEqual(max)
      expect(s.ticks[0]).toBe(s.min)
      expect(s.ticks[s.ticks.length - 1]).toBeCloseTo(s.max, 9)
    }
  })
})
