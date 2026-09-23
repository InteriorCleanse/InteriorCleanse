/**
 * THE DESK — the crew, on one screen.
 *
 * Design brief, in order of priority:
 *   1. A person who has never traded should understand the top of this screen
 *      in about three seconds. One warm sentence, then one number, then the
 *      track record. Everything else is detail and stays folded away.
 *   2. A panel that cannot see must LOOK like it cannot see — desaturated,
 *      dashed, with what it is waiting on written on it. Never a zero standing
 *      in for "we don't know".
 *   3. Colour carries meaning, not decoration. Each crew member owns one hue so
 *      you learn the desk by shape and colour instead of by reading labels.
 *
 * This file draws `/api/desk` and nothing else. No trading logic, no thresholds
 * of its own, no way to place or shape an order. Every word and number comes
 * from the payload — including his voice lines, which are composed server-side
 * so there is exactly one place they can be got wrong.
 *
 * THE SIGNAL CORE (the moving picture between the hero and the track record)
 * draws `payload.core` only. The wireframe's vertices are the real strategy
 * votes (one each, pushed out by confidence), its colour is the fused
 * direction, and its speed follows the tape when the tape is trusted and is
 * otherwise constant. The stat strip and the four small charts render an
 * UNAVAILABLE frame for any reading the server sent as null. A pretty screen
 * that implies activity nobody is reading is the one thing this file refuses
 * to be.
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

/* ---------- the trust ring: the one number worth a picture ---------- */
function ring(trust) {
  const R = 52, C = 2 * Math.PI * R
  const hue = trust >= 80 ? 152 : trust >= 50 ? 38 : 4
  return `
  <div class="dk-ring">
    <svg viewBox="0 0 128 128" aria-label="${trust} out of 100 of the desk can see">
      <circle class="dk-ring-track" cx="64" cy="64" r="${R}" />
      <circle class="dk-ring-fill" cx="64" cy="64" r="${R}"
        stroke="hsl(${hue} 85% 58%)"
        stroke-dasharray="${C}" stroke-dashoffset="${C - (C * trust) / 100}" />
    </svg>
    <div class="dk-ring-mid">
      <div class="dk-ring-num" style="color:hsl(${hue} 85% 62%)">${trust}</div>
      <div class="dk-ring-cap">can see</div>
    </div>
  </div>`
}

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

function hero(d) {
  const tone = d.core?.panel?.direction === 'long' ? 'long' : d.core?.panel?.direction === 'short' ? 'short' : 'flat'
  return `
  <section class="dk2-hero">
    <div class="dk2-hero-top">
      <span class="dk2-live"><i></i>Live desk</span>
      <span class="dk-chip paper" title="Live market data; fills are simulated at the next candle open plus spread and slippage.">${esc(d.mode)} · simulated · no real money</span>
      <span class="dk-chip">${esc(d.symbol)} · ${esc(d.interval)}</span>
      <div class="dk2-tools">
        <span class="dk2-upd" id="desk-status"></span>
        <button class="dk2-tool" data-act="reload" title="Reload the desk" aria-label="Reload the desk">${icon('reload')}</button>
        <button class="dk2-tool" data-act="speak" title="Read it to me" aria-label="Read the desk aloud">${icon('speak')}</button>
        <a class="dk2-tool" href="/api/desk?format=text" target="_blank" rel="noopener" title="The desk as plain text" aria-label="The desk as plain text">${icon('text')}</a>
      </div>
    </div>
    <div class="dk2-hero-body">
      ${heroPrice(d)}
      <div class="dk2-verdict">
        <div class="dk2-verdict-tag ${tone}">${esc(d.floor.verdict)}</div>
        <p class="dk-headline">${esc(d.voice.floor)}</p>
        <p class="dk-sub">${esc(d.voice.trust)}</p>
      </div>
      ${ring(d.floor.trust)}
    </div>
  </section>`
}

