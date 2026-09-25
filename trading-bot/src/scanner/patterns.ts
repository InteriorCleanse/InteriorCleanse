/**
 * THE PATTERN FINDER — textbook chart and candle patterns, found in real
 * candles by fixed rules. Pure: no network, no clock, no AI.
 *
 * Every pattern it reports carries the exact points it was built from, what
 * would confirm it and what would cancel it, so it can be drawn and checked
 * on the chart. It is a description of shape, not a forecast: Mr. Cash has
 * not tested any of these patterns as a trading rule, the page says so, and
 * nothing here reaches the engine.
 */
import type { Candle } from '../types.ts'

export type Bias = 'bull' | 'bear' | 'neutral'
export type Status = 'forming' | 'confirmed' | 'failed' | 'breakout' | 'breakdown' | 'active'
export type Line = { i1: number; p1: number; i2: number; p2: number; role: string }
export type Point = { i: number; p: number; label: string }

export type Pattern = {
  id: string
  name: string
  kind: 'chart' | 'candle' | 'divergence' | 'zone' | 'volume'
  bias: Bias
  status: Status
  from: number
  to: number
  lines: Line[]
  points: Point[]
  zone: { lo: number; hi: number } | null
  meaning: string
  confirm: string
  invalidate: string
  /** The textbook "measured move": a way to size the pattern, not a forecast. */
  target: number | null
}

export type ScanResult = {
  bars: number
  trend: 'uptrend' | 'downtrend' | 'range' | 'unclear'
  atr: number | null
  patterns: Pattern[]
  summary: { bull: number; bear: number; neutral: number; text: string }
}

export const UNTESTED = 'Pattern names are textbook shapes found by fixed rules. Mr. Cash has not tested any of them as a trading rule; treat each as something to check, not a signal.'

const r = (n: number) => Math.round(n * 1e6) / 1e6
const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toFixed(2) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toPrecision(4))

export function atr(c: Candle[], period = 14): number | null {
  if (c.length < period + 1) return null
  let s = 0
  for (let i = c.length - period; i < c.length; i++) s += Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close))
  return s / period
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1), out: number[] = []
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)))
  return out
}

/** RSI with Wilder smoothing, one value per candle (NaN until there are enough). */
export function rsiSeries(c: Candle[], period = 14): number[] {
  const out = new Array(c.length).fill(NaN)
  if (c.length <= period) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) { const d = c[i].close - c[i - 1].close; if (d > 0) gain += d; else loss -= d }
  gain /= period; loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < c.length; i++) {
    const d = c[i].close - c[i - 1].close
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

export type Pivot = { i: number; p: number; kind: 'H' | 'L' }

/** Swing highs and lows: a bar higher (lower) than the k bars either side. */
export function pivots(c: Candle[], k = 3): Pivot[] {
  const out: Pivot[] = []
  for (let i = k; i < c.length - k; i++) {
    let hi = true, lo = true
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue
      if (j < i ? c[j].high >= c[i].high : c[j].high > c[i].high) hi = false
      if (j < i ? c[j].low <= c[i].low : c[j].low < c[i].low) lo = false
    }
    if (hi) out.push({ i, p: c[i].high, kind: 'H' })
    if (lo) out.push({ i, p: c[i].low, kind: 'L' })
  }
  return out
}

const lowestBetween = (c: Candle[], a: number, b: number) => { let m = { i: a, p: Infinity }; for (let i = a + 1; i < b; i++) if (c[i].low < m.p) m = { i, p: c[i].low }; return m }
const highestBetween = (c: Candle[], a: number, b: number) => { let m = { i: a, p: -Infinity }; for (let i = a + 1; i < b; i++) if (c[i].high > m.p) m = { i, p: c[i].high }; return m }
const firstClose = (c: Candle[], from: number, test: (x: number, i: number) => boolean): number => { for (let i = from; i < c.length; i++) if (test(c[i].close, i)) return i; return -1 }

function mk(p: Omit<Pattern, 'lines' | 'points' | 'zone' | 'target'> & Partial<Pick<Pattern, 'lines' | 'points' | 'zone' | 'target'>>): Pattern {
  return { lines: [], points: [], zone: null, target: null, ...p }
}

