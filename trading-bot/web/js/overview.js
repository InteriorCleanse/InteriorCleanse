/**
 * HOME COMMAND CENTER: what Kestrel is, what it is doing, and what happened.
 *
 * Three read-only layers around the core that desk.js draws:
 *  - the status rail (top): mode, operations, data, engine, open paper positions;
 *  - the desks table (under the core): every paper book as one row, each with
 *    its own starting size, never added up into a figure that does not exist;
 *  - the event timeline (lower), beside the launcher.
 *
 * Reads GET /api/overview, /api/health, /api/system, /api/live/status and
 * /api/events. Nothing here can place, size or change an order. Every state
 * is a word and a shape as well as a colour.
 */
import { esc } from './api.js'

const $ = (id) => document.getElementById(id)
const usd = (n, d = 2) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
const pc = (n) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
const tone = (n) => (n > 0.004 ? 'up' : n < -0.004 ? 'down' : 'flat')
const ny = (ms, withDay) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', ...(withDay ? { weekday: 'short' } : {}), hour: 'numeric', minute: '2-digit' })
const ct = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' CT'
const ago = (sec) => sec == null ? 'never' : sec < 90 ? `${Math.round(sec)} s` : sec < 5400 ? `${Math.round(sec / 60)} min` : sec < 172800 ? `${Math.round(sec / 3600)} h` : `${Math.round(sec / 86400)} days`
const glyph = (s) => `<i class="cc-g s-${s}" aria-hidden="true"></i>`
const json = (p) => fetch(p, { credentials: 'same-origin' }).then((r) => r.json()).then((j) => (j.ok === false ? null : j.data ?? j)).catch(() => null)

let st = { overview: null, health: null, system: null, live: null, events: null }

async function load() {
  const [overview, health, system, live, events] = await Promise.all(['/api/overview', '/api/health', '/api/system', '/api/live/status', '/api/events'].map(json))
  // A failed read keeps the last picture rather than blanking the screen.
  st = { overview: overview || st.overview, health: health || st.health, system: system || st.system, live: live || st.live, events: events || st.events }
  paint()
}

// ---------- status rail ----------
function cells() {
  const { health, system, live, overview } = st
  const out = []
  const gates = live?.gates || []
  const passed = gates.filter((g) => g.ok).length
  out.push({ k: 'Mode', v: 'Paper only', s: 'info', note: live ? `Live locked, ${passed} of ${gates.length} gates pass` : 'No real orders', tab: 'road' })

  const ops = health?.ops
  if (ops) {
    const s = ops.overall === 'HEALTHY' ? 'ok' : ops.overall === 'DEGRADED' || ops.overall === 'WARN' ? 'warn' : 'bad'
    out.push({ k: 'Operations', v: ops.overall.charAt(0) + ops.overall.slice(1).toLowerCase(), s, note: ops.alerts ? `${ops.alerts} alert${ops.alerts === 1 ? '' : 's'} open` : 'No alerts', tab: 'ops' })
  } else out.push({ k: 'Operations', v: 'Unknown', s: 'idle', note: 'Health has not answered', tab: 'ops' })

  const candles = system?.feeds?.candles
  const src = String(ops?.dataSource || '').toUpperCase()
  if (candles) {
    const s = candles.verdict === 'fresh' ? (src === 'MOCK' ? 'warn' : 'ok') : candles.verdict === 'stale' ? 'warn' : 'bad'
    const v = src === 'MOCK' ? 'Mock feed' : src ? src.charAt(0) + src.slice(1).toLowerCase() + ' feed' : 'Feed'
    out.push({ k: 'Data', v, s, note: candles.ageSec == null ? 'No candle read yet' : `Candles ${ago(candles.ageSec)} old`, tab: 'ops' })
  } else out.push({ k: 'Data', v: 'Unknown', s: 'idle', note: 'Feed age not reported', tab: 'ops' })

  if (health) {
    const late = health.watchStaleSec != null && health.watchStaleSec > health.watchEveryMinutes * 60 * 3
    const s = health.stop?.stopped ? 'bad' : late ? 'warn' : 'ok'
    const v = health.stop?.stopped ? 'Stopped' : late ? 'Running late' : 'Watching'
    out.push({ k: 'Engine', v, s, note: health.watchStaleSec == null ? 'No check yet' : `Last check ${ago(health.watchStaleSec)} ago`, tab: 'today' })
  }

  if (overview) {
    const open = overview.books.reduce((n, b) => n + (b.open || 0), 0)
    out.push({ k: 'Paper positions', v: `${open} open`, s: open ? 'info' : 'idle', note: `Across ${overview.books.length} desks, each its own book` })
  }
  return out
}

