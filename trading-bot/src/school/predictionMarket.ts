/**
 * PREDICTION-MARKET EDGE, COSTS AND KELLY — a teaching calculator.
 *
 * In a binary market the YES and NO contracts each pay 1 if they win, so their
 * prices should sum to one. Two kinds of mispricing:
 *
 *   single venue:  YES ask + NO ask < 1   ⇒ buy both, lock 1 − (sum) per pair
 *   cross venue:   the same event's YES trades at different prices on two
 *                  venues ⇒ buy the cheaper, sell (or buy NO) on the dearer
 *
 * Detection is the easy half. The edge that is left after fees, the spread,
 * slippage from walking the book, and the capital tied up until settlement is
 * the only one that matters, and the position is sized with a FRACTION of
 * Kelly because the probability estimate is never exactly right.
 *
 * This is arithmetic for the Market School. Mr. Cash is not connected to any
 * prediction market and does not trade them; every example is SIMULATED.
 * Pure functions, no I/O.
 */

export type BookSide = { price: number; size: number }

/** A quote for one contract: the best ask and, optionally, the levels behind it. */
export type Quote = { ask: number; bid?: number; asks?: BookSide[] }

export type SingleVenueEdge = {
  yesAsk: number
  noAsk: number
  sum: number
  /** 1 − (YES ask + NO ask). Positive means a theoretical lock. */
  edge: number
  theoretical: boolean
  note: string
  provenance: 'SIMULATED'
}

export function singleVenueEdge(yes: Quote, no: Quote): SingleVenueEdge {
  for (const p of [yes.ask, no.ask]) if (!(p > 0 && p < 1)) throw new Error('contract prices must be strictly between 0 and 1')
  const sum = yes.ask + no.ask
  const edge = 1 - sum
  return { yesAsk: yes.ask, noAsk: no.ask, sum, edge, theoretical: edge > 0, note: edge > 0 ? `YES ${yes.ask.toFixed(2)} + NO ${no.ask.toFixed(2)} = ${sum.toFixed(2)} < 1: a theoretical ${(edge * 100).toFixed(1)}¢ per pair before costs.` : `YES ${yes.ask.toFixed(2)} + NO ${no.ask.toFixed(2)} = ${sum.toFixed(2)} ≥ 1: no edge.`, provenance: 'SIMULATED' }
}

export type CrossVenueEdge = {
  cheapVenue: string
  dearVenue: string
  cheapYesAsk: number
  dearYesBid: number
  /** dear bid − cheap ask, per contract. */
  divergence: number
  divergencePct: number
  theoretical: boolean
  note: string
  provenance: 'SIMULATED'
}

/** The same event on two venues: buy YES where it is cheap, sell YES (or buy NO) where it is dear. Needs a bid on the dear side. */
export function crossVenueEdge(a: { venue: string; yes: Quote }, b: { venue: string; yes: Quote }): CrossVenueEdge {
  const [cheap, dear] = a.yes.ask <= b.yes.ask ? [a, b] : [b, a]
  const dearBid = dear.yes.bid ?? (dear.yes.ask - 0.01)
  const divergence = dearBid - cheap.yes.ask
  return { cheapVenue: cheap.venue, dearVenue: dear.venue, cheapYesAsk: cheap.yes.ask, dearYesBid: dearBid, divergence, divergencePct: divergence / cheap.yes.ask, theoretical: divergence > 0, note: divergence > 0 ? `${cheap.venue} YES ask ${cheap.yes.ask.toFixed(2)} vs ${dear.venue} YES bid ${dearBid.toFixed(2)}: ${(divergence * 100).toFixed(1)}¢ (${(100 * divergence / cheap.yes.ask).toFixed(0)}%) divergence before costs.` : 'No cross-venue divergence at these quotes.', provenance: 'SIMULATED' }
}

