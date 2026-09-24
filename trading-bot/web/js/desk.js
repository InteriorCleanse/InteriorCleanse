/**
 * HOME — the core, and what it decided.
 *
 * Design brief, in order of priority:
 *   1. A person who has never traded should understand the top of this screen
 *      in about three seconds: what Mr. Cash thinks right now, in one sentence,
 *      next to a core that shows every model he runs and which of them are
 *      talking. Everything else is detail and stays folded away.
 *   2. A model that cannot see must LOOK like it cannot see — grey, dashed,
 *      silent, with what it is waiting on written beside it. Never a zero
 *      standing in for "we don't know".
 *   3. Colour carries meaning, not decoration: mint up, coral down, iris for the
 *      AI itself, aqua for a model reading live, amber for an estimate.
 *
 * This file draws `/api/desk` and nothing else. No trading logic, no thresholds
 * of its own, no way to place or shape an order. Every word and number comes
 * from the payload — including his voice lines, which are composed server-side
 * so there is exactly one place they can be got wrong.
 *
 * THE CORE (web/js/core.js) draws `payload.agents` and `payload.core.panel`
 * only: one input per agent, one neuron per strategy vote, the fused decision in
 * the middle. This file runs its frame loop and stops it off screen and under
 * reduced motion. The small charts render an UNAVAILABLE frame for any reading
 * the server sent as null. A pretty screen that implies activity nobody is
 * reading is the one thing this file refuses to be.
 */

const CREW = {
  book:   { hue: 187, glyph: 'M3 12h3l2-5 3 10 3-8 2 3h5' },                       // a tape reading
  tape:   { hue: 262, glyph: 'M4 18V7m0 0 5 5 4-4 7 7M4 7h0' },                    // structure
  signal: { hue: 38,  glyph: 'M13 2 4 14h6l-1 8 9-12h-6z' },                       // the spark
  risk:   { hue: 152, glyph: 'M12 3 4 6v6c0 4 3.5 7.5 8 9 4.5-1.5 8-5 8-9V6z' },   // a shield
  regime: { hue: 206, glyph: 'M3 15a4 4 0 0 1 4-4 5 5 0 0 1 9.5-1.5A3.5 3.5 0 0 1 20 15z' }, // weather
  proof:  { hue: 345, glyph: 'M5 21V9m7 12V3m7 18v-8' },                           // a scoreboard
}

const STATUS_LABEL = { LIVE: 'reading', PARTIAL: 'estimating', WAITING: 'standing by', BLIND: "can't see" }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/* ---------- the evidence strip: how much has actually been earned ---------- */
function evidence(d) {
  // Numbers come from the payload, never from parsing the sentence next to them
  // and never from a total hardcoded here. Both of those were true until the
  // flaw hunt; either one drifts the moment a gate is added or reworded.
  const { met: done, total } = d.floor.gates
  const passed = total > 0 && done >= total
  const pips = total > 0
    ? Array.from({ length: total }, (_, i) => `<span class="dk-pip${i < done ? ' on' : ''}"></span>`).join('')
    : ''
  return `
  <div class="dk-evidence${passed ? ' met' : ''}">
    <div class="dk-evidence-head">
      <span class="dk-evidence-title">Track record</span>
      <span class="dk-evidence-count">${total > 0 ? `${done} of ${total} checks` : 'no checks readable'}</span>
    </div>
    ${pips ? `<div class="dk-pips">${pips}</div>` : ''}
    <p class="dk-evidence-line">${esc(d.voice.evidence)}</p>
  </div>`
}

/* ---------- one crew member: a uniform tile, coloured by state, not by agent ---------- */
const STATE_CLASS = { LIVE: 's-live', PARTIAL: 's-partial', WAITING: 's-wait', BLIND: 's-blind' }

