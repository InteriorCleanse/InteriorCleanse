// The Mr. Cash intelligence workspace (Phase 22I/22P).
//
// A professional charting surface over the READ-ONLY intelligence API: the
// engine's own annotations drawn on candles, with zoom, pan, a crosshair,
// per-layer toggles, an event timeline, and a provenance inspector that answers
// "why is this on my chart?" for anything you click.
//
// It renders what the engine saw. It places nothing, decides nothing, and has
// no control that could.

import { getJson, esc, nyTime } from './api.js'

const $ = (id) => document.getElementById(id)

// The twelve display groups the operator actually thinks in. These are finer
// than the annotation `layer` field on purpose: "context" alone would bundle
// VWAP, sessions, news, order flow and regime behind one switch, and the trade
// map is more useful split into what you're aiming at (TRADES) versus what you
// stand to lose (RISK).
//
// `on` is the DEFAULT. Deliberately NOT everything: a chart with every mark lit
// at once is unreadable, and an unreadable chart is a chart you stop checking.
// The default is the decision-relevant core — structure, liquidity, imbalance,
// and the live trade with its risk. Context layers are one click away.
const GROUP_DEFS = [
  { id: 'structure',  label: 'Structure',    colour: '#8b949e', on: true,  match: (a) => a.layer === 'structure' },
  { id: 'liquidity',  label: 'Liquidity',    colour: '#ffa657', on: true,  match: (a) => a.layer === 'liquidity' },
  { id: 'fvg',        label: 'FVG',          colour: '#39c5cf', on: true,  match: (a) => a.layer === 'imbalance' },
  { id: 'orderblock', label: 'Order blocks', colour: '#bc8cff', on: false, match: (a) => a.layer === 'orderblock' },
  { id: 'ict',        label: 'ICT',          colour: '#e3b341', on: false, match: (a) => a.layer === 'ict' },
  { id: 'trades',     label: 'Trades',       colour: '#58a6ff', on: true,  match: (a) => a.layer === 'trade' && ['entry', 'take-profit', 'target-zone', 'entry-zone'].includes(a.annotationType) },
  { id: 'risk',       label: 'Risk',         colour: '#f85149', on: true,  match: (a) => a.layer === 'trade' && ['stop-loss', 'stop-zone', 'invalidation-level', 'risk-reward'].includes(a.annotationType) },
  { id: 'vwap',       label: 'VWAP',         colour: '#a5d6ff', on: false, match: (a) => a.annotationType === 'vwap' },
  { id: 'sessions',   label: 'Sessions',     colour: '#6e7681', on: false, match: (a) => a.annotationType === 'session-boundary' },
  { id: 'news',       label: 'News',         colour: '#ff7b72', on: false, match: (a) => a.annotationType === 'news-marker' },
  { id: 'orderflow',  label: 'Order flow',   colour: '#7ee787', on: false, match: (a) => a.annotationType === 'order-flow-state' },
  { id: 'regime',     label: 'Regime',       colour: '#d2a8ff', on: false, match: (a) => ['trend-regime', 'range-regime', 'volatility-regime'].includes(a.annotationType) },
]

const DEFAULT_GROUPS = () => new Set(GROUP_DEFS.filter((g) => g.on).map((g) => g.id))

/** Which display group an annotation belongs to, or null when it has no chart form. */
function groupOf(a) {
  const def = GROUP_DEFS.find((g) => g.match(a))
  return def ? def.id : null
}

function groupColour(a) {
  const def = GROUP_DEFS.find((g) => g.match(a))
  return def ? def.colour : '#8b949e'
}

const state = {
  loaded: false,
  candles: [],
  annotations: [],
  trade: null,
  timeline: [],
  alerts: [],
  changes: null,
  timeframes: null,
  groupsOn: DEFAULT_GROUPS(),
  strategiesOn: null,   // null = all
  htfOn: true,
  // viewport, in candle indices
  view: { start: 0, count: 0 },
  hover: null,
  selected: null,
  geom: null,
}

// ---------------------------------------------------------------
// Data
// ---------------------------------------------------------------

