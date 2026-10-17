/**
 * THE FLOOR — Kestrel's agents as a trading floor, the owl as head trader.
 *
 * Every desk has one job and says where its data comes from. Above the desks,
 * the floor is a live galaxy: every desk is a world that glows while it reads
 * and goes dark when it cannot see, and the head trader's world curves across
 * the horizon. Each time a new reading arrives the owl takes off, flies world
 * to world in the order Kestrel's cycle uses them (collect → read → vote →
 * check), and lands on the head trader's world with the floor's call. Perched, its pose is the call: watching
 * a WATCH, leaning in for a ready LONG or SHORT, settled while a paper
 * position is open, eyes shut when most desks cannot see.
 *
 * What this file is not: a trader. It reads endpoints the app already has
 * (/api/desk, /api/second-opinion, /api/watcher, /api/news, /api/bigmoney,
 * /api/paper) and draws them. It has no thresholds of its own and no way to
 * place, block or size anything. JEV is the recorded second opinion; it never
 * trades. The order of the patrol is a picture of the cycle; the real cycle
 * runs in milliseconds on the server.
 */
import { getJson, esc } from './api.js'
import { mountOwl } from './owl.js'
import { mountGalaxy, WORLD_KINDS } from './galaxy.js'

const REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const STEPS = ['COLLECT', 'READ', 'VOTE', 'CHECK', 'DECIDE']
const STATUS = { LIVE: 'reading', PARTIAL: 'estimating', WAITING: 'standing by', BLIND: "can't see", OFF: 'not connected' }

const G = {
  book: 'M3 12h3l2-5 3 10 3-8 2 3h5',
  tape: 'M4 18V7m0 0 5 5 4-4 7 7',
  whales: 'M3 14c2.5 0 3-3 6-3s3.5 3 6 3 3-2 6-2M5 18c2 0 2.5-1.5 4.5-1.5S12 18 14 18M15 8.5c1-1.8 2.6-2.5 4-2',
  news: 'M5 5h11v14H6a1 1 0 0 1-1-1zM16 9h3v9a1 1 0 0 1-1 1h-2M8 9h5M8 12h5M8 15h3',
  quiver: 'M4 20h16M6 17V10M10 17V10M14 17V10M18 17V10M3 10l9-6 9 6z',
  regime: 'M3 15a4 4 0 0 1 4-4 5 5 0 0 1 9.5-1.5A3.5 3.5 0 0 1 20 15z',
  signal: 'M13 2 4 14h6l-1 8 9-12h-6z',
  jev: 'M12 4a5 5 0 0 0-5 5c0 1.8 1 3 2 4v3h6v-3c1-1 2-2.2 2-4a5 5 0 0 0-5-5zM10 19h4M12 1v1M4 9H3M21 9h-1',
  risk: 'M12 3 4 6v6c0 4 3.5 7.5 8 9 4.5-1.5 8-5 8-9V6z',
  proof: 'M5 21V9m7 12V3m7 18v-8',
  head: 'M5 9c0-3 3-5 7-5s7 2 7 5v6c0 3.5-3 6-7 6s-7-2.5-7-6zM9.3 10.5a2 2 0 1 0 .01 0M14.7 10.5a2 2 0 1 0 .01 0M11 14l1 1.5 1-1.5',
}