/** Double top and double bottom: two matching swings with a real dip (rise) between them. */
function doubles(c: Candle[], piv: Pivot[], a: number): Pattern[] {
  const out: Pattern[] = []
  const tol = Math.max(a * 0.6, c[c.length - 1].close * 0.003)
  for (const kind of ['H', 'L'] as const) {
    const ps = piv.filter((p) => p.kind === kind)
    for (let n = ps.length - 1; n >= 1; n--) {
      const p2 = ps[n], p1 = ps[n - 1]
      if (c.length - 1 - p2.i > 40) break
      if (p2.i - p1.i < 5 || Math.abs(p2.p - p1.p) > tol) continue
      const top = kind === 'H'
      const mid = top ? lowestBetween(c, p1.i, p2.i) : highestBetween(c, p1.i, p2.i)
      const depth = top ? Math.min(p1.p, p2.p) - mid.p : mid.p - Math.max(p1.p, p2.p)
      if (depth < a * 1.5) continue
      const neck = mid.p
      const extreme = top ? Math.max(p1.p, p2.p) : Math.min(p1.p, p2.p)
      const broke = firstClose(c, p2.i + 1, (x) => (top ? x < neck : x > neck))
      const failed = firstClose(c, p2.i + 1, (x) => (top ? x > extreme + tol / 2 : x < extreme - tol / 2))
      const status: Status = failed >= 0 && (broke < 0 || failed < broke) ? 'failed' : broke >= 0 ? 'confirmed' : 'forming'
      const height = Math.abs(extreme - neck)
      out.push(mk({
        id: `${top ? 'double-top' : 'double-bottom'}-${p1.i}-${p2.i}`, name: top ? 'Double top' : 'Double bottom', kind: 'chart', bias: top ? 'bear' : 'bull', status,
        from: p1.i, to: status === 'failed' ? failed : Math.max(p2.i, broke), target: r(top ? neck - height : neck + height),
        points: [{ i: p1.i, p: p1.p, label: top ? 'Top 1' : 'Bottom 1' }, { i: p2.i, p: p2.p, label: top ? 'Top 2' : 'Bottom 2' }],
        lines: [{ i1: p1.i, p1: neck, i2: c.length - 1, p2: neck, role: 'neckline' }],
        meaning: top ? 'Price pushed up to the same area twice and was turned away both times.' : 'Price fell to the same area twice and was bought both times.',
        confirm: `A close ${top ? 'below' : 'above'} the neckline at ${fmt(neck)}.`,
        invalidate: `A close ${top ? 'above' : 'below'} ${fmt(extreme)}, beyond both ${top ? 'tops' : 'bottoms'}.`,
      }))
      break
    }
  }
  return out
}

