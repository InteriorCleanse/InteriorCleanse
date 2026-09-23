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

/* ---------- one crew member ---------- */
function card(a) {
  const c = CREW[a.id] || { hue: 210, glyph: '' }
  const blind = a.status === 'BLIND'
  const live = a.status === 'LIVE'
  const rows = (a.rows || []).map((r) => `
    <div class="dk-row"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`).join('')

  return `
  <article class="dk-card${blind ? ' blind' : ''}" style="--hue:${c.hue}">
    <div class="dk-card-top"></div>
    <header class="dk-card-head">
      <span class="dk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${c.glyph}"/></svg></span>
      <div class="dk-card-titles">
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.plain)}</p>
      </div>
      <span class="dk-state${live ? ' pulse' : ''}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
    </header>

    ${a.headline === '—'
      ? `<div class="dk-value none">No reading</div>`
      : `<div class="dk-value">${esc(a.headline)}</div>`}
    <p class="dk-say">${esc(a.line)}</p>
    ${a.waitingOn ? `<p class="dk-wait">Waiting on ${esc(a.waitingOn)}</p>` : ''}

    <details class="dk-more">
      <summary>Details</summary>
      <div class="dk-rows">${rows}</div>
      <p class="dk-detail">${esc(a.detail)}</p>
      <p class="dk-prov">${esc(a.provenance === 'REAL' ? 'Read straight from the source' : a.provenance === 'APPROXIMATE' ? 'Estimated from candles, not the live tape' : 'Nothing readable right now')}${a.ageSec === null || a.ageSec === undefined ? '' : ` · ${a.ageSec}s ago`}</p>
    </details>
  </article>`
}

/* ---------- the signal core: markup ---------- */
const prov = (p) => `<i class="${esc(p)}" title="${p === 'REAL' ? 'Read straight from the source' : p === 'APPROXIMATE' ? 'Estimated from candles, not the live tape' : 'Nothing readable right now'}">${esc(p)}</i>`
const fmtPx = (n) => (n >= 1000 ? '$' + Math.round(n).toLocaleString('en-US') : '$' + Number(n).toFixed(2))

function stat(s) {
  return `<div class="dk-stat"><div class="k"><span>${esc(s.label)}</span>${prov(s.provenance)}</div><div class="v${s.value === '—' ? ' none' : ''}">${esc(s.value)}</div><div class="s">${esc(s.sub)}</div></div>`
}

function mini(id, label, right, ok, none) {
  return `<div class="dk-mini"><div class="k"><span>${esc(label)}</span><b>${esc(right)}</b></div>${ok ? `<canvas id="${id}" aria-hidden="true"></canvas>` : `<div class="none">UNAVAILABLE<br>${esc(none)}</div>`}</div>`
}