/** The floor, in patrol order. `src` is where each desk's data comes from. */
const DESKS = [
  { id: 'book',   name: 'BOOK',   role: 'Order-book trader',  task: 'Reads bids against asks on the live order book', step: 'COLLECT', src: ['binance.com'] },
  { id: 'tape',   name: 'TAPE',   role: 'Tape reader',        task: 'Counts aggressive buys against sells, trade by trade', step: 'COLLECT', src: ['binance.com'] },
  { id: 'whales', name: 'WHALES', role: 'Whale watcher',      task: 'Flags large prints on the tape and insider filings', step: 'COLLECT', src: ['binance.com', 'sec.gov'] },
  { id: 'news',   name: 'NEWS',   role: 'News desk',          task: 'Watches the economic calendar and crypto headlines', step: 'COLLECT', src: ['faireconomy.media', 'coindesk.com', 'cointelegraph.com'] },
  { id: 'quiver', name: 'QUIVER', role: 'Politician watcher', task: 'Reads disclosed congress trades for the names you follow', step: 'COLLECT', src: ['quiverquant.com'] },
  { id: 'regime', name: 'REGIME', role: 'Market weather',     task: 'Decides whether the market is trending, ranging or wild', step: 'READ', src: ['Kestrel engine'] },
  { id: 'signal', name: 'SIGNAL', role: 'Strategy desk',      task: "Gathers every strategy's vote on this candle", step: 'VOTE', src: ['Kestrel engine'] },
  { id: 'jev',    name: 'JEV',    role: 'AI second opinion',  task: 'Claude reads the same numbers and makes its own call', step: 'VOTE', src: ['anthropic.com'] },
  { id: 'risk',   name: 'RISK',   role: 'Risk manager',       task: 'Checks size, limits, spread and the kill switch', step: 'CHECK', src: ['Kestrel engine'] },
  { id: 'proof',  name: 'PROOF',  role: 'Scorekeeper',        task: 'Keeps the paper record and the validation gates', step: 'CHECK', src: ['Kestrel paper record'] },
]

// ---------------------------------------------------------------- data, each source on its own clock

const TTL = { desk: 20_000, opinion: 60_000, watcher: 120_000, news: 300_000, bigmoney: 600_000, paper: 60_000 }
const URL_OF = { desk: '/api/desk', opinion: '/api/second-opinion', watcher: '/api/watcher', news: '/api/news', bigmoney: '/api/bigmoney', paper: '/api/paper' }
const cache = {}
async function read(key, force = false) {
  const c = cache[key]
  if (!force && c && Date.now() - c.at < TTL[key]) return c.data
  try { const j = await getJson(URL_OF[key]); const data = j && j.ok !== false ? j.data : null; cache[key] = { at: Date.now(), data }; return data } catch { cache[key] = { at: Date.now(), data: c?.data ?? null }; return c?.data ?? null }
}

const ago = (sec) => (sec === null || sec === undefined ? '' : sec < 90 ? `${Math.round(sec)} s ago` : sec < 5400 ? `${Math.round(sec / 60)} min ago` : `${Math.round(sec / 3600)} h ago`)
const usd = (n) => `${n < 0 ? '−' : '+'}$${Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? (Math.abs(n) / 1e3).toFixed(0) + 'k' : Math.abs(n).toFixed(0)}`
const nyTime = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** What each desk shows, from the payloads. Never a zero standing in for "we don't know". */
function viewOf(id, d) {
  const desk = d.desk
  const agent = desk?.agents?.find((a) => a.id === id)
  if (agent) return { status: agent.status, headline: agent.headline, detail: agent.waitingOn ? `Waiting on ${agent.waitingOn}` : agent.detail || agent.line, age: agent.ageSec }
  if (id === 'whales') {
    const flow = desk?.core?.flow
    const ins = (d.bigmoney?.insiders ?? []).filter((x) => x.side === 'buy' || x.side === 'sell')
    const buys = ins.filter((x) => x.side === 'buy').length
    const big = flow && flow.largeNetUsd !== null && flow.largeNetUsd !== undefined
    return {
      status: flow?.trusted && big ? 'LIVE' : ins.length ? 'PARTIAL' : 'WAITING',
      headline: big ? `${usd(flow.largeNetUsd)} net` : '—',
      detail: `${big ? 'Large prints on the tape, net buyers minus sellers. ' : 'No trusted tape for large prints yet. '}${ins.length ? `${buys} insider buys, ${ins.length - buys} sells filed.` : 'No insider filings read yet.'}`,
      age: flow?.asOf ? (Date.now() - flow.asOf) / 1000 : null,
    }
  }
  if (id === 'news') {
    const n = d.news
    if (!n) return { status: 'WAITING', headline: '—', detail: 'The calendar and headlines have not been read yet.', age: null }
    const high = (n.upcoming ?? []).filter((e) => e.impact === 'High' && e.time >= Date.now())
    const next = high[0]
    return { status: n.errors?.length && !n.calendar?.length ? 'PARTIAL' : 'LIVE', headline: `${high.length} high-impact`, detail: next ? `Next: ${next.country} ${next.title}, ${nyTime(next.time)} NY.` : 'No high-impact release in the next 36 hours.', age: n.fetchedAt ? (Date.now() - n.fetchedAt) / 1000 : null }
  }
  if (id === 'quiver') {
    const w = d.watcher
    if (!w) return { status: 'WAITING', headline: '—', detail: 'The politician watcher has not reported yet.', age: null }
    if (w.quiver?.status !== 'CONNECTED') return { status: 'OFF', headline: '—', detail: 'Add MRCASH_QUIVER_KEY to .env to read congress trades.', age: null }
    const r = w.latest
    return { status: 'LIVE', headline: r ? (r.items.length ? `${r.items.length} new` : 'Nothing new') : '—', detail: `Watching ${w.settings?.names?.join(', ') || 'no one yet'}.${r && r.items[0] ? ` Latest: ${r.items[0].who} ${r.items[0].side} ${r.items[0].ticker}.` : ''}`, age: r ? (Date.now() - r.at) / 1000 : null }
  }
  if (id === 'jev') {
    const o = d.opinion
    if (!o) return { status: 'WAITING', headline: '—', detail: 'The second opinion has not reported yet.', age: null }
    const last = o.recent?.[0]
    if (!o.status?.available) return { status: 'OFF', headline: last?.opinion ? `${last.opinion.action}` : '—', detail: o.status?.reason || 'Not available.', age: last ? (Date.now() - last.at) / 1000 : null }
    return { status: 'LIVE', headline: last?.opinion ? `${last.opinion.action} ${Math.round(last.opinion.confidence * 100)}%` : '—', detail: last?.opinion ? `Kestrel said ${last.engine.action}. Recorded, never traded.` : o.status.reason, age: last ? (Date.now() - last.at) / 1000 : null }
  }
  return { status: 'WAITING', headline: '—', detail: '', age: null }
}

