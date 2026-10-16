/**
 * THE FLOOR — Kestrel's agents as a trading floor, the owl as head trader.
 *
 * Every desk has one job and says where its data comes from. Each time a new
 * reading arrives the owl takes off, visits the desks in the order Kestrel's
 * cycle uses them (collect → read → vote → check), and lands on the head
 * trader's desk with the floor's call. Perched, its pose is the call: watching
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
    <div class="fl-perch" aria-hidden="true"></div>
  </article>`
}

function render(d) {
  return `<div class="fl" data-form="${formOf(d)}">
    <div class="fl-bar">
      <div class="fl-title"><b>The floor</b><span>${esc(d.desk?.symbol ?? 'BTCUSDT')} · ${esc(d.desk?.interval ?? '5m')} · every desk has one job</span></div>
      <ol class="fl-steps" aria-label="Kestrel's cycle">${STEPS.map((s) => `<li data-step="${s}">${s.toLowerCase()}</li>`).join('')}</ol>
    </div>
    <div class="fl-stage">
      ${headCard(d)}
      <div class="fl-grid">${DESKS.map((k) => deskCard(k, viewOf(k.id, d))).join('')}</div>
      <canvas class="fl-owl" aria-hidden="true"></canvas>
      <img class="fl-owl-flat" src="/icon.svg" alt="" hidden>
    </div>
    <p class="fl-note">Paper only. The desks show what Kestrel already computes and where each reading comes from; none of them can place, block or size a trade. JEV is a recorded second opinion and never trades. The owl's flight is a picture of the cycle, which runs in milliseconds on the server.</p>
  </div>`
}

// ---------------------------------------------------------------- the owl's patrol

let owl = null, data = null, timer = null, patrolling = false, abort = false, lastSeen = 0, lastPatrol = 0
const OWL_W = () => (innerWidth < 640 ? 170 : 270)

function stage() { return document.querySelector('#floor-out .fl-stage') }
function visible() { const s = document.getElementById('tab-floor'); return !!s && !s.classList.contains('hidden') && document.visibilityState === 'visible' }

/** Where the owl's canvas goes to sit on (or hover over) an element, in stage coordinates. */
function spotFor(el, perch) {
  const st = stage(), c = st.querySelector('.fl-owl')
  const sr = st.getBoundingClientRect(), r = el.getBoundingClientRect()
  const w = c.offsetWidth, h = c.offsetHeight
  if (perch) { const p = el.querySelector('.fl-perch').getBoundingClientRect(); return { x: p.left - sr.left + p.width / 2 - w / 2, y: p.top - sr.top - h * 0.82 } }
  return { x: r.left - sr.left + r.width / 2 - w / 2, y: r.top - sr.top - h * 0.55 }
}

function place(c, x, y) { c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`; c.dataset.x = x; c.dataset.y = y }
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function flyTo(target) {
  const c = stage()?.querySelector('.fl-owl')
  if (!c) return Promise.resolve()
  const x0 = Number(c.dataset.x || 0), y0 = Number(c.dataset.y || 0)
  const dx = target.x - x0, dy = target.y - y0, dist = Math.hypot(dx, dy)
  const ms = Math.max(420, Math.min(1150, dist * 1.4))
  return new Promise((resolve) => {
    const t0 = performance.now()
    const tick = (now) => {
      if (abort) return resolve()
      const t = Math.min(1, (now - t0) / ms), e = ease(t)
      // a gentle arc so it flies, not slides
      const lift = Math.sin(t * Math.PI) * Math.min(60, dist * 0.18)
      place(c, x0 + dx * e, y0 + dy * e - lift)
      if (owl) owl.steer(dist ? (dx / dist) * (t < 0.92 ? 1 : 0.3) : 0, dist ? dy / dist : 0)
      if (t < 1) requestAnimationFrame(tick); else resolve()
    }
    requestAnimationFrame(tick)
  })
}

function step(name) { document.querySelectorAll('#floor-out .fl-steps li').forEach((li) => li.classList.toggle('on', li.dataset.step === name)) }

async function patrol() {
  const st = stage()
  if (!st || patrolling) return
  const head = st.querySelector('.fl-headdesk')
  if (REDUCE || !owl) {
    for (const k of DESKS) { st.querySelector(`[data-desk="${k.id}"]`)?.classList.add('fl-seen') }
    step('DECIDE')
    return
  }
  patrolling = true; abort = false; lastPatrol = Date.now()
  owl.takeOff()
  await wait(380)
  for (const k of DESKS) {
    if (abort) break
    const el = st.querySelector(`[data-desk="${k.id}"]`)
    if (!el) continue
    step(k.step)
    await flyTo(spotFor(el, false))
    el.classList.add('fl-visit')
    owl.glance(0, 0.35, 420)
    await wait(460)
    el.classList.remove('fl-visit'); el.classList.add('fl-seen')
  }
  step('DECIDE')
  if (abort) { const c = st.querySelector('.fl-owl'), p = spotFor(head, true); place(c, p.x, p.y); owl.steer(0, 0); owl.land(); patrolling = false; return }
  await flyTo(spotFor(head, true))
  owl.steer(0, 0)
  owl.land()
  head.classList.add('fl-visit'); setTimeout(() => head.classList.remove('fl-visit'), 1200)
  await wait(1100)
  patrolling = false
}

function mountTheOwl() {
  const st = stage()
  const c = st?.querySelector('.fl-owl')
  if (!c) return
  const w = OWL_W(); c.style.width = `${w}px`; c.style.height = `${Math.round(w / 1.53)}px`
  owl?.destroy?.()
  owl = mountOwl(c, { state: formOf(data), home: -0.35 })
  if (!owl) { c.hidden = true; st.querySelector('.fl-owl-flat').hidden = false; return }
  const p = spotFor(st.querySelector('.fl-headdesk'), true); place(c, p.x, p.y)
  st.onpointermove = (e) => { if (!owl || patrolling) return; const r = c.getBoundingClientRect(); owl.point(((e.clientX - (r.left + r.width / 2)) / r.width), ((e.clientY - (r.top + r.height / 2)) / r.height)) }
  st.onpointerleave = () => owl?.point(null)
}

// ---------------------------------------------------------------- load, refresh, stop

async function gather(force = false) {
  const [desk, opinion, watcher, news, bigmoney, paper] = await Promise.all(['desk', 'opinion', 'watcher', 'news', 'bigmoney', 'paper'].map((k) => read(k, force && k === 'desk')))
  return { desk, opinion, watcher, news, bigmoney, paper }
}

/** Refresh the desks in place (no full redraw while the owl is flying). */
function update(d) {
  const st = stage()
  if (!st) return
  for (const k of DESKS) {
    const el = st.querySelector(`[data-desk="${k.id}"]`)
    if (!el) continue
    const fresh = document.createElement('div'); fresh.innerHTML = deskCard(k, viewOf(k.id, d))
    const n = fresh.firstElementChild; n.className = el.className
    el.replaceWith(n)
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
  st.closest('.fl').dataset.form = formOf(d)
  owl?.setState(formOf(d))
}

export async function loadFloor() {
  const out = document.getElementById('floor-out')
  if (!out) return
  data = await gather(true)
  if (!out.querySelector('.fl')) {
    out.innerHTML = render(data)
    mountTheOwl()
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
addEventListener('resize', () => { const st = stage(); if (!st || patrolling) return; const c = st.querySelector('.fl-owl'); const p = spotFor(st.querySelector('.fl-headdesk'), true); place(c, p.x, p.y) })
document.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b && b.dataset.tab !== 'floor') { abort = true; stopRefresh() } })

window.loadFloor = loadFloor
