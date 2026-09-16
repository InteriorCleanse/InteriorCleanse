/**
 * TradingView export (Phase 22J) — a Pine v5 generator fed by the SAME canonical
 * annotations the native chart draws.
 *
 * THE LIMITATION, STATED PLAINLY (see docs/TRADINGVIEW_INTEGRATION.md):
 *
 *   TradingView offers NO public, supported API that lets external software draw
 *   on, or stream data into, a user's logged-in chart. Pine Script runs inside
 *   TradingView on TradingView's data and cannot fetch an external URL. So this
 *   module does NOT pretend to drive a live chart remotely, and the project does
 *   not scrape TradingView or automate a logged-in account.
 *
 * What it DOES: emit self-contained Pine source with Mr. Cash's real annotation
 * times and prices BAKED IN as constants, which you paste into the Pine Editor.
 * That makes it a point-in-time SNAPSHOT — the generated header says so, and
 * stamps the generation time and engine version. The native Mr. Cash chart
 * remains the real-time source of truth.
 *
 * Because the drawings come from the canonical annotations rather than a
 * re-implementation of the rules in Pine, the export cannot silently diverge
 * from the engine: there is no second calculation to drift.
 *
 * SECURITY: everything emitted passes `sanitisePineText`. Only symbol,
 * timeframe, times, prices and labels leave the process; anything that looks
 * like a key, secret, token, PIN, path or environment variable is stripped.
 */

import type { ChartAnnotation, AnnotationType } from './types.ts'

/** Which annotation types the export can draw, and how. */
type PineShape = 'hline' | 'box' | 'label'

const SHAPE: Partial<Record<AnnotationType, PineShape>> = {
  // levels
  'previous-day-high': 'hline', 'previous-day-low': 'hline',
  'previous-week-high': 'hline', 'previous-week-low': 'hline',
  'session-high': 'hline', 'session-low': 'hline',
  'equal-highs': 'hline', 'equal-lows': 'hline',
  'swing-high': 'label', 'swing-low': 'label',
  'higher-high': 'label', 'higher-low': 'label', 'lower-high': 'label', 'lower-low': 'label',
  // structure events
  bos: 'label', choch: 'label',
  // zones
  'fvg-bullish': 'box', 'fvg-bearish': 'box',
  'order-block-bullish': 'box', 'order-block-bearish': 'box', 'breaker-block': 'box',
  // strategy + trade
  'silver-bullet-setup': 'label', 'unicorn-setup': 'label', 'turtle-soup-setup': 'label', 'strategy-setup': 'label',
  entry: 'hline', 'stop-loss': 'hline', 'take-profit': 'hline',
  'liquidity-sweep': 'label', 'liquidity-raid': 'label', 'failed-breakout': 'label',
  // context
  'trend-regime': 'label', 'range-regime': 'label',
}

/** Pine colour per layer. Kept few and legible rather than clever. */
const COLOUR: Record<string, string> = {
  structure: 'color.new(color.gray, 0)',
  liquidity: 'color.new(color.orange, 0)',
  imbalance: 'color.new(color.teal, 70)',
  orderblock: 'color.new(color.purple, 70)',
  ict: 'color.new(color.yellow, 0)',
  trade: 'color.new(color.blue, 0)',
  context: 'color.new(color.silver, 0)',
}

/**
 * Strip anything that must never leave the process. Applied to EVERY string
 * that reaches the output, including labels taken from engine rationale.
 *
 * Deny-list, not allow-list, because rationale text is free-form English — but
 * the patterns cover the shapes secrets actually take here: key/secret/token/
 * pin/csrf assignments, bearer tokens, long hex/base64 runs, absolute paths,
 * environment-variable references and URLs with credentials.
 */
