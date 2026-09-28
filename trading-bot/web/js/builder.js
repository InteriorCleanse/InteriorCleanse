/**
 * THE STRATEGY BUILDER — say it in plain English, read the rules and the code,
 * see how it did on history.
 *
 * Reads GET /api/builder and posts to /api/builder/run, /save and /delete.
 * Every result is a BACKTEST on the bot's stored candles, split in-sample and
 * out-of-sample. Nothing here places, sizes or shapes an order.
 */
import { esc, fmtR, nyTime } from './api.js'
import { lineChart } from './viz.js'

const $ = (id) => document.getElementById(id)
const pct = (v) => (v == null ? '—' : Math.round(v * 100) + '%')
const r2 = (v) => (v == null ? '—' : fmtR(v))
const num = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d))
const VERDICT = { 'NOT ENOUGH DATA': 'medium', 'NO EDGE SHOWN': 'low', 'FAILED OUT-OF-SAMPLE': 'low', 'SURVIVED OUT-OF-SAMPLE': 'good' }
const REASON = { stop: 'stop', target: 'target', time: 'time limit', rule: 'exit rule' }

let meta = null, result = null, busy = false, rephrase = null, rephrasing = false, err = null, text = '', name = '', savedNote = null, showAll = false, loaded = false

async function csrf() { const cfg = await fetch('/api/config', { credentials: 'same-origin' }).then((r) => r.json()); return cfg.csrf }
async function post(path, body) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': await csrf() }, body: JSON.stringify(body) })
  const j = await res.json()
  if (!j.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return j.data
}
async function load() {
  try { const j = await fetch('/api/builder', { credentials: 'same-origin' }).then((r) => r.json()); if (!j.ok) throw new Error(j.error); meta = j.data; loaded = true } catch (e) { err = e.message }
  paint()
}

async function run() {
  const ta = $('bd-text'); if (ta) text = ta.value
  const nm = $('bd-name'); if (nm) name = nm.value
  if (!text.trim()) { err = 'Describe a strategy first.'; paint(); return }
  busy = true; err = null; savedNote = null; showAll = false; rephrase = null; paint()
  try { result = await post('/api/builder/run', { text, name }); const m = await fetch('/api/builder', { credentials: 'same-origin' }).then((r) => r.json()); if (m.ok) meta = m.data } catch (e) { err = e.message } finally { busy = false; paint() }
}
async function askRephrase() {
  rephrasing = true; rephrase = null; paint()
  try { rephrase = await post('/api/builder/rephrase', { text }) } catch (e) { rephrase = { error: e.message } } finally { rephrasing = false; paint() }
}

function rephraseBlock(p) {
  const needs = p.ignored.length || p.error
  if (!needs && !rephrase) return ''
  if (!meta.ai) return needs ? '<p class="muted pl-note">With the AI assistant on (ANTHROPIC_API_KEY in .env), the builder can suggest a rewrite in its own phrases for you to accept or ignore.</p>' : ''
  if (rephrase && rephrase.error) return `<p class="pl-err">${esc(rephrase.error)}</p>`
  if (rephrase) return `<div class="bd-rephrase"><h3>Suggested rewrite <span class="badge sc-prov">AI · CHECK IT</span></h3><blockquote>${esc(rephrase.text)}</blockquote>
    ${rephrase.leftOut ? `<p class="muted">Left out: ${esc(rephrase.leftOut)}</p>` : ''}
    <p class="muted">${rephrase.parsed && rephrase.parsed.spec ? `The builder understands ${rephrase.parsed.understood.length - 1} rule${rephrase.parsed.understood.length === 2 ? '' : 's'} in it${rephrase.parsed.ignored.length ? `, and still not ${rephrase.parsed.ignored.length} phrase${rephrase.parsed.ignored.length === 1 ? '' : 's'}` : ''}.` : 'The builder still finds no entry rule in it.'} Cost about $${Number(rephrase.costUsd || 0).toFixed(4)}.</p>
    <div class="row"><button class="btn" id="bd-use" type="button" ${rephrase.parsed && rephrase.parsed.spec ? '' : 'disabled'}>Use this and backtest</button><button class="chip" id="bd-dismiss" type="button">Keep mine</button></div></div>`
  return `<button class="chip" id="bd-rephrase" type="button" ${rephrasing ? 'disabled' : ''}>${rephrasing ? 'Asking…' : 'Ask Claude to rephrase it in the builder\'s words'}</button>`
}

