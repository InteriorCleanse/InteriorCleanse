/**
 * CONDITIONS — is the market fit to trade right now? Reads GET /api/conditions:
 * every watched market (crypto, the forex majors, stocks, index and commodity
 * funds) graded against its own history, its trading hours and the calendar,
 * plus the engine's own market. A reading, not a signal. It never stops or
 * starts anything by itself: when the verdict is POOR, the existing kill switch
 * is offered here and pressing it stays your decision.
 */
import { getJson, esc } from './api.js'

const $ = (id) => document.getElementById(id)
const VERDICT = { GOOD: 'Conditions are good', CAUTION: 'Trade with caution', POOR: 'Conditions are poor', 'NOT ENOUGH DATA': 'NOT ENOUGH DATA' }
const GRADE = { good: 'Good', caution: 'Caution', poor: 'Poor', closed: 'Closed', blind: 'No data' }
const KIND = { crypto: 'Crypto', forex: 'Forex majors', stock: 'Stocks', index: 'Indexes & funds' }
const fmtMin = (m) => m === null || m === undefined ? '' : m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${Math.round(m / 1440)} days`
const pctTxt = (v) => v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`

let data = null, err = null, loadedAt = 0, busy = false

async function load() {
  try { const j = await getJson('/api/conditions'); data = j.data; err = null } catch (e) { err = e.message }
  loadedAt = Date.now()
  render()
}

async function stopNow() {
  if (busy) return
  if (!confirm('Engage the kill switch?\n\nMr. Cash will open NO new positions (paper included) until you resume. Open paper positions are still managed to their stop or target.')) return
  busy = true
  try {
    const cfg = await getJson('/api/config')
    const reason = data && data.verdict === 'POOR' ? `market conditions poor: ${(data.reasons[0] || '').slice(0, 140)}` : 'stopped from the Conditions page'
    await fetch('/api/stop', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify({ reason }) })
  } finally { busy = false; await load() }
}