function agentTile(a) {
  const c = CREW[a.id] || { glyph: '' }
  const rows = (a.rows || []).map((r) => `<div class="dk-row"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`).join('')
  return `
  <article class="dk2-agent ${STATE_CLASS[a.status] || 's-wait'}">
    <div class="dk2-agent-hd">
      <span class="dk2-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${c.glyph}"/></svg></span>
      <div class="dk2-agent-t"><h3>${esc(a.title)}</h3><p>${esc(a.plain)}</p></div>
      <span class="dk2-st"><i></i>${esc(STATUS_LABEL[a.status] || a.status)}</span>
    </div>
    <div class="dk2-read${a.headline === '—' ? ' none' : ''}">${a.headline === '—' ? 'NO READING' : esc(a.headline)}</div>
    <p class="dk2-say">${esc(a.line)}${a.waitingOn && !String(a.line || '').toLowerCase().includes(String(a.waitingOn).toLowerCase()) ? ` <span>Waiting on ${esc(a.waitingOn)}.</span>` : ''}</p>
    <details class="dk-more">
      <summary>Details</summary>
      <div class="dk-rows">${rows}</div>
      <p class="dk-detail">${esc(a.detail)}</p>
      <p class="dk-prov">${esc(a.provenance === 'REAL' ? 'Read straight from the source' : a.provenance === 'APPROXIMATE' ? 'Estimated from candles, not the live tape' : 'Nothing readable right now')}${a.ageSec === null || a.ageSec === undefined ? '' : ` · ${a.ageSec}s ago`}</p>
    </details>
  </article>`
}

