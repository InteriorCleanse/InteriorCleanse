/**
 * HOME OVERVIEW — every paper book on one screen, and what runs without being asked.
 *
 * Reads GET /api/overview. Each book keeps its own starting size and says PAPER;
 * nothing here is added up into a figure that does not exist.
 */
import { esc } from './api.js'

const $ = (id) => document.getElementById(id)
const usd = (n, d = 2) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
const pc = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const tone = (n) => (n > 0.004 ? 'up' : n < -0.004 ? 'down' : 'flat')
const ct = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' CT'

function spark(points, start) {
  if (!points || points.length < 2) return '<div class="ov-spark-empty">The curve starts drawing after the first few cycles.</div>'
  const W = 360, H = 70, vs = points.map((p) => p.v), lo = Math.min(start, ...vs), hi = Math.max(start, ...vs), span = hi - lo || 1
  const x = (k) => (k / (points.length - 1)) * W, y = (v) => H - 4 - ((v - lo) / span) * (H - 8)
  const d = points.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  return `<svg class="ov-spark ${vs[vs.length - 1] >= start ? 'up' : 'down'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${W},${H}L0,${H}Z" class="fill"/><path d="${d}" class="line"/></svg>`
}

let data = null
async function load() {
  try { const j = await fetch('/api/overview', { credentials: 'same-origin' }).then((r) => r.json()); if (j.ok) data = j.data } catch { /* keeps the last picture */ }
  paint()
}

function paint() {
  const out = $('home-overview'); if (!out || !data) return
  const [lead, ...rest] = data.books
  out.innerHTML = `
  <div class="ov-lead" data-tab="${lead.tab}" role="button" tabindex="0" aria-label="Open the ${esc(lead.label)}">
    <div class="ov-lead-l">
      <div class="ov-eyebrow">${esc(lead.label)} <span class="badge sc-prov">PAPER</span><span class="ov-status${lead.status === 'NOT CONNECTED' ? ' warn' : ''}">${esc(lead.status.toLowerCase())}</span></div>
      <div class="ov-big">${usd(lead.now)}</div>
      <div class="ov-chg ${tone(lead.changePct)}">${pc(lead.changePct)} <span>since the ${usd(lead.start, 0)} start · ${lead.open} open</span></div>
      <div class="ov-market">${esc(lead.market)}</div>
    </div>
    <div class="ov-lead-r">${spark(data.equityCurve, lead.start)}</div>
  </div>
  <div class="ov-books">${rest.map((b) => `
    <button class="ov-book" data-tab="${b.tab}">
      <span class="ov-book-name">${esc(b.label)}</span>
      <b>${usd(b.now)}</b>
      <span class="ov-chg ${tone(b.changePct)}">${pc(b.changePct)}</span>
      <small>${esc(b.market)} · ${b.open} open</small>
    </button>`).join('')}
    <div class="ov-auto">
      <div class="ov-auto-h">Running on its own</div>
      <ul>${data.autopilot.map((a) => `<li><i class="${a.paused ? 'off' : 'on'}"></i><span><b>${esc(a.name)}</b> ${esc(a.schedule)}${a.next ? ` · next ${ct(a.next)}` : ''}${a.paused ? ' · paused' : ''}</span></li>`).join('')}</ul>
    </div>
  </div>
  ${data.latest ? `<div class="ov-latest"><span>Latest from the stock desk</span>${esc(data.latest.lines[0] || '')}</div>` : ''}`
}

const out = $('home-overview')
if (out) {
  out.addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t && window.showTab) window.showTab(t.dataset.tab) })
  out.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.ov-lead')) { e.preventDefault(); window.showTab && window.showTab(e.target.dataset.tab) } })
  load()
  setInterval(() => { if (!document.hidden && !$('tab-desk')?.classList.contains('hidden')) load() }, 60_000)
}