export type CostModel = {
  /** Taker fee per side as a share of notional (0.02 = 2%). */
  feePerSide: number
  /** Number of sides executed (2 for a pair, 2 for a cross-venue leg pair). */
  sides: number
  /** Extra slippage per contract from walking the book, if not computed from levels. */
  slippagePerContract?: number
  /** Gas / withdrawal / transfer cost in contract units per trade. */
  fixedCost?: number
  /** Days until settlement and the annual cost of the capital, for the opportunity cost. */
  daysToSettle?: number
  capitalCostAnnual?: number
}

/** Average fill price when buying `qty` contracts by walking the ask levels. Null if the book is too thin. */
export function walkBook(asks: BookSide[], qty: number): { avgPrice: number; filled: number; slippage: number } | null {
  let left = qty, cost = 0, filled = 0
  for (const lvl of [...asks].sort((x, y) => x.price - y.price)) {
    const take = Math.min(left, lvl.size)
    cost += take * lvl.price; filled += take; left -= take
    if (left <= 0) break
  }
  if (filled < qty) return null
  const avgPrice = cost / qty
  return { avgPrice, filled, slippage: avgPrice - asks.reduce((m, l) => Math.min(m, l.price), Infinity) }
}

export type NetEdge = {
  grossEdge: number
  fees: number
  slippage: number
  fixed: number
  capitalCost: number
  netEdge: number
  survives: boolean
  note: string
  provenance: 'SIMULATED'
}

/** Subtract everything from the theoretical edge. `notional` is the per-pair notional the fees apply to (≈ the sum of prices paid). */
export function netEdge(grossEdge: number, notional: number, costs: CostModel, slippageFromBook = 0): NetEdge {
  const fees = costs.feePerSide * costs.sides * notional
  const slippage = slippageFromBook + (costs.slippagePerContract ?? 0)
  const fixed = costs.fixedCost ?? 0
  const capitalCost = costs.daysToSettle && costs.capitalCostAnnual ? notional * costs.capitalCostAnnual * (costs.daysToSettle / 365) : 0
  const net = grossEdge - fees - slippage - fixed - capitalCost
  return { grossEdge, fees, slippage, fixed, capitalCost, netEdge: net, survives: net > 0, note: net > 0 ? `${(grossEdge * 100).toFixed(1)}¢ gross − ${(fees * 100).toFixed(1)}¢ fees − ${(slippage * 100).toFixed(1)}¢ slippage − ${(fixed * 100).toFixed(1)}¢ fixed − ${(capitalCost * 100).toFixed(1)}¢ capital = ${(net * 100).toFixed(1)}¢ net per pair.` : `The costs (${((fees + slippage + fixed + capitalCost) * 100).toFixed(1)}¢) exceed the gross edge (${(grossEdge * 100).toFixed(1)}¢). A theoretical edge that does not survive costs is a loss.`, provenance: 'SIMULATED' }
}

export type KellySize = {
  /** Full Kelly fraction f* = (b·p − q) / b, clipped at 0. */
  fullKelly: number
  /** The fraction actually suggested: fullKelly × fraction, capped. */
  fraction: number
  suggested: number
  cap: number
  note: string
  provenance: 'SIMULATED'
}

/**
 * Kelly for a binary bet: `p` the probability of winning, `b` the net odds
 * received per unit staked (payout − 1) / 1. For a YES contract bought at price
 * x that pays 1, b = (1 − x) / x. Fractional Kelly (default a quarter) because
 * the probability is an estimate; capped so a mistaken p cannot bet the book.
 */
export function kellyFraction(p: number, b: number, fraction = 0.25, cap = 0.1): KellySize {
  if (!(p >= 0 && p <= 1)) throw new Error('p must be in [0, 1]')
  if (!(b > 0)) throw new Error('net odds must be positive')
  const q = 1 - p
  const full = Math.max(0, (b * p - q) / b)
  const suggested = Math.min(cap, full * fraction)
  return { fullKelly: full, fraction, suggested, cap, note: full === 0 ? 'No positive expectation at these odds; Kelly says do not bet.' : `Full Kelly ${(full * 100).toFixed(1)}% of bankroll; at ${fraction}× Kelly and a ${(cap * 100).toFixed(0)}% cap, ${(suggested * 100).toFixed(1)}%. Full Kelly assumes p is exactly right — it never is.`, provenance: 'SIMULATED' }
}