/* ---------- the signal core: markup ---------- */
const prov = (p) => `<i class="dk2-prov ${esc(p)}" title="${p === 'REAL' ? 'Read straight from the source' : p === 'APPROXIMATE' ? 'Estimated from candles, not the live tape' : 'Nothing readable right now'}">${esc(p)}</i>`
const fmtPx = (n) => (n >= 1000 ? '$' + Math.round(n).toLocaleString('en-US') : '$' + Number(n).toFixed(2))
const ICONS = {
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  speak: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  text: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
}
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`

/** Minutes per candle from the interval the payload names ("5m", "1h"); null if it is not in that form. */
function intervalMinutes(iv) {
  const m = /^(\d+)([mh])$/.exec(String(iv || ''))
  return m ? Number(m[1]) * (m[2] === 'h' ? 60 : 1) : null
}

function heroPrice(d) {
  const r = d.core?.range
  if (!r || !r.bars.length) return `<div class="dk2-price-block"><div class="dk2-label">${esc(d.symbol)} · last close</div><div class="dk2-price none">—</div><div class="dk2-chg">no stored candles</div></div>`
  const last = r.bars[r.bars.length - 1].c, first = r.bars[0].c
  const pct = first ? ((last - first) / first) * 100 : 0
  const mins = intervalMinutes(d.interval)
  const span = mins ? (r.bars.length * mins >= 120 ? `${Math.round((r.bars.length * mins) / 60)}h` : `${r.bars.length * mins}m`) : `${r.bars.length} candles`
  return `
  <div class="dk2-price-block">
    <div class="dk2-label">${esc(d.symbol)} · last close ${prov(r.provenance)}</div>
    <div class="dk2-price">${fmtPx(last)}</div>
    <div class="dk2-chg ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}% <span>over ${span} · ${fmtPx(r.low)} – ${fmtPx(r.high)}</span></div>
    <canvas id="dk-m-range" class="dk2-spark" aria-hidden="true"></canvas>
  </div>`
}

const shortName = (n) => String(n).replace(/\s*\(.*\)\s*$/, '')

function fact(k, v, sub, cls = '') {
  return `<div class="hm-fact"><span class="k">${esc(k)}</span><b class="${cls}">${esc(v)}</b><span class="s">${esc(sub)}</span></div>`
}

function homeHero(d) {
  const p = d.core?.panel
  const tone = p?.direction === 'long' ? 'long' : p?.direction === 'short' ? 'short' : 'flat'
  const regime = (d.agents || []).find((a) => a.id === 'regime')
  const n = (d.agents || []).length + (p ? p.votes.length : 0)
  const brainLabel = `The core: ${n} models. ${p && p.score !== null ? `Agreement ${p.score} of 100${p.enterScore !== null ? `, acts at ${p.enterScore}` : ''}.` : 'No decision yet.'}`
  return `
  <section class="hm-hero">
    <div class="hm-brain">
      <canvas id="dk-core-canvas" role="img" aria-label="${esc(brainLabel)}"></canvas>
      <div class="hm-legend" aria-hidden="true">
        <span><i class="buy"></i>buy</span><span><i class="sell"></i>sell</span><span><i class="hold"></i>hold</span>
        <span><i class="live"></i>reading</span><span><i class="est"></i>estimating</span><span><i class="blind"></i>can't see</span>
        <span class="hm-hint">drag to turn · point at a node to read it</span>
      </div>
    </div>
    <div class="hm-side">
      <div class="hm-top">
        <span class="hm-live"><i></i>Live · ${esc(d.symbol)} ${esc(d.interval)}</span>
        <div class="dk2-tools">
          <button class="dk2-tool" data-act="reload" title="Reload" aria-label="Reload">${icon('reload')}</button>
          <button class="dk2-tool" data-act="speak" title="Read it to me" aria-label="Read it aloud">${icon('speak')}</button>
        </div>
      </div>
      <div class="hm-verdict ${tone}">${esc(d.floor.verdict)}</div>
      <h1 class="hm-say">${esc(d.voice.floor)}</h1>
      ${heroPrice(d)}
      <div class="hm-facts">
        ${p && p.score !== null ? fact('Agreement', `${p.score}/100`, p.enterScore !== null ? `acts at ${p.enterScore}` : 'no act-at level', tone === 'flat' ? '' : tone) : fact('Agreement', '—', 'no decision yet')}
        ${fact('Market mood', regime && regime.headline !== '—' ? String(regime.headline).toLowerCase().replace(/-/g, ' ') : '—', regime ? STATUS_LABEL[regime.status] || '' : 'no reading')}
        ${fact('Can see', `${d.floor.trust}/100`, d.floor.blind && d.floor.blind.length ? `${d.floor.blind.join(', ')} blind` : 'every input reading')}
      </div>
      <div class="hm-actions">
        <button class="btn" data-tab="today">Today's plan</button>
        <button class="btn ghost" data-tab="chart">Chart</button>
        <button class="btn ghost" data-tab="ask">Ask Mr. Cash</button>
      </div>
      <p class="hm-stamp"><span id="desk-status"></span></p>
    </div>
  </section>`
}

function modelsSection(d) {
  const p = d.core?.panel
  const agents = (d.agents || []).map((a) => `
    <li class="hm-model" data-node="${esc(a.id)}" tabindex="0" title="${esc(a.line)}">
      <i class="hm-dot ${esc(a.status)}"></i>
      <span class="hm-name"><b>${esc(a.title)}</b><span>${esc(a.plain)}</span></span>
      <em class="hm-st ${esc(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</em>
    </li>`).join('')
  const votes = p ? p.votes.map((v) => {
    const off = v.weight === 0, cls = off ? 'off' : v.action === 'BUY' ? 'buy' : v.action === 'SELL' ? 'sell' : 'hold'
    const conf = v.action === 'HOLD' ? 0 : Math.max(0, Math.min(100, Math.round(v.confidence)))
    return `
    <li class="hm-model" data-node="${esc(v.id)}" tabindex="0" title="${esc(v.name)}: ${esc(v.action)}${v.action === 'HOLD' ? '' : ` at confidence ${conf}`}, regime weight ${v.weight.toFixed(2)}${off ? ' (switched off in this regime)' : ''}">
      <i class="hm-dot ${cls}"></i>
      <span class="hm-name"><b>${esc(shortName(v.name))}</b>${conf > 0 ? `<span class="hm-bar"><i class="${cls}" style="width:${conf}%"></i></span>` : ''}</span>
      <em class="hm-st ${cls}">${off ? 'off in this regime' : v.action === 'HOLD' ? 'hold' : `${v.action.toLowerCase()} ${conf}`}</em>
    </li>`
  }).join('') : ''
  return `
  <section class="hm-models" aria-label="Every model running">
    <div class="hm-col">
      <h2>Reading the market <span>${(d.agents || []).length} models, each watching one thing</span></h2>
      <ul>${agents}</ul>
    </div>
    <div class="hm-col">
      <h2>Voting on this candle <span>${p ? p.votes.length : 0} strategies${p && p.regime ? `, weighted for a ${esc(p.regime)} market` : ''}</span></h2>
      ${p ? `<ul>${votes}</ul>` : '<p class="muted">No votes for this candle.</p>'}
    </div>
  </section>`
}

function statsTile(c) {
  const row = (s) => `<div class="dk2-stat"><span class="k">${esc(s.label)} ${prov(s.provenance)}</span><b class="${s.value === '—' ? 'none' : ''}">${esc(s.value)}</b><span class="s">${esc(s.sub)}</span></div>`
  return `
  <div class="dk2-tile dk2-stats">
    <div class="dk2-tile-h"><b>Paper record</b><span>from closed paper trades only</span></div>
    <div class="dk2-stat-grid">${row(c.stats.fill)}${row(c.stats.hit)}${row(c.stats.expectancy)}${row(c.stats.book)}</div>
  </div>`
}

function chartTile(id, label, right, ok, none, cls = '') {
  return `<div class="dk2-tile dk2-chart ${cls}"><div class="dk2-tile-h"><b>${esc(label)}</b><span>${esc(right)}</span></div>${ok ? `<canvas id="${id}" aria-hidden="true"></canvas>` : `<div class="dk2-none">UNAVAILABLE<br><span>${esc(none)}</span></div>`}</div>`
}

function chartsRow(c) {
  const pulseRight = c.pulse.perMin === null ? '—' : `${Math.round(c.pulse.perMin)}/min · ${c.pulse.label || ''}`
  return `
    ${chartTile('dk-m-vol', 'Volume', c.volume.bars.length ? `last ${c.volume.bars.length} candles` : '—', c.volume.bars.length > 0, 'no stored candles', 'c-vol')}
    ${chartTile('dk-m-heat', 'Heat · volume by NY hour', c.heat.days.length ? `${c.heat.days.length} day${c.heat.days.length === 1 ? '' : 's'}` : '—', c.heat.days.length > 0, 'no stored candles', 'c-heat')}
    ${chartTile('dk-m-pulse', 'Pulse · the tape', pulseRight, c.pulse.perMin !== null, c.flow.trusted ? 'no tape reading this candle' : 'stream not trusted', 'c-pulse')}`
}

/* ---------- the signal core: drawing ---------- */
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
let coreData = null
let deskData = null
let brainFocus = null
let coreFrame = null
let coreT0 = 0

function fitCanvas(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = cv.clientWidth, h = cv.clientHeight
  if (!w || !h) return null
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
  const ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}

const MINT = '74,222,154', GREY = '154,163,194', IRIS = '139,147,255'

function drawVolume(cv, v) {
  const f = fitCanvas(cv); if (!f) return
  const { ctx, w, h } = f
  ctx.clearRect(0, 0, w, h)
  const max = Math.max(...v.bars.map((b) => b.v), 1e-9)
  const gap = 2, bw = Math.max(1, (w - gap * (v.bars.length - 1)) / v.bars.length)
  v.bars.forEach((b, i) => {
    const bh = Math.max(1, (b.v / max) * (h - 2))
    ctx.fillStyle = b.up ? `rgba(${MINT},.75)` : `rgba(${GREY},.55)`
    ctx.fillRect(i * (bw + gap), h - bh, bw, bh)
  })
}

function drawHeat(cv, heat) {
  const f = fitCanvas(cv); if (!f) return
  const { ctx, w, h } = f
  ctx.clearRect(0, 0, w, h)
  const rows = heat.grid.length, cols = 24
  const cw = w / cols, ch = h / rows
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = heat.grid[r][c]
    const a = heat.max > 0 ? Math.pow(v / heat.max, 0.6) : 0
    ctx.fillStyle = v > 0 ? `rgba(${IRIS},${(0.08 + 0.85 * a).toFixed(3)})` : 'rgba(255,255,255,.035)'
    ctx.fillRect(c * cw + 0.5, r * ch + 0.5, Math.max(0.5, cw - 1), Math.max(0.5, ch - 1))
  }
  ctx.fillStyle = `rgba(${GREY},.8)`; ctx.font = "9px 'Geist Mono',ui-monospace,monospace"
  for (const hr of [0, 6, 12, 18]) ctx.fillText(String(hr).padStart(2, '0'), hr * cw + 1, h - 1)
}

function drawRange(cv, r) {
  const f = fitCanvas(cv); if (!f) return
  const { ctx, w, h } = f
  ctx.clearRect(0, 0, w, h)
  const lo = r.low, hi = r.high, span = Math.max(hi - lo, 1e-9)
  const n = r.bars.length
  const x = (i) => (n === 1 ? w / 2 : (i / (n - 1)) * w)
  const y = (p) => 3 + (1 - (p - lo) / span) * (h - 6)
  ctx.beginPath()
  r.bars.forEach((b, i) => { i ? ctx.lineTo(x(i), y(b.h)) : ctx.moveTo(x(i), y(b.h)) })
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(x(i), y(r.bars[i].l))
  ctx.closePath(); ctx.fillStyle = `rgba(${IRIS},.14)`; ctx.fill()
  ctx.beginPath(); ctx.strokeStyle = `rgba(${IRIS},.95)`; ctx.lineWidth = 1.4
  r.bars.forEach((b, i) => { i ? ctx.lineTo(x(i), y(b.c)) : ctx.moveTo(x(i), y(b.c)) })
  ctx.stroke()
}

/**
 * The pulse: one blink per trade on average. The blink period is 60 s divided
 * by the tape's real trades-per-minute reading, so a quiet tape blinks slowly
 * and a fast one flickers — cadence is read, never invented.
 */
function drawPulse(cv, pulse, t) {
  const f = fitCanvas(cv); if (!f) return
  const { ctx, w, h } = f
  ctx.clearRect(0, 0, w, h)
  const period = Math.max(0.12, 60 / Math.max(pulse.perMin, 1e-9))
  const phase = REDUCED ? 0 : (t / 1000) % period / period
  const glow = 1 - Math.min(1, phase * 3)
  const cx = 26, cy = h / 2
  ctx.beginPath(); ctx.arc(cx, cy, 9 + glow * 7, 0, Math.PI * 2); ctx.fillStyle = `rgba(${IRIS},${(0.10 + glow * 0.25).toFixed(3)})`; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = `rgba(${IRIS},${(0.55 + glow * 0.45).toFixed(3)})`; ctx.fill()
  ctx.fillStyle = 'rgba(238,241,251,.94)'; ctx.font = "700 22px 'Geist Mono',ui-monospace,monospace"; ctx.textBaseline = 'middle'
  ctx.fillText(`${Math.round(pulse.perMin)}`, 48, cy - 1)
  ctx.fillStyle = `rgba(${GREY},.9)`; ctx.font = "10px 'Geist Mono',ui-monospace,monospace"
  ctx.fillText(`trades / min · ${pulse.label || ''}`, 48, cy + 17)
}

function drawStatics() {
  const c = coreData; if (!c) return
  const vol = document.getElementById('dk-m-vol'); if (vol && c.volume.bars.length) drawVolume(vol, c.volume)
  const heat = document.getElementById('dk-m-heat'); if (heat && c.heat.days.length) drawHeat(heat, c.heat)
  const range = document.getElementById('dk-m-range'); if (range && c.range.bars.length) drawRange(range, c.range)
}

/** What the core draws: the payload's agents and votes, nothing else. */
function brainState(d) {
  const p = d.core?.panel
  return {
    agents: (d.agents || []).map((a) => ({ id: a.id, title: a.title, status: a.status })),
    votes: p ? p.votes.map((v) => ({ id: v.id, name: v.name, action: v.action, confidence: v.confidence, weight: v.weight })) : [],
    core: { score: p ? p.score : null, enterScore: p ? p.enterScore : null, direction: p ? p.direction : null },
    focus: brainFocus,
  }
}

function frame(t) {
  coreFrame = null
  const d = deskData; if (!d) return
  const scope = document.getElementById('dk-core-canvas')
  if (!scope || !deskVisible()) return
  if (!coreT0) coreT0 = t
  if (window.MrCore) window.MrCore.draw(scope, brainState(d), t - coreT0, REDUCED)
  const c = coreData
  const pulse = document.getElementById('dk-m-pulse'); if (pulse && c && c.pulse.perMin !== null) drawPulse(pulse, c.pulse, t - coreT0)
  if (!REDUCED) coreFrame = requestAnimationFrame(frame)
}

function startCore() {
  if (coreFrame) cancelAnimationFrame(coreFrame)
  coreFrame = null
  drawStatics()
  coreFrame = requestAnimationFrame(frame)
}
function stopCore() { if (coreFrame) cancelAnimationFrame(coreFrame); coreFrame = null }
window.addEventListener('resize', () => { if (deskData && deskVisible()) { drawStatics(); if (REDUCED) startCore() } })

/**
 * THE PIPELINE — the six steps every paper trade has to pass, left to right,
 * lit from the same /api/desk reading as everything else on this page. A step
 * is "done" only when the desk says so; the first step that is not done is
 * where Mr. Cash is right now. Nothing here is estimated: a step with no
 * reading says so.
 */
const ICON = {
  scan: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M6.5 12s2-3.5 5.5-3.5 5.5 3.5 5.5 3.5-2 3.5-5.5 3.5S6.5 12 6.5 12z"/><circle cx="12" cy="12" r="1.4"/>',
  mood: '<path d="M3 17l5-6 4 4 5-7 4 5"/><path d="M3 21h18"/>',
  analyze: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/><path d="M8 12.5v-2M10.5 12.5v-4M13 12.5v-3"/>',
  plan: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><circle cx="12" cy="13" r="3.5"/><circle cx="12" cy="13" r=".9"/>',
  risk: '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="m9 12 2 2 4-4"/>',
  record: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>',
}
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`
const rowVal = (a, label) => a?.rows?.find((r) => r.label === label)?.value