function orbTile(c) {
  const colour = c.panel.direction === 'long' ? 'var(--brand)' : c.panel.direction === 'short' ? 'var(--red)' : 'var(--dim)'
  const cap = [c.flow.trusted ? `tape ${c.flow.tapeLabel || 'read'}` : 'tape not read', c.volatility.label ? `volatility ${c.volatility.label}` : 'volatility —', c.panel.regime ? `regime ${c.panel.regime}` : ''].filter(Boolean).join(' · ')
  return `
  <div class="dk2-tile dk2-orb dk-core-scope" id="dk-scope" data-dir="${c.panel.direction || 'none'}">
    <div class="dk2-tile-h"><b>Signal core</b><span>${esc(cap)}</span></div>
    <div class="dk-core-stage">
      <canvas id="dk-core-canvas" aria-hidden="true"></canvas>
      <div class="dk-core-mid">
        <div class="dk-core-num" style="color:${colour}">${c.panel.score === null ? '—' : c.panel.score}</div>
        <div class="dk-core-act">${esc(c.panel.action)}${c.panel.enterScore !== null ? ` · acts at ${c.panel.enterScore}` : ''}</div>
      </div>
    </div>
  </div>`
}

function votesTile(c) {
  const n = c.panel.votes.length
  const rows = c.panel.votes.map((v) => {
    const cls = v.weight === 0 ? 'off' : v.action === 'BUY' ? 'buy' : v.action === 'SELL' ? 'sell' : 'hold'
    const conf = v.action === 'HOLD' ? 0 : Math.max(0, Math.min(100, Math.round(v.confidence)))
    return `<div class="dk2-vote ${cls}" title="${esc(v.name)}: ${esc(v.action)} at confidence ${Math.round(v.confidence)}, regime weight ${v.weight.toFixed(2)}${v.weight === 0 ? ' (not allowed in this regime)' : ''}">
      <span class="n">${esc(v.name)}</span>
      <span class="a">${v.action === 'HOLD' ? 'hold' : `${v.action.toLowerCase()} ${conf}`}</span>
      <span class="bar"><i style="width:${conf}%"></i></span>
      <span class="w">×${v.weight.toFixed(2)}</span>
    </div>`
  }).join('')
  const score = c.panel.score, need = c.panel.enterScore
  const meter = score !== null && need !== null
    ? `<div class="dk2-meter" title="Agreement ${score} of 100; the panel acts at ${need}"><i style="width:${Math.max(0, Math.min(100, score))}%"></i><b style="left:${Math.max(0, Math.min(100, need))}%"></b></div><div class="dk2-meter-cap"><span>agreement ${score}</span><span>acts at ${need}</span></div>`
    : ''
  return `
  <div class="dk2-tile dk2-votes">
    <div class="dk2-tile-h"><b>The panel</b><span>${n} strateg${n === 1 ? 'y' : 'ies'} voting on this candle</span></div>
    ${meter}
    <div class="dk2-vote-list">${rows || '<p class="muted">No votes for this candle.</p>'}</div>
  </div>`
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

const MINT = '52,211,153', RED = '248,81,73', GREY = '139,152,165', CYAN = '34,211,238', VIOLET = '139,124,246'

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
    ctx.fillStyle = v > 0 ? `rgba(${MINT},${(0.08 + 0.85 * a).toFixed(3)})` : 'rgba(255,255,255,.035)'
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
  ctx.closePath(); ctx.fillStyle = `rgba(${MINT},.14)`; ctx.fill()
  ctx.beginPath(); ctx.strokeStyle = `rgba(${MINT},.95)`; ctx.lineWidth = 1.4
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
  ctx.beginPath(); ctx.arc(cx, cy, 9 + glow * 7, 0, Math.PI * 2); ctx.fillStyle = `rgba(${MINT},${(0.10 + glow * 0.25).toFixed(3)})`; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = `rgba(${MINT},${(0.55 + glow * 0.45).toFixed(3)})`; ctx.fill()
  ctx.fillStyle = 'rgba(230,237,243,.92)'; ctx.font = "700 22px 'Geist Mono',ui-monospace,monospace"; ctx.textBaseline = 'middle'
  ctx.fillText(`${Math.round(pulse.perMin)}`, 48, cy - 1)
  ctx.fillStyle = `rgba(${GREY},.9)`; ctx.font = "10px 'Geist Mono',ui-monospace,monospace"
  ctx.fillText(`trades / min · ${pulse.label || ''}`, 48, cy + 17)
}