function coreMarkup(c) {
  const n = c.panel.votes.length
  const colour = c.panel.direction === 'long' ? 'var(--brand)' : c.panel.direction === 'short' ? 'var(--red)' : 'var(--dim)'
  const votes = c.panel.votes.map((v) => {
    const cls = v.action === 'BUY' ? 'buy' : v.action === 'SELL' ? 'sell' : ''
    const off = v.weight === 0 ? ' off' : ''
    const label = v.action === 'HOLD' ? 'hold' : `${v.action.toLowerCase()} ${Math.round(v.confidence)}`
    return `<span class="dk-core-vote ${cls}${off}" title="${esc(v.name)}: ${esc(v.action)} at confidence ${Math.round(v.confidence)}, regime weight ${v.weight.toFixed(2)}${v.weight === 0 ? ' (not allowed in this regime)' : ''}">${esc(v.name)} · ${label}</span>`
  }).join('')
  const cap = [`${n} strateg${n === 1 ? 'y' : 'ies'}`, c.flow.trusted ? `tape ${c.flow.tapeLabel || 'read'}` : 'tape not read', c.volatility.label ? `volatility ${c.volatility.label}` : 'volatility —', c.panel.regime ? `regime ${c.panel.regime}` : ''].filter(Boolean).join(' · ')
  const rangeRight = c.range.high !== null ? `${fmtPx(c.range.low)} – ${fmtPx(c.range.high)}` : '—'
  const pulseRight = c.pulse.perMin === null ? '—' : `${Math.round(c.pulse.perMin)}/min · ${c.pulse.label || ''}`
  return `
  <section class="dk-core">
    <div class="dk-core-scope dk-core-hero" id="dk-scope" data-dir="${c.panel.direction || 'none'}">
      <div class="dk-core-cap">The brain · signal core<b>${esc(cap)}</b></div>
      <div class="dk-core-stage">
        <canvas id="dk-core-canvas" aria-hidden="true"></canvas>
        <div class="dk-core-mid">
          <div class="dk-core-num" style="color:${colour}">${c.panel.score === null ? '—' : c.panel.score}</div>
          <div class="dk-core-act">${esc(c.panel.action)}${c.panel.enterScore !== null ? ` · acts at ${c.panel.enterScore}` : ''}</div>
        </div>
      </div>
      <div class="dk-core-votes">${votes || '<span class="dk-core-vote">no votes for this candle</span>'}</div>
    </div>
    <div class="dk-stats">${stat(c.stats.fill)}${stat(c.stats.hit)}${stat(c.stats.expectancy)}${stat(c.stats.book)}</div>
    <div class="dk-minis">
      ${mini('dk-m-vol', 'Volume', c.volume.bars.length ? `${c.volume.bars.length} candles` : '—', c.volume.bars.length > 0, 'no stored candles')}
      ${mini('dk-m-heat', 'Heat · volume by NY hour', c.heat.days.length ? `${c.heat.days.length} day${c.heat.days.length === 1 ? '' : 's'}` : '—', c.heat.days.length > 0, 'no stored candles')}
      ${mini('dk-m-range', 'Range', rangeRight, c.range.bars.length > 0, 'no stored candles')}
      ${mini('dk-m-pulse', 'Pulse · tape', pulseRight, c.pulse.perMin !== null, c.flow.trusted ? 'no tape reading this candle' : 'stream not trusted')}
    </div>
    <p class="dk-core-note">${esc(c.note)}</p>
  </section>`
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
  ctx.fillStyle = `rgba(${GREY},.8)`; ctx.font = '9px ui-monospace,monospace'
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
  ctx.fillStyle = 'rgba(230,237,243,.92)'; ctx.font = '700 22px ui-monospace,monospace'; ctx.textBaseline = 'middle'
  ctx.fillText(`${Math.round(pulse.perMin)}`, 48, cy - 1)
  ctx.fillStyle = `rgba(${GREY},.9)`; ctx.font = '10px ui-monospace,monospace'
  ctx.fillText(`trades / min · ${pulse.label || ''}`, 48, cy + 17)
}

/**
 * The wireframe. One vertex per strategy, placed round a sphere and pushed out
 * by its confidence (a HOLD sits close to the centre); every pair joined, so
 * the panel reads as one tangled solid that tightens when the votes agree.
 * Rotation speed follows the tape's trades-per-minute when the tape is trusted
 * and is a constant slow turn otherwise. Three faint rings mark 33 / 66 / 100
 * of the agreement scale.
 */