function pipelineSteps(d) {
  const ag = Object.fromEntries((d.agents || []).map((a) => [a.id, a]))
  const tape = ag.tape, regime = ag.regime, signal = ag.signal, risk = ag.risk, proof = ag.proof
  const panel = d.core?.panel
  const cleared = panel && (panel.action === 'LONG' || panel.action === 'SHORT')
  const hasCandidate = risk && risk.headline !== 'NO CANDIDATE'
  const seeing = (a) => a && (a.status === 'LIVE' || a.status === 'PARTIAL')
  return [
    { k: 'scan', t: 'Scan', tab: 'chart', state: seeing(tape) ? 'done' : 'blind',
      v: `${d.symbol} · ${d.interval}`, s: seeing(tape) ? `${rowVal(tape, 'Sweeps today') ?? '—'} sweeps, ${rowVal(tape, 'Fair value gaps') ?? '—'} gaps in play` : "can't read the chart right now" },
    { k: 'mood', t: 'Mood', tab: 'intel', state: seeing(regime) ? 'done' : 'blind',
      v: seeing(regime) ? String(regime.headline).toLowerCase() : '—', s: seeing(regime) ? `${rowVal(regime, 'Volatility') ?? '—'} volatility` : 'no reading' },
    { k: 'analyze', t: 'Analyze', tab: 'today', state: !panel || panel.score === null ? 'blind' : cleared ? 'done' : 'wait',
      v: panel && panel.score !== null ? `${panel.score}/100` : '—', s: panel && panel.enterScore !== null ? `acts at ${panel.enterScore} · ${String(panel.action).toLowerCase()}` : 'no decision yet' },
    { k: 'plan', t: 'Plan', tab: 'today', state: hasCandidate ? 'done' : cleared ? 'wait' : 'idle',
      v: hasCandidate ? 'entry · stop · target' : 'no plan', s: hasCandidate ? 'written before entry' : 'no plan, no trade' },
    { k: 'risk', t: 'Risk', tab: 'ops', state: !hasCandidate ? 'idle' : risk.headline === 'CLEAR' ? 'done' : 'stop',
      v: !hasCandidate ? 'nothing to check' : risk.headline === 'CLEAR' ? 'all checks clear' : `stopped: ${String(risk.headline).toLowerCase()}`, s: '9 rules, any one can veto' },
    { k: 'record', t: 'Record', tab: 'validation', state: 'idle',
      v: `${rowVal(proof, 'Paper trades') ?? '0'} paper trades`, s: `${rowVal(proof, 'Gates met') ?? '—'} gates met` },
  ]
}