/** Net odds for a contract bought at `price` that pays 1. */
export function netOdds(price: number): number {
  if (!(price > 0 && price < 1)) throw new Error('price must be strictly between 0 and 1')
  return (1 - price) / price
}

/** Blend several venues' implied probabilities by their depth: p̃ = Σ q_k p_k / Σ q_k. */
export function consensusProbability(quotes: Array<{ price: number; depth: number }>): number | null {
  const tot = quotes.reduce((a, x) => a + x.depth, 0)
  if (!(tot > 0)) return null
  return quotes.reduce((a, x) => a + x.depth * x.price, 0) / tot
}

/** A worked SIMULATED example for the lesson page — the numbers are illustrative, not quotes. */
export function workedExample(): { steps: string[]; single: SingleVenueEdge; cross: CrossVenueEdge; net: NetEdge; kelly: KellySize; provenance: 'SIMULATED' } {
  const single = singleVenueEdge({ ask: 0.47 }, { ask: 0.51 })
  const cross = crossVenueEdge({ venue: 'venue A', yes: { ask: 0.55, bid: 0.54 } }, { venue: 'venue B', yes: { ask: 0.63, bid: 0.62 } })
  const net = netEdge(cross.divergence, 0.55 + 0.38, { feePerSide: 0.01, sides: 2, slippagePerContract: 0.005, fixedCost: 0.002, daysToSettle: 30, capitalCostAnnual: 0.05 })
  const kelly = kellyFraction(0.58, netOdds(0.55))
  return {
    steps: [
      '1. Single venue: YES 0.47 + NO 0.51 = 0.98 < 1 → 2¢ theoretical lock per pair.',
      '2. Cross venue: YES asks 0.55 on A and bids 0.62 on B → 7¢ divergence.',
      '3. Costs: two sides of fees, book slippage, transfer cost, and the capital tied until settlement.',
      '4. Only the NET edge is real. Size the survivor with a fraction of Kelly, capped.',
      'All numbers are SIMULATED for teaching. This system is not connected to any prediction market.',
    ],
    single, cross, net, kelly, provenance: 'SIMULATED',
  }
}

/**
 * Kalshi's published trading fee for `contracts` contracts at `price` (0–1):
 * round up to the next cent of 0.07 × C × P × (1 − P). Returned per contract.
 * Check Kalshi's current fee schedule; some markets use a different rate.
 */
export function kalshiFeePerContract(price: number, contracts = 100, rate = 0.07): number {
  if (!(price > 0 && price < 1) || !(contracts > 0)) return 0
  return Math.round((Math.ceil(rate * contracts * price * (1 - price) * 100 - 1e-9) / 100 / contracts) * 1e8) / 1e8
}

export type VenueQuote = { venue: string; yesAsk: number; noAsk: number; fee: 'kalshi' | number }

export type Route = { label: string; cost: number; gross: number; fees: number; net: number; survives: boolean }

export type TwoVenueCheck = {
  venues: Array<{ venue: string; yesAsk: number; noAsk: number; sum: number; gross: number; fees: number; net: number; survives: boolean }>
  cross: Route[]
  divergence: { cents: number; pct: number; cheaper: string }
  consensus: number
  best: Route | null
  bet: null | { side: 'YES' | 'NO'; venue: string; price: number; p: number; edgeAfterFee: number; kelly: KellySize }
  notes: string[]
  provenance: 'SIMULATED'
}

const feeFor = (q: VenueQuote, price: number, contracts: number) => (q.fee === 'kalshi' ? kalshiFeePerContract(price, contracts) : q.fee * price)