function drawCore(cv, c, t) {
  const f = fitCanvas(cv); if (!f) return
  const { ctx, w, h } = f
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2, cy = h * 0.5, R = Math.min(w * 0.46, h * 0.52)
  const sec = t / 1000
  const speed = REDUCED ? 0 : c.flow.tapePerMin === null ? 0.20 : 0.14 + Math.min(1.0, c.flow.tapePerMin / 240)
  const breathe = REDUCED ? 1 : 1 + 0.04 * Math.sin(sec * (c.volatility.ratio || 1) * 1.6)
  // The winning side sets the mood colour; HOLD nodes glow cyan/violet so the
  // brain reads as lit rather than grey. BUY/SELL keep their meaning.
  const rgb = c.panel.direction === 'long' ? MINT : c.panel.direction === 'short' ? RED : CYAN
  const nodeCol = (a) => (a === 'BUY' ? MINT : a === 'SELL' ? RED : (a === 'HOLD' ? CYAN : VIOLET))

  // Central bloom behind the score.
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15)
  bloom.addColorStop(0, `rgba(${rgb},0.16)`); bloom.addColorStop(0.5, `rgba(${rgb},0.05)`); bloom.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, w, h)

  // Orbit rings.
  for (const k of [1 / 3, 2 / 3, 1]) {
    ctx.beginPath(); ctx.ellipse(cx, cy, R * k, R * k * 0.42, 0, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${CYAN},${k === 1 ? 0.16 : 0.09})`; ctx.lineWidth = 1; ctx.setLineDash(k === 1 ? [] : [3, 6]); ctx.stroke()
  }
  ctx.setLineDash([])
  // Radar sweep.
  if (!REDUCED) {
    const a = (sec * 0.8) % (Math.PI * 2)
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.42)
    g.addColorStop(0, `rgba(${rgb},.30)`); g.addColorStop(1, `rgba(${rgb},0)`)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.42); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.stroke()
  }

  const votes = c.panel.votes
  if (!votes.length) return
  const ay = sec * speed, ax = sec * speed * 0.37 + 0.6
  const pts = votes.map((v, i) => {
    const n = votes.length
    const phi = Math.acos(1 - 2 * (i + 0.5) / n)
    const theta = i * 2.399963 + (v.action === 'SELL' ? Math.PI : 0)
    const r = (v.action === 'HOLD' ? 0.78 : 0.86 + 0.14 * Math.min(1, v.confidence / 100)) * (v.weight === 0 ? 0.5 : 1) * breathe
    const x = r * Math.sin(phi) * Math.cos(theta), y = r * Math.cos(phi), z = r * Math.sin(phi) * Math.sin(theta)
    const x1 = x * Math.cos(ay) + z * Math.sin(ay), z1 = -x * Math.sin(ay) + z * Math.cos(ay)
    const y1 = y * Math.cos(ax) - z1 * Math.sin(ax), z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
    const p = 1 / (1.45 - z2 * 0.35)
    return { x: cx + x1 * R * p, y: cy + y1 * R * p, d: p, z: z2, v }
  })

  // Edges (additive glow): brighter when both ends vote the same way.
  ctx.globalCompositeOperation = 'lighter'
  const edges = []
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i], b = pts[j]
    const same = a.v.action !== 'HOLD' && a.v.action === b.v.action
    const depth = (a.d + b.d) / 2
    const alpha = (same ? 0.55 : 0.16) * depth
    const col = same ? nodeCol(a.v.action) : CYAN
    const grd = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
    grd.addColorStop(0, `rgba(${nodeCol(a.v.action)},${alpha.toFixed(3)})`)
    grd.addColorStop(1, `rgba(${nodeCol(b.v.action)},${alpha.toFixed(3)})`)
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = grd; ctx.lineWidth = same ? 1.6 : 0.8; ctx.stroke()
    if (same) edges.push({ a, b, col })
  }
  // Signal pulses travelling the agreeing edges — the brain "thinking".
  if (!REDUCED) {
    for (const e of edges) {
      const fr = ((sec * 0.5 + (e.a.x + e.b.x) * 0.0016) % 1)
      const px = e.a.x + (e.b.x - e.a.x) * fr, py = e.a.y + (e.b.y - e.a.y) * fr
      ctx.beginPath(); ctx.arc(px, py, 1.9, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${e.col},0.9)`; ctx.fill()
    }
  }
  // Nodes, back to front, glowing.
  for (const p of pts.sort((a, b) => a.z - b.z)) {
    const col = nodeCol(p.v.action)
    const rad = (p.v.action === 'HOLD' ? 2.0 : 2.6) + p.d * 2.6
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 4)
    halo.addColorStop(0, `rgba(${col},${(0.5 * p.d).toFixed(3)})`); halo.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(p.x, p.y, rad * 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${col},${(0.55 + p.d * 0.45).toFixed(3)})`; ctx.fill()
    ctx.beginPath(); ctx.arc(p.x - rad * 0.3, p.y - rad * 0.3, rad * 0.4, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${(0.4 * p.d).toFixed(3)})`; ctx.fill()
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

function render(d) {
  return `
  <div class="dk">
    <section class="dk-hero">
      <div class="dk-hero-say">
        <div class="dk-chips">
          <span class="dk-chip paper" title="Live market data; fills are simulated at the next candle open plus spread and slippage.">${esc(d.mode)} · simulated execution · no real money</span>
          <span class="dk-chip">${esc(d.symbol)} · ${esc(d.interval)}</span>
          <span class="dk-chip">${esc(d.floor.verdict)}</span>
        </div>
        <p class="dk-headline">${esc(d.voice.floor)}</p>
        <p class="dk-sub">${esc(d.voice.trust)}</p>
      </div>
      ${ring(d.floor.trust)}
    </section>

    ${d.core ? coreMarkup(d.core) : ''}

    ${evidence(d)}

    <h2 class="dk-crew-title">The crew <span>six of them, each watching one thing</span></h2>
    <div class="dk-crew">${d.agents.map(card).join('')}</div>

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
    if (status) status.textContent = `updated ${new Date(j.data.generatedAt).toLocaleTimeString()}`
    coreData = j.data.core || null
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
  if (b.classList.contains('dk-learn-card') && typeof window.showTab === 'function') window.showTab(b.dataset.tab)
  setTimeout(() => { if (deskVisible()) { if (coreData && !coreFrame) startCore() } else stopCore() }, 0)
})

window.loadDesk = loadDesk
/** What he'd say if you asked him to read the desk aloud. */
window.deskSpoken = () => document.getElementById('desk-out')?.dataset.spoken || ''
document.getElementById('btn-desk')?.addEventListener('click', loadDesk)
document.getElementById('btn-desk-read')?.addEventListener('click', () => {
  if (window.speakAs) window.speakAs(window.deskSpoken())
})