/** The owl's form, from the floor's call and the paper book. */
function formOf(d) {
  const f = d.desk?.floor
  if (!f) return 'perched'
  if ((f.blind?.length ?? 0) >= 4) return 'blind'
  if ((d.paper?.open?.length ?? 0) > 0) return 'holding'
  const v = String(f.verdict || '')
  if (/^(LONG|SHORT)\b/.test(v) && !/WATCH/.test(v)) return 'stooping'
  if (/WATCH/.test(v)) return 'watching'
  return 'perched'
}

// ---------------------------------------------------------------- markup

const icon = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${G[id]}"/></svg>`

function deskCard(desk, v) {
  return `<article class="fl-desk" data-desk="${desk.id}" data-status="${esc(v.status)}">
    <header><span class="fl-ico">${icon(desk.id)}</span><div class="fl-who"><b>${esc(desk.name)}</b><small>${esc(desk.role)}</small></div><span class="fl-pill"><i></i>${esc(STATUS[v.status] || v.status)}</span></header>
    <div class="fl-head">${esc(v.headline ?? '—')}</div>
    <p class="fl-detail">${esc(v.detail || '')}</p>
    <p class="fl-task"><span>Job</span>${esc(desk.task)}</p>
    <footer>${desk.src.map((s) => `<span class="fl-src">${esc(s)}</span>`).join('')}<span class="fl-age">${esc(ago(v.age))}</span></footer>
  </article>`
}

function headCard(d) {
  const f = d.desk?.floor
  const form = formOf(d)
  return `<article class="fl-desk fl-headdesk" data-desk="head" data-form="${form}">
    <header><span class="fl-ico">${icon('head')}</span><div class="fl-who"><b>HEAD TRADER</b><small>The owl: fuses the floor into one call</small></div><span class="fl-pill fl-form"><i></i>${esc(form)}</span></header>
    <div class="fl-verdict">${esc(f?.verdict ?? '—')}</div>
    <p class="fl-detail">${esc(f?.verdictDetail ?? 'Waiting for the first reading.')}</p>
    <div class="fl-meta"><span><b>${f ? f.trust : '—'}%</b> of the desk can see</span><span><b>${f?.gates ? `${f.gates.met}/${f.gates.total}` : '—'}</b> validation gates met</span><span class="fl-paper">PAPER · no real money</span></div>
  </article>`
}