/* ---------- 3D helpers: rotate a unit vector, then project to the canvas ---------- */
// One shared camera so the wireframe shell, the vote nodes and the depth dust
// all turn together as a single solid, which is what makes it read as an orb
// rather than a flat scatter. Perspective divide (1.5 − z·0.4) puts the near
// face closer and the far face smaller — the cue the eye needs for volume.
function rot3(x, y, z, ay, ax) {
  const x1 = x * Math.cos(ay) + z * Math.sin(ay), z1 = -x * Math.sin(ay) + z * Math.cos(ay)
  const y1 = y * Math.cos(ax) - z1 * Math.sin(ax), z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
  return { x: x1, y: y1, z: z2 }
}
function proj(p, R, cx, cy) {
  const d = 1 / (1.5 - p.z * 0.4)
  return { x: cx + p.x * R * d, y: cy + p.y * R * d, d, z: p.z }
}

// The depth dust: a fixed cloud of faint points on a shell a little larger than
// the brain, drifting with the same camera so the scene has parallax behind the
// wireframe. Generated once, deterministically — decoration, reading nothing.
let STARS = null
function stars() {
  if (STARS) return STARS
  STARS = []
  let s = 20240119
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  for (let i = 0; i < 120; i++) {
    const phi = Math.acos(1 - 2 * rnd()), theta = rnd() * Math.PI * 2
    const r = 1.35 + rnd() * 0.9
    STARS.push({ x: r * Math.sin(phi) * Math.cos(theta), y: r * Math.cos(phi), z: r * Math.sin(phi) * Math.sin(theta), s: 0.5 + rnd() * 1.1, tw: rnd() * 6.28 })
  }
  return STARS
}

/**
 * The signal core, drawn as a rotating orb. What is real and what is dressing:
 *
 *   REAL — one node per strategy, its colour the strategy's vote (mint BUY, red
 *   SELL, cyan HOLD), pushed out from the shell by confidence, dimmed to half
 *   radius when the regime disallows it; an edge between any two that agree, and
 *   a spark running that edge. The centre number and rotation speed are the
 *   fused score and the real tape cadence.
 *
 *   DRESSING — the wireframe shell (latitude/longitude grid), the shaded orb
 *   body and the depth dust. These carry no data; they exist only to give the
 *   real nodes a solid to sit on so the panel reads as a brain, not a chart.
 *
 * Rotation follows the tape's trades-per-minute when the tape is trusted and is
 * a constant slow turn otherwise.
 */