/** Head and shoulders (and inverse): three swings, the middle one furthest out, with a neckline under (over) them. */
function headShoulders(c: Candle[], piv: Pivot[], a: number): Pattern[] {
  const out: Pattern[] = []
  const tol = Math.max(a * 0.6, c[c.length - 1].close * 0.003)
  for (const kind of ['H', 'L'] as const) {
    const ps = piv.filter((p) => p.kind === kind)
    for (let n = ps.length - 1; n >= 2; n--) {
      const [ls, hd, rs] = [ps[n - 2], ps[n - 1], ps[n]]
      if (c.length - 1 - rs.i > 40) break
      const normal = kind === 'H'
      const s = normal ? 1 : -1
      if (!((hd.p - ls.p) * s > tol && (hd.p - rs.p) * s > tol && Math.abs(ls.p - rs.p) <= tol * 1.5)) continue
      const t1 = normal ? lowestBetween(c, ls.i, hd.i) : highestBetween(c, ls.i, hd.i)
      const t2 = normal ? lowestBetween(c, hd.i, rs.i) : highestBetween(c, hd.i, rs.i)
      if (!Number.isFinite(t1.p) || !Number.isFinite(t2.p) || t2.i === t1.i) continue
      const slope = (t2.p - t1.p) / (t2.i - t1.i)
      const neckAt = (i: number) => t1.p + slope * (i - t1.i)
      const broke = firstClose(c, rs.i + 1, (x, i) => (normal ? x < neckAt(i) : x > neckAt(i)))
      const failed = firstClose(c, rs.i + 1, (x) => (normal ? x > hd.p : x < hd.p))
      const status: Status = failed >= 0 && (broke < 0 || failed < broke) ? 'failed' : broke >= 0 ? 'confirmed' : 'forming'
      const height = Math.abs(hd.p - neckAt(hd.i))
      const nowNeck = neckAt(c.length - 1)
      out.push(mk({
        id: `${normal ? 'hs' : 'ihs'}-${ls.i}-${rs.i}`, name: normal ? 'Head and shoulders' : 'Inverse head and shoulders', kind: 'chart', bias: normal ? 'bear' : 'bull', status,
        from: ls.i, to: status === 'failed' ? failed : Math.max(rs.i, broke), target: r(normal ? neckAt(Math.max(broke, rs.i)) - height : neckAt(Math.max(broke, rs.i)) + height),
        points: [{ i: ls.i, p: ls.p, label: 'Left shoulder' }, { i: hd.i, p: hd.p, label: 'Head' }, { i: rs.i, p: rs.p, label: 'Right shoulder' }],
        lines: [{ i1: t1.i, p1: t1.p, i2: c.length - 1, p2: nowNeck, role: 'neckline' }],
        meaning: normal ? 'A high, a higher high, then a lower high: buyers pushed less hard each time.' : 'A low, a lower low, then a higher low: sellers pushed less hard each time.',
        confirm: `A close ${normal ? 'below' : 'above'} the neckline (about ${fmt(nowNeck)} now).`,
        invalidate: `A close ${normal ? 'above' : 'below'} the head at ${fmt(hd.p)}.`,
      }))
      break
    }
  }
  return out
}

function fit(pts: Pivot[]): { slope: number; at: (i: number) => number } {
  const n = pts.length, mx = pts.reduce((s, p) => s + p.i, 0) / n, my = pts.reduce((s, p) => s + p.p, 0) / n
  let num = 0, den = 0
  for (const p of pts) { num += (p.i - mx) * (p.p - my); den += (p.i - mx) ** 2 }
  const slope = den ? num / den : 0
  return { slope, at: (i: number) => my + slope * (i - mx) }
}

/** Triangles and channels from the last few swing highs and lows. */
function trendlines(c: Candle[], piv: Pivot[], a: number): Pattern[] {
  const last = c.length - 1
  const hs = piv.filter((p) => p.kind === 'H' && last - p.i <= 60).slice(-3)
  const ls = piv.filter((p) => p.kind === 'L' && last - p.i <= 60).slice(-3)
  if (hs.length < 2 || ls.length < 2) return []
  const from = Math.min(hs[0].i, ls[0].i)
  if (last - from < 15) return []
  const H = fit(hs), L = fit(ls)
  const sH = (H.slope * 10) / a, sL = (L.slope * 10) / a // ATRs per 10 bars
  const flat = (s: number) => Math.abs(s) < 0.25
  let name = '', bias: Bias = 'neutral', meaning = ''
  if (flat(sH) && sL > 0.25) { name = 'Ascending triangle'; bias = 'bull'; meaning = 'Sellers hold a flat ceiling while buyers step in at higher and higher lows.' }
  else if (sH < -0.25 && flat(sL)) { name = 'Descending triangle'; bias = 'bear'; meaning = 'Buyers hold a flat floor while sellers press from lower and lower highs.' }
  else if (sH < -0.25 && sL > 0.25) { name = 'Symmetrical triangle'; bias = 'neutral'; meaning = 'Highs falling and lows rising: the range is squeezing, with no side in control yet.' }
  else if (sH > 0.25 && sL > 0.25 && Math.abs(sH - sL) < 0.35) { name = 'Rising channel'; bias = 'bull'; meaning = 'Higher highs and higher lows between two roughly parallel lines.' }
  else if (sH < -0.25 && sL < -0.25 && Math.abs(sH - sL) < 0.35) { name = 'Falling channel'; bias = 'bear'; meaning = 'Lower highs and lower lows between two roughly parallel lines.' }
  else if (sH > 0.25 && sL < -0.25) { name = 'Broadening range'; bias = 'neutral'; meaning = 'Highs higher and lows lower: swings are getting wider, which usually means indecision.' }
  else return []
  const top = H.at(last), bot = L.at(last)
  if (top <= bot) return []
  const close = c[last].close
  const status: Status = close > top + a * 0.1 ? 'breakout' : close < bot - a * 0.1 ? 'breakdown' : 'forming'
  const height = Math.abs(H.at(from) - L.at(from))
  return [mk({
    id: `${name.toLowerCase().replace(/\s+/g, '-')}-${from}`, name, kind: 'chart', bias: status === 'breakout' ? 'bull' : status === 'breakdown' ? 'bear' : bias, status, from, to: last,
    target: status === 'breakout' ? r(top + height) : status === 'breakdown' ? r(bot - height) : null,
    lines: [{ i1: hs[0].i, p1: r(H.at(hs[0].i)), i2: last, p2: r(top), role: 'upper line' }, { i1: ls[0].i, p1: r(L.at(ls[0].i)), i2: last, p2: r(bot), role: 'lower line' }],
    points: [...hs.map((p) => ({ i: p.i, p: p.p, label: 'touch' })), ...ls.map((p) => ({ i: p.i, p: p.p, label: 'touch' }))],
    meaning,
    confirm: `A close above ${fmt(top)} (upper line) or below ${fmt(bot)} (lower line); the break decides the direction.`,
    invalidate: status === 'forming' ? 'A break that closes back inside the lines.' : `A close back inside, ${status === 'breakout' ? `below ${fmt(top)}` : `above ${fmt(bot)}`}.`,
  })]
}