function pipeline(d) {
  const steps = pipelineSteps(d)
  const now = steps.findIndex((x) => x.state !== 'done')
  const label = { done: 'passed', wait: 'waiting', idle: 'not yet', blind: "can't see", stop: 'stopped' }
  return `<section class="dk-pipe" aria-label="How a paper trade happens here">
    <div class="dk-pipe-head"><b>How a trade happens here</b><span>every step has to pass before the next one starts</span></div>
    <ol class="dk-pipe-row">${steps.map((x, i) => `<li class="dk-step ${x.state}${i === now ? ' now' : ''}">
      <button data-tab="${x.tab}" title="Open ${esc(x.tab)}">
        <span class="dk-step-i">${svg(x.k)}</span>
        <span class="dk-step-n">${i + 1}. ${esc(x.t)}${i === now ? ' <em>now</em>' : ''}</span>
        <span class="dk-step-v">${esc(x.v)}</span>
        <span class="dk-step-s">${esc(x.s)} · ${label[x.state]}</span>
      </button></li>`).join('')}</ol>
  </section>`
}

function render(d) {
  const c = d.core
  return `
  <div class="dk hm">
    ${homeHero(d)}
    <section class="hm-markets" id="dk-markets" aria-live="polite"></section>
    ${modelsSection(d)}
    ${pipeline(d)}

    <details class="hm-more">
      <summary>Charts, the track record and each model's notes</summary>
      ${c ? `<h2 class="dk2-h">The tape <span>closed candles and the live stream, nothing forecast</span></h2>
      <div class="dk2-grid dk2-charts">${chartsRow(c)}</div>
      <div class="dk2-grid dk2-proof">
        ${statsTile(c)}
        ${evidence(d)}
      </div>
      <p class="dk-core-note">${esc(c.note)}</p>` : `<div class="dk2-grid dk2-proof">${evidence(d)}</div>`}
      <h2 class="dk2-h">Each model's notes <span>what it sees, and what it is waiting on</span></h2>
      <div class="dk2-crew">${d.agents.map(agentTile).join('')}</div>
      <section class="dk-accounts" id="dk-accounts" aria-live="polite"></section>
      <section class="dk-learn">
        <div class="dk-learn-head"><b>How it gets better</b><span>it proves strategies to itself before it trusts them — nothing here trades your money</span></div>
        <div class="dk-learn-row">
          <button class="dk-learn-card" data-tab="factory"><b>Breeds and tests</b><i>tries strategy variants on real history, keeps only the ones that survive out-of-sample</i></button>
          <button class="dk-learn-card" data-tab="research"><b>Questions itself</b><i>the lab raises questions from the record, checks them, and flags overfitting</i></button>
          <button class="dk-learn-card" data-tab="knowledge"><b>Remembers</b><i>every lesson and post-mortem is versioned; a setup that keeps failing gets refused</i></button>
        </div>
      </section>
    </details>

    <p class="dk-foot">He reports what he sees. The engine decides, the safety checks can stop it, and nothing on this screen can place, size or shape an order. Pulses in the core are readings and votes on their way to the decision — not trades, not prices.</p>
  </div>`
}