function drawCore(cv, c, t) {
  const f = fitCanvas(cv); if (!f) return
  const { ctx, w, h } = f
  ctx.clearRect(0, 0, w, h)
  // The visible shell projects to ~0.69R and the outermost nodes to ~0.77R, so
  // R can run to 0.58 of the height and the orb still clears the stage edges.
  const cx = w / 2, cy = h * 0.5, R = Math.min(w * 0.44, h * 0.58)
  const sec = t / 1000
  const speed = REDUCED ? 0 : c.flow.tapePerMin === null ? 0.22 : 0.16 + Math.min(0.9, c.flow.tapePerMin / 240)
  const breathe = REDUCED ? 1 : 1 + 0.045 * Math.sin(sec * (c.volatility.ratio || 1) * 1.4)
  const ay = REDUCED ? 0.7 : sec * speed
  // A slow camera nod instead of a continuous tumble — it reads as a spinning
  // globe you are looking slightly down onto, cleaner than an end-over-end roll.
  const ax = 0.44 + (REDUCED ? 0 : Math.sin(sec * 0.2) * 0.13 + Math.sin(sec * 0.063) * 0.05)
  // The winning side sets the mood colour; a flat market glows cyan so the brain
  // reads as lit rather than grey. BUY/SELL keep their meaning. A second accent
  // (violet, or a warm amber when short) gives the bloom depth instead of a flat wash.
  const rgb = c.panel.direction === 'long' ? MINT : c.panel.direction === 'short' ? RED : CYAN
  const acc = c.panel.direction === 'short' ? '245,158,66' : VIOLET
  const nodeCol = (a) => (a === 'BUY' ? MINT : a === 'SELL' ? RED : (a === 'HOLD' ? CYAN : VIOLET))

  // Central bloom behind the whole scene — mood colour into the accent into black,
  // so the light feels coloured and volumetric rather than a single tint.
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.7)
  bloom.addColorStop(0, `rgba(${rgb},0.20)`); bloom.addColorStop(0.32, `rgba(${acc},0.09)`); bloom.addColorStop(0.7, `rgba(${rgb},0.03)`); bloom.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, w, h)

  ctx.globalCompositeOperation = 'lighter'

  // A tight bright flare right behind the score, so the number sits on light.
  const flare = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55)
  flare.addColorStop(0, `rgba(${rgb},0.22)`); flare.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = flare; ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.fill()

  // Depth dust behind the orb (far half only; the near half is drawn last).
  const dust = stars().map((st) => ({ p: proj(rot3(st.x, st.y, st.z, ay * 0.6, ax * 0.6), R, cx, cy), st }))
  for (const { p, st } of dust) {
    if (p.z > 0.2) continue
    const tw = REDUCED ? 0.6 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(sec * 1.5 + st.tw))
    ctx.beginPath(); ctx.arc(p.x, p.y, st.s * p.d * 0.7, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${st.tw > 3.14 ? acc : CYAN},${(0.16 * p.d * tw).toFixed(3)})`; ctx.fill()
  }

  // The orb body: a soft lit sphere so the wireframe has volume under it.
  const body = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.3, R * 0.05, cx, cy, R * 1.02)
  body.addColorStop(0, `rgba(${rgb},0.16)`); body.addColorStop(0.5, `rgba(${acc},0.05)`); body.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()

  // The wireframe shell: latitude rings + longitude half-rings, depth-shaded so
  // the front of the cage is bright and the back fades. This is the orb. Two-tone
  // (mood latitudes, accent longitudes) reads richer than a single colour.
  const ring = (build, col, base) => {
    let prev = null
    for (let k = 0; k <= 48; k++) {
      const u = build(k / 48)
      const p = proj(rot3(u.x, u.y, u.z, ay, ax), R, cx, cy)
      if (prev) {
        const dep = (p.z + prev.z) / 2
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y)
        ctx.strokeStyle = `rgba(${col},${(base + 0.24 * Math.max(0, (dep + 1) / 2)).toFixed(3)})`
        ctx.lineWidth = 0.55 + 0.7 * Math.max(0, dep); ctx.stroke()
      }
      prev = p
    }
  }
  for (const lat of [-0.6, -0.3, 0, 0.3, 0.6]) {
    const cphi = Math.cos(lat * Math.PI / 2), sphi = Math.sin(lat * Math.PI / 2)
    ring((u) => { const th = u * Math.PI * 2; return { x: cphi * Math.cos(th), y: sphi, z: cphi * Math.sin(th) } }, rgb, 0.05)
  }
  for (let m = 0; m < 6; m++) {
    const lon = (m / 6) * Math.PI
    ring((u) => { const ph = (u - 0.5) * Math.PI; const cph = Math.cos(ph); return { x: cph * Math.cos(lon), y: Math.sin(ph), z: cph * Math.sin(lon) } }, acc, 0.035)
  }

  // Rim light: a bright arc down the leading edge of the silhouette, the way a
  // lit sphere catches light — the single strongest "this is a solid" cue. The
  // perspective divide shrinks the visible orb below R, so the arc rides at ~0.7R
  // to hug the real edge rather than float outside it.
  const rimR = R * 0.7
  const rim = ctx.createLinearGradient(cx - rimR, cy, cx + rimR, cy)
  rim.addColorStop(0, `rgba(${acc},0)`); rim.addColorStop(0.55, `rgba(${CYAN},0.12)`); rim.addColorStop(1, `rgba(${rgb},0.55)`)
  ctx.beginPath(); ctx.arc(cx, cy, rimR, -0.85, 1.3); ctx.strokeStyle = rim; ctx.lineWidth = 2.4; ctx.stroke()

  const votes = c.panel.votes
  if (!votes.length) { ctx.globalCompositeOperation = 'source-over'; return }

  // The real nodes: one per strategy, on (or just outside) the shell.
  const pts = votes.map((v, i) => {
    const n = votes.length
    const phi = Math.acos(1 - 2 * (i + 0.5) / n)
    const theta = i * 2.399963 + (v.action === 'SELL' ? Math.PI : 0)
    const r = (v.action === 'HOLD' ? 0.82 : 0.94 + 0.16 * Math.min(1, v.confidence / 100)) * (v.weight === 0 ? 0.55 : 1) * breathe
    const p = proj(rot3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta), ay, ax), R, cx, cy)
    return { ...p, v }
  })

  // Edges: brighter when both ends vote the same way, faint otherwise.
  const edges = []
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i], b = pts[j]
    const same = a.v.action !== 'HOLD' && a.v.action === b.v.action
    const depth = (a.d + b.d) / 2
    const alpha = (same ? 0.5 : 0.10) * depth
    const grd = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
    grd.addColorStop(0, `rgba(${nodeCol(a.v.action)},${alpha.toFixed(3)})`)
    grd.addColorStop(1, `rgba(${nodeCol(b.v.action)},${alpha.toFixed(3)})`)
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = grd; ctx.lineWidth = same ? 1.5 : 0.6; ctx.stroke()
    if (same) edges.push({ a, b, col: nodeCol(a.v.action) })
  }

  // Signal sparks running the agreeing edges as glowing streaks with a bright
  // head — the brain thinking. A longer comet tail and a lit tip read as motion.
  if (!REDUCED) {
    for (const e of edges) {
      const fr = (sec * 0.55 + (e.a.x + e.b.x) * 0.0016) % 1
      const tail = Math.max(0, fr - 0.22)
      const tx = e.a.x + (e.b.x - e.a.x) * tail, ty = e.a.y + (e.b.y - e.a.y) * tail
      const hx = e.a.x + (e.b.x - e.a.x) * fr, hy = e.a.y + (e.b.y - e.a.y) * fr
      const g = ctx.createLinearGradient(tx, ty, hx, hy)
      g.addColorStop(0, `rgba(${e.col},0)`); g.addColorStop(1, `rgba(${e.col},0.95)`)
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy)
      ctx.strokeStyle = g; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke()
      const head = ctx.createRadialGradient(hx, hy, 0, hx, hy, 5)
      head.addColorStop(0, `rgba(255,255,255,0.9)`); head.addColorStop(0.4, `rgba(${e.col},0.8)`); head.addColorStop(1, `rgba(${e.col},0)`)
      ctx.fillStyle = head; ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.lineCap = 'butt'
  }

  // Nodes, back to front, with a crisp core and a tight halo.
  for (const p of pts.slice().sort((a, b) => a.z - b.z)) {
    const col = nodeCol(p.v.action)
    const rad = (p.v.action === 'HOLD' ? 2.0 : 2.8) + p.d * 2.4
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 4.5)
    halo.addColorStop(0, `rgba(${col},${(0.55 * p.d).toFixed(3)})`); halo.addColorStop(0.4, `rgba(${col},${(0.18 * p.d).toFixed(3)})`); halo.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(p.x, p.y, rad * 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${col},${(0.6 + p.d * 0.4).toFixed(3)})`; ctx.fill()
    ctx.beginPath(); ctx.arc(p.x - rad * 0.28, p.y - rad * 0.28, rad * 0.42, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${(0.5 * p.d).toFixed(3)})`; ctx.fill()
  }

  // Depth dust in front of the orb, drawn last so it sparkles over the cage.
  for (const { p, st } of dust) {
    if (p.z <= 0.2) continue
    const tw = REDUCED ? 0.7 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(sec * 1.5 + st.tw))
    ctx.beginPath(); ctx.arc(p.x, p.y, st.s * p.d * 0.8, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${st.tw > 3.14 ? acc : CYAN},${(0.22 * p.d * tw).toFixed(3)})`; ctx.fill()
  }

  ctx.globalCompositeOperation = 'source-over'
}