/** A world's name tag in the sky. Pressing it brings that desk's card into view. */
function worldLabel(desk, v) {
  return `<button type="button" class="fl-world" data-world="${desk.id}" data-status="${esc(v.status)}" title="${esc(desk.task)}"><b>${esc(desk.name)}</b><span><i></i>${esc(STATUS[v.status] || v.status)}</span></button>`
}

function render(d) {
  return `<div class="fl" data-form="${formOf(d)}">
    <div class="fl-bar">
      <div class="fl-title"><b>The floor</b><span>${esc(d.desk?.symbol ?? 'BTCUSDT')} · ${esc(d.desk?.interval ?? '5m')} · every desk has one job</span></div>
      <ol class="fl-steps" aria-label="Kestrel's cycle">${STEPS.map((s) => `<li data-step="${s}">${s.toLowerCase()}</li>`).join('')}</ol>
    </div>
    <div class="fl-stage">
      <section class="fl-space" aria-label="The floor as a galaxy: each world is a desk, lit while it reads; the owl flies between them and lands on the head trader's world">
        <canvas class="fl-galaxy" aria-hidden="true"></canvas>
        <div class="fl-worlds">${DESKS.map((k) => worldLabel(k, viewOf(k.id, d))).join('')}</div>
        <div class="fl-homelabel" aria-hidden="true"><small>HEAD TRADER</small><b>${esc(d.desk?.floor?.verdict ?? '—')}</b></div>
        <canvas class="fl-owl" aria-hidden="true"></canvas>
        <img class="fl-owl-flat" src="/icon.svg" alt="" hidden>
      </section>
      ${headCard(d)}
      <div class="fl-grid">${DESKS.map((k) => deskCard(k, viewOf(k.id, d))).join('')}</div>
    </div>
    <p class="fl-note">Paper only. The desks show what Kestrel already computes and where each reading comes from; none of them can place, block or size a trade. JEV is a recorded second opinion and never trades. The galaxy and the owl's flight are a picture of the cycle, which runs in milliseconds on the server.</p>
  </div>`
}

// ---------------------------------------------------------------- the galaxy and the owl's patrol

let owl = null, galaxy = null, data = null, timer = null, patrolling = false, abort = false, lastSeen = 0, lastPatrol = 0
let L = null   // the sky's layout: stage size, each world's centre and radius, the home world
const OWL_W = () => (innerWidth < 640 ? 210 : 380)

/** Where each desk's world sits, as fractions of the sky (x of its width, y of its height), and its radius (of its height). */
const SKY = {
  wide: { book: [0.07, 0.27, 0.055], tape: [0.16, 0.60, 0.060], whales: [0.25, 0.22, 0.065], news: [0.33, 0.53, 0.055], quiver: [0.41, 0.21, 0.045], regime: [0.58, 0.20, 0.060], signal: [0.66, 0.48, 0.050], jev: [0.75, 0.23, 0.060], risk: [0.84, 0.56, 0.055], proof: [0.93, 0.27, 0.045] },
  tall: { book: [0.13, 0.08, 0.035], tape: [0.38, 0.13, 0.038], whales: [0.63, 0.08, 0.040], news: [0.87, 0.14, 0.034], quiver: [0.16, 0.28, 0.032], regime: [0.48, 0.31, 0.038], signal: [0.80, 0.28, 0.034], jev: [0.22, 0.47, 0.038], risk: [0.52, 0.50, 0.035], proof: [0.82, 0.46, 0.032] },
}
/** Where the head trader's world meets the sky, as a fraction of the sky's height. */
const HORIZON = 0.80
/** The home world's atmosphere is the floor's call. */
const TINT = { perched: [0.40, 0.68, 1.00], watching: [1.00, 0.72, 0.32], stooping: [1.00, 0.42, 0.26], holding: [0.32, 0.88, 0.72], blind: [0.45, 0.50, 0.62] }
/** How brightly a world shines, by its desk's status. */
const LIGHT = { LIVE: 1, PARTIAL: 0.78, WAITING: 0.5, BLIND: 0.14, OFF: 0.14 }

function stage() { return document.querySelector('#floor-out .fl-stage') }
function space() { return document.querySelector('#floor-out .fl-space') }
function visible() { const s = document.getElementById('tab-floor'); return !!s && !s.classList.contains('hidden') && document.visibilityState === 'visible' }

