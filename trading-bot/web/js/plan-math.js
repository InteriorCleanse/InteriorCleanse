/**
 * TRADE PLANNER MATHS — pure functions, no page, no network.
 *
 * For YOUR OWN trades, placed by you in TradingView or your broker's app. This
 * works out size, stops, targets and option break-evens from numbers you type.
 * It sends nothing and places nothing; it has no idea what an order is.
 *
 * Kept separate from planner.js so the tests can check every number without a
 * browser. Every function returns { ok:false, error } for input it cannot
 * honestly compute from, rather than a number that looks right and is not.
 */

const pos = (n) => Number.isFinite(n) && n > 0
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

/**
 * Shares or coins. Risk a fixed share of the account between entry and stop;
 * never spend more cash than the account holds (no leverage assumed).
 */
export function sharePlan({ account, riskPct, entry, stop, target = null, whole = true }) {
  if (!pos(account)) return { ok: false, error: 'Enter your account size.' }
  if (!pos(riskPct) || riskPct > 100) return { ok: false, error: 'Risk per trade must be between 0 and 100 %.' }
  if (!pos(entry) || !pos(stop)) return { ok: false, error: 'Enter an entry and a stop price.' }
  if (entry === stop) return { ok: false, error: 'The stop cannot equal the entry.' }
  const side = stop < entry ? 'long' : 'short'
  const perUnit = Math.abs(entry - stop)
  const budget = account * riskPct / 100
  const byRisk = budget / perUnit
  const byCash = account / entry
  const floor = (q) => (whole ? Math.floor(q) : Math.floor(q * 1e6) / 1e6)
  const qty = floor(Math.min(byRisk, byCash))
  const warnings = []
  if (qty <= 0) return { ok: false, error: whole ? 'Not enough risk budget for even one share at this stop. Widen the risk %, or use a closer stop.' : 'The risk budget is too small for this stop.' }
  if (byCash < byRisk) warnings.push('Capped by cash: the risk budget would buy more than the account holds, so the size is what the cash allows.')
  if (riskPct > 2) warnings.push(`${riskPct}% per trade is aggressive — many traders keep it at 1–2%, so a losing streak does not sink the account.`)
  const dir = side === 'long' ? 1 : -1
  const targets = [1, 2, 3].map((r) => ({ r, price: round(entry + dir * r * perUnit, 6) }))
  let rr = null
  if (target !== null && Number.isFinite(target)) {
    if ((target - entry) * dir <= 0) warnings.push('The target is on the wrong side of the entry for this stop.')
    else rr = round(Math.abs(target - entry) / perUnit, 2)
  }
  return {
    ok: true, side, qty, perUnit: round(perUnit, 6), budget: round(budget), risk: round(qty * perUnit),
    notional: round(qty * entry), targets, rr, warnings,
  }
}

/**
 * Options: how many contracts. The loss at your stop sizes the trade, and the
 * worst case — the premium going to zero, or the price gapping through the
 * stop — is always shown next to it, because a stop on an option is not a
 * guarantee.
 */
export function optionPlan({ account, riskPct, premium, stopPremium = null, multiplier = 100, feePerContract = 0 }) {
  if (!pos(account)) return { ok: false, error: 'Enter your account size.' }
  if (!pos(riskPct) || riskPct > 100) return { ok: false, error: 'Risk per trade must be between 0 and 100 %.' }
  if (!pos(premium)) return { ok: false, error: 'Enter the option price (the premium, per share).' }
  if (!pos(multiplier)) return { ok: false, error: 'The contract multiplier must be positive (100 for US equity options).' }
  const fee = Number.isFinite(feePerContract) && feePerContract > 0 ? feePerContract : 0
  const hasStop = stopPremium !== null && Number.isFinite(stopPremium)
  if (hasStop && (stopPremium < 0 || stopPremium >= premium)) return { ok: false, error: 'The stop on the premium must be below what you pay (and not negative).' }
  const budget = account * riskPct / 100
  const cost = premium * multiplier + fee
  const lossAtStop = hasStop ? (premium - stopPremium) * multiplier + 2 * fee : cost
  const lossWorst = cost
  const contracts = Math.min(Math.floor(budget / lossAtStop), Math.floor(account / cost))
  if (contracts <= 0) return { ok: false, error: 'Not enough risk budget for even one contract here. Lower the premium, tighten the stop, or raise the risk %.' }
  const warnings = []
  if (hasStop) warnings.push('A stop on an option can fill well below it in a fast move or at the open. The worst case is the whole premium.')
  if (riskPct > 2) warnings.push(`${riskPct}% per trade is aggressive for options, which can lose everything they cost.`)
  return {
    ok: true, contracts, budget: round(budget), cost: round(contracts * cost),
    lossAtStop: round(contracts * lossAtStop), lossWorst: round(contracts * lossWorst),
    stopPremium: hasStop ? stopPremium : null, warnings,
  }
}

/**
 * Compare strikes you are looking at, AT EXPIRATION. Break-even, the move
 * needed to reach it, the most you can lose, and the profit or loss if the
 * stock is exactly at your target on expiry day.
 *
 * It ignores time value, implied volatility and the odds of getting there — so
 * the cheapest, furthest strike often "wins" this table and usually expires
 * worthless. It says so on the page.
 */
export function strikeCompare({ type, underlying, target, strikes, multiplier = 100 }) {
  if (type !== 'call' && type !== 'put') return { ok: false, error: 'Choose call or put.' }
  if (!pos(underlying)) return { ok: false, error: 'Enter the stock price now.' }
  if (!pos(target)) return { ok: false, error: 'Enter the price you think it reaches by expiry.' }
  const rows = (strikes || []).filter((s) => pos(s.strike) && pos(s.premium))
  if (!rows.length) return { ok: false, error: 'Enter at least one strike and its premium.' }
  const out = rows.map(({ strike, premium }) => {
    const breakeven = type === 'call' ? strike + premium : strike - premium
    const intrinsic = type === 'call' ? Math.max(0, target - strike) : Math.max(0, strike - target)
    const pnl = (intrinsic - premium) * multiplier
    const moneyPct = ((strike - underlying) / underlying) * 100
    const itm = type === 'call' ? strike < underlying : strike > underlying
    const atm = Math.abs(moneyPct) < 0.5
    return {
      strike, premium,
      moneyness: atm ? 'ATM' : itm ? 'ITM' : 'OTM',
      fromSpotPct: round(moneyPct, 2),
      breakeven: round(breakeven, 4),
      moveToBreakevenPct: round(((breakeven - underlying) / underlying) * 100, 2),
      maxLoss: round(premium * multiplier),
      pnlAtTarget: round(pnl),
      returnAtTargetPct: round((pnl / (premium * multiplier)) * 100, 1),
    }
  })
  const best = out.reduce((a, b) => (b.pnlAtTarget > a.pnlAtTarget ? b : a))
  return { ok: true, type, rows: out, bestAtTarget: best.pnlAtTarget > 0 ? best.strike : null }
}

/** A plain-text summary to paste next to the order ticket in TradingView or your broker's app. */
export function ticketText(p, { symbol = '', entry, stop }) {
  if (!p || !p.ok) return ''
  return [
    `${symbol ? symbol + ' ' : ''}${p.side.toUpperCase()} ${p.qty} @ ${entry}`,
    `Stop ${stop}  (risk $${p.risk})`,
    `Targets 1R ${p.targets[0].price} · 2R ${p.targets[1].price} · 3R ${p.targets[2].price}`,
  ].join('\n')
}
