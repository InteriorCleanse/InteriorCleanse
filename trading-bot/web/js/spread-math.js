/**
 * OPTION SPREAD MATHS — pure functions, no page, no network.
 *
 * For YOUR OWN spreads, placed by you in your broker's app. Every structure
 * here is DEFINED RISK: a bought option caps each sold one, so the most you can
 * lose is known before you enter. Nothing here places, sends or simulates an
 * order; Mr. Cash does not trade options.
 *
 * All values are AT EXPIRATION, from prices you type. Time value, implied
 * volatility, early assignment and the odds of any price being reached are not
 * modelled, and the page says so. Every function returns { ok:false, error }
 * for input it cannot honestly compute from.
 */

const pos = (n) => Number.isFinite(n) && n > 0
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

const L = (slot, type, side, qty = 1) => ({ slot, type, side, qty })

/**
 * The structures. `slots` are the strikes you type, lowest first; each leg
 * points at one. side +1 = buy, −1 = sell.
 */
export const STRUCTURES = {
  'bull-call': {
    name: 'Bull call spread', family: 'Debit spread', kind: 'debit', view: 'up',
    blurb: 'Buy a call, sell a higher call. Pays if the price rises; you can lose only what you paid.',
    slots: ['Lower strike', 'Higher strike'], legs: [L(0, 'call', 1), L(1, 'call', -1)],
  },
  'bear-put': {
    name: 'Bear put spread', family: 'Debit spread', kind: 'debit', view: 'down',
    blurb: 'Buy a put, sell a lower put. Pays if the price falls; you can lose only what you paid.',
    slots: ['Lower strike', 'Higher strike'], legs: [L(1, 'put', 1), L(0, 'put', -1)],
  },
  'bull-put': {
    name: 'Bull put spread', family: 'Credit spread', kind: 'credit', view: 'up',
    blurb: 'Sell a put, buy a lower put. Collects a credit that you keep if the price stays above the sold strike.',
    slots: ['Lower strike', 'Higher strike'], legs: [L(1, 'put', -1), L(0, 'put', 1)],
  },
  'bear-call': {
    name: 'Bear call spread', family: 'Credit spread', kind: 'credit', view: 'down',
    blurb: 'Sell a call, buy a higher call. Collects a credit that you keep if the price stays below the sold strike.',
    slots: ['Lower strike', 'Higher strike'], legs: [L(0, 'call', -1), L(1, 'call', 1)],
  },
  'call-butterfly': {
    name: 'Long call butterfly', family: 'Butterfly', kind: 'debit', view: 'pin',
    blurb: 'Buy one low call, sell two middle calls, buy one high call. Pays most if the price finishes at the middle strike.',
    slots: ['Low wing', 'Body (middle)', 'High wing'], legs: [L(0, 'call', 1), L(1, 'call', -1, 2), L(2, 'call', 1)],
  },
  'put-butterfly': {
    name: 'Long put butterfly', family: 'Butterfly', kind: 'debit', view: 'pin',
    blurb: 'The same shape built from puts: buy one high put, sell two middle puts, buy one low put.',
    slots: ['Low wing', 'Body (middle)', 'High wing'], legs: [L(2, 'put', 1), L(1, 'put', -1, 2), L(0, 'put', 1)],
  },
  'iron-butterfly': {
    name: 'Iron butterfly', family: 'Butterfly', kind: 'credit', view: 'pin',
    blurb: 'Sell a put and a call at the same middle strike, buy a put and a call further out. A credit that is largest if the price pins the middle.',
    slots: ['Low wing (buy put)', 'Body (sell put + call)', 'High wing (buy call)'],
    legs: [L(0, 'put', 1), L(1, 'put', -1), L(1, 'call', -1), L(2, 'call', 1)],
  },
  'iron-condor': {
    name: 'Iron condor', family: 'Credit spread', kind: 'credit', view: 'range',
    blurb: 'A bull put spread below and a bear call spread above. Keeps the credit if the price stays between the two sold strikes.',
    slots: ['Bought put', 'Sold put', 'Sold call', 'Bought call'],
    legs: [L(0, 'put', 1), L(1, 'put', -1), L(2, 'call', -1), L(3, 'call', 1)],
  },
}

/** What you expect → which structures fit it. */
export const VIEWS = [
  { id: 'up', label: 'It goes up' },
  { id: 'down', label: 'It goes down' },
  { id: 'pin', label: 'It finishes near one price' },
  { id: 'range', label: 'It stays inside a range' },
]