function hero(d) {
  const v = d.verdict, cls = v === 'NOT ENOUGH DATA' ? 'nd' : v.toLowerCase()
  const st = d.stop || { stopped: false }
  const e = d.engine
  const stopBox = st.stopped
    ? `<div class="cd-stop on"><b>Kill switch is ON</b><span>since ${esc(st.since)} · ${esc(st.reason)}. No new positions. Resume from the Today page.</span></div>`
    : `<div class="cd-stop"><span>${v === 'POOR' ? 'Mr. Cash has not stopped anything by himself. If you want no new entries while this lasts:' : 'The kill switch is off. It is there if you want it:'}</span><button class="btn ${v === 'POOR' ? '' : 'ghost'}" id="cd-stop">Stop new entries</button></div>`
  return `<div class="card cd-hero ${cls}">
    <div class="cd-kicker">Market conditions · every watched market · <span class="badge sc-prov">READING</span></div>
    <h2 class="cd-verdict">${esc(VERDICT[v] || v)}</h2>
    <ul class="cd-reasons">${d.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    ${e ? `<div class="cd-engine"><span class="cd-g ${e.grade}">${esc(GRADE[e.grade])}</span> The engine's market, <b>${esc(e.label)}</b>${e.score !== null ? ` · score ${e.score}/100` : ''}</div>` : ''}
    ${stopBox}
  </div>`
}

function assets(d) {
  return `<div class="cd-assets">${d.assets.map((a) => {
    const h = a.hours
    const when = h.open ? (h.closesInMin !== null ? `closes in ${fmtMin(h.closesInMin)}` : '') : (h.opensInMin !== null ? `opens in ${fmtMin(h.opensInMin)}` : '')
    return `<div class="cd-asset ${h.open ? 'open' : 'shut'} g-${a.worst || 'none'}">
      <div class="cd-asset-top"><i class="cd-dot"></i><b>${esc(a.label)}</b><em>${h.open ? 'OPEN' : 'CLOSED'}</em></div>
      <div class="cd-asset-h">${esc(h.label)}${when ? ` · ${esc(when)}` : ''}</div>
      ${a.markets ? `<div class="cd-counts"><span class="good">${a.good} good</span><span class="caution">${a.caution} caution</span><span class="poor">${a.poor} poor</span></div>` : '<div class="cd-counts muted">nothing watched</div>'}
      ${a.via ? `<div class="cd-via">read through ${esc(a.via)}</div>` : ''}
      ${h.note ? `<div class="cd-via">${esc(h.note)}</div>` : ''}
    </div>`
  }).join('')}</div>`
}

function strength(d) {
  const s = d.strength
  if (!s) return `<div class="card"><h2>Currency strength</h2><p class="muted">NOT ENOUGH DATA: fewer than two major pairs are live right now (the FX market is closed at weekends).</p></div>`
  const max = Math.max(0.05, ...s.map((x) => Math.abs(x.score)))
  return `<div class="card"><h2>Currency strength <span class="muted">${d.fxOpen ? 'last 24 hours, centred on the average' : 'FX is closed: the last session\'s move'}</span></h2>
    <div class="cd-str">${s.map((x) => `<div class="cd-str-row"><b>${esc(x.ccy)}</b><div class="cd-str-bar"><i class="${x.score >= 0 ? 'up' : 'down'}" style="--w:${(Math.abs(x.score) / max * 50).toFixed(1)}%"></i></div><span>${x.score >= 0 ? '+' : ''}${x.score.toFixed(2)}%</span></div>`).join('')}</div>
    <p class="muted cd-foot">Each currency's move against the dollar from the watched pairs, minus the average of all of them. Strongest at the top. Kraken's FX book, not the interbank rate.</p>
  </div>`
}

function tone(d) {
  const t = d.tone, st = d.stress
  return `<div class="card"><h2>Across markets</h2>
    <div class="cd-tone"><div><span>Risk tone</span><b class="t-${esc(t.tone.replace(/ /g, ''))}">${esc(t.tone)}</b></div><div><span>Stress</span><b class="s-${esc(st.level.replace(/ /g, ''))}">${esc(st.level)}</b></div><div><span>Poor right now</span><b>${pctTxt(st.poorShare)}</b></div><div><span>Volatility elevated</span><b>${pctTxt(st.elevatedShare)}</b></div></div>
    ${t.votes.length ? `<p class="muted cd-foot">${t.votes.map(esc).join(' · ')}</p>` : ''}
    <p class="muted cd-foot">${st.assessed} open markets assessed. Stress turns "stressed" when ${Math.round(d.thresholds.stressPoorShare * 100)}% of them are poor at once, or ${Math.round(d.thresholds.stressElevatedShare * 100)}% have elevated volatility.</p>
  </div>`
}

function table(d) {
  const groups = ['crypto', 'forex', 'stock', 'index'].map((k) => [k, d.markets.filter((m) => m.kind === k)]).filter(([, rs]) => rs.length)
  return `<div class="card"><h2>Every market</h2>${groups.map(([k, rs]) => `
    <h3 class="cd-grp">${esc(KIND[k])}</h3>
    <div class="cd-rows">${rs.map((m) => {
      const flags = m.readings.filter((r) => r.level === 'poor' || r.level === 'caution')
      return `<details class="cd-row g-${m.grade}"><summary><span class="cd-g ${m.grade}">${esc(GRADE[m.grade])}</span><b>${esc(m.label)}</b><span class="cd-score">${m.score === null ? '' : `${m.score}`}</span><span class="cd-flags">${flags.length ? flags.map((f) => `<em class="${f.level}">${esc(f.label)}</em>`).join('') : m.grade === 'closed' ? `<em class="info">${esc(m.hours.label)}</em>` : m.grade === 'blind' ? '<em class="info">not enough data</em>' : '<em class="ok">clear</em>'}</span></summary>
        <ul class="cd-read">${m.readings.map((r) => `<li class="${r.level}"><b>${esc(r.label)}</b><span>${esc(r.value)}</span><p>${esc(r.text)}</p></li>`).join('')}</ul>
        <div class="cd-via">${esc(m.provenance)}</div>
      </details>`
    }).join('')}</div>`).join('')}</div>`
}

function render() {
  const root = $('cond-out'); if (!root) return
  if (err && !data) { root.innerHTML = `<div class="card"><p class="pl-err">${esc(err)}</p></div>`; return }
  if (!data) { root.innerHTML = '<div class="card"><p class="muted">Reading every market…</p></div>'; return }
  const d = data
  root.innerHTML = `${hero(d)}${assets(d)}<div class="cd-pair">${strength(d)}${tone(d)}</div>${table(d)}
    <div class="card"><h2>How it reads</h2><p class="muted" style="margin-top:0">${esc(d.note)}</p>
      <ul class="cd-how">
        <li><b>Poor</b>: a shock candle (${d.thresholds.shockX}× its average range), volatility in the top ${Math.round((1 - d.thresholds.disorderlyPct) * 100)}% of its own history, or a high-impact release for its currency from ${d.thresholds.eventBeforeMin} minutes before to ${d.thresholds.eventAfterMin} after.</li>
        <li><b>Caution</b>: big candle (${d.thresholds.bigX}×), elevated or dead volatility, chop, thin volume, a gap, thin hours, or a release within two hours.</li>
        <li><b>The verdict</b> is POOR when the engine's own market is poor or stress is market-wide; NOT ENOUGH DATA when the engine's market cannot be read.</li>
        <li><b>Hours</b>: crypto 24/7; forex Sunday 17:00 to Friday 17:00 ET; stocks 09:30–16:00 ET with pre and after hours; options the regular session only; futures Sunday 18:00 to Friday 17:00 ET with a 17:00–18:00 break. US holidays by the exchange's rules.</li>
      </ul>
      <p class="muted cd-foot">Updated ${d.asOf ? new Date(d.asOf).toLocaleTimeString() : '—'} · market watch ${d.watchAsOf ? new Date(d.watchAsOf).toLocaleTimeString() : 'still on its first look'}.</p>
    </div>`
  $('cd-stop')?.addEventListener('click', stopNow)
}

function init() {
  const section = $('tab-conditions'); if (!section) return
  new MutationObserver(() => { if (!section.classList.contains('hidden') && Date.now() - loadedAt > 20_000) load() }).observe(section, { attributes: true, attributeFilter: ['class'] })
  setInterval(() => { if (document.visibilityState === 'visible' && !section.classList.contains('hidden')) load() }, 60_000)
  if (!section.classList.contains('hidden')) load()
}

init()