/**
 * The owner's two-venue desk: typed-in quotes for the same event on two
 * venues. Checks each venue alone (YES + NO under $1), both cross-venue
 * routes (YES here + NO there), the YES-price divergence, and, given your own
 * probability `p`, the side worth the most after fees with a capped
 * fractional Kelly stake. Arithmetic only: no venue is contacted.
 */
export function twoVenueCheck(a: VenueQuote, b: VenueQuote, opts: { p?: number | null; contracts?: number; kellyFraction?: number } = {}): TwoVenueCheck {
  for (const q of [a, b]) for (const v of [q.yesAsk, q.noAsk]) if (!(v > 0 && v < 1)) throw new Error('prices must be strictly between 0 and 1')
  const C = opts.contracts ?? 100
  const venues = [a, b].map((q) => {
    const sum = q.yesAsk + q.noAsk, gross = 1 - sum, fees = feeFor(q, q.yesAsk, C) + feeFor(q, q.noAsk, C), net = gross - fees
    return { venue: q.venue, yesAsk: q.yesAsk, noAsk: q.noAsk, sum, gross, fees, net, survives: net > 0 }
  })
  const route = (y: VenueQuote, n: VenueQuote): Route => {
    const cost = y.yesAsk + n.noAsk, gross = 1 - cost, fees = feeFor(y, y.yesAsk, C) + feeFor(n, n.noAsk, C), net = gross - fees
    return { label: `YES on ${y.venue} + NO on ${n.venue}`, cost, gross, fees, net, survives: net > 0 }
  }
  const cross = [route(a, b), route(b, a)]
  const all = [...venues.map((v) => ({ label: `YES + NO on ${v.venue}`, cost: v.sum, gross: v.gross, fees: v.fees, net: v.net, survives: v.survives })), ...cross]
  const best = all.filter((r) => r.survives).sort((x, y) => y.net - x.net)[0] ?? null
  const mid = (q: VenueQuote) => (q.yesAsk + (1 - q.noAsk)) / 2
  const cheaper = a.yesAsk <= b.yesAsk ? a : b
  const divergence = { cents: Math.abs(a.yesAsk - b.yesAsk), pct: Math.abs(a.yesAsk - b.yesAsk) / Math.min(a.yesAsk, b.yesAsk), cheaper: cheaper.venue }
  let bet: TwoVenueCheck['bet'] = null
  const p = opts.p
  if (p !== undefined && p !== null && p > 0 && p < 1) {
    const options = [a, b].flatMap((q) => [
      { side: 'YES' as const, venue: q.venue, price: q.yesAsk, win: p, fee: feeFor(q, q.yesAsk, C) },
      { side: 'NO' as const, venue: q.venue, price: q.noAsk, win: 1 - p, fee: feeFor(q, q.noAsk, C) },
    ]).map((o) => ({ ...o, edge: o.win - o.price - o.fee })).sort((x, y) => y.edge - x.edge)
    const o = options[0]
    const effPrice = Math.min(0.999, o.price + o.fee)
    bet = { side: o.side, venue: o.venue, price: o.price, p: o.win, edgeAfterFee: o.edge, kelly: kellyFraction(o.win, netOdds(effPrice), opts.kellyFraction ?? 0.25, 0.1) }
  }
  const notes = [
    best ? `${best.label}: ${(best.net * 100).toFixed(1)}¢ per $1 pair after fees, before slippage and the capital tied up until settlement.` : 'No route survives fees at these quotes. That is the normal answer: the easy gaps close fast.',
    'Check that both venues settle on exactly the same rules and source. "The same event" worded differently is the most common way an arbitrage turns into two bets.',
    'Quotes are top of book: walking the book, withdrawal costs and latency eat thin edges. Size with a fraction of Kelly, never full Kelly.',
  ]
  return { venues, cross, divergence, consensus: (mid(a) + mid(b)) / 2, best, bet, notes, provenance: 'SIMULATED' }
}
