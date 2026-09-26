/**
 * SCALP DESK — the conditions a scalper looks for, the break-even arithmetic,
 * and the 5-minute call. Reads GET /api/scalp, /api/scalp/breakeven and
 * /api/forecast?window=5. A reading, not a signal; nothing here places an order.
 */
import { lineChart } from './viz.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const $ = (id) => document.getElementById(id)
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const VERDICT = { good: 'Good conditions', thin: 'Thin conditions', 'stand aside': 'Stand aside', 'NOT ENOUGH DATA': 'NOT ENOUGH DATA' }

let data = null, err = null, calc = { target: 40, stop: 30, spread: '', fee: '', slip: '', result: null, error: null }, five = null, loadedAt = 0

async function getJson(path) { const r = await fetch(path, { credentials: 'same-origin' }); const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`); return j.data }

async function load() {
  try { data = await getJson('/api/scalp'); err = null } catch (e) { err = e.message }
  try { five = await getJson('/api/forecast?window=5') } catch { five = null }
  loadedAt = Date.now()
  render()
}

function ring(score, verdict) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score)) / 100
  const col = verdict === 'good' ? 'var(--green)' : verdict === 'stand aside' ? 'var(--red)' : 'var(--amber)'
  return `<svg class="sd-ring" viewBox="0 0 130 130" role="img" aria-label="Conditions score ${score} of 100"><circle cx="65" cy="65" r="${r}" fill="none" stroke="rgba(255,246,228,.08)" stroke-width="10"/><circle cx="65" cy="65" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 65 65)" style="filter:drop-shadow(0 0 6px ${col})"/><text x="65" y="70" text-anchor="middle" class="sd-ring-n">${score}</text><text x="65" y="88" text-anchor="middle" class="sd-ring-k">of 100</text></svg>`
}

function costBar(d) {
  if (d.typicalMoveBps == null) return ''
  const max = Math.max(d.typicalMoveBps, d.roundTripBps) * 1.1
  const w = (v) => `${Math.min(100, (v / max) * 100).toFixed(1)}%`
  return `<div class="sd-bars"><div><span>Typical move</span><i class="sd-bar move" style="width:${w(d.typicalMoveBps)}"></i><b>${d.typicalMoveBps} bps</b></div><div><span>Round-trip cost</span><i class="sd-bar cost" style="width:${w(d.roundTripBps)}"></i><b>${d.roundTripBps} bps</b></div></div>`
}

function curveChart(curve, title) {
  return lineChart({ series: [{ name: 'Break-even after costs', color: '#E6747C', points: curve.map((p) => [p.targetBps, p.breakEven === null ? null : p.breakEven * 100]) }, { name: 'Break-even with no costs', color: 'rgba(216,181,110,.8)', points: curve.map((p) => [p.targetBps, p.rawBreakEven * 100]) }], xLabel: 'Target (basis points)', yLabel: 'Win rate needed (%)', area: false, height: 260, title })
}

function fiveMinute() {
  if (!five) return ''
  const c = five.current ?? five.lastRead, t = five.tally
  const line = c ? (c.call === 'flat' ? `holding flat · p(up) ${pct(c.pUp)}` : `${c.call === 'up' ? '▲ UP' : '▼ DOWN'} · p(up) ${pct(c.pUp)}`) : 'no call'
  return `<button class="fc-term fc-mini" data-tab="forecast"><span class="fc-bar-top"><i></i><i></i><i></i><span>the-call · ${esc(five.symbol)} · next 5m</span><span class="badge sc-prov">PAPER FORECAST</span></span><span class="fc-body"><span class="fc-line">› ${esc(line)}${five.current ? '' : ' · <em class="fc-res void">STALE</em>'}${c ? ` · difficulty ${c.difficulty}/4` : ''}</span><span class="fc-line">› live ${t.right}/${t.calls} right · skill ${t.skill == null ? '—' : t.skill.toFixed(3)}${t.status === 'OK' ? '' : ' · NOT ENOUGH DATA'}</span>${five.backtest ? `<span class="fc-line">› backtest ${five.backtest.tally.right}/${five.backtest.tally.calls} right over ${five.backtest.windows} windows · skill ${five.backtest.tally.skill == null ? '—' : five.backtest.tally.skill.toFixed(3)} · <em class="fc-res void">BACKTEST</em></span>` : ''}</span></button>`
}

