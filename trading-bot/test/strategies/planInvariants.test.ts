/**
 * PLAN INVARIANTS — a trade plan that is the wrong way round is not a bad
 * trade, it is a broken one.
 *
 * `atrPlan` computes `risk = Math.abs(entry - stop)`, so a stop on the WRONG
 * SIDE of the entry does not throw and does not even look odd: the risk comes
 * out positive and the target is placed a multiple of it away, in the correct
 * direction. A "long" with its stop above the entry would sail through every
 * type check and every unit test that only asserts a vote fired.
 *
 * Seven of the ten strategies pass an explicit `stopPrice` derived from a zone
 * — a gap edge, a breaker, a sweep wick, a VWAP band — rather than from the
 * entry, and `meanReversion` passes an explicit `targetPrice` (the VWAP) too.
 * Nothing in `atrPlan` checks that those land on the right side. Whether they
 * always do is a property of each strategy's guards, and reading seven of them
 * and believing the reading is weaker than exercising them.
 *
 * So this drives EVERY registered strategy over many seeded market shapes
 * through the real `IctEngine`, and asserts the invariant on every plan that
 * comes back. It also asserts a floor on how many plans were examined, because
 * a property test that silently exercises nothing passes just as green as one
 * that proves something.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import { IctEngine } from '../../src/ictStrategy.ts'
import type { Candle } from '../../src/types.ts'

const tmp = tempDataDir('mrcash-planinv-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { contextFor, STRATEGIES } = await import('../../src/strategies/registry.ts')
after(() => tmp.cleanup())

const STEP = 300_000

/** A seeded walk, so a failure is reproducible from the seed alone. */
function series(seed: number, n: number, opts: { drift: number; vol: number }): Candle[] {
  let s = seed >>> 0
  const rnd = (): number => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
  // Start on a Monday 00:00 ET so the walk crosses every session and killzone.
  const t0 = Date.UTC(2026, 0, 12, 5, 0)
  const out: Candle[] = []
  let price = 30_000
  for (let i = 0; i < n; i++) {
    const open = price
    const move = (rnd() - 0.5) * opts.vol + opts.drift
    const close = open * (1 + move)
    const wick = Math.abs(rnd() - 0.5) * opts.vol * open
    out.push({
      openTime: t0 + i * STEP, closeTime: t0 + i * STEP + STEP - 1,
      open, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick, close, volume: 1 + rnd() * 10,
    })
    price = close
  }
  return out
}

/** The shapes a stop-from-a-zone is most likely to land the wrong side of. */
const SHAPES = [
  { name: 'quiet chop', drift: 0, vol: 0.001 },
  { name: 'strong uptrend', drift: 0.0012, vol: 0.002 },
  { name: 'strong downtrend', drift: -0.0012, vol: 0.002 },
  { name: 'violent whipsaw', drift: 0, vol: 0.010 },
  { name: 'drifting up, violent', drift: 0.0008, vol: 0.008 },
  { name: 'drifting down, violent', drift: -0.0008, vol: 0.008 },
]