async function save() {
  const nm = $('bd-name'); if (nm) name = nm.value
  if (!name.trim()) { savedNote = 'Give it a name first.'; paint(); return }
  try { meta.saved = await post('/api/builder/save', { name, text }); savedNote = `Saved as "${name.trim()}".` } catch (e) { savedNote = e.message }
  paint()
}
async function remove(id) {
  try { meta.saved = await post('/api/builder/delete', { id }) } catch (e) { err = e.message }
  paint()
}

function metricCol(title, m, cls = '') {
  return `<div class="bd-col ${cls}"><h3>${esc(title)}</h3>
    <dl><div><dt>Trades</dt><dd>${m.trades}</dd></div><div><dt>Win rate</dt><dd>${pct(m.winRate)}</dd></div><div><dt>Expectancy</dt><dd class="${m.expectancyR > 0 ? 'bd-up' : m.expectancyR < 0 ? 'bd-down' : ''}">${r2(m.expectancyR)}</dd></div><div><dt>Total</dt><dd>${r2(m.totalR)}</dd></div><div><dt>Profit factor</dt><dd>${num(m.profitFactor)}</dd></div><div><dt>Worst drawdown</dt><dd>${m.maxDrawdownR ? '−' + num(m.maxDrawdownR) + 'R' : '—'}</dd></div><div><dt>Losing streak</dt><dd>${m.longestLosingStreak}</dd></div></dl>
    ${m.enoughData ? '' : '<p class="bd-nd">NOT ENOUGH DATA</p>'}</div>`
}

function curve(rep) {
  if (rep.trades.length < 2) return ''
  let cum = 0
  const rows = rep.trades.map((t, i) => ({ x: i + 1, y: Math.round((cum += t.rMultiple) * 100) / 100, oos: t.sample === 'OUT-OF-SAMPLE' }))
  const firstOos = rows.findIndex((r) => r.oos)
  const ins = rows.map((r, i) => [r.x, firstOos < 0 || i <= firstOos ? r.y : null])
  const oos = rows.map((r, i) => [r.x, firstOos >= 0 && i >= firstOos ? r.y : null])
  return lineChart({ series: [{ name: 'In-sample', color: 'rgba(170,180,210,.85)', points: ins }, { name: 'Out-of-sample', color: '#5B8CFF', points: oos }], xLabel: 'Trade #', yLabel: 'Cumulative R', area: false, zeroLine: true, height: 250, title: 'Cumulative R, trade by trade: grey is in-sample, blue is out-of-sample' })
}