async function load(force = false) {
  if (state.loaded && !force) return
  setStatus('loading…')
  try {
    const [ann, trade, tl, alerts, changes, scan] = await Promise.all([
      getJson('/api/intel/annotations').catch((e) => ({ ok: false, error: e.message })),
      getJson('/api/intel/trade').catch((e) => ({ ok: false, error: e.message })),
      getJson('/api/intel/timeline').catch((e) => ({ ok: false, error: e.message })),
      getJson('/api/intel/alerts').catch((e) => ({ ok: false, error: e.message })),
      getJson('/api/intel/changes').catch((e) => ({ ok: false, error: e.message })),
      // /api/analysis carries the candle series; /api/scan does not.
      getJson('/api/analysis?candles=600').catch((e) => ({ ok: false, error: e.message })),
    ])
    if (ann && ann.ok === false && ann.flag) { renderDisabled(ann); return }
    state.annotations = ann?.data?.annotations ?? []
    state.timeframes = ann?.data?.timeframes ?? null
    state.trade = trade?.data ?? null
    state.timeline = tl?.data?.events ?? []
    state.alerts = alerts?.data?.alerts ?? []
    state.changes = changes?.data ?? null
    state.candles = scan?.data?.candles ?? []
    if (!state.view.count) {
      state.view.count = Math.min(180, state.candles.length)
      state.view.start = Math.max(0, state.candles.length - state.view.count)
    }
    state.loaded = true
    setStatus('')
    renderAll()
  } catch (err) {
    setStatus('')
    $('intel-out').innerHTML = `<div class="plain">Could not load the intelligence layer: ${esc(err.message)}.</div>`
  }
}

function setStatus(s) { const el = $('intel-status'); if (el) el.textContent = s }

function renderDisabled(payload) {
  setStatus('')
  $('intel-out').innerHTML = `<div class="card"><h2>Intelligence layer is off</h2><div class="plain">${esc(payload.error)}</div><div class="muted" style="font-size:12px">Turn it on in <code>config.intelligence</code>. These are visualization flags only — no trading behaviour changes either way.</div></div>`
}

// ---------------------------------------------------------------
// Chart
// ---------------------------------------------------------------

function visibleCandles() {
  const { start, count } = state.view
  return state.candles.slice(start, start + count)
}

function visibleAnnotations() {
  const cs = visibleCandles()
  if (!cs.length) return []
  const from = cs[0].openTime, to = cs[cs.length - 1].closeTime ?? cs[cs.length - 1].openTime
  return state.annotations.filter((a) => {
    const g = groupOf(a)
    if (!g || !state.groupsOn.has(g)) return false
    if (!state.htfOn && a.timeframe && state.timeframes && a.timeframe !== state.timeframes.executionTimeframe) return false
    if (state.strategiesOn && a.strategyIds.length && !a.strategyIds.some((s) => state.strategiesOn.has(s))) return false
    // Keep levels that extend into view even if they started before it.
    const end = a.endTime ?? to
    return end >= from && a.startTime <= to
  })
}