function drawStatics() {
  const c = coreData; if (!c) return
  const vol = document.getElementById('dk-m-vol'); if (vol && c.volume.bars.length) drawVolume(vol, c.volume)
  const heat = document.getElementById('dk-m-heat'); if (heat && c.heat.days.length) drawHeat(heat, c.heat)
  const range = document.getElementById('dk-m-range'); if (range && c.range.bars.length) drawRange(range, c.range)
}

function frame(t) {
  coreFrame = null
  const c = coreData; if (!c) return
  const scope = document.getElementById('dk-core-canvas')
  if (!scope || !deskVisible()) return
  if (!coreT0) coreT0 = t
  drawCore(scope, c, t - coreT0)
  const pulse = document.getElementById('dk-m-pulse'); if (pulse && c.pulse.perMin !== null) drawPulse(pulse, c.pulse, t - coreT0)
  if (!REDUCED) coreFrame = requestAnimationFrame(frame)
}

function startCore() {
  if (coreFrame) cancelAnimationFrame(coreFrame)
  coreFrame = null
  drawStatics()
  coreFrame = requestAnimationFrame(frame)
}
function stopCore() { if (coreFrame) cancelAnimationFrame(coreFrame); coreFrame = null }
window.addEventListener('resize', () => { if (coreData && deskVisible()) { drawStatics(); if (REDUCED) startCore() } })

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
  <div class="dk dk2">
    ${hero(d)}

    ${pipeline(d)}

    ${c ? `<div class="dk2-grid">
      ${orbTile(c)}
      ${votesTile(c)}
    </div>` : ''}

    <h2 class="dk2-h">The crew <span>six of them, each watching one thing</span></h2>
    <div class="dk2-crew">${d.agents.map(agentTile).join('')}</div>

    ${c ? `<h2 class="dk2-h">The tape <span>closed candles and the live stream, nothing forecast</span></h2>
    <div class="dk2-grid dk2-charts">${chartsRow(c)}</div>
    <div class="dk2-grid dk2-proof">
      ${statsTile(c)}
      ${evidence(d)}
    </div>
    <p class="dk-core-note">${esc(c.note)}</p>` : `<div class="dk2-grid dk2-proof">${evidence(d)}</div>`}

    <section class="dk-accounts" id="dk-accounts" aria-live="polite"></section>

    <section class="dk-learn">
      <div class="dk-learn-head"><b>How it gets better</b><span>it proves strategies to itself before it trusts them — nothing here trades your money</span></div>
      <div class="dk-learn-row">
        <button class="dk-learn-card" data-tab="factory"><span class="dk-learn-i">⑂</span><b>Breeds &amp; tests</b><i>tries strategy variants on real history, keeps only the ones that survive out-of-sample</i></button>
        <button class="dk-learn-card" data-tab="research"><span class="dk-learn-i">◎</span><b>Questions itself</b><i>the lab raises questions from the record, checks them, and flags overfitting</i></button>
        <button class="dk-learn-card" data-tab="knowledge"><span class="dk-learn-i">✦</span><b>Remembers</b><i>every lesson and post-mortem is versioned; a setup that keeps failing gets refused</i></button>
      </div>
    </section>

    <p class="dk-foot">He reports what he sees. The engine decides, the safety checks can stop it, and nothing on this screen can place, size or shape an order.</p>
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
    out.innerHTML = render(j.data)
    out.dataset.spoken = [j.data.voice.floor, j.data.voice.trust, j.data.voice.evidence].join(' ')
    // The stamp lives inside the markup just redrawn, so look it up again rather than writing to the old copy.
    const stamp = document.getElementById('desk-status')
    if (stamp) stamp.textContent = `updated ${new Date(j.data.generatedAt).toLocaleTimeString()}`
    coreData = j.data.core || null
    // The accounts card (web/js/accounts.js) fills itself in; the desk only says it has drawn.
    document.dispatchEvent(new CustomEvent('desk:rendered'))
    if (deskVisible()) { startDeskRefresh(); if (coreData) startCore() } else { stopDeskRefresh(); stopCore() }
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
  setTimeout(() => { if (deskVisible()) { if (coreData && !coreFrame) startCore() } else stopCore() }, 0)
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
