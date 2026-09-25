/**
 * THE SCREENSHOT SCANNER — what the AI is asked to return about a chart
 * picture, and how its answer is cleaned before the page draws it.
 *
 * The answer is a fixed JSON shape (structured outputs), so the page can draw
 * each pattern box, level line and candle marker on the screenshot itself.
 * Positions are fractions of the image (0 = left/top, 1 = right/bottom).
 * Prices are copied as the model READ them from the picture, never computed,
 * and anything it could not read is listed as unreadable rather than guessed.
 *
 * Everything here is a picture-based read labelled as such; it is not checked
 * against market data and never reaches the engine.
 */

const nullable = (t: Record<string, unknown>) => ({ anyOf: [t, { type: 'null' }] })
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
const S = { type: 'string' }, N = { type: 'number' }

/** JSON schema for structured outputs: every object closed, no numeric or length limits (clamped here instead). */
export const PICTURE_SCHEMA = obj({
  readable: { type: 'boolean' },
  symbol: nullable(S),
  timeframe: nullable(S),
  trend: { enum: ['uptrend', 'downtrend', 'range', 'unclear'] },
  summary: S,
  patterns: { type: 'array', items: obj({ name: S, bias: { enum: ['bull', 'bear', 'neutral'] }, status: { enum: ['forming', 'confirmed', 'failed'] }, box: obj({ x0: N, y0: N, x1: N, y1: N }), meaning: S, confirm: S, invalidate: S }) },
  levels: { type: 'array', items: obj({ kind: { enum: ['support', 'resistance', 'liquidity', 'gap'] }, price: nullable(S), y: N, y2: nullable(N), note: S }) },
  candles: { type: 'array', items: obj({ name: S, bias: { enum: ['bull', 'bear', 'neutral'] }, x: N, y: N, note: S }) },
  plan: obj({ stance: { enum: ['long', 'short', 'no-trade'] }, entry: nullable(S), stop: nullable(S), target: nullable(S), rr: nullable(N), why: S }),
  invalidation: S,
  unreadable: { type: 'array', items: S },
  confidence: { enum: ['low', 'medium', 'high'] },
  confidenceWhy: S,
})

export const PICTURE_INSTRUCTIONS = `Scan this chart screenshot like a careful technical analyst and fill in every field of the JSON schema.

Positions: every x and y is a fraction of the IMAGE (0 = left or top edge, 1 = right or bottom edge), measured on the chart as drawn, so boxes and lines can be drawn back onto the picture. A pattern "box" must tightly enclose the candles that form it.

What to look for:
- trend and structure (higher highs and lows, lower highs and lows, or a range);
- chart patterns (head and shoulders, inverse head and shoulders, double top or bottom, triangles, wedges, flags, channels, cup and handle), each with its status and what would confirm or cancel it;
- support, resistance and liquidity levels (equal highs or lows where stops rest), and fair value gaps (use kind "gap" with y and y2 for its top and bottom);
- notable candles (engulfing, hammer, shooting star, doji, morning or evening star, inside bar) at their x and y.

Prices: copy a price only when you can read it on the axis or a label, as text exactly as shown. If you cannot read it, use null and add what you could not read to "unreadable". Never estimate a price from pixels.

Plan: if a clean, defined-risk idea exists, give the entry ZONE, stop, target and approximate reward-to-risk with the reasoning; otherwise stance "no-trade" is a valid, honest answer.

Confidence: say how sure you are and why (image quality, how clear the pattern is, how many candles are visible). Do not describe any pattern as reliable or likely to work, and do not quote success rates; this is a read of a picture, not advice.`

type Any = Record<string, unknown>
const clamp01 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0 }
const text = (v: unknown, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const opt = (v: unknown, max = 40) => (v === null || v === undefined || String(v).trim() === '' ? null : text(v, max))
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
const list = (v: unknown, max: number): Any[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').slice(0, max) as Any[] : [])

export type PictureRead = ReturnType<typeof cleanPictureRead>

/** Clean the model's answer: clamp every position, cap every list and string, keep only known values. */
export function cleanPictureRead(raw: unknown) {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Any
  const plan = (r.plan && typeof r.plan === 'object' ? r.plan : {}) as Any
  const rr = Number(plan.rr)
  return {
    kind: 'AI PICTURE READ' as const,
    readable: r.readable === true,
    symbol: opt(r.symbol, 24),
    timeframe: opt(r.timeframe, 24),
    trend: oneOf(r.trend, ['uptrend', 'downtrend', 'range', 'unclear'] as const, 'unclear'),
    summary: text(r.summary, 700),
    patterns: list(r.patterns, 8).map((p) => {
      const b = (p.box && typeof p.box === 'object' ? p.box : {}) as Any
      const [x0, x1] = [clamp01(b.x0), clamp01(b.x1)].sort((a, c) => a - c), [y0, y1] = [clamp01(b.y0), clamp01(b.y1)].sort((a, c) => a - c)
      return { name: text(p.name, 60), bias: oneOf(p.bias, ['bull', 'bear', 'neutral'] as const, 'neutral'), status: oneOf(p.status, ['forming', 'confirmed', 'failed'] as const, 'forming'), box: { x0, y0, x1, y1 }, meaning: text(p.meaning, 300), confirm: text(p.confirm, 200), invalidate: text(p.invalidate, 200) }
    }).filter((p) => p.name),
    levels: list(r.levels, 10).map((l) => ({ kind: oneOf(l.kind, ['support', 'resistance', 'liquidity', 'gap'] as const, 'support'), price: opt(l.price, 24), y: clamp01(l.y), y2: l.y2 === null || l.y2 === undefined ? null : clamp01(l.y2), note: text(l.note, 200) })),
    candles: list(r.candles, 6).map((k) => ({ name: text(k.name, 40), bias: oneOf(k.bias, ['bull', 'bear', 'neutral'] as const, 'neutral'), x: clamp01(k.x), y: clamp01(k.y), note: text(k.note, 200) })).filter((k) => k.name),
    plan: { stance: oneOf(plan.stance, ['long', 'short', 'no-trade'] as const, 'no-trade'), entry: opt(plan.entry), stop: opt(plan.stop), target: opt(plan.target), rr: Number.isFinite(rr) && rr > 0 && rr < 100 ? Math.round(rr * 10) / 10 : null, why: text(plan.why, 600) },
    invalidation: text(r.invalidation, 300),
    unreadable: (Array.isArray(r.unreadable) ? r.unreadable : []).slice(0, 8).map((u) => text(u, 120)).filter(Boolean),
    confidence: oneOf(r.confidence, ['low', 'medium', 'high'] as const, 'low'),
    confidenceWhy: text(r.confidenceWhy, 300),
  }
}