/** Support and resistance: prices where swings keep turning, grouped within half an ATR. */
function zones(c: Candle[], piv: Pivot[], a: number): Pattern[] {
  const recent = piv.filter((p) => c.length - 1 - p.i <= 150).sort((x, y) => x.p - y.p)
  const groups: Pivot[][] = []
  for (const p of recent) { const g = groups[groups.length - 1]; if (g && p.p - g[0].p <= a * 0.5) g.push(p); else groups.push([p]) }
  const close = c[c.length - 1].close
  return groups.filter((g) => g.length >= 2)
    .map((g) => ({ g, lo: Math.min(...g.map((p) => p.p)), hi: Math.max(...g.map((p) => p.p)) }))
    .sort((x, y) => y.g.length - x.g.length || Math.abs((x.lo + x.hi) / 2 - close) - Math.abs((y.lo + y.hi) / 2 - close))
    .slice(0, 4)
    .map(({ g, lo, hi }) => {
      const mid = (lo + hi) / 2, below = mid < close
      return mk({
        id: `zone-${Math.round(mid * 100)}`, name: below ? 'Support zone' : 'Resistance zone', kind: 'zone', bias: 'neutral', status: 'active',
        from: Math.min(...g.map((p) => p.i)), to: c.length - 1, zone: { lo: r(lo - a * 0.1), hi: r(hi + a * 0.1) },
        points: g.map((p) => ({ i: p.i, p: p.p, label: 'turn' })),
        meaning: `Price has turned here ${g.length} times in the last ${Math.min(150, c.length)} bars.`,
        confirm: below ? 'Buyers defending it again on a retest.' : 'Sellers defending it again on a retest.',
        invalidate: `A clean close ${below ? 'below' : 'above'} ${fmt(below ? lo : hi)}.`,
      })
    })
}