function rail() {
  return `<div class="cc-rail" role="group" aria-label="System status">${cells().map((c) => {
    const inner = `<span class="cc-k">${esc(c.k)}</span><b>${glyph(c.s)}${esc(c.v)}</b><small>${esc(c.note)}</small>`
    return c.tab ? `<button class="cc-cell s-${c.s}" data-tab="${c.tab}">${inner}</button>` : `<div class="cc-cell s-${c.s}">${inner}</div>`
  }).join('')}</div>`
}

// ---------- desks table ----------
function deskState(b) {
  const s = b.status
  if (s === 'NOT CONNECTED') return ['warn', 'Not connected']
  if (s === 'MAIN WINDOW ONLY') return ['idle', 'Main window only']
  if (s === 'PAUSED') return ['warn', 'Paused']
  if (b.open > 0) return ['info', 'Paper position']
  if (s === 'MARKET CLOSED') return ['idle', 'Waiting']
  if (s === 'PREMARKET') return ['ok', 'Analyzing']
  if (s === 'RUNNING' || s === 'LIVE' || s === 'TRADING HOURS') return ['ok', 'Observing']
  if (s === 'STARTING') return ['idle', 'Starting']
  return ['idle', s.charAt(0) + s.slice(1).toLowerCase()]
}

function spark(points, start) {
  if (!points || points.length < 2) return ''
  const W = 64, H = 18, vs = points.map((p) => p.v), lo = Math.min(start, ...vs), hi = Math.max(start, ...vs), span = hi - lo || 1
  const d = points.map((p, k) => `${k ? 'L' : 'M'}${((k / (points.length - 1)) * W).toFixed(1)},${(H - 2 - ((p.v - lo) / span) * (H - 4)).toFixed(1)}`).join('')
  return `<svg class="cc-spark ${tone((vs[vs.length - 1] / start - 1) * 100)}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/></svg>`
}

function desks() {
  const o = st.overview
  if (!o) return `<div class="cc-empty">Reading the desks…</div>`
  const auto = Object.fromEntries(o.autopilot.map((a) => [a.name, a]))
  const books = new Set(o.books.map((b) => b.label))
  const when = (a) => a?.paused ? 'Paused' : a?.next ? ct(a.next) : 'On its own clock'
  const rows = o.books.map((b) => {
    const [s, word] = deskState(b), a = auto[b.label]
    return `<tr data-tab="${b.tab}">
      <th scope="row"><button data-tab="${b.tab}">${esc(b.label)}</button><small>${esc(b.market)}</small></th>
      <td><span class="cc-tag s-${s}">${glyph(s)}${word}</span></td>
      <td class="num">${b.id === 'stocks' ? spark(o.equityCurve, b.start) : ''}${usd(b.now)}<small>of ${usd(b.start, 0)}</small><em class="chg-sm ${tone(b.changePct)}">${pc(b.changePct)}</em></td>
      <td class="num opt-sm ${tone(b.changePct)}">${pc(b.changePct)}</td>
      <td class="num opt-sm">${b.open}</td>
      <td class="opt">${esc(a?.schedule || '')}</td>
      <td class="opt nowrap">${esc(when(a))}</td>
    </tr>`
  })
  // Services that run on a schedule but keep no paper book of their own.
  const services = o.autopilot.filter((a) => !books.has(a.name)).map((a) => `<tr class="svc">
      <th scope="row"><span>${esc(a.name)}</span><small>No paper book</small></th>
      <td><span class="cc-tag s-${a.paused ? 'warn' : 'ok'}">${glyph(a.paused ? 'warn' : 'ok')}${a.paused ? 'Paused' : 'Observing'}</span></td>
      <td class="num faint">none</td><td class="num faint opt-sm">none</td><td class="num faint opt-sm">none</td>
      <td class="opt">${esc(a.schedule)}</td>
      <td class="opt nowrap">${esc(when(a))}</td>
    </tr>`)
  return `<div class="cc-h"><h2 id="cc-desks-h">Desks</h2><span>Each keeps its own paper book. Nothing here is added together.</span></div>
  <div class="cc-scroll"><table class="cc-tbl" aria-labelledby="cc-desks-h">
    <thead><tr><th scope="col">Desk</th><th scope="col">State</th><th scope="col" class="num">Paper equity</th><th scope="col" class="num opt-sm">Since start</th><th scope="col" class="num opt-sm">Open</th><th scope="col" class="opt">Runs</th><th scope="col" class="opt">Next</th></tr></thead>
    <tbody>${rows.join('')}${services.join('')}</tbody>
  </table></div>
  ${o.latest?.lines?.[0] ? `<p class="cc-note"><b>Stock desk, latest:</b> ${esc(o.latest.lines[0])}</p>` : ''}`
}