/** Lays the worlds out for the sky's current size and tells the galaxy. */
function layout() {
  const sp = space()
  if (!sp || !data) return null
  const W = sp.clientWidth, H = sp.clientHeight
  const table = W < 640 ? SKY.tall : SKY.wide
  const pos = {}
  for (const k of DESKS) {
    const [fx, fy, fr] = table[k.id]
    const r = Math.max(12, fr * H)
    pos[k.id] = { x: fx * W, y: fy * H, r }
    const tag = sp.querySelector(`.fl-world[data-world="${k.id}"]`)
    if (tag) { tag.style.left = `${(fx * W).toFixed(1)}px`; tag.style.top = `${(fy * H + r + 6).toFixed(1)}px` }
  }
  const R = Math.max(W * 0.75, H * 1.2), top = HORIZON * H
  const home = { x: W / 2, y: top + R, r: R, top }
  const hl = sp.querySelector('.fl-homelabel')
  if (hl) { hl.style.left = `${(W / 2).toFixed(1)}px`; hl.style.top = `${(top + 14).toFixed(1)}px` }
  L = { W, H, pos, home }
  galaxy?.setWorlds(DESKS.map((k) => ({ id: k.id, ...pos[k.id], kind: WORLD_KINDS[k.id], light: LIGHT[viewOf(k.id, data).status] ?? 0.5 })))
  galaxy?.setHome({ x: home.x, y: home.y, r: home.r, light: 1 }, TINT[formOf(data)])
  return L
}