/** Candlestick patterns on the last closed candle (and the two before it). */
function candles(c: Candle[], a: number): Pattern[] {
  const n = c.length - 1
  if (n < 5) return []
  const x = c[n], p = c[n - 1], q = c[n - 2]
  const body = (k: Candle) => Math.abs(k.close - k.open), range = (k: Candle) => k.high - k.low
  const up = (k: Candle) => k.close > k.open, down = (k: Candle) => k.close < k.open
  const upper = x.high - Math.max(x.open, x.close), lower = Math.min(x.open, x.close) - x.low
  const fell = x.close < c[n - 5].close, rose = x.close > c[n - 5].close
  const out: Pattern[] = []
  const add = (id: string, name: string, bias: Bias, meaning: string, confirm: string, invalidate: string, from = n) => out.push(mk({ id: `${id}-${n}`, name, kind: 'candle', bias, status: 'active', from, to: n, points: [{ i: n, p: bias === 'bear' ? x.high : x.low, label: name }], meaning, confirm, invalidate }))
  if (down(p) && up(x) && x.open <= p.close && x.close >= p.open && body(x) > body(p)) add('bull-engulf', 'Bullish engulfing', 'bull', 'A green candle whose body swallows the previous red one.', `The next candle holding above ${fmt(x.low)}.`, `A close below ${fmt(x.low)}.`, n - 1)
  if (up(p) && down(x) && x.open >= p.close && x.close <= p.open && body(x) > body(p)) add('bear-engulf', 'Bearish engulfing', 'bear', 'A red candle whose body swallows the previous green one.', `The next candle staying below ${fmt(x.high)}.`, `A close above ${fmt(x.high)}.`, n - 1)
  if (range(x) > 0 && lower >= 2 * body(x) && upper <= Math.max(body(x) * 0.5, range(x) * 0.1) && fell) add('hammer', 'Hammer', 'bull', 'After a drop, sellers pushed price down and buyers pulled it back up, leaving a long lower wick.', `A close above ${fmt(x.high)}.`, `A close below ${fmt(x.low)}.`)
  if (range(x) > 0 && upper >= 2 * body(x) && lower <= Math.max(body(x) * 0.5, range(x) * 0.1) && rose) add('shooting-star', 'Shooting star', 'bear', 'After a rise, buyers pushed price up and sellers knocked it back, leaving a long upper wick.', `A close below ${fmt(x.low)}.`, `A close above ${fmt(x.high)}.`)
  if (range(x) > 0 && body(x) <= range(x) * 0.1 && out.length === 0) add('doji', 'Doji', 'neutral', 'Open and close almost equal: neither side won the candle.', 'The next candle choosing a direction.', 'Not applicable: a doji only marks indecision.')
  if (down(q) && body(q) > a * 0.6 && body(p) < body(q) * 0.35 && up(x) && x.close > (q.open + q.close) / 2) add('morning-star', 'Morning star', 'bull', 'A strong red candle, a small pause, then a green candle closing well into the red one.', `Holding above ${fmt(Math.min(p.low, x.low))}.`, `A close below ${fmt(Math.min(p.low, x.low))}.`, n - 2)
  if (up(q) && body(q) > a * 0.6 && body(p) < body(q) * 0.35 && down(x) && x.close < (q.open + q.close) / 2) add('evening-star', 'Evening star', 'bear', 'A strong green candle, a small pause, then a red candle closing well into the green one.', `Staying below ${fmt(Math.max(p.high, x.high))}.`, `A close above ${fmt(Math.max(p.high, x.high))}.`, n - 2)
  if (x.high < p.high && x.low > p.low) add('inside-bar', 'Inside bar', 'neutral', 'This candle sits entirely inside the previous one: the market paused.', `A break above ${fmt(p.high)} or below ${fmt(p.low)}.`, 'The break that fails and closes back inside.', n - 1)
  return out
}

/** RSI divergence between the last two swing highs (or lows). */
function divergence(c: Candle[], piv: Pivot[]): Pattern[] {
  const rs = rsiSeries(c)
  const out: Pattern[] = []
  for (const kind of ['H', 'L'] as const) {
    const ps = piv.filter((p) => p.kind === kind && c.length - 1 - p.i <= 40).slice(-2)
    if (ps.length < 2 || !Number.isFinite(rs[ps[0].i]) || !Number.isFinite(rs[ps[1].i])) continue
    const [a1, a2] = ps
    const bear = kind === 'H' && a2.p > a1.p && rs[a2.i] < rs[a1.i] - 3
    const bull = kind === 'L' && a2.p < a1.p && rs[a2.i] > rs[a1.i] + 3
    if (!bear && !bull) continue
    out.push(mk({
      id: `${bear ? 'bear' : 'bull'}-div-${a1.i}-${a2.i}`, name: bear ? 'Bearish RSI divergence' : 'Bullish RSI divergence', kind: 'divergence', bias: bear ? 'bear' : 'bull', status: 'active', from: a1.i, to: a2.i,
      lines: [{ i1: a1.i, p1: a1.p, i2: a2.i, p2: a2.p, role: 'price' }],
      points: [{ i: a1.i, p: a1.p, label: `RSI ${rs[a1.i].toFixed(0)}` }, { i: a2.i, p: a2.p, label: `RSI ${rs[a2.i].toFixed(0)}` }],
      meaning: bear ? 'Price made a higher high but momentum (RSI) made a lower one: the push is weakening.' : 'Price made a lower low but momentum (RSI) made a higher one: the selling is weakening.',
      confirm: bear ? `A close below the last swing low.` : `A close above the last swing high.`,
      invalidate: bear ? `A new high with RSI also higher.` : `A new low with RSI also lower.`,
    }))
  }
  return out
}