// ---------- event timeline ----------
const sev = (e) => /error|bad|critical|fail/.test(e.severity) ? 'bad' : /warn/.test(e.severity) ? 'warn' : /good|ok|success|win/.test(e.severity) ? 'ok' : 'idle'

function events() {
  const list = (st.events?.events || []).slice().sort((a, b) => b.time - a.time).slice(0, 8)
  const today = new Date().toDateString()
  const items = list.map((e) => `<li class="s-${sev(e)}">
      <time datetime="${new Date(e.time).toISOString()}" title="${esc(new Date(e.time).toString())}">${ny(e.time, new Date(e.time).toDateString() !== today)}</time>
      ${glyph(sev(e))}
      <div><b>${esc(e.title)}</b>${e.body ? `<p>${esc(e.body)}</p>` : ''}</div>
    </li>`).join('')
  return `<div class="cc-h"><h2 id="cc-ev-h">What happened</h2><span>Newest first, times in New York</span></div>
  ${items ? `<ol class="cc-tl" aria-labelledby="cc-ev-h">${items}</ol>` : '<p class="cc-empty">Nothing logged yet. Events land here as Kestrel works: alerts, paper positions, research runs.</p>'}`
}

// ---------- placement ----------
// desk.js redraws #desk-out wholesale; these two blocks are kept as nodes and
// put back after each redraw ('desk:rendered'), the way accounts.js fills its slot.
const desksEl = document.createElement('section'); desksEl.className = 'cc-desks'; desksEl.setAttribute('aria-labelledby', 'cc-desks-h')
const lowerEl = document.createElement('div'); lowerEl.className = 'cc-lower'
const eventsEl = document.createElement('section'); eventsEl.className = 'cc-events'; eventsEl.setAttribute('aria-labelledby', 'cc-ev-h')
lowerEl.append(eventsEl)

function place() {
  const tab = $('tab-desk'), out = $('desk-out'); if (!tab || !out) return
  const hero = out.querySelector('.hm-hero')
  if (hero) hero.after(desksEl); else out.before(desksEl)
  const go = $('home-go'); if (go && go.parentNode !== lowerEl) lowerEl.append(go)
  const more = out.querySelector('details.hm-more')
  if (more) more.before(lowerEl); else out.after(lowerEl)
}

// What changed since the last paint, so a new reading gets one brief highlight
// (a single move per change, never a loop; tokens.css stops it under reduced motion).
let prevTick = null, prevVals = {}
function paint() {
  const top = $('home-overview'); if (!top) return
  top.innerHTML = rail()
  desksEl.innerHTML = desks()
  eventsEl.innerHTML = events()
  place()
  const tick = st.health?.lastWatchAt ?? null
  if (prevTick !== null && tick !== null && tick > prevTick) top.querySelector('.cc-cell[data-tab="today"]')?.classList.add('cc-fresh')
  prevTick = tick
  const vals = Object.fromEntries((st.overview?.books || []).map((b) => [b.id, b.now]))
  desksEl.querySelectorAll('tbody tr[data-tab]').forEach((tr, i) => { const b = st.overview.books[i]; if (b && prevVals[b.id] !== undefined && prevVals[b.id] !== b.now) tr.classList.add('cc-fresh') })
  prevVals = vals
  // The backdrop (bg.js) dims when the candle feed is stale and sends one wave per new candle check.
  const v = st.system?.feeds?.candles?.verdict
  document.dispatchEvent(new CustomEvent('kestrel:state', { detail: { stale: v ? v !== 'fresh' : false, tick } }))
}

const top = $('home-overview')
if (top) {
  const go = (e) => { const t = e.target.closest('[data-tab]'); if (t && window.showTab) { e.preventDefault(); window.showTab(t.dataset.tab) } }
  top.addEventListener('click', go)
  // A row is a target too, so a click anywhere on it opens that desk; the name stays the keyboard target.
  desksEl.addEventListener('click', go)
  document.addEventListener('desk:rendered', place)
  load()
  setInterval(() => { if (!document.hidden && !$('tab-desk')?.classList.contains('hidden')) load() }, 60_000)
}