const intrinsic = (type, strike, s) => (type === 'call' ? Math.max(0, s - strike) : Math.max(0, strike - s))

/** Profit or loss of ONE spread at expiry, in dollars, open fees included. */
export function payoffAt(legs, s, multiplier = 100, openFees = 0) {
  let v = 0
  for (const l of legs) v += l.side * l.qty * (intrinsic(l.type, l.strike, s) - l.premium)
  return v * multiplier - openFees
}

/**
 * Plan one spread from the strikes and per-leg prices you typed.
 * premiums[i] is the price of legs[i] of the structure, per share.
 */
export function spreadPlan({ structure, strikes, premiums, underlying = null, multiplier = 100, feePerContract = 0, account = null, riskPct = null, exercise = 'american' }) {
  const st = STRUCTURES[structure]
  if (!st) return { ok: false, error: 'Choose a spread.' }
  if (!pos(multiplier)) return { ok: false, error: 'The contract multiplier must be positive (100 for US equity options).' }
  const ks = (strikes || []).slice(0, st.slots.length)
  if (ks.length < st.slots.length || !ks.every(pos)) return { ok: false, error: `Enter all ${st.slots.length} strikes.` }
  for (let i = 1; i < ks.length; i++) if (!(ks[i] > ks[i - 1])) return { ok: false, error: `Strikes must go from lowest to highest: ${st.slots[i]} must be above ${st.slots[i - 1]}.` }
  const ps = (premiums || []).slice(0, st.legs.length)
  if (ps.length < st.legs.length || !ps.every((p) => Number.isFinite(p) && p >= 0)) return { ok: false, error: 'Enter the price of every leg (from your broker\'s option chain).' }
  const fee = Number.isFinite(feePerContract) && feePerContract > 0 ? feePerContract : 0

  const legs = st.legs.map((l, i) => ({ ...l, strike: ks[l.slot], premium: ps[i] }))
  const contractsPerSpread = legs.reduce((a, l) => a + l.qty, 0)
  const openFees = fee * contractsPerSpread
  const net = legs.reduce((a, l) => a + l.side * l.qty * l.premium, 0) // + paid, − received
  if (st.kind === 'debit' && !(net > 0)) return { ok: false, error: `A ${st.name.toLowerCase()} costs money to open, but these prices give a credit. Check that each price sits on the right leg.` }
  if (st.kind === 'credit' && !(net < 0)) return { ok: false, error: `A ${st.name.toLowerCase()} pays a credit to open, but these prices cost money. Check that each price sits on the right leg.` }

  const lo = ks[0], hi = ks[ks.length - 1]
  const span = Math.max(hi - lo, hi * 0.02)
  const at = (s) => payoffAt(legs, s, multiplier, openFees)
  // Every structure here is flat beyond its outer strikes. Check it rather than assume it.
  if (Math.abs(at(hi * 3 + span) - at(hi)) > 1e-6 || Math.abs(at(0) - at(lo)) > 1e-6) return { ok: false, error: 'This combination is not capped on both sides, so it has no fixed worst case.' }

  const points = [0, ...ks, hi + span]
  const values = points.map(at)
  const maxProfit = Math.max(...values)
  const maxLoss = -Math.min(...values)
  if (!(maxProfit > 0)) return { ok: false, error: 'At these prices the spread cannot make money at expiry, wherever it finishes (fees included). Re-check the quotes.' }
  if (!(maxLoss > 0)) return { ok: false, error: 'At these prices the spread can never lose, which means a typo or stale quotes. Re-check each leg.' }

  const breakevens = []
  for (let i = 1; i < points.length; i++) {
    const a = values[i - 1], b = values[i]
    if (a * b < 0) breakevens.push(round(points[i - 1] + (points[i] - points[i - 1]) * (-a / (b - a)), 4))
    else if (b === 0 && i < points.length - 1) breakevens.push(round(points[i], 4))
  }

  const widths = []
  for (let i = 1; i < ks.length; i++) widths.push(round(ks[i] - ks[i - 1], 4))
  const warnings = []
  if (st.family === 'Butterfly' && widths[0] !== widths[1]) warnings.push('The wings are not the same width (a "broken-wing" butterfly), so the loss is larger on one side. The numbers above already include that.')
  // exercise: 'american' (US stock and ETF options), 'european' (no early exercise), or 'check' (the product has both).
  if (st.kind === 'credit' && exercise === 'american') warnings.push('Sold legs can be assigned early: US stock options can be exercised any day, most often in-the-money puts, and calls just before a dividend. The bought leg still caps the loss, but assignment can leave you holding shares overnight.')
  if (st.kind === 'credit' && exercise === 'check') warnings.push('Some series of this product are American-style, so a sold leg can be assigned early, and some are European-style, so it cannot. Check which one you are trading.')
  if (st.kind === 'credit' && maxProfit / maxLoss < 0.34) warnings.push(`You risk ${round(maxLoss / maxProfit, 1)}× what you can make. Spreads like this win often and lose big: one full loss can take back several wins.`)
  if (Number.isFinite(riskPct) && riskPct > 2) warnings.push(`${riskPct}% per trade is aggressive. Many traders keep it at 1–2%, so a losing streak does not sink the account.`)

  const spot = pos(underlying) ? underlying : null
  const sizing = sizeSpreads({ account, riskPct, maxLoss })

  return {
    ok: true, structure, name: st.name, family: st.family, kind: st.kind,
    legs: legs.map((l) => ({ action: l.side > 0 ? 'BUY' : 'SELL', qty: l.qty, type: l.type, strike: l.strike, premium: l.premium })),
    net: round(Math.abs(net), 4), netDollars: round(Math.abs(net) * multiplier),
    contractsPerSpread, openFees: round(openFees), roundTripFees: round(openFees * 2),
    maxProfit: round(maxProfit), maxLoss: round(maxLoss), rr: round(maxProfit / maxLoss, 2),
    breakevens, widths,
    atSpot: spot === null ? null : round(at(spot)),
    breakevensFromSpotPct: spot === null ? [] : breakevens.map((b) => round(((b - spot) / spot) * 100, 2)),
    curve: payoffCurve(legs, { lo, hi, spot, multiplier, openFees }),
    sizing, warnings,
  }
}