function volumeSpike(c: Candle[]): Pattern[] {
  const n = c.length - 1
  if (n < 21) return []
  const avg = c.slice(n - 20, n).reduce((s, k) => s + k.volume, 0) / 20
  if (!(avg > 0) || c[n].volume < avg * 2) return []
  const green = c[n].close >= c[n].open
  return [mk({
    id: `vol-${n}`, name: `Volume spike (${(c[n].volume / avg).toFixed(1)}× average)`, kind: 'volume', bias: 'neutral', status: 'active', from: n, to: n,
    points: [{ i: n, p: green ? c[n].low : c[n].high, label: 'volume' }],
    meaning: `The last candle traded ${(c[n].volume / avg).toFixed(1)} times its 20-candle average volume, on a ${green ? 'green' : 'red'} candle. Heavy volume says a lot changed hands, not who won.`,
    confirm: 'Follow-through in the same direction on the next candles.', invalidate: 'An immediate reversal that erases the candle.',
  })]
}

function trendOf(c: Candle[], piv: Pivot[]): ScanResult['trend'] {
  if (c.length < 50) return 'unclear'
  const closes = c.map((k) => k.close)
  const e20 = ema(closes, 20), e50 = ema(closes, 50), n = c.length - 1
  const hs = piv.filter((p) => p.kind === 'H').slice(-2), ls = piv.filter((p) => p.kind === 'L').slice(-2)
  const hh = hs.length === 2 && hs[1].p > hs[0].p, hl = ls.length === 2 && ls[1].p > ls[0].p
  const lh = hs.length === 2 && hs[1].p < hs[0].p, ll = ls.length === 2 && ls[1].p < ls[0].p
  if (e20[n] > e50[n] && closes[n] > e50[n] && (hh || hl)) return 'uptrend'
  if (e20[n] < e50[n] && closes[n] < e50[n] && (lh || ll)) return 'downtrend'
  return 'range'
}

/** Run every finder over the candles. Needs at least 30 closed candles. */
export function scanPatterns(c: Candle[]): ScanResult {
  const a = atr(c)
  if (c.length < 30 || !a) return { bars: c.length, trend: 'unclear', atr: a, patterns: [], summary: { bull: 0, bear: 0, neutral: 0, text: `NOT ENOUGH DATA: ${c.length} candles; the finder needs at least 30.` } }
  const piv = pivots(c)
  const patterns = [...headShoulders(c, piv, a), ...doubles(c, piv, a), ...trendlines(c, piv, a), ...divergence(c, piv), ...candles(c, a), ...volumeSpike(c), ...zones(c, piv, a)]
    .filter((p) => p.status !== 'failed' || c.length - 1 - p.to <= 10)
  const live = patterns.filter((p) => p.kind !== 'zone' && p.status !== 'failed')
  const bull = live.filter((p) => p.bias === 'bull').length, bear = live.filter((p) => p.bias === 'bear').length, neutral = live.filter((p) => p.bias === 'neutral').length
  const trend = trendOf(c, piv)
  const text = live.length ? `${trend === 'unclear' ? 'Trend unclear' : trend[0].toUpperCase() + trend.slice(1)}; ${bull} bullish, ${bear} bearish and ${neutral} neutral pattern${live.length === 1 ? '' : 's'} on the chart. A count of shapes, not a signal.` : `${trend === 'unclear' ? 'Trend unclear' : trend[0].toUpperCase() + trend.slice(1)}; no textbook pattern stands out right now.`
  return { bars: c.length, trend, atr: r(a), patterns, summary: { bull, bear, neutral, text } }
}