async function loadDesk() {
  const out = document.getElementById('desk-out')
  const status = document.getElementById('desk-status')
  if (!out) return
  if (status) status.textContent = 'having a look…'
  try {
    const r = await fetch('/api/desk')
    const j = await r.json()
    if (!j.ok) throw new Error(j.error || 'could not read the desk')
    // A refresh redraws the page; keep whatever the reader had unfolded.
    const open = [...out.querySelectorAll('details')].map((x) => x.open)
    out.innerHTML = render(j.data)
    out.querySelectorAll('details').forEach((x, i) => { if (open[i]) x.open = true })
    out.dataset.spoken = [j.data.voice.floor, j.data.voice.trust, j.data.voice.evidence].join(' ')
    // The stamp lives inside the markup just redrawn, so look it up again rather than writing to the old copy.
    const stamp = document.getElementById('desk-status')
    if (stamp) stamp.textContent = `updated ${new Date(j.data.generatedAt).toLocaleTimeString()}`
    coreData = j.data.core || null
    deskData = j.data
    // The accounts card (web/js/accounts.js) fills itself in; the desk only says it has drawn.
    document.dispatchEvent(new CustomEvent('desk:rendered'))
    attachBrain()
    if (deskVisible()) { startDeskRefresh(); startCore() } else { stopDeskRefresh(); stopCore() }
  } catch (e) {
    out.innerHTML = `<div class="plain">Couldn't read the desk just now: ${esc(e.message)}. Showing you nothing rather than making something up.</div>`
    if (status) status.textContent = 'failed'
    stopCore()
  }
}