/** How many spreads fit the risk budget, sized by the WORST case, which for these structures is known up front. */
export function sizeSpreads({ account, riskPct, maxLoss }) {
  if (!pos(account) || !pos(riskPct)) return { ok: false, error: 'Enter your account size and risk % to size it.' }
  if (riskPct > 100) return { ok: false, error: 'Risk per trade must be between 0 and 100 %.' }
  if (!pos(maxLoss)) return { ok: false, error: 'No worst case to size from.' }
  const budget = account * riskPct / 100
  const spreads = Math.floor(budget / maxLoss + 1e-9)
  if (spreads <= 0) return { ok: false, error: `One spread can lose $${round(maxLoss)}, more than your ${riskPct}% budget of $${round(budget)}. Use narrower strikes, or a larger risk %.` }
  return { ok: true, budget: round(budget), spreads, totalMaxLoss: round(spreads * maxLoss) }
}

/**
 * The payoff at expiry as points for a chart. It is a straight line between
 * strikes, so the corners plus the two ends draw it exactly.
 */
export function payoffCurve(legs, { lo, hi, spot = null, multiplier = 100, openFees = 0 }) {
  let from = lo, to = hi
  if (spot !== null) { from = Math.min(from, spot); to = Math.max(to, spot) }
  const pad = Math.max(to - from, to * 0.02) * 0.45
  from = Math.max(0, from - pad); to = to + pad
  const xs = [...new Set([from, ...legs.map((l) => l.strike), to])].filter((x) => x >= from && x <= to).sort((a, b) => a - b)
  return { from: round(from, 4), to: round(to, 4), points: xs.map((x) => ({ x: round(x, 4), y: round(payoffAt(legs, x, multiplier, openFees)) })) }
}

/** Plain text to paste next to your broker's multi-leg order ticket. */
export function spreadTicket(p, { symbol = '', expiry = '', spreads = 1 } = {}) {
  if (!p || !p.ok) return ''
  const head = [symbol, expiry].filter(Boolean).join(' ')
  const n = Math.max(1, Math.floor(spreads) || 1)
  return [
    `${p.name}${head ? ' · ' + head : ''} · ${n} spread${n === 1 ? '' : 's'}`,
    ...p.legs.map((l) => `${l.action} ${l.qty * n} ${l.strike} ${l.type.toUpperCase()} @ ${l.premium}`),
    `One order, limit ${p.net} ${p.kind === 'debit' ? 'DEBIT' : 'CREDIT'}`,
    `Max loss $${round(p.maxLoss * n)} · max profit $${round(p.maxProfit * n)} (at expiry, open fees included)`,
  ].join('\n')
}
