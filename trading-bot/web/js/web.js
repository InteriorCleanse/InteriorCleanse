/**
 * WEB RESEARCH (Perplexity) on the Ask screen: presets, a free question, and
 * every answer with its sources. Research only; the engine never reads it.
 *
 * Any element anywhere with data-web-preset (and data-web-symbol when the
 * preset needs one) opens Ask and runs that lookup, so the stock desk and the
 * research desk can offer "Check the web" without their own fetch code.
 * Answers are third-party text: rendered escaped, links open in a new tab with
 * no referrer.
 */
import { esc } from './api.js'

const $ = (id) => document.getElementById(id)
let st = null, recent = [], busy = false, err = null, sym = ''

async function csrf() { const cfg = await fetch('/api/config', { credentials: 'same-origin' }).then((r) => r.json()); return cfg.csrf }
async function load() {
  try { const j = await fetch('/api/web', { credentials: 'same-origin' }).then((r) => r.json()); if (j.ok) { st = j.data.status; recent = j.data.recent } } catch { /* keeps the last picture */ }
  paint()
}
async function ask(body) {
  if (busy) return
  busy = true; err = null; paint()
  try {
    const res = await fetch('/api/web/ask', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': await csrf() }, body: JSON.stringify(body) })
    const j = await res.json()
    if (!j.ok) throw new Error(j.error || `HTTP ${res.status}`)
    recent = [j.data, ...recent.filter((a) => a.question !== j.data.question)].slice(0, 10)
  } catch (e) { err = e.message }
  busy = false
  await load()
}

const when = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

function answerCard(a) {
  return `<article class="wr-ans">
    <header><b>${esc(a.question)}</b><span>${when(a.at)}${a.cached ? ', from the cache' : ''}</span></header>
    <div class="wr-text">${esc(a.answer)}</div>
    ${a.citations.length ? `<ol class="wr-src">${a.citations.map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(c.title || host(c.url))}</a>${c.date ? ` <span>${esc(c.date)}</span>` : ''}</li>`).join('')}</ol>` : '<p class="wr-nosrc">No sources were given for this answer. Treat it with extra care.</p>'}
  </article>`
}

function paint() {
  const out = $('web-research'); if (!out) return
  const on = st?.available
  const presets = st?.presets || []
  out.innerHTML = `
  <div class="wr-head">
    <h2>Web research</h2>
    <span class="badge sc-prov">AI RESEARCH</span>
    <span class="wr-meta">${st ? (on ? `Perplexity ${esc(st.model)}, ${st.usedToday} of ${st.dailyCap} questions used today` : esc(st.reason)) : 'Checking…'}</span>
  </div>
  <p class="wr-lede">For what Kestrel's own feeds cannot see: why something moved, when a company reports, what is on the macro calendar. Every answer lists its sources. It is research for you to read, never a signal, and the engine does not see it.</p>
  <form class="wr-form" id="wr-form" autocomplete="off">
    <div class="wr-row">
      <input id="wr-sym" class="wr-sym" placeholder="Ticker, e.g. NVDA" aria-label="Ticker or market" maxlength="20" value="${esc(sym)}">
      ${presets.filter((p) => p.needsSymbol).map((p) => `<button type="button" class="ghost" data-wr="${p.id}" ${on && !busy ? '' : 'disabled'}>${esc(p.label)}</button>`).join('')}
    </div>
    <div class="wr-row">
      ${presets.filter((p) => !p.needsSymbol).map((p) => `<button type="button" class="ghost" data-wr="${p.id}" ${on && !busy ? '' : 'disabled'}>${esc(p.label)}</button>`).join('')}
    </div>
    <div class="wr-row">
      <input id="wr-q" class="wr-q" placeholder="Or ask anything that needs the web" aria-label="Question for web research" maxlength="600">
      <button class="btn" type="submit" ${on && !busy ? '' : 'disabled'}>${busy ? '<span class="spin">◌</span> Searching' : 'Search the web'}</button>
    </div>
  </form>
  ${err ? `<div class="err">${esc(err)}</div>` : ''}
  <div class="wr-list">${recent.length ? recent.map(answerCard).join('') : `<p class="cc-empty">${on ? 'No questions yet. Answers you ask for stay here for 30 minutes without costing anything again.' : 'Web research is off. Add PERPLEXITY_API_KEY to .env and restart Kestrel to turn it on.'}</p>`}</div>`
}

document.addEventListener('click', (e) => {
  const p = e.target.closest('[data-wr]')
  if (p && p.closest('#web-research')) { e.preventDefault(); sym = $('wr-sym')?.value.trim() || ''; ask({ preset: p.dataset.wr, symbol: sym }); return }
  // "Check the web" from any other screen.
  const g = e.target.closest('[data-web-preset]')
  if (g) {
    e.preventDefault()
    sym = g.dataset.webSymbol || ''
    if (window.showTab) window.showTab('ask')
    ask({ preset: g.dataset.webPreset, symbol: sym })
    requestAnimationFrame(() => $('web-research')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
})
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'wr-form') return
  e.preventDefault()
  const q = $('wr-q')?.value.trim()
  if (q) ask({ q })
})

if ($('web-research')) load()