/**
 * KEEP IT LIVE, BUT ONLY WHILE SOMEONE IS LOOKING.
 *
 * The desk loaded once and then sat there. Every panel shows how old its reading
 * is, so a screen left open quietly drifted to "300s old" while presenting
 * itself as a live floor — the numbers were honest, the impression was not.
 *
 * It now refreshes on a timer, and stops when the tab is hidden or you navigate
 * away: `/api/desk` is ~5ms, but polling a background tab forever is how a
 * dashboard earns a reputation for melting laptops. A hidden tab resumes with an
 * immediate fetch so it is never showing a stale frame on return. The core's
 * animation follows the same rule: it runs only while the desk is on screen.
 */
const REFRESH_MS = 15_000
let timer = null

function deskVisible() {
  const section = document.getElementById('tab-desk')
  return !!section && !section.classList.contains('hidden') && document.visibilityState === 'visible'
}

function stopDeskRefresh() { if (timer) { clearInterval(timer); timer = null } }

function startDeskRefresh() {
  stopDeskRefresh()
  timer = setInterval(() => {
    if (!deskVisible()) { stopDeskRefresh(); stopCore(); return }
    loadDesk()
  }, REFRESH_MS)
}

document.addEventListener('visibilitychange', () => {
  if (deskVisible()) { loadDesk(); startDeskRefresh() } else { stopDeskRefresh(); stopCore() }
})
// Switching tabs does not fire visibilitychange; the tab buttons do. Restart the picture when the desk comes back.
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]')
  if (!b) return
  // The learning cards are built on this page, so they miss index.html's load-time
  // binding; route them through the shared tab switcher.
  if (b.closest('#desk-out') && typeof window.showTab === 'function') window.showTab(b.dataset.tab)
  setTimeout(() => { if (deskVisible()) { if (deskData && !coreFrame) startCore() } else stopCore() }, 0)
})