function results() {
  if (!result) return ''
  const p = result.parsed
  const understood = `<div class="card bd-read"><h2>What the builder understood</h2>
    <ul class="bd-list ok">${p.understood.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
    ${p.assumed.length ? `<h3>Filled in, because you did not say</h3><ul class="bd-list assumed">${p.assumed.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
    ${p.ignored.length ? `<h3>Not understood, so left out</h3><ul class="bd-list ignored">${p.ignored.map((u) => `<li>${esc(u)}</li>`).join('')}</ul><p class="muted pl-note">Rephrase with the phrases under "What it understands" and run again.</p>` : ''}
    ${p.error ? `<p class="pl-err">${esc(p.error)}</p>` : ''}${rephraseBlock(p)}</div>`
  if (!result.code) return understood
  const code = `<div class="card bd-code"><h2>The code <span class="badge sc-prov">READ-ONLY</span></h2><p class="muted" style="margin-top:0">The rules as code, so you can check exactly what was tested. This text is shown, not run.</p><pre><code>${esc(result.code)}</code></pre></div>`
  const rep = result.report
  if (!rep) return understood + code + `<div class="card"><h2>Backtest</h2><p class="muted">NOT ENOUGH DATA: fewer than 200 stored ${esc(meta?.interval || '')} candles for ${esc(meta?.market || '')}. Leave the bot running and the store fills in.</p></div>`
  const trades = showAll ? rep.trades.slice().reverse() : rep.trades.slice(-15).reverse()
  return `<div class="bd-two">${understood}${code}</div>
  <div class="card bd-res">
    <div class="rd-kicker">Backtest · ${esc(rep.market)} ${esc(rep.interval)} · ${rep.candles.toLocaleString()} candles, ${rep.from ? nyTime(rep.from) : '—'} to ${rep.to ? nyTime(rep.to) : '—'} ET · <span class="badge sc-prov">BACKTEST</span></div>
    <h2 class="bd-verdict"><span class="badge ${VERDICT[rep.verdict] || 'low'}">${esc(rep.verdict)}</span></h2>
    <p class="rd-line">${esc(rep.line)}</p>
    <div class="bd-cols">${metricCol('All trades', rep.all)}${metricCol('In-sample · first 70%', rep.inSample)}${metricCol('Out-of-sample · last 30%', rep.outOfSample, 'oos')}</div>
    <div class="bd-facts">
      <span>Price over the same out-of-sample window: <b class="${rep.holdOosPct > 0 ? 'bd-up' : rep.holdOosPct < 0 ? 'bd-down' : ''}">${rep.holdOosPct == null ? '—' : (rep.holdOosPct > 0 ? '+' : '') + rep.holdOosPct + '%'}</b></span>
      <span>Deflated Sharpe: <b>${rep.deflated ? esc(rep.deflated.verdict) : '—'}</b>${rep.deflated && rep.deflated.probability != null ? ` (${pct(rep.deflated.probability)})` : ''}</span>
      <span>Builder runs counted: <b>${rep.trials}</b></span>
      ${rep.missedEntries ? `<span>Entries skipped because price opened too far away: <b>${rep.missedEntries}</b></span>` : ''}
    </div>
    <div class="bd-thirds"><h3>Across time <span class="badge ${rep.stable === 'CONSISTENT' ? 'good' : rep.stable === 'MIXED' ? 'low' : 'medium'}">${esc(rep.stable)}</span></h3><p class="muted">The whole history in three equal periods. A rule that only worked in one of them is fragile, whatever the totals say.</p>
      <div class="bd-cols">${rep.thirds.map((t, k) => `<div class="bd-col"><h3>Period ${k + 1}</h3><dl><div><dt>From</dt><dd>${nyTime(t.from)}</dd></div><div><dt>Trades</dt><dd>${t.trades}</dd></div><div><dt>Expectancy</dt><dd class="${t.expectancyR > 0 ? 'bd-up' : t.expectancyR < 0 ? 'bd-down' : ''}">${r2(t.expectancyR)}</dd></div><div><dt>Win rate</dt><dd>${pct(t.winRate)}</dd></div></dl></div>`).join('')}</div></div>
    ${curve(rep)}
    ${rep.trades.length ? `<div class="scroll"><table class="bd-trades"><thead><tr><th>Entry (ET)</th><th>Side</th><th class="num">Entry</th><th class="num">Exit</th><th>Exit by</th><th class="num">Candles</th><th class="num">R</th><th>Sample</th></tr></thead><tbody>
      ${trades.map((t) => `<tr><td>${nyTime(t.time)}</td><td>${esc(t.direction)}</td><td class="num">${num(t.entry)}</td><td class="num">${num(t.exit)}</td><td>${esc(REASON[t.reason] || t.reason)}</td><td class="num">${t.candlesHeld}</td><td class="num ${t.rMultiple > 0 ? 'bd-up' : t.rMultiple < 0 ? 'bd-down' : ''}">${fmtR(t.rMultiple)}</td><td><span class="bd-s ${t.sample === 'OUT-OF-SAMPLE' ? 'oos' : ''}">${t.sample === 'OUT-OF-SAMPLE' ? 'out' : 'in'}</span></td></tr>`).join('')}
    </tbody></table></div>${rep.trades.length > 15 ? `<button class="chip" id="bd-all">${showAll ? 'Show the last 15' : `Show all ${rep.trades.length}`}</button>` : ''}` : '<p class="muted">The rules never fired on these candles.</p>'}
    <p class="muted pl-note">${esc(rep.note)}</p>
  </div>`
}

function paint() {
  const root = $('builder-out'); if (!root) return
  const focused = document.activeElement && document.activeElement.id
  if (!meta) { root.innerHTML = err ? `<div class="card"><p class="pl-err">${esc(err)}</p></div>` : '<div class="card"><p class="muted">Opening the builder…</p></div>'; return }
  root.innerHTML = `
  <div class="card bd-hero">
    <div class="rd-kicker">Strategy builder · plain English to a backtest · <span class="badge sc-prov">RESEARCH · BACKTEST</span></div>
    <h2 class="bd-title">Describe a strategy. Read the rules. See how it did.</h2>
    <p class="muted bd-sub">Say it the way you would say it to a trader. The builder turns it into rules and code you can check, then tests it on ${meta.candles.toLocaleString()} stored ${esc(meta.interval)} ${esc(meta.market)} candles, holding back the last 30% as a test it never saw. It never trades.</p>
    <label class="bd-label" for="bd-text">Your strategy</label>
    <textarea id="bd-text" rows="4" maxlength="2000" placeholder="Buy when RSI(14) is below 30 and price is above the 200 EMA. Sell when RSI is above 60. Stop 1.5 ATR, take profit 2R.">${esc(text)}</textarea>
    <div class="bd-ex">${meta.examples.map((e, i) => `<button class="chip" data-ex="${i}" type="button">${esc(e.name)}</button>`).join('')}</div>
    <div class="bd-row">
      <button class="btn" id="bd-run" type="button" ${busy ? 'disabled' : ''}>${busy ? 'Testing…' : 'Build and backtest'}</button>
      <input id="bd-name" type="text" maxlength="80" placeholder="Name it to save it" value="${esc(name)}" aria-label="Strategy name">
      <button class="chip" id="bd-save" type="button" ${result && result.parsed && result.parsed.spec ? '' : 'disabled'}>Save to my strategies</button>
      ${savedNote ? `<span class="muted">${esc(savedNote)}</span>` : ''}
    </div>
    ${err ? `<p class="pl-err">${esc(err)}</p>` : ''}
    <details class="bd-gram"><summary>What it understands</summary><ul>${meta.grammar.map((g) => `<li>${esc(g)}</li>`).join('')}</ul><p class="muted">Anything else is listed as "not understood" rather than guessed. News-event rules ("short airlines after a crash") need a history of headlines this desk does not have, so they are left out.</p></details>
  </div>
  ${results()}
  <div class="card"><h2>My strategies <span class="badge sc-prov">SAVED ON THIS COMPUTER</span></h2>
    ${meta.saved.length ? `<ul class="bd-saved">${meta.saved.map((s) => `<li><div><b>${esc(s.name)}</b><small>${esc(s.text)}</small></div><span class="badge ${VERDICT[s.verdict] || 'low'}">${esc(s.verdict || 'NOT TESTED')}</span><span class="muted">${s.oosTrades} out-of-sample · ${r2(s.oosExpectancyR)}</span><button class="chip" data-load="${esc(s.id)}" type="button">Open</button><button class="chip" data-del="${esc(s.id)}" type="button" aria-label="Delete ${esc(s.name)}">Delete</button></li>`).join('')}</ul>` : '<p class="muted">Nothing saved yet. Build one, name it and save it; its latest verdict is kept beside it.</p>'}
    <p class="muted pl-note">Builder runs counted so far: ${meta.trials}. Every run counts, so the more variations you try, the stricter the deflated-Sharpe bar gets. That is how the builder keeps you from fitting the past.</p>
  </div>
  <div class="card"><h2>What will not happen</h2><ul class="cd-how">
    <li>Nothing here trades. A strategy built here reaches Trading Bot only through research, an out-of-sample test, a human review and a paper test.</li>
    <li>A good backtest is a backtest. The out-of-sample column is the one that counts, and under 30 out-of-sample trades it says NOT ENOUGH DATA.</li>
    <li>Costs are always on: the paper engine's spread, slippage, latency and fees, and a stop gapped through fills at the open.</li>
  </ul></div>`
  if (focused) { const el = $(focused); if (el && 'focus' in el) { el.focus(); if (el.setSelectionRange && typeof el.value === 'string') el.setSelectionRange(el.value.length, el.value.length) } }
}

function init() {
  const section = $('tab-builder'); if (!section) return
  section.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return
    if (t.id === 'bd-run') run()
    else if (t.id === 'bd-rephrase') askRephrase()
    else if (t.id === 'bd-use' && rephrase) { text = rephrase.text; rephrase = null; run() }
    else if (t.id === 'bd-dismiss') { rephrase = null; paint() }
    else if (t.id === 'bd-save') save()
    else if (t.id === 'bd-all') { showAll = !showAll; paint() }
    else if (t.dataset.ex !== undefined) { const ex = meta.examples[Number(t.dataset.ex)]; text = ex.text; name = ex.name; paint() }
    else if (t.dataset.load) { const s = meta.saved.find((x) => x.id === t.dataset.load); if (s) { text = s.text; name = s.name; run() } }
    else if (t.dataset.del) remove(t.dataset.del)
  })
  section.addEventListener('input', (e) => { if (e.target.id === 'bd-text') text = e.target.value; else if (e.target.id === 'bd-name') name = e.target.value })
  section.addEventListener('keydown', (e) => { if (e.target.id === 'bd-text' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run() } })
  new MutationObserver(() => { if (!section.classList.contains('hidden') && !loaded) load() }).observe(section, { attributes: true, attributeFilter: ['class'] })
  if (!section.classList.contains('hidden')) load()
}

init()