export function sanitisePineText(input: string): string {
  let s = String(input)
  s = s.replace(/\b(api[_-]?key|apikey|secret|token|password|passwd|pin|csrf|auth|bearer|private[_-]?key)\b\s*[:=]?\s*\S+/gi, '[redacted]')
  s = s.replace(/\bBearer\s+\S+/gi, '[redacted]')
  s = s.replace(/\b[A-Fa-f0-9]{32,}\b/g, '[redacted]')          // long hex — keys, hashes
  s = s.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[redacted]')  // long base64
  s = s.replace(/\$\{?[A-Z_][A-Z0-9_]{2,}\}?/g, '[redacted]')   // $ENV_VAR
  s = s.replace(/\b(?:process\.env|MRCASH_[A-Z_]+|EXCHANGE_API_[A-Z]+|ANTHROPIC_API_KEY)\S*/g, '[redacted]')
  s = s.replace(/(?:[A-Za-z]:\\|\/)(?:[\w.-]+\/){2,}[\w.-]*/g, '[redacted]') // absolute-ish paths
  s = s.replace(/\b\w+:\/\/[^\s@]+@\S+/g, '[redacted]')          // creds in a URL
  // Pine string literals are double-quoted: neutralise quotes, backslashes and newlines.
  s = s.replace(/\\/g, '/').replace(/"/g, "'").replace(/[\r\n]+/g, ' ')
  return s.trim()
}

/** A Pine string literal, always sanitised and length-capped. */
function lit(s: string, max = 120): string {
  const clean = sanitisePineText(s)
  return `"${clean.length > max ? clean.slice(0, max - 1) + '…' : clean}"`
}

/** A finite number Pine can read, or null when the value is not usable. */
function num(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') : null
}

export type PineExportOptions = {
  symbol: string
  timeframe: string
  engineVersion: string
  /** Fixed for deterministic snapshots in tests. */
  generatedAt: number
  /** Cap on drawings, because Pine limits boxes/labels/lines per script. */
  maxDrawings?: number
  title?: string
}

export type PineExport = {
  filename: string
  source: string
  /** How many annotations were drawn, and how many could not be. */
  drawn: number
  skipped: Array<{ id: string; annotationType: string; reason: string }>
  limitations: string[]
}

/**
 * Generate the Pine v5 source for a set of annotations.
 *
 * Only annotations with a shape AND usable prices are drawn; everything else is
 * reported in `skipped` with the reason, so the export is never silently partial.
 */
export function generatePine(annotations: ChartAnnotation[], opts: PineExportOptions): PineExport {
  const max = opts.maxDrawings ?? 400
  const skipped: PineExport['skipped'] = []
  const lines: string[] = []
  const stamp = new Date(opts.generatedAt).toISOString()

  lines.push('//@version=5')
  lines.push(`indicator(${lit(opts.title ?? `Mr. Cash markup — ${opts.symbol} ${opts.timeframe}`)}, overlay = true, max_boxes_count = 500, max_labels_count = 500, max_lines_count = 500)`)
  lines.push('')
  lines.push('// =====================================================================')
  lines.push(`// GENERATED BY MR. CASH — engine ${sanitisePineText(opts.engineVersion)} — ${stamp}`)
  lines.push('//')
  lines.push('// THIS IS A POINT-IN-TIME SNAPSHOT, NOT A LIVE FEED.')
  lines.push('// TradingView provides no supported way for external software to stream')
  lines.push('// data into, or draw on, your logged-in chart. Pine cannot fetch a URL.')
  lines.push('// Every level below is a CONSTANT, baked in at the time above, taken')
  lines.push('// straight from Mr. Cash\'s own annotations — there is no second')
  lines.push('// calculation here that could drift from the engine.')
  lines.push('//')
  lines.push('// To refresh it: re-export from Mr. Cash and paste again.')
  lines.push(`// Set the chart to ${sanitisePineText(opts.symbol)} at ${sanitisePineText(opts.timeframe)} so the times line up.`)
  lines.push('// =====================================================================')
  lines.push('')

  // Layer toggles, so the user can switch groups off inside TradingView too.
  const layers = [...new Set(annotations.map((a) => a.layer))].sort()
  for (const l of layers) lines.push(`show_${l} = input.bool(true, ${lit(`Show ${l}`)}, group = ${lit('Mr. Cash layers')})`)
  lines.push('')
  lines.push('// Drawings are created once, on the last bar, from baked constants.')
  lines.push('if barstate.islast')

  let drawn = 0
  for (const a of annotations) {
    if (drawn >= max) { skipped.push({ id: a.id, annotationType: a.annotationType, reason: `Drawing cap of ${max} reached.` }); continue }
    const shape = SHAPE[a.annotationType]
    if (!shape) { skipped.push({ id: a.id, annotationType: a.annotationType, reason: 'No Pine shape is defined for this annotation type.' }); continue }
    const colour = COLOUR[a.layer] ?? 'color.new(color.gray, 0)'
    const label = lit(`${a.annotationType} ${a.lifecycleStatus}${a.dataQuality !== 'REAL' ? ` [${a.dataQuality}]` : ''}`)
    const guard = `    if show_${a.layer}`

    if (shape === 'box') {
      const top = num(a.priceHigh), bot = num(a.priceLow)
      if (top === null || bot === null) { skipped.push({ id: a.id, annotationType: a.annotationType, reason: 'A box needs both priceHigh and priceLow; one was unavailable.' }); continue }
      const left = Math.round(a.startTime), right = Math.round(a.endTime ?? a.startTime + 60 * 60_000)
      lines.push(guard)
      lines.push(`        box.new(left = ${left}, top = ${top}, right = ${right}, bottom = ${bot}, xloc = xloc.bar_time, bgcolor = ${colour}, border_color = ${colour}, text = ${label}, text_size = size.tiny)`)
      drawn++
      continue
    }

    const price = num(a.price)
    if (price === null) { skipped.push({ id: a.id, annotationType: a.annotationType, reason: 'No usable price on this annotation.' }); continue }

    if (shape === 'hline') {
      lines.push(guard)
      lines.push(`        line.new(x1 = ${Math.round(a.startTime)}, y1 = ${price}, x2 = ${Math.round(a.endTime ?? a.startTime + 24 * 60 * 60_000)}, y2 = ${price}, xloc = xloc.bar_time, color = ${colour}, width = 1, style = line.style_dashed)`)
      lines.push(guard)
      lines.push(`        label.new(x = ${Math.round(a.startTime)}, y = ${price}, xloc = xloc.bar_time, text = ${label}, style = label.style_label_left, color = color.new(color.black, 100), textcolor = ${colour}, size = size.tiny)`)
      drawn++
      continue
    }

    // label
    const up = a.direction === 'bullish' || a.direction === 'long'
    lines.push(guard)
    lines.push(`        label.new(x = ${Math.round(a.eventTime)}, y = ${price}, xloc = xloc.bar_time, text = ${label}, style = ${up ? 'label.style_label_up' : 'label.style_label_down'}, color = color.new(color.black, 100), textcolor = ${colour}, size = size.tiny)`)
    drawn++
  }

  if (drawn === 0) lines.push('    na // nothing to draw: no annotation in this set has a Pine shape and usable prices')
  lines.push('')

  const limitations = [
    'Point-in-time snapshot: levels are constants baked in at generation time, not a live feed.',
    'TradingView has no supported API for external software to draw on, or push data into, a logged-in chart; Pine cannot fetch a URL.',
    'Order-flow, data-quality and provenance detail are summarised into label text only — TradingView has no equivalent of the native chart\'s inspector.',
    'Drawing counts are capped by TradingView (max_boxes_count / max_labels_count / max_lines_count) and by this export\'s own cap.',
    'Bar times must line up: set the chart to the same symbol and timeframe, on the same exchange listing, or the levels will sit on the wrong bars.',
  ]

  // The filename is written to disk by whoever downloads it, so it is reduced to
  // a strict safe set — a symbol like "BTC/USDT" must never contribute a path
  // separator, and nothing may start with a dot.
  const slug = (s: string): string => sanitisePineText(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+/, '') || 'export'

  return {
    filename: `mrcash-${slug(opts.symbol)}-${slug(opts.timeframe)}-${stamp.slice(0, 10)}.pine`,
    source: lines.join('\n') + '\n',
    drawn,
    skipped,
    limitations,
  }
}