function calcCard() {
  const r = calc.result
  const inp = (k, label, ph = '') => `<label class="fc-in"><span>${label}</span><input name="${k}" type="number" step="0.1" min="0" value="${esc(calc[k])}" placeholder="${esc(ph)}"></label>`
  const c = data?.costs
  return `<div class="card"><h2>Break-even calculator <span class="badge sc-prov">ARITHMETIC</span></h2>
    <p class="muted" style="margin-top:0">Your scalp shape in basis points (1 bp = 0.01%; on BTC at $80,000 that is $8). Costs default to the paper engine's own: spread ${c ? c.spreadBps : '—'} bps, fee ${c ? c.feeBpsPerSide : '—'} bps a side, slippage ${c ? c.slippageBpsPerSide : '—'} bps a side. Put your own venue's numbers in to see your real bar.</p>
    <form id="sd-calc" class="fc-edge-form"><fieldset><legend>Shape</legend>${inp('target', 'target bps')}${inp('stop', 'stop bps')}</fieldset><fieldset><legend>Costs</legend>${inp('spread', 'spread bps', c ? c.spreadBps : '')}${inp('fee', 'fee bps / side', c ? c.feeBpsPerSide : '')}${inp('slip', 'slippage bps / side', c ? c.slippageBpsPerSide : '')}</fieldset><button class="btn" type="submit">Work it out</button></form>
    ${calc.error ? `<p class="pl-err">${esc(calc.error)}</p>` : ''}
    ${r ? `<div class="fc-score"><div><span>Round trip</span><b>${r.roundTripBps} bps</b></div><div><span>Costs take</span><b class="${r.costShare >= 0.5 ? 'fc-down' : r.costShare >= 0.25 ? 'fc-flat' : 'fc-up'}">${Math.round(r.costShare * 100)}% <small>of target</small></b></div><div><span>Win rate needed</span><b>${r.breakEven === null ? 'impossible' : pct(r.breakEven)}</b></div><div><span>With no costs</span><b>${pct(r.rawBreakEven)}</b></div><div><span>Verdict</span><b class="${r.verdict === 'workable' ? 'fc-up' : r.verdict === 'tight' ? 'fc-flat' : 'fc-down'}">${esc(r.verdict)}</b></div></div><p class="plain">${esc(r.note)}</p>${curveChart(r.curve, 'The bar rises as the target shrinks: small targets need very high win rates after costs')}` : ''}
  </div>`
}

function render() {
  const root = $('scalp-out'); if (!root) return
  const form = $('sd-calc'); if (form) { const fd = new FormData(form); for (const k of ['target', 'stop', 'spread', 'fee', 'slip']) if (fd.has(k)) calc[k] = fd.get(k) }
  if (form && form.contains(document.activeElement)) return
  if (err && !data) { root.innerHTML = `<div class="card"><p class="pl-err">${esc(err)}</p></div>`; return }
  if (!data) { root.innerHTML = '<div class="card"><p class="muted">Reading the tape…</p></div>'; return }
  const d = data
  root.innerHTML = `
  <div class="card sd-hero">
    <div class="sd-hero-l">${ring(d.score, d.verdict)}</div>
    <div class="sd-hero-r">
      <div class="sd-kicker">${esc(d.symbol)} · scalping conditions right now · <span class="badge sc-prov">${esc(d.source === 'NOT CONNECTED' ? 'NOT CONNECTED' : 'READING')}</span></div>
      <h2 class="sd-verdict ${d.verdict.replace(' ', '')}">${esc(VERDICT[d.verdict] || d.verdict)}</h2>
      ${costBar(d)}
      <p class="muted pl-note">${esc(d.note)}</p>
    </div>
  </div>
  ${d.readings.length ? `<div class="sd-grid">${d.readings.map((r) => `<div class="sd-read ${r.status}"><span class="sd-dot"></span><b>${esc(r.label)}</b><em>${esc(r.value)}</em><p>${esc(r.text)}</p></div>`).join('')}</div>` : ''}
  ${d.playbook.length ? `<div class="card"><h2>Textbook playbook for this tape</h2><ul class="sd-play">${d.playbook.map((p) => `<li>${esc(p)}</li>`).join('')}</ul><p class="muted pl-note">Textbook, not advice, and not a rule Mr. Cash trades. Test any of it on paper first.</p></div>` : ''}
  <div class="card"><h2>The 5-minute call</h2><p class="muted" style="margin-top:0">Up or down over the next five minutes, scored against the real close. Short horizons are the hardest to call; watch the skill number before trusting any of it.</p>${fiveMinute() || '<p class="muted">The 5-minute desk is starting.</p>'}</div>
  ${calcCard()}
  <div class="card"><h2>At the configured costs</h2>${curveChart(d.curve, 'Win rate needed to break even, stop equal to target, at the paper engine’s costs')}</div>
  <div class="card"><h2>Learn the craft</h2><p class="muted" style="margin-top:0">Six lessons in the School, "Scalping: the technical and fundamental side": why costs come first, when to scalp, the news clock, the technical toolkit (VWAP, fast averages, levels, tape), execution, and discipline.</p><button class="btn ghost" data-tab="school">Open the School</button></div>`
}

async function runCalc() {
  const form = $('sd-calc'); if (!form) return
  const fd = new FormData(form)
  for (const k of ['target', 'stop', 'spread', 'fee', 'slip']) calc[k] = fd.get(k) ?? ''
  const q = new URLSearchParams(); for (const k of ['target', 'stop', 'spread', 'fee', 'slip']) if (calc[k] !== '') q.set(k, calc[k])
  try { const r = await getJson('/api/scalp/breakeven?' + q); calc.result = r; calc.error = null } catch (e) { calc.error = e.message; calc.result = null }
  document.activeElement?.blur?.()
  render()
}

function init() {
  const root = $('scalp-out'); if (!root) return
  root.addEventListener('submit', (e) => { if (e.target.id === 'sd-calc') { e.preventDefault(); runCalc() } })
  root.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b && typeof window.showTab === 'function') window.showTab(b.dataset.tab) })
  const section = $('tab-scalp')
  if (section) new MutationObserver(() => { if (!section.classList.contains('hidden') && Date.now() - loadedAt > 30_000) load() }).observe(section, { attributes: true, attributeFilter: ['class'] })
  setInterval(() => { if (document.visibilityState === 'visible' && section && !section.classList.contains('hidden')) load() }, 60_000)
  runCalcDefault()
}

async function runCalcDefault() { try { calc.result = await getJson(`/api/scalp/breakeven?target=${calc.target}&stop=${calc.stop}`) } catch { /* the form still works */ } }

init()