test('every strategy plan puts the stop and the target on the correct side of the entry', () => {
  let plans = 0
  const byStrategy = new Map<string, number>()
  const failures: string[] = []

  for (const shape of SHAPES) {
    for (const seed of [7, 101, 4242]) {
      const candles = series(seed, 400, shape)
      const engine = new IctEngine(candles)
      for (let i = 0; i < candles.length; i++) {
        const a = engine.step(i)
        if (!a) continue
        const ctx = contextFor(a, candles)
        for (const s of STRATEGIES) {
          const v = s.evaluate(ctx)
          if (v.action === 'HOLD' || !v.plan) continue
          plans++
          byStrategy.set(s.meta.id, (byStrategy.get(s.meta.id) ?? 0) + 1)
          const { entry, stop, takeProfit, rr } = v.plan
          const where = `${s.meta.id} ${v.direction} on "${shape.name}" seed ${seed} candle ${i}`

          for (const [label, n] of [['entry', entry], ['stop', stop], ['target', takeProfit], ['rr', rr]] as const) {
            if (!Number.isFinite(n)) failures.push(`${where}: ${label} is ${n}`)
          }
          if (v.direction === 'long') {
            if (!(stop < entry)) failures.push(`${where}: LONG stop ${stop} is not below entry ${entry}`)
            if (!(takeProfit > entry)) failures.push(`${where}: LONG target ${takeProfit} is not above entry ${entry}`)
          } else {
            if (!(stop > entry)) failures.push(`${where}: SHORT stop ${stop} is not above entry ${entry}`)
            if (!(takeProfit < entry)) failures.push(`${where}: SHORT target ${takeProfit} is not below entry ${entry}`)
          }
          if (!(rr > 0)) failures.push(`${where}: reward-to-risk is ${rr}`)
        }
      }
    }
  }

  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} plan(s) were the wrong way round`)
  // Guard against a vacuous pass: if the fixtures stop producing signals this
  // test would go green while checking nothing.
  assert.ok(plans >= 50, `only ${plans} plans were exercised — the fixtures no longer reach the strategies`)
  assert.ok(byStrategy.size >= 4, `only ${byStrategy.size} distinct strategies produced a plan: ${[...byStrategy.keys()].join(', ')}`)
})

/**
 * The invariant above holds because each strategy guards its own entry against
 * its own zone. `atrPlan` itself does not check, and this pins that fact so it
 * is a known property rather than an assumption: hand it a stop on the wrong
 * side and it produces a plan that looks perfectly well-formed.
 *
 * This is documentation, not an endorsement. If a future strategy derives a
 * stop from something that can sit the wrong side of the entry, the test above
 * is what catches it — not `atrPlan`.
 */
test('atrPlan does not itself reject a stop on the wrong side — the strategies must', async () => {
  const { atrPlan } = await import('../../src/strategies/plan.ts')
  const wrong = atrPlan('long', 100, 2, { stopPrice: 105 })
  assert.equal(wrong.stop > wrong.entry, true, 'atrPlan silently accepted an inverted stop')
  assert.equal(wrong.rr > 0, true, 'and it still reports a positive reward-to-risk')
  assert.equal(wrong.takeProfit > wrong.entry, true, 'and the target is placed as if the plan were sound')
})

// ---------------------------------------------------------------
// The zone-based strategies, which the random walks above never reach
// ---------------------------------------------------------------

/**
 * The walks above exercise five strategies. The other five need structures a
 * random walk almost never builds — and three of THOSE are exactly the ones
 * whose stop comes from a zone rather than from the entry (silver bullet from a
 * gap edge, unicorn from a breaker, trend pullback from an order block). Those
 * are the cases the invariant is least obviously safe for, so they get built by
 * hand and swept across the whole retest tolerance.
 *
 * What keeps them safe is a margin: the retest band reaches 0.1 ATR past the
 * zone, the stop is placed 0.2 ATR past it. The stop is therefore always 0.1
 * ATR beyond the furthest price that can still fire — for any ATR above zero.
 */
function fvgAt(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'f', direction: 'bullish', top: 105, bottom: 100, createdIndex: 8, createdTime: 0, sizeAtr: 1.2, fromDisplacement: true, state: 'fresh', ...over }
}
function obAt(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'b', direction: 'bearish', top: 105, bottom: 100, index: 3, time: 0, displacementIndex: 4, sizeAtr: 1.5, withStructureBreak: true, withFvg: true, state: 'broken', ...over }
}
function analysisOf(over: Record<string, unknown>): never {
  return { index: 10, etClock: '10:30', structureTrend: 'bullish', fvgs: [], orderBlocks: [], sweepsToday: [], swingSweepsToday: [], ...over } as never
}

test('the zone-based stops stay the right side of the entry across the whole retest band', async () => {
  const { silverBullet } = await import('../../src/strategies/silverBullet.ts')
  const { unicorn } = await import('../../src/strategies/unicorn.ts')
  let fired = 0
  const failures: string[] = []

  const cases = [
    {
      name: 'silver bullet long',
      analysis: analysisOf({ structureTrend: 'bullish', fvgs: [fvgAt({ direction: 'bullish' })] }),
      run: (c: never) => silverBullet.evaluate(c),
    },
    {
      name: 'silver bullet short',
      analysis: analysisOf({ structureTrend: 'bearish', fvgs: [fvgAt({ direction: 'bearish' })] }),
      run: (c: never) => silverBullet.evaluate(c),
    },
    {
      name: 'unicorn long',
      analysis: analysisOf({ orderBlocks: [obAt({ direction: 'bearish' })], fvgs: [fvgAt({ direction: 'bullish', top: 104, bottom: 101 })] }),
      run: (c: never) => unicorn.evaluate(c),
    },
    {
      name: 'unicorn short',
      analysis: analysisOf({ orderBlocks: [obAt({ direction: 'bullish' })], fvgs: [fvgAt({ direction: 'bearish', top: 104, bottom: 101 })] }),
      run: (c: never) => unicorn.evaluate(c),
    },
  ]

  // Sweep price right across the zone and well past both tolerance edges, at
  // ATRs spanning four orders of magnitude.
  for (const c of cases) {
    for (const atr of [0.001, 0.05, 2, 25, 400]) {
      for (let price = 100 - atr; price <= 105 + atr; price += Math.max(0.01, atr / 40)) {
        const v = c.run({ candles: [], index: 10, price, atr, analysis: c.analysis, features: null } as never)
        if (v.action === 'HOLD' || !v.plan) continue
        fired++
        const { entry, stop, takeProfit } = v.plan
        const where = `${c.name} atr ${atr} price ${price.toFixed(4)}`
        if (v.direction === 'long' && !(stop < entry)) failures.push(`${where}: LONG stop ${stop} >= entry ${entry}`)
        if (v.direction === 'short' && !(stop > entry)) failures.push(`${where}: SHORT stop ${stop} <= entry ${entry}`)
        if (v.direction === 'long' && !(takeProfit > entry)) failures.push(`${where}: LONG target ${takeProfit} <= entry ${entry}`)
        if (v.direction === 'short' && !(takeProfit < entry)) failures.push(`${where}: SHORT target ${takeProfit} >= entry ${entry}`)
      }
    }
  }

  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} zone-based plan(s) were the wrong way round`)
  assert.ok(fired >= 200, `only ${fired} zone-based plans fired — the hand-built fixtures no longer satisfy the strategies`)
})

