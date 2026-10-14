/**
 * AI SECOND OPINION on Home: Claude's own call on the state Kestrel saw, next
 * to Kestrel's, and how both have scored. Paper research; nothing here can
 * place, block or size an order.
 *
 * Reads GET /api/second-opinion. "Ask now" posts /api/second-opinion/ask with
 * the CSRF token and counts against the same daily cap. Under 30 scored calls
 * it shows tallies, not percentages.
 */
import { esc } from './api.js'

const $ = (id) => document.getElementById(id)
const ny = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })
const glyph = (s) => `<i class="cc-g s-${s}" aria-hidden="true"></i>`
const CALL = { BUY: 'ok', SELL: 'bad', HOLD: 'idle' }
const tag = (call, text) => `<span class="cc-tag s-${CALL[call] || 'idle'}">${glyph(CALL[call] || 'idle')}${esc(text || call)}</span>`
const pct = (x) => `${Math.round(x * 100)}%`
let data = null, busy = false, err = null

async function load() {
  try { const j = await fetch('/api/second-opinion', { credentials: 'same-origin' }).then((r) => r.json()); if (j.ok) data = j.data } catch { /* keep the last picture */ }
  paint()
}
async function askNow() {
  if (busy) return
  busy = true; err = null; paint()
  try {
    const cfg = await fetch('/api/config', { credentials: 'same-origin' }).then((r) => r.json())
    const j = await fetch('/api/second-opinion/ask', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: '{}' }).then((r) => r.json())
    if (!j.ok) throw new Error(j.error || 'The request failed.')
  } catch (e) { err = e.message }
  busy = false
  await load()
}

function outcomeOf(r) {
  if (r.error) return `<span class="faint">no answer: ${esc(r.error)}</span>`
  if (!r.outcome) return `<span class="faint">scored after ${r.state.scoring.horizonCandles} candles</span>`
  const o = r.outcome
  return `${o.returnPct > 0 ? '+' : ''}${o.returnPct.toFixed(2)}% → ${esc(o.truth)} · Claude ${o.aiRight ? 'right' : 'wrong'}, Kestrel ${o.engineRight ? 'right' : 'wrong'}`
}

function latest(r) {
  if (!r) return '<p class="cc-empty">No opinion yet. Claude is asked when Kestrel sees a setup forming, at most every 30 minutes, or when you press Ask now.</p>'
  const o = r.opinion
  const agree = o && o.action === r.engine.call
  const lv = o?.keyLevels ? Object.entries(o.keyLevels).filter(([, v]) => v).map(([k, v]) => `${k} ${Number(v).toLocaleString('en-US')}`).join(' · ') : ''
  return `<div class="so-pair">
    <div class="so-side">
      <span class="cc-k">Claude</span>
      ${o ? `<div class="so-call">${tag(o.action)}<b>${pct(o.confidence)}</b><small>its own confidence, not a measured probability</small></div>
      ${o.reasoning.length ? `<ul class="so-why">${o.reasoning.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${o.riskNotes ? `<p class="so-risk">${esc(o.riskNotes)}</p>` : ''}${lv ? `<p class="so-lv">${esc(lv)}</p>` : ''}` : `<p class="faint">${esc(r.error || 'No answer.')}</p>`}
    </div>
    <div class="so-side">
      <span class="cc-k">Kestrel</span>
      <div class="so-call">${tag(r.engine.call, r.engine.action)}<b>${r.engine.score}</b><small>agreement score</small></div>
      <p class="faint">A watch counts as HOLD: nothing was done yet.</p>
      ${o ? `<p class="so-agree s-${agree ? 'ok' : 'warn'}">${glyph(agree ? 'ok' : 'warn')}${agree ? 'They agree' : 'They disagree'}</p>` : ''}
    </div>
  </div>
  <p class="cc-note">${esc(ny(r.at))} · ${esc(r.symbol)} ${esc(r.interval)} at ${Number(r.state.price).toLocaleString('en-US')} · ${outcomeOf(r)}</p>`
}

function board(s) {
  const thin = s.sampleStatus === 'NOT ENOUGH DATA'
  const right = (k) => s.scored ? `${k} of ${s.scored}` : '—'
  const aiK = s.aiHitRate === null ? 0 : Math.round(s.aiHitRate * s.scored), enK = s.engineHitRate === null ? 0 : Math.round(s.engineHitRate * s.scored)
  return `<div class="so-board">
    <div><span class="cc-k">Scored</span><b>${s.scored}${thin ? ` of 30` : ''}</b><small>${s.answered} answered, ${s.asked} asked</small></div>
    <div><span class="cc-k">Claude right</span><b>${thin ? right(aiK) : pct(s.aiHitRate)}</b></div>
    <div><span class="cc-k">Kestrel right</span><b>${thin ? right(enK) : pct(s.engineHitRate)}</b></div>
    <div><span class="cc-k">When they disagreed</span><b>${s.whenTheyDisagree.n}</b><small>Claude ${s.whenTheyDisagree.aiRight}, Kestrel ${s.whenTheyDisagree.engineRight}, neither ${s.whenTheyDisagree.neither}</small></div>
  </div>
  <p class="cc-note"><span class="ev-st ${thin ? 'none' : 'early'}">${esc(s.sampleStatus)}</span> ${esc(s.note)}</p>`
}

function recent(rows) {
  const list = rows.slice(1, 8)
  if (!list.length) return ''
  return `<details class="so-more"><summary>Earlier calls</summary><table class="cc-tbl"><thead><tr><th scope="col">When</th><th scope="col">Kestrel</th><th scope="col">Claude</th><th scope="col">Result</th></tr></thead><tbody>
    ${list.map((r) => `<tr><td class="nowrap">${esc(ny(r.at))}</td><td>${esc(r.engine.action)}</td><td>${r.opinion ? `${esc(r.opinion.action)} ${pct(r.opinion.confidence)}` : '—'}</td><td>${outcomeOf(r)}</td></tr>`).join('')}
  </tbody></table></details>`
}

const el = document.createElement('section'); el.className = 'cc-opinion'; el.setAttribute('aria-labelledby', 'so-h')

function paint() {
  const st = data?.status
  el.innerHTML = `<div class="cc-h"><h2 id="so-h">Second opinion</h2><span class="badge sc-prov">AI · PAPER RESEARCH</span>
    <span>${st ? esc(st.available ? `${st.usedToday} of ${st.dailyCap} asked today. ${st.reason}` : st.reason) : 'Checking…'}</span>
    <button class="ghost so-ask" type="button" ${st?.available && !busy ? '' : 'disabled'}>${busy ? 'Asking…' : 'Ask now'}</button></div>
  <p class="so-lede">Claude reads the same market state Kestrel saw, without Kestrel's verdict, and makes its own call. It is recorded before the outcome and scored on one rule for both. It never places, blocks or sizes a trade.</p>
  ${err ? `<div class="err">${esc(err)}</div>` : ''}
  ${data ? latest(data.recent[0]) + board(data.scoreboard) + recent(data.recent) : '<p class="cc-empty">Reading…</p>'}`
  place()
}

function place() {
  const desks = document.querySelector('#tab-desk .cc-desks')
  if (desks && el.previousElementSibling !== desks) desks.after(el)
}

if ($('tab-desk')) {
  el.addEventListener('click', (e) => { if (e.target.closest('.so-ask')) { e.preventDefault(); askNow() } })
  document.addEventListener('desk:rendered', () => requestAnimationFrame(place))
  load()
  setInterval(() => { if (!document.hidden && !$('tab-desk')?.classList.contains('hidden')) load() }, 60_000)
}