function drawChart() {
  const canvas = $('intel-canvas')
  if (!canvas) return
  const cs = visibleCandles()
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const W = canvas.clientWidth, H = canvas.clientHeight
  canvas.width = W * dpr; canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  if (!cs.length) { ctx.fillStyle = '#8b949e'; ctx.font = '13px sans-serif'; ctx.fillText('No candles loaded.', 12, 24); return }

  const padL = 8, padR = 78, padT = 12, padB = 26
  const plotW = W - padL - padR, plotH = H - padT - padB
  const anns = visibleAnnotations()

  let lo = Infinity, hi = -Infinity
  for (const c of cs) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high) }
  // Include nearby annotation prices so levels are not drawn off-screen.
  for (const a of anns) {
    for (const p of [a.price, a.priceHigh, a.priceLow]) {
      if (typeof p === 'number' && p > lo * 0.97 && p < hi * 1.03) { lo = Math.min(lo, p); hi = Math.max(hi, p) }
    }
  }
  const pad = (hi - lo) * 0.06 || 1
  lo -= pad; hi += pad
  const n = cs.length
  const x = (i) => padL + (i + 0.5) * plotW / n
  const y = (p) => padT + (hi - p) / (hi - lo) * plotH
  const cw = Math.max(1, (plotW / n) * 0.66)
  const t0 = cs[0].openTime, t1 = cs[n - 1].openTime
  const xAt = (time) => {
    if (time <= t0) return x(0)
    if (time >= t1) return x(n - 1)
    let a = 0, b = n - 1
    while (a < b) { const m = (a + b) >> 1; if (cs[m].openTime < time) a = m + 1; else b = m }
    return x(a)
  }
  state.geom = { x, y, xAt, n, lo, hi, padL, padR, padT, plotW, plotH, cs, cw }

  // grid + price axis
  ctx.strokeStyle = 'rgba(139,148,158,0.14)'; ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'; ctx.lineWidth = 1
  for (let g = 0; g <= 4; g++) {
    const p = lo + (hi - lo) * (g / 4), yy = y(p)
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke()
    ctx.fillText(p.toFixed(0), W - padR + 5, yy + 3)
  }

  // zones behind the candles
  for (const a of anns) {
    if (typeof a.priceHigh !== 'number' || typeof a.priceLow !== 'number') continue
    const col = groupColour(a)
    const x0 = xAt(a.startTime), x1 = a.endTime ? xAt(a.endTime) : W - padR
    const alpha = a.lifecycleStatus === 'ACTIVE' ? 0.13 : a.lifecycleStatus === 'INVALIDATED' ? 0.07 : 0.10
    ctx.fillStyle = hexA(col, alpha)
    ctx.fillRect(x0 - cw / 2, y(a.priceHigh), Math.max(2, x1 - x0 + cw), Math.max(1, y(a.priceLow) - y(a.priceHigh)))
    if (a.id === state.selected) {
      ctx.strokeStyle = col; ctx.lineWidth = 2
      ctx.strokeRect(x0 - cw / 2, y(a.priceHigh), Math.max(2, x1 - x0 + cw), Math.max(1, y(a.priceLow) - y(a.priceHigh)))
      ctx.lineWidth = 1
    }
  }

  // candles
  for (let i = 0; i < n; i++) {
    const c = cs[i]
    const up = c.close >= c.open
    ctx.strokeStyle = up ? '#3fb950' : '#f85149'
    ctx.fillStyle = up ? '#3fb950' : '#f85149'
    ctx.beginPath(); ctx.moveTo(x(i), y(c.high)); ctx.lineTo(x(i), y(c.low)); ctx.stroke()
    const yo = y(c.open), yc = y(c.close)
    ctx.fillRect(x(i) - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)))
  }

  // horizontal levels + point markers
  for (const a of anns) {
    const col = groupColour(a)
    const selected = a.id === state.selected
    if (typeof a.price === 'number' && a.priceHigh === null && a.priceLow === null) {
      const yy = y(a.price)
      ctx.strokeStyle = selected ? col : hexA(col, a.lifecycleStatus === 'ACTIVE' ? 0.75 : 0.35)
      ctx.lineWidth = selected ? 2 : 1
      ctx.setLineDash(a.layer === 'trade' ? [] : [4, 3])
      ctx.beginPath(); ctx.moveTo(xAt(a.startTime), yy); ctx.lineTo(W - padR, yy); ctx.stroke()
      ctx.setLineDash([]); ctx.lineWidth = 1
    }
    // a small tick at the event time for momentary marks
    if (MOMENT.has(a.annotationType) && typeof a.price === 'number') {
      const px = xAt(a.eventTime), py = y(a.price)
      ctx.fillStyle = col
      ctx.beginPath()
      const up = a.direction === 'bullish' || a.direction === 'long'
      ctx.moveTo(px, py + (up ? 7 : -7)); ctx.lineTo(px - 4, py + (up ? 13 : -13)); ctx.lineTo(px + 4, py + (up ? 13 : -13))
      ctx.closePath(); ctx.fill()
      if (selected) { ctx.strokeStyle = '#e6edf3'; ctx.stroke() }
    }
  }

  // crosshair
  if (state.hover) {
    const { mx, my } = state.hover
    ctx.strokeStyle = 'rgba(230,237,243,0.35)'; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(mx, padT); ctx.lineTo(mx, H - padB); ctx.moveTo(padL, my); ctx.lineTo(W - padR, my); ctx.stroke()
    ctx.setLineDash([])
    const price = hi - ((my - padT) / plotH) * (hi - lo)
    ctx.fillStyle = '#e6edf3'; ctx.font = '10px sans-serif'
    ctx.fillText(price.toFixed(1), W - padR + 5, my + 3)
    const i = Math.max(0, Math.min(n - 1, Math.round((mx - padL) / (plotW / n) - 0.5)))
    if (cs[i]) ctx.fillText(nyTime(cs[i].openTime), padL + 4, H - padB + 15)
  }
}