function place(c, x, y, s = 1) { c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`; c.dataset.x = x; c.dataset.y = y; c.dataset.s = s }
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clampN = (x, a, b) => Math.max(a, Math.min(b, x))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const owlEl = () => space()?.querySelector('.fl-owl')
const posOf = (c) => ({ x: Number(c.dataset.x || 0), y: Number(c.dataset.y || 0) })

/**
 * Depth: the worlds are far away and the home world is close, so the owl
 * shrinks as it flies out to them and grows as it comes home. The canvas
 * scales about 50% 70% (the CSS transform-origin); the flying figure sits at
 * about 49% of its height and spans roughly ±28% of its height, ±30% of its width.
 */
const FIG = { cy: 0.49, half: 0.28, halfW: 0.30, origin: 0.70 }
const WORLD_SCALE = () => (innerWidth < 640 ? 0.62 : 0.55)

/** Where the owl's canvas goes so the small, distant owl hovers just above a world, inside the sky. */
function hoverSpot(id) {
  const c = owlEl(), w = c.offsetWidth, h = c.offsetHeight, p = L.pos[id], s = WORLD_SCALE()
  const cx = clampN(p.x, w * FIG.halfW * s + 6, L.W - w * FIG.halfW * s - 6)
  const cy = Math.max(p.y - p.r - h * FIG.half * s - 6, h * FIG.half * s + 6)
  return { x: cx - w / 2, y: cy - h * (FIG.origin - (FIG.origin - FIG.cy) * s), s }
}
/** Where it stands on the head trader's world, on the horizon, close to the camera. */
function homeSpot() {
  const c = owlEl(), w = c.offsetWidth, h = c.offsetHeight
  return { x: L.home.x - w / 2, y: L.home.top - h * 0.82, s: 1 }
}

/** Tells the galaxy where the owl is and how fast it moves, so the sky drifts after it and the stars streak. */
function track(c, x, y, vx, vy) {
  if (!galaxy) return
  galaxy.follow(x + c.offsetWidth / 2, y + c.offsetHeight / 2)
  galaxy.velocity(vx, vy)
}

/**
 * Flies the owl's canvas to a point along a swooping curve: two control points
 * pushed off the straight line (alternating sides, so a patrol weaves), a lift
 * over the middle, and a little depth as it comes toward you and goes back.
 * It banks into the curve because the steering follows the real velocity.
 */
let swoop = 1
function flyTo(target, opts = {}) {
  const c = owlEl()
  if (!c) return Promise.resolve()
  const { x: x0, y: y0 } = posOf(c)
  const dx = target.x - x0, dy = target.y - y0, dist = Math.hypot(dx, dy)
  const ms = opts.ms ?? Math.max(560, Math.min(1500, dist * 1.6))
  swoop = -swoop
  const nx = dist ? -dy / dist : 0, ny = dist ? dx / dist : 0
  const bend = (opts.bend ?? Math.min(120, dist * 0.3)) * swoop
  const lift = opts.lift ?? Math.min(80, dist * 0.22)
  const p1 = { x: x0 + dx * 0.3 + nx * bend, y: y0 + dy * 0.3 + ny * bend - lift }
  const p2 = { x: x0 + dx * 0.7 - nx * bend * 0.6, y: y0 + dy * 0.7 - ny * bend * 0.6 - lift }
  const bez = (t, a, b, q, d) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * q + t * t * t * d }
  const curve = opts.ease ?? ease, depth = opts.depth ?? 0.14
  const s0 = Number(c.dataset.s || 1), s1 = target.s ?? s0
  return new Promise((resolve) => {
    const t0 = performance.now()
    let px = x0, py = y0, pt = t0
    const tick = (now) => {
      if (abort) return resolve()
      const t = Math.min(1, (now - t0) / ms), e = curve(t)
      const x = bez(e, x0, p1.x, p2.x, target.x), y = bez(e, y0, p1.y, p2.y, target.y)
      place(c, x, y, (s0 + (s1 - s0) * e) * (1 + depth * Math.sin(t * Math.PI)))
      const vx = x - px, vy = y - py, sp = Math.hypot(vx, vy), dts = Math.max(0.008, (now - pt) / 1000); px = x; py = y; pt = now
      track(c, x, y, vx / dts, vy / dts)
      if (owl && sp > 0.05) owl.steer(clampN(vx / Math.max(sp, 3), -1, 1) * (t < 0.92 ? 1 : 0.3), clampN(vy / Math.max(sp, 3), -1, 1))
      if (t < 1) requestAnimationFrame(tick); else resolve()
    }
    requestAnimationFrame(tick)
  })
}

/** A loop-the-loop on screen: forward, up and over, back to where it started, in time with the owl's own turn. */
function loopAround(ms, r) {
  const c = owlEl()
  if (!c) return Promise.resolve()
  const { x: x0, y: y0 } = posOf(c), s0 = Number(c.dataset.s || 1)
  return new Promise((resolve) => {
    const t0 = performance.now()
    const tick = (now) => {
      if (abort) return resolve()
      const t = Math.min(1, (now - t0) / ms), a = ease(t) * Math.PI * 2
      const x = x0 + Math.sin(a) * r, y = y0 - (1 - Math.cos(a)) * r
      place(c, x, y, s0 * (1 + 0.08 * Math.sin(a / 2)))
      track(c, x, y, Math.cos(a) * r * 6, -Math.sin(a) * r * 6)
      if (t < 1) requestAnimationFrame(tick); else { place(c, x0, y0, s0); resolve() }
    }
    requestAnimationFrame(tick)
  })
}

function step(name) { document.querySelectorAll('#floor-out .fl-steps li').forEach((li) => li.classList.toggle('on', li.dataset.step === name)) }

/** The owl reaches a world: it rings with light, its tag lights up, and so does its desk's card. */
function arrive(id) {
  galaxy?.pulse(id)
  space()?.querySelector(`.fl-world[data-world="${id}"]`)?.classList.add('on')
  stage()?.querySelector(`.fl-desk[data-desk="${id}"]`)?.classList.add('fl-visit')
}
function leave(id) {
  const tag = space()?.querySelector(`.fl-world[data-world="${id}"]`)
  tag?.classList.remove('on'); tag?.classList.add('seen')
  const card = stage()?.querySelector(`.fl-desk[data-desk="${id}"]`)
  card?.classList.remove('fl-visit'); card?.classList.add('fl-seen')
}

async function patrol() {
  const st = stage()
  if (!st || patrolling || !L) return
  const head = st.querySelector('.fl-headdesk')
  if (REDUCE || !owl) {
    for (const k of DESKS) { st.querySelector(`[data-desk="${k.id}"]`)?.classList.add('fl-seen'); space()?.querySelector(`.fl-world[data-world="${k.id}"]`)?.classList.add('seen') }
    step('DECIDE')
    return
  }
  patrolling = true; abort = false; lastPatrol = Date.now()
  space()?.querySelectorAll('.fl-world.seen').forEach((t) => t.classList.remove('seen'))
  const form = formOf(data)
  owl.takeOff()
  await wait(260)   // the crouch, then the jump
  // world to world in cycle order; the longest leg gets a barrel roll
  let prev = posOf(owlEl()), rollAt = -1, longest = 0
  DESKS.forEach((k, i) => { const p = hoverSpot(k.id); const d = Math.hypot(p.x - prev.x, p.y - prev.y); if (i > 0 && d > longest) { longest = d; rollAt = i } prev = p })
  for (const [i, k] of DESKS.entries()) {
    if (abort) break
    step(k.step)
    const flight = flyTo(hoverSpot(k.id))
    if (i === rollAt) { await wait(160); owl.trick('roll') }
    await flight
    arrive(k.id)
    owl.glance(0, 0.3, 420)
    await wait(380)
    leave(k.id)
  }
  step('DECIDE')
  const perch = homeSpot()
  if (abort) { place(owlEl(), perch.x, perch.y); owl.steer(0, 0); owl.land(); patrolling = false; return }
  if (form === 'stooping') {
    // a setup is ready: climb off to one side, loop, then dive onto the home world
    await flyTo({ x: perch.x - Math.min(260, L.W * 0.22), y: perch.y - 90, s: 0.8 })
    const ms = owl.trick('loop')
    if (ms) await loopAround(ms, 70)
    owl.trick('stoop')
    await flyTo(perch, { ms: 560, bend: 0, lift: 0, depth: 0.22, ease: (t) => t * t })
  } else await flyTo(perch)
  if (abort) { place(owlEl(), perch.x, perch.y) }
  owl.steer(0, 0)
  owl.land()
  head?.classList.add('fl-visit'); setTimeout(() => head?.classList.remove('fl-visit'), 1200)
  await wait(1150)
  // the landing beat, by form: the call for a setup, a scan for a watch, a shake for a held position
  const beat = { stooping: 'spread', watching: 'scan', holding: 'shake', perched: 'hoot', blind: '' }[form]
  if (beat && !abort) { const ms = owl.trick(beat); if (ms) await wait(ms) }
  patrolling = false
}

function mountScene() {
  const sp = space()
  if (!sp) return
  const g = sp.querySelector('.fl-galaxy'), c = sp.querySelector('.fl-owl')
  galaxy?.destroy?.(); owl?.destroy?.()
  galaxy = mountGalaxy(g)
  if (!galaxy) g.hidden = true
  const w = OWL_W(); c.style.width = `${w}px`; c.style.height = `${Math.round(w / 1.53)}px`
  owl = mountOwl(c, { state: formOf(data), home: -0.35, perch: false })
  layout()
  if (!owl) { c.hidden = true; sp.querySelector('.fl-owl-flat').hidden = false; return }
  const p = homeSpot(); place(c, p.x, p.y)
  sp.onpointermove = (e) => {
    if (!owl) return
    sp.classList.toggle('fl-over-owl', onOwl(e))
    if (patrolling) return
    const r = c.getBoundingClientRect()
    owl.point(((e.clientX - (r.left + r.width / 2)) / r.width), ((e.clientY - (r.top + r.height / 2)) / r.height))
  }
  sp.onpointerleave = () => { owl?.point(null); sp.classList.remove('fl-over-owl') }
  // tap a world: the owl flies over to it; tap the owl: it reacts; tap the sky: it looks there
  sp.onclick = (e) => {
    const tag = e.target.closest('.fl-world')
    if (tag) { visit(tag.dataset.world); return }
    if (!owl) return
    if (onOwl(e)) { poke(); return }
    const r = sp.getBoundingClientRect(), o = owlEl().getBoundingClientRect()
    owl.glance(clampN(((e.clientX - (o.left + o.width / 2)) / (r.width / 2)) * 1.2, -1.2, 1.2), clampN(((e.clientY - (o.top + o.height / 2)) / (r.height / 2)) * 0.5, -0.4, 0.5), 1100)
  }
}

/** Is the pointer on the owl itself (an ellipse around the figure, not the whole canvas)? */
function onOwl(e) {
  const c = owlEl()
  if (!c || c.hidden) return false
  const r = c.getBoundingClientRect()
  const nx = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.24), ny = (e.clientY - (r.top + r.height * 0.55)) / (r.height * 0.40)
  return nx * nx + ny * ny <= 1
}

/** Tapping the owl: a different move each time, a barrel roll if it is flying. */
let pokes = 0
function poke() {
  if (patrolling) { owl.trick('roll'); return }
  const moves = ['hoot', 'hop', 'swivel', 'spread', 'shake']
  owl.trick(moves[pokes++ % moves.length])
}

/** Tapping a world: the owl flies over to it, lights it, looks it over and flies home. */
async function visit(id) {
  if (!L) return
  if (patrolling || !owl || REDUCE) { arrive(id); setTimeout(() => leave(id), 900); return }
  patrolling = true; abort = false
  owl.takeOff()
  await wait(260)
  await flyTo(hoverSpot(id))
  if (!abort) { arrive(id); owl.glance(0, 0.3, 700); await wait(1000); leave(id) }
  const home = homeSpot()
  await flyTo(home)
  if (abort) place(owlEl(), home.x, home.y)
  owl.steer(0, 0); owl.land()
  await wait(1150)
  patrolling = false
}

// ---------------------------------------------------------------- load, refresh, stop

async function gather(force = false) {
  const [desk, opinion, watcher, news, bigmoney, paper] = await Promise.all(['desk', 'opinion', 'watcher', 'news', 'bigmoney', 'paper'].map((k) => read(k, force && k === 'desk')))
  return { desk, opinion, watcher, news, bigmoney, paper }
}

/** Refresh the desks, the worlds and the call in place (no full redraw while the owl is flying). */
function update(d) {
  const st = stage()
  if (!st) return
  for (const k of DESKS) {
    const v = viewOf(k.id, d)
    const el = st.querySelector(`.fl-desk[data-desk="${k.id}"]`)
    if (el) {
      const fresh = document.createElement('div'); fresh.innerHTML = deskCard(k, v)
      const n = fresh.firstElementChild; n.className = el.className
      el.replaceWith(n)
    }
    const tag = space()?.querySelector(`.fl-world[data-world="${k.id}"]`)
    if (tag) { tag.dataset.status = v.status; tag.querySelector('span').innerHTML = `<i></i>${esc(STATUS[v.status] || v.status)}` }
  }
  const head = st.querySelector('.fl-headdesk')
  if (head) {
    const fresh = document.createElement('div'); fresh.innerHTML = headCard(d)
    head.querySelector('.fl-verdict').textContent = fresh.querySelector('.fl-verdict').textContent
    head.querySelector('.fl-detail').textContent = fresh.querySelector('.fl-detail').textContent
    head.querySelector('.fl-meta').innerHTML = fresh.querySelector('.fl-meta').innerHTML
    head.querySelector('.fl-form').innerHTML = fresh.querySelector('.fl-form').innerHTML
    head.dataset.form = formOf(d)
  }
  const hl = space()?.querySelector('.fl-homelabel b')
  if (hl) hl.textContent = d.desk?.floor?.verdict ?? '—'
  st.closest('.fl').dataset.form = formOf(d)
  layout()
  owl?.setState(formOf(d))
}

export async function loadFloor() {
  const out = document.getElementById('floor-out')
  if (!out) return
  data = await gather(true)
  if (!out.querySelector('.fl')) {
    out.innerHTML = render(data)
    mountScene()
    lastSeen = data.desk?.generatedAt ?? 0
    setTimeout(() => { if (visible()) patrol() }, 900)
  } else update(data)
  startRefresh()
}

async function refresh() {
  if (!visible()) { stopRefresh(); abort = true; return }
  data = await gather()
  update(data)
  const g = data.desk?.generatedAt ?? 0
  if (g !== lastSeen && Date.now() - lastPatrol > 25_000) { lastSeen = g; patrol() }
}

function startRefresh() { stopRefresh(); timer = setInterval(refresh, 20_000) }
function stopRefresh() { if (timer) { clearInterval(timer); timer = null } }

document.addEventListener('visibilitychange', () => { if (visible()) { loadFloor() } else { stopRefresh(); abort = true } })
addEventListener('resize', () => { if (!space() || patrolling) return; layout(); const c = owlEl(); if (c && L) { const p = homeSpot(); place(c, p.x, p.y) } })
document.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b && b.dataset.tab !== 'floor') { abort = true; stopRefresh() } })

window.loadFloor = loadFloor
