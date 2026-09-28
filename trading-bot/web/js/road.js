/**
 * ROAD TO LIVE — one page with every step between paper and real money, read
 * live from the app's own records. It shows and explains; it cannot arm,
 * enable or place anything.
 */
import { getJson, esc } from './api.js'
import { buildRoad } from './road-math.js'

const $ = (id) => document.getElementById(id)
const STATUS = { done: 'Done', progress: 'In progress', waiting: 'Waiting on the record', owner: 'Your action' }
const WHO = { time: 'needs time on paper', you: 'needs you' }
let loadedAt = 0

async function safe(path) { try { const j = await getJson(path); return j && j.ok !== false ? (j.data ?? j) : null } catch { return null } }

async function load() {
  const root = $('road-out'); if (!root) return
  if (!root.innerHTML) root.innerHTML = '<div class="card"><p class="muted">Reading the records…</p></div>'
  const [validation, firstFill, checkpoints, live] = await Promise.all([safe('/api/validation'), safe('/api/ops/first-fill'), safe('/api/ops/checkpoints'), safe('/api/live/status')])
  loadedAt = Date.now()
  render(buildRoad({ validation, firstFill, checkpoints, live }))
}

function bar(f) { return `<span class="rd-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, f)) * 100)}%"></i></span>` }

function render(r) {
  const root = $('road-out'); if (!root) return
  root.innerHTML = `
  <div class="card rd-hero">
    <div class="rd-kicker">How close is live trading? · <span class="badge sc-prov">${esc(r.verdict)}</span></div>
    <h2 class="rd-big">${r.done} <small>of ${r.total} steps</small></h2>
    ${bar(r.done / r.total)}
    <p class="rd-line">${esc(r.line)}</p>
    <p class="muted rd-note">The software side is built and the live machinery ships switched off. What is left is evidence that takes time on paper, and decisions only you can make. Nothing on this page can switch anything on, and no step that is yours is ever marked done for you.</p>
  </div>
  <ol class="rd-steps">${r.steps.map((s, i) => `
    <li class="rd-step s-${s.status}${r.current && r.current.id === s.id ? ' now' : ''}">
      <div class="rd-num">${s.status === 'done' ? '✓' : i + 1}</div>
      <div class="rd-body">
        <div class="rd-head"><b>${esc(s.title)}</b><span class="rd-st">${esc(STATUS[s.status])}</span><span class="rd-who">${esc(WHO[s.who] || '')}</span></div>
        <p>${esc(s.summary)}</p>
        ${s.progress > 0 && s.status !== 'done' ? bar(s.progress) : ''}
        ${s.detail && s.detail.length ? `<ul class="rd-det">${s.detail.map((d) => `<li class="${d.met ? 'met' : ''}"><span>${d.met ? '✓' : '·'} ${esc(d.label)}</span><em>${d.value !== null && d.value !== undefined ? `${esc(d.value)} / ${esc(d.threshold)} ${esc(d.unit || '')}` : esc(d.unit || '')}</em></li>`).join('')}</ul>` : ''}
        <p class="rd-how">${esc(s.how)}</p>
      </div>
    </li>`).join('')}</ol>
  <div class="card"><h2>What will not happen</h2><ul class="cd-how">
    <li>Kestrel never arms itself. No green gate, schedule or research result switches live trading on.</li>
    <li>Passing every step is a passed validation stage, not proof that the strategy works, and never a promise of a return.</li>
    <li>Live starts at the smallest caps and only with money you can afford to lose. The full list is in docs/LIVE_READINESS.md.</li>
  </ul></div>`
}

function init() {
  const section = $('tab-road'); if (!section) return
  new MutationObserver(() => { if (!section.classList.contains('hidden') && Date.now() - loadedAt > 30_000) load() }).observe(section, { attributes: true, attributeFilter: ['class'] })
  if (!section.classList.contains('hidden')) load()
}

init()