window.loadDesk = loadDesk
/** What he'd say if you asked him to read the desk aloud. */
window.deskSpoken = () => document.getElementById('desk-out')?.dataset.spoken || ''
// The desk's own tools live inside the markup it redraws, so they are delegated rather than bound once.
document.addEventListener('click', (e) => {
  const t = e.target.closest('#desk-out [data-act]')
  if (!t) return
  if (t.dataset.act === 'reload') loadDesk()
  if (t.dataset.act === 'speak' && window.speakAs) window.speakAs(window.deskSpoken())
})

// Point at a model in the list and the core lights its satellite.
function focusNode(id) {
  if (brainFocus === id) return
  brainFocus = id
  if (REDUCED && deskData && deskVisible()) startCore()
}
// And the other way round: point at a neuron and its row lights; click it to go to the row.
const modelRow = (id) => [...document.querySelectorAll('#desk-out .hm-model')].find((r) => r.dataset.node === id)
function attachBrain() {
  const cv = document.getElementById('dk-core-canvas')
  if (!cv || !window.MrCore || !window.MrCore.attach) return
  window.MrCore.attach(cv, {
    // The loop is already running unless motion is reduced; then draw the one frame the drag asked for.
    redraw: () => { if (REDUCED && deskData && deskVisible()) startCore() },
    onHover: (id) => {
      document.querySelectorAll('#desk-out .hm-model.is-lit').forEach((r) => r.classList.remove('is-lit'))
      const r = id && modelRow(id); if (r) r.classList.add('is-lit')
    },
    onPick: (id) => {
      const r = modelRow(id); if (!r) return
      r.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' })
      r.focus({ preventScroll: true })
    },
  })
}
document.addEventListener('pointerover', (e) => { const r = e.target.closest?.('#desk-out .hm-model'); focusNode(r ? r.dataset.node : null) })
document.addEventListener('focusin', (e) => { const r = e.target.closest?.('#desk-out .hm-model'); focusNode(r ? r.dataset.node : null) })
// The detail charts sit in a fold; draw them when it opens.
document.addEventListener('toggle', (e) => { if (e.target.matches?.('#desk-out details.hm-more') && e.target.open) drawStatics() }, true)