const MOMENT = new Set(['bos', 'choch', 'liquidity-sweep', 'liquidity-raid', 'failed-breakout', 'higher-high', 'higher-low', 'lower-high', 'lower-low', 'swing-high', 'swing-low', 'silver-bullet-setup', 'unicorn-setup', 'turtle-soup-setup', 'strategy-setup'])

function hexA(hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

/** The annotation nearest a click, within a tolerance. */
function pick(mx, my) {
  const g = state.geom
  if (!g) return null
  let best = null, bestD = 14
  for (const a of visibleAnnotations()) {
    const cands = []
    if (typeof a.price === 'number') cands.push({ px: MOMENT.has(a.annotationType) ? g.xAt(a.eventTime) : mx, py: g.y(a.price) })
    if (typeof a.priceHigh === 'number' && typeof a.priceLow === 'number') {
      const yTop = g.y(a.priceHigh), yBot = g.y(a.priceLow)
      if (my >= yTop - 3 && my <= yBot + 3) cands.push({ px: mx, py: my })
    }
    for (const c of cands) {
      const d = Math.hypot(c.px - mx, c.py - my)
      if (d < bestD) { bestD = d; best = a }
    }
  }
  return best
}

// ---------------------------------------------------------------
// Panels
// ---------------------------------------------------------------

function layerControls() {
  const chips = GROUP_DEFS.map((g) => {
    const n = state.annotations.filter((a) => groupOf(a) === g.id).length
    return `<button class="chip ${state.groupsOn.has(g.id) ? 'on' : ''}" data-group="${g.id}" style="border-color:${g.colour}" title="${n} annotation(s)">${esc(g.label)}${n ? ` <span class="muted">${n}</span>` : ''}</button>`
  }).join('')
  const tfs = state.timeframes
    ? state.timeframes.timeframes.map((t) => `<span class="badge ${t.available ? 'good' : ''}" title="${esc(t.note)}">${esc(t.timeframe)}${t.available ? '' : ' ✕'}</span>`).join(' ')
    : ''
  const shown = visibleAnnotations().length
  return `<div class="card"><h2>Layers <span class="muted">— hide or show marks; the data underneath is never dropped</span></h2>
    <div class="row" style="flex-wrap:wrap;gap:6px">${chips}</div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px">
      <button class="chip ${state.htfOn ? 'on' : ''}" data-htf="1">Higher timeframes</button>
      <button class="chip" data-showall="1">Show all</button>
      <button class="chip" data-hideall="1">Hide all</button>
      <button class="chip" data-reset="1">Reset</button>
    </div>
    <div class="muted" style="font-size:12px;margin-top:8px">Showing <b>${shown}</b> of ${state.annotations.length} annotations. The default is the decision-relevant core — structure, liquidity, imbalance and the live trade with its risk — because a chart with everything lit at once is one you stop reading. Context layers are one click away, and hiding a layer never discards data.</div>
    <div class="muted" style="font-size:12px;margin-top:4px">Timeframes available from stored candles: ${tfs || '—'}. A timeframe marked ✕ has too little data and is reported UNAVAILABLE rather than synthesised.</div>
  </div>`
}

function inspectorPanel() {
  const a = state.annotations.find((x) => x.id === state.selected)
  if (!a) return `<div class="card"><h2>Provenance inspector</h2><div class="plain">Click any mark on the chart to see exactly why it is there — what it is, why the engine drew it, when it became knowable, which module produced it, and what would invalidate it.</div></div>`
  const px = a.price !== null ? `$${a.price.toFixed(2)}` : (a.priceHigh !== null && a.priceLow !== null ? `$${a.priceLow.toFixed(2)} – $${a.priceHigh.toFixed(2)}` : '—')
  const row = (k, v) => `<tr><td class="muted" style="white-space:nowrap">${esc(k)}</td><td>${v}</td></tr>`
  const dqCls = a.dataQuality === 'REAL' ? 'win' : a.dataQuality === 'APPROXIMATE' ? 'skip' : 'loss'
  return `<div class="card"><h2>Why is this on my chart?</h2>
    <div class="scroll"><table>
      ${row('WHAT', `<b>${esc(a.annotationType)}</b> <span class="muted">(${esc(a.layer)})</span>`)}
      ${row('WHY', esc(a.rationale))}
      ${row('WHEN', `event ${esc(nyTime(a.eventTime))} · knowable ${esc(nyTime(a.knownAt))}`)}
      ${row('SOURCE', `${esc(a.source)}${a.sourceFeature ? ` · <code>${esc(a.sourceFeature)}</code>` : ''}`)}
      ${row('TIMEFRAME', esc(a.timeframe))}
      ${row('PRICE', esc(px))}
      ${row('STRATEGY', a.strategyIds.length ? esc(a.strategyIds.join(', ')) + (a.strategyState ? ` <span class="muted">(${esc(a.strategyState)})</span>` : '') : '<span class="muted">not referenced by a strategy</span>')}
      ${row('REGIME', a.regime ? esc(a.regime) : '<span class="muted">unavailable</span>')}
      ${row('DATA', `<span class="${dqCls}">${esc(a.dataQuality)}</span>`)}
      ${row('STATUS', `<b>${esc(a.lifecycleStatus)}</b>`)}
      ${row('INVALIDATION', a.invalidationCondition ? esc(a.invalidationCondition) : '<span class="muted">none recorded</span>')}
      ${row('SIGNAL', a.linkedSignalId ? `<code>${esc(a.linkedSignalId)}</code>` : '<span class="muted">none</span>')}
      ${row('TRADE', a.linkedTradeId ? `<code>${esc(a.linkedTradeId)}</code>` : '<span class="muted">none</span>')}
      ${row('ID', `<code>${esc(a.id)}</code> <span class="muted">schema v${a.schemaVersion} · engine ${esc(a.engineVersion)}</span>`)}
    </table></div>
    <div class="row" style="margin-top:8px"><button class="chip" data-explain="${esc(a.id)}">Explain this</button></div>
    <div id="intel-explain-one"></div>
  </div>`
}

function tradePanel() {
  const t = state.trade
  if (!t) return ''
  const why = t.whyTrade, not = t.whyNot
  const reasonRows = (rs) => rs.slice(0, 14).map((r) => `<tr><td>${r.passed ? '<span class="win">✓</span>' : '<span class="skip">○</span>'}</td><td class="muted">${esc(r.group)}</td><td>${esc(r.label)}</td><td class="muted" style="font-size:12px">${esc(r.detail)}</td></tr>`).join('')
  const conf = t.confluence
  const chain = conf.links.map((l) => `<div class="plain" style="border-left-color:${l.supports === true ? 'var(--good)' : l.supports === false ? 'var(--loss,#f85149)' : 'var(--line)'}"><b>${esc(l.label)}</b> — ${l.supports === true ? '<span class="win">supports</span>' : l.supports === false ? '<span class="loss">argues against</span>' : '<span class="muted">not stated</span>'}: ${esc(l.detail)}</div>`).join('')
  const strat = t.strategies.map((s) => `<tr><td><b>${esc(s.name)}</b><div class="muted" style="font-size:11px">${esc(s.family)}${s.needsTape ? ' · needs tape' : ''}</div></td><td><span class="badge ${s.action === 'BUY' ? 'good' : s.action === 'SELL' ? '' : ''}">${esc(s.action)}</span></td><td class="num">${s.confidence}</td><td class="num">${Math.round(s.readiness * 100)}%</td><td class="muted" style="font-size:12px">${esc(s.missing.length ? 'waiting on: ' + s.missing.map((m) => m.step).join('; ') : s.reason)}</td></tr>`).join('')
  return `<div class="card"><h2>Trade intelligence — why${not.rejected ? ', and why not' : ''}</h2>
    <div class="plain"><b>Engine decision:</b> ${esc(why.action)}${why.direction ? ` (${esc(why.direction)})` : ''} — ${esc(why.engineReason)}</div>
    <h3 style="margin:12px 0 4px;font-size:13px">WHY THIS TRADE EXISTS</h3>
    <div class="scroll"><table><tr><th></th><th>Group</th><th>Condition</th><th>Detail</th></tr>${reasonRows(why.reasons)}</table></div>
    ${not.rejected ? `<h3 style="margin:14px 0 4px;font-size:13px">WHY IT WAS NOT TAKEN</h3>
      <div class="plain">Categories: <b>${esc(not.categories.join(', '))}</b>${not.primary ? `<br>Primary blocker (${esc(not.primary.category)}, from ${esc(not.primary.source)}): ${esc(not.primary.detail)}` : ''}</div>
      <div class="scroll"><table><tr><th></th><th>Group</th><th>Condition</th><th>Detail</th></tr>${reasonRows(not.reasons)}</table></div>` : ''}
    <h3 style="margin:14px 0 4px;font-size:13px">STRATEGY CONFLUENCE</h3>
    ${chain}
    <div class="muted" style="font-size:12px;margin:6px 0">${esc(conf.note)}</div>
    <div class="plain">${esc(t.agreement.note)}</div>
    <div class="scroll" style="margin-top:8px"><table><tr><th>Strategy</th><th>Vote</th><th>Conf</th><th>Ready</th><th>State</th></tr>${strat}</table></div>
    <div class="muted" style="font-size:12px;margin-top:6px">${esc(t.note)}</div>
  </div>`
}

function timelinePanel() {
  const ev = state.timeline.slice(-60).reverse()
  const rows = ev.map((e) => `<tr data-ann="${esc(e.annotationId || '')}"><td class="muted" style="white-space:nowrap">${esc(nyTime(e.at))}</td><td><span class="badge">${esc(e.category.replace(' EVENT', ''))}</span></td><td class="${e.severity === 'action' ? 'win' : e.severity === 'warn' ? 'skip' : ''}">${esc(e.title)}</td><td class="muted" style="font-size:12px">${esc(e.detail)}</td></tr>`).join('')
  return `<div class="card"><h2>Event timeline <span class="muted">— click a row to select it on the chart</span></h2>
    ${ev.length ? `<div class="scroll" style="max-height:300px"><table><tr><th>When</th><th>Lane</th><th>Event</th><th>Detail</th></tr>${rows}</table></div>` : '<div class="muted">No events in this window.</div>'}</div>`
}

function changesPanel() {
  const c = state.changes
  const lines = c?.lines ?? ['No change recorded.']
  return `<div class="card"><h2>What changed?</h2>${lines.map((l) => `<div class="plain" style="font-size:12.5px">${esc(l)}</div>`).join('')}
    <div class="muted" style="font-size:12px;margin-top:6px">${esc(c?.delta?.note ?? '')}</div></div>`
}

function alertPanel() {
  const rows = state.alerts.slice(0, 40).map((a) => `<tr><td class="muted" style="white-space:nowrap">${esc(nyTime(a.timestamp))}</td><td><span class="badge ${a.severity === 'critical' ? 'good' : ''}">${esc(a.event)}</span></td><td>${esc(a.title)}</td><td class="muted" style="font-size:12px">${esc(a.reason)}</td><td class="${a.dataQuality === 'REAL' ? 'win' : 'skip'}">${esc(a.dataQuality)}</td></tr>`).join('')
  return `<div class="card"><h2>Alert centre</h2>
    ${state.alerts.length ? `<div class="scroll" style="max-height:260px"><table><tr><th>When</th><th>Event</th><th>Title</th><th>Reason</th><th>Data</th></tr>${rows}</table></div>` : '<div class="muted">No alerts yet.</div>'}
    <div class="muted" style="font-size:12px;margin-top:6px">Alerts are derived from real changes in engine state. Nothing here can place, size or approve an order.</div></div>`
}

function exportPanel() {
  return `<div class="card"><h2>TradingView export</h2>
    <div class="row"><a class="btn ghost" href="/api/intel/export/pine?format=text" target="_blank" rel="noopener">Download Pine snapshot</a><span class="muted" id="intel-pine-note"></span></div>
    <div class="plain"><b>An honest limitation:</b> TradingView provides no supported API for external software to draw on, or stream data into, your logged-in chart, and Pine cannot fetch a URL. So this export is a <b>point-in-time snapshot</b>: real Mr. Cash annotations baked in as constants that you paste into the Pine Editor. The native chart above stays the real-time source of truth.</div>
  </div>`
}

function askPanel() {
  const qs = [
    ['why-this-trade', 'Why did Mr. Cash take this trade?'],
    ['why-not-this-setup', "Why didn't Mr. Cash take this setup?"],
    ['current-structure', 'What is the current market structure?'],
    ['who-agrees', 'Which strategies agree?'],
    ['who-disagrees', 'Which strategies disagree?'],
    ['what-changed', 'What changed recently?'],
    ['active-liquidity', 'Show me the active liquidity.'],
    ['current-risk', 'What is the current risk?'],
  ]
  return `<div class="card"><h2>Ask the engine <span class="muted">— explanations only, never a new opinion</span></h2>
    <div class="row" style="flex-wrap:wrap;gap:6px">${qs.map(([t, l]) => `<button class="chip" data-topic="${t}">${esc(l)}</button>`).join('')}</div>
    <div id="intel-explain"></div>
    <div class="muted" style="font-size:12px;margin-top:6px">Answers may only cite annotations shown above and may never state a decision different from the engine's. If the AI does either, the deterministic explanation is used instead.</div>
  </div>`
}

// ---------------------------------------------------------------
// Render + events
// ---------------------------------------------------------------

function renderAll() {
  $('intel-out').innerHTML = `
    ${layerControls()}
    <div class="card"><h2>Chart <span class="muted">— drag to pan, wheel to zoom, click a mark to inspect it</span></h2>
      <canvas id="intel-canvas" style="width:100%;height:420px;display:block;cursor:crosshair"></canvas>
      <div class="muted" style="font-size:12px;margin-top:6px">${state.annotations.length} annotations from the engine. Marks are hidden by the toggles above, never deleted.</div>
    </div>
    ${inspectorPanel()}
    ${tradePanel()}
    ${timelinePanel()}
    ${changesPanel()}
    ${alertPanel()}
    ${askPanel()}
    ${exportPanel()}
  `
  wire()
  drawChart()
}

function rerenderInspector() {
  const el = $('intel-out')
  if (!el) return
  const cards = el.querySelectorAll('.card')
  // The inspector is the 3rd card (layers, chart, inspector).
  if (cards[2]) { cards[2].outerHTML = inspectorPanel(); wire() }
  drawChart()
}

function wire() {
  for (const b of document.querySelectorAll('#intel-out [data-group]')) {
    b.onclick = () => { const id = b.dataset.group; state.groupsOn.has(id) ? state.groupsOn.delete(id) : state.groupsOn.add(id); renderAll() }
  }
  const htf = document.querySelector('#intel-out [data-htf]')
  if (htf) htf.onclick = () => { state.htfOn = !state.htfOn; renderAll() }
  const showAll = document.querySelector('#intel-out [data-showall]')
  if (showAll) showAll.onclick = () => { state.groupsOn = new Set(GROUP_DEFS.map((g) => g.id)); renderAll() }
  const hideAll = document.querySelector('#intel-out [data-hideall]')
  if (hideAll) hideAll.onclick = () => { state.groupsOn.clear(); state.selected = null; renderAll() }
  const rst = document.querySelector('#intel-out [data-reset]')
  if (rst) rst.onclick = () => {
    state.groupsOn = DEFAULT_GROUPS(); state.htfOn = true; state.selected = null
    state.view.count = Math.min(180, state.candles.length)
    state.view.start = Math.max(0, state.candles.length - state.view.count)
    renderAll()
  }
  for (const tr of document.querySelectorAll('#intel-out [data-ann]')) {
    tr.style.cursor = 'pointer'
    tr.onclick = () => { const id = tr.dataset.ann; if (id) { state.selected = id; rerenderInspector() } }
  }
  for (const b of document.querySelectorAll('#intel-out [data-topic]')) {
    b.onclick = async () => {
      const box = $('intel-explain')
      box.innerHTML = '<div class="muted">thinking…</div>'
      try {
        const r = await getJson(`/api/intel/explain?topic=${encodeURIComponent(b.dataset.topic)}`)
        const d = r.data
        box.innerHTML = `<div class="plain"><div class="muted" style="font-size:11px">source: ${esc(d.source)} · engine decision: ${esc(d.engineDecision)} · ${d.cited} annotation(s) in context</div><pre style="white-space:pre-wrap;margin:6px 0 0;font:inherit">${esc(d.text)}</pre></div>`
      } catch (e) { box.innerHTML = `<div class="plain">Could not explain: ${esc(e.message)}</div>` }
    }
  }
  for (const b of document.querySelectorAll('#intel-out [data-explain]')) {
    b.onclick = async () => {
      const box = $('intel-explain-one')
      box.innerHTML = '<div class="muted">thinking…</div>'
      try {
        const r = await getJson(`/api/intel/explain?topic=explain-annotation&id=${encodeURIComponent(b.dataset.explain)}`)
        box.innerHTML = `<pre style="white-space:pre-wrap;margin:6px 0 0;font:inherit">${esc(r.data.text)}</pre>`
      } catch (e) { box.innerHTML = `<div class="plain">Could not explain: ${esc(e.message)}</div>` }
    }
  }

  const canvas = $('intel-canvas')
  if (!canvas) return
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect()
    state.hover = { mx: e.clientX - r.left, my: e.clientY - r.top }
    if (drag.on) {
      const dx = state.hover.mx - drag.x
      const perCandle = (state.geom?.plotW ?? 1) / Math.max(1, state.view.count)
      const shift = Math.round(dx / perCandle)
      if (shift !== 0) {
        state.view.start = Math.max(0, Math.min(state.candles.length - state.view.count, drag.start - shift))
      }
    }
    drawChart()
  }
  canvas.onmouseleave = () => { state.hover = null; drag.on = false; drawChart() }
  canvas.onmousedown = (e) => {
    const r = canvas.getBoundingClientRect()
    drag.on = true; drag.x = e.clientX - r.left; drag.start = state.view.start; drag.moved = false
  }
  canvas.onmouseup = (e) => {
    const r = canvas.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    const wasDrag = Math.abs(mx - drag.x) > 3
    drag.on = false
    if (!wasDrag) {
      const hit = pick(mx, my)
      state.selected = hit ? hit.id : null
      rerenderInspector()
    }
  }
  canvas.onwheel = (e) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15
    const next = Math.max(20, Math.min(state.candles.length, Math.round(state.view.count * factor)))
    const centre = state.view.start + state.view.count / 2
    state.view.count = next
    state.view.start = Math.max(0, Math.min(state.candles.length - next, Math.round(centre - next / 2)))
    drawChart()
  }
}

const drag = { on: false, x: 0, start: 0, moved: false }

window.addEventListener('resize', () => { if (state.loaded) drawChart() })

// Exposed for index.html's tab switcher.
window.loadIntel = () => load(false)
window.reloadIntel = () => load(true)