/**
 * THE ONE CASE THAT DOES BREAK THE INVARIANT, AND WHAT STOPS IT MATTERING.
 *
 * The margin that protects the zone-based stops is a multiple of ATR, so at
 * ATR exactly zero it vanishes: the retest band collapses onto the zone, the
 * stop lands exactly on the zone edge, and a price sitting on that edge fires a
 * plan whose stop EQUALS its entry — zero risk, `rr` 0.
 *
 * A flat-ATR market with a live gap is contrived (a pegged or halted market
 * where the gap formed outside the ATR window) but it is not impossible, and
 * the plan is genuinely malformed when it happens.
 *
 * What makes it harmless is `sizeForStop`, which refuses a zero stop distance
 * and returns quantity 0 — and `applyFilters` then rejects a zero quantity
 * outright. So the degenerate plan can never become a position.
 *
 * That guard is the load-bearing part, and it is quieter than it looks. Deleting
 * the `stopDistance > 0` line does NOT blow up: `wantedRiskUsd / 0` is Infinity,
 * the position cap immediately clamps it, and what comes out is an ordinary
 * looking 0.25 at a reported risk of $0 — a full-size position on a trade whose
 * stop is its entry. Measured, by deleting the line and re-running this test.
 * Nothing downstream would flag it, which is exactly why the guard is pinned
 * here rather than trusted.
 */
test('a zero-ATR plan is degenerate, and the risk engine refuses to size it', async () => {
  const { silverBullet } = await import('../../src/strategies/silverBullet.ts')
  const { sizeForStop } = await import('../../src/risk.ts')
  const { applyFilters } = await import('../../src/risk/filters.ts')

  const a = analysisOf({ structureTrend: 'bullish', fvgs: [fvgAt({ direction: 'bullish' })] })
  const v = silverBullet.evaluate({ candles: [], index: 10, price: 100, atr: 0, analysis: a, features: null } as never)
  assert.ok(v.plan, 'the fixture should still fire; if it stops firing this test proves nothing')
  assert.equal(v.plan!.stop, v.plan!.entry, 'at zero ATR the stop collapses onto the entry')
  assert.equal(v.plan!.rr, 0)

  const sized = sizeForStop(v.plan!.entry, v.plan!.stop)
  assert.equal(sized.quantity, 0, 'a zero stop distance must size to nothing, never divide by it')
  assert.equal(Number.isFinite(sized.quantity), true)
  assert.equal(applyFilters(sized.quantity, v.plan!.entry, { stepSize: 0.001, tickSize: 0.01, minNotionalUsd: 10 }).ok, false)
})
