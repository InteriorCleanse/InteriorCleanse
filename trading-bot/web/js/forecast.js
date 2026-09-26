/**
 * THE CALL — up or down over the next window, on paper, with the working.
 *
 * Reads GET /api/forecast (PAPER FORECAST). Two views of the same desk:
 *   - the "The call" tab: the live call, its readings, the settled log,
 *     the scoreboard against a coin flip, calibration, and the BACKTEST;
 *   - a compact terminal on Home, under the markets strip.
 * Nothing here places an order; the desk has no execution path at all.
 */
import { priceStack, lineChart } from './viz.js'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const $ = (id) => document.getElementById(id)
const pct = (v) => (v == null ? '—' : Math.round(v * 100) + '%')
const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const ARROW = { up: '▲', down: '▼', flat: '·', unchanged: '=' }
const RESULT = { right: 'RIGHT', wrong: 'WRONG', passed: 'PASSED', void: 'VOID' }

let desk = null, err = null, loading = false, fetchedAt = 0, ticker = null, win = 15
let edge = { form: { pmYes: 55, pmNo: 43, pmFee: 0, kYes: 62, kNo: 40, p: '', contracts: 100 }, result: null, error: null, busy: false }

async function load(force = false) {
  if (loading) return
  loading = true
  try {
    const r = await fetch(`/api/forecast?window=${win}` + (force ? '&refresh=1' : ''), { credentials: 'same-origin' })
    const j = await r.json()
    if (!j.ok) throw new Error(j.error || 'The desk did not answer.')
    desk = j.data; err = null; fetchedAt = Date.now()
  } catch (e) { err = e.message } finally { loading = false; paint() }
}

const left = () => (desk?.current ? desk.current.msLeft - (Date.now() - fetchedAt) : 0)

function callLine(c, line) {
  if (!c) return ''
  if (c.call === 'flat') return `<span class="fc-flat">holding flat</span>, no call · p(up) ${pct(c.pUp)}, under the ${Math.round(line * 100)}% line`
  return `<span class="fc-${c.call}">${ARROW[c.call]} ${c.call.toUpperCase()}</span> · p(up) ${pct(c.pUp)} · confidence ${pct(c.confidence)}`
}

function logLine(r) {
  const said = r.call === 'flat' ? '<span class="fc-flat">stayed flat</span>' : `said <span class="fc-${r.call}">${ARROW[r.call]} ${r.call.toUpperCase()}</span>`
  return `<li class="fc-log ${r.result}"><time>${hhmm(r.windowEnd)}</time><b>SETTLED <span class="fc-${r.outcome}">${ARROW[r.outcome]} ${r.outcome.toUpperCase()}</span></b><span>${said}</span><em class="fc-res ${r.result}">${RESULT[r.result]}</em><span class="fc-p">p(up) ${pct(r.pUp)}</span></li>`
}

function gauge(p, line) {
  const at = p * 100
  return `<div class="fc-gauge" role="img" aria-label="Probability up ${pct(p)}"><div class="fc-bar"><i class="fc-down-fill" style="width:${(100 - at).toFixed(1)}%"></i><i class="fc-up-fill" style="width:${at.toFixed(1)}%"></i></div><span class="fc-tick" style="left:${(line * 100).toFixed(1)}%"></span><span class="fc-tick" style="left:${((1 - line) * 100).toFixed(1)}%"></span><div class="fc-scale"><span>▼ down</span><span>${Math.round((1 - line) * 100)}% · flat · ${Math.round(line * 100)}%</span><span>up ▲</span></div></div>`
}

function score(t, label) {
  const skill = t.skill == null ? '—' : (t.skill > 0 ? '+' : '') + t.skill.toFixed(3)
  return `<div class="fc-score">
    <div><span>Calls</span><b>${t.calls}</b></div>
    <div><span>Right</span><b>${t.right} <small>${pct(t.hitRate)}</small></b></div>
    <div><span>Passed</span><b>${t.passed}</b></div>
    <div><span>Went up</span><b>${pct(t.upRate)}</b></div>
    <div><span>Brier</span><b>${t.brier == null ? '—' : t.brier.toFixed(3)}</b></div>
    <div title="1 − Brier ÷ 0.25. Above 0 beats a coin flip; below 0 is worse than one."><span>Skill vs coin flip</span><b class="${t.skill > 0 ? 'fc-up' : t.skill < 0 ? 'fc-down' : ''}">${skill}</b></div>
  </div>${t.status === 'OK' ? '' : `<p class="fc-nd">${esc(label)}: NOT ENOUGH DATA — ${t.calls} of 30 calls. Treat every number above as noise until then.</p>`}`
}

function calibration(t) {
  if (!t.forecasts) return ''
  return `<table class="fc-cal"><thead><tr><th>Said p(up)</th><th class="num">Windows</th><th class="num">Said, on average</th><th class="num">Went up</th></tr></thead><tbody>${t.calibration.map((b) => `<tr><td>${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%</td><td class="num">${b.count}</td><td class="num">${pct(b.saidUp)}</td><td class="num">${pct(b.wentUp)}</td></tr>`).join('')}</tbody></table><p class="muted pl-note">Calibrated means the two right-hand columns match: when it says 65%, it should go up about 65% of the time.</p>`
}

function staleRead(r, line) {
  return `<div class="fc-stale"><p class="fc-line">› last read from candles up to ${hhmm(r.windowStart)} <span class="badge medium">STALE · NOT SCORED</span></p>
    ${gauge(r.pUp, line)}
    <p class="fc-line">› ${callLine(r, line)} · difficulty ${r.difficulty}/4${r.tags.length ? ' · ' + r.tags.map(esc).join(', ') : ''}</p>
    <ul class="fc-reads">${r.readings.map(readRow).join('')}</ul></div>`
}

const readRow = (r) => `<li><b>${esc(r.label)}</b><span class="fc-push"><i class="${r.push >= 0 ? 'up' : 'down'}" style="width:${Math.min(50, Math.abs(r.push) * 160).toFixed(1)}%;${r.push >= 0 ? 'left:50%' : `left:${(50 - Math.min(50, Math.abs(r.push) * 160)).toFixed(1)}%`}"></i></span><span class="muted">${esc(r.text)}</span></li>`

function statusText(d) {
  if (d.status === 'WAITING FOR CANDLES') return 'waiting for the candle that opens this window'
  if (d.status === 'STALE CANDLES') return 'NOT CONNECTED: no fresh candles, so no call this window'
  if (d.status === 'STARTING') return 'starting up'
  return 'live'
}


const cents = (v) => `${(v * 100).toFixed(1)}¢`
function edgeCard(d) {
  const f = edge.form, r = edge.result
  const pDefault = d?.current?.pUp ?? d?.lastRead?.pUp
  const inp = (k, label, extra = '') => `<label class="fc-in"><span>${label}</span><input name="${k}" type="number" step="0.1" min="0" max="100" value="${esc(f[k])}" ${extra}></label>`
  return `<div class="card fc-edge"><h2>Edge check · Polymarket × Kalshi <span class="badge sc-prov">SIMULATED · YOUR QUOTES</span></h2>
    <p class="muted" style="margin-top:0">Type the asks for the same event on both venues, in cents. The check looks for YES + NO under $1 on one venue, for YES on one venue plus NO on the other under $1, and for how far the two YES prices disagree. It subtracts fees (Kalshi's published formula, and your Polymarket rate) and, if you give a probability, finds the side worth the most and a capped quarter-Kelly stake. Mr. Cash does not connect to either venue and places nothing.</p>
    <form id="fc-edge-form" class="fc-edge-form">
      <fieldset><legend>Polymarket</legend>${inp('pmYes', 'YES ask ¢')}${inp('pmNo', 'NO ask ¢')}${inp('pmFee', 'fee %')}</fieldset>
      <fieldset><legend>Kalshi</legend>${inp('kYes', 'YES ask ¢')}${inp('kNo', 'NO ask ¢')}<label class="fc-in"><span>contracts</span><input name="contracts" type="number" min="1" max="100000" value="${esc(f.contracts)}"></label></fieldset>
      <fieldset><legend>Your view</legend><label class="fc-in"><span>p(YES) %</span><input name="p" type="number" step="0.1" min="1" max="99" value="${esc(f.p)}" placeholder="${pDefault ? Math.round(pDefault * 100) : ''}"></label>${pDefault ? `<button type="button" class="chip" id="fc-use-desk">Use the desk's ${Math.round(pDefault * 100)}%</button>` : ''}</fieldset>
      <button class="btn" type="submit" ${edge.busy ? 'disabled' : ''}>${edge.busy ? 'Checking…' : 'Check the edge'}</button>
    </form>
    ${edge.error ? `<p class="pl-err">${esc(edge.error)}</p>` : ''}
    ${r ? `<div class="fc-edge-out">
      ${priceStack({ venues: r.venues.map((v) => ({ name: v.venue, yes: v.yesAsk, no: v.noAsk })).concat(r.cross.map((c, i) => ({ name: i === 0 ? 'YES PM + NO K' : 'YES K + NO PM', yes: i === 0 ? r.venues[0].yesAsk : r.venues[1].yesAsk, no: i === 0 ? r.venues[1].noAsk : r.venues[0].noAsk }))), title: 'What a $1 payout costs, venue by venue and across venues' })}
      <table class="fc-routes"><thead><tr><th>Route</th><th class="num">Cost</th><th class="num">Gross</th><th class="num">Fees</th><th class="num">Net per $1</th><th></th></tr></thead><tbody>
      ${[...r.venues.map((v) => ({ label: `YES + NO on ${v.venue}`, cost: v.sum, gross: v.gross, fees: v.fees, net: v.net, survives: v.survives })), ...r.cross].map((x) => `<tr><td>${esc(x.label)}</td><td class="num">$${x.cost.toFixed(3)}</td><td class="num">${cents(x.gross)}</td><td class="num">${cents(x.fees)}</td><td class="num ${x.survives ? 'fc-up' : 'fc-down'}">${cents(x.net)}</td><td>${x.survives ? '<span class="badge good">survives fees</span>' : '<span class="badge low">no edge</span>'}</td></tr>`).join('')}
      </tbody></table>
      <div class="fc-score"><div><span>YES divergence</span><b>${cents(r.divergence.cents)} <small>${Math.round(r.divergence.pct * 100)}%</small></b></div><div><span>Cheaper YES</span><b>${esc(r.divergence.cheaper)}</b></div><div><span>Consensus p(YES)</span><b>${Math.round(r.consensus * 100)}%</b></div>${r.bet ? `<div><span>Best side for your view</span><b>${esc(r.bet.side)} on ${esc(r.bet.venue)}</b></div><div><span>Edge after fee</span><b class="${r.bet.edgeAfterFee > 0 ? 'fc-up' : 'fc-down'}">${cents(r.bet.edgeAfterFee)}</b></div><div><span>¼-Kelly stake</span><b>${(r.bet.kelly.suggested * 100).toFixed(1)}% <small>of bankroll</small></b></div>` : ''}</div>
      ${r.bet ? `<p class="muted">${esc(r.bet.kelly.note)}</p>` : ''}
      <ul class="fc-notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>` : ''}
  </div>`
}

async function runEdge() {
  const form = $('fc-edge-form'); if (!form) return
  const fd = new FormData(form)
  for (const k of Object.keys(edge.form)) edge.form[k] = fd.get(k) ?? edge.form[k]
  const q = new URLSearchParams({ pmYes: edge.form.pmYes, pmNo: edge.form.pmNo, pmFee: edge.form.pmFee, kYes: edge.form.kYes, kNo: edge.form.kNo, contracts: edge.form.contracts })
  if (edge.form.p !== '' && edge.form.p !== null) q.set('p', String(Number(edge.form.p) / 100))
  edge.busy = true; edge.error = null; tabView()
  try { const j = await fetch('/api/forecast/edge?' + q, { credentials: 'same-origin' }).then((x) => x.json()); if (!j.ok) { edge.error = j.error; edge.result = null } else edge.result = j.data } catch (e) { edge.error = e.message } finally { edge.busy = false; tabView() }
}

function calibrationChart(t) {
  const pts = t.calibration.filter((b) => b.count > 0 && b.saidUp !== null)
  if (pts.length < 2) return ''
  return lineChart({ series: [{ name: 'Went up', color: '#60C892', points: pts.map((b) => [b.saidUp, b.wentUp]) }, { name: 'Perfect calibration', color: 'rgba(216,181,110,.7)', points: [[0.2, 0.2], [0.8, 0.8]] }], xLabel: 'Said p(up)', yLabel: 'Went up', area: false, height: 240, title: 'Calibration: points on the gold line mean the percentages can be trusted' })
}

function tabView() {
  const root = $('forecast-out'); if (!root) return
  if (err && !desk) { root.innerHTML = `<div class="card"><p class="pl-err">${esc(err)}</p></div>`; return }
  if (!desk) { root.innerHTML = '<div class="card"><p class="muted">Opening the desk…</p></div>'; return }
  const d = desk, c = d.current
  root.innerHTML = `
  <div class="fc-term">
    <div class="fc-bar-top"><i></i><i></i><i></i><span>mr-cash · the-call · ${esc(d.symbol)} · ${d.windowMinutes}m</span><span class="fc-win" role="group" aria-label="Window length"><button class="${win === 15 ? 'on' : ''}" data-win="15">15m</button><button class="${win === 5 ? 'on' : ''}" data-win="5">5m scalp</button></span><span class="badge sc-prov">PAPER FORECAST</span></div>
    <div class="fc-body">
      <div class="fc-now">
        <div class="fc-q">Will ${esc(d.symbol)} end this ${d.windowMinutes}-minute window higher?</div>
        ${c ? `<div class="fc-big">${c.call === 'flat' ? '<span class="fc-flat">FLAT</span>' : `<span class="fc-${c.call}">${ARROW[c.call]} ${c.call.toUpperCase()}</span>`}<span class="fc-bigp">${pct(c.pUp)}<small> p(up)</small></span></div>
        ${gauge(c.pUp, d.line)}
        <p class="fc-line">› ${callLine(c, d.line)} · <b id="fc-left">${mmss(left())}</b> left · difficulty ${c.difficulty}/4${c.tags.length ? ' · ' + c.tags.map(esc).join(', ') : ''}</p>
        <ul class="fc-reads">${c.readings.map(readRow).join('')}</ul>`
        : `<p class="fc-line">› <span class="fc-flat">no call</span> · ${esc(statusText(d))}</p>${d.lastRead ? staleRead(d.lastRead, d.line) : ''}`}
      </div>
      <div class="fc-logwrap"><div class="fc-h">Settled windows <span class="muted">your live paper record</span></div>
        ${d.log.length ? `<ul class="fc-logs">${d.log.slice(0, 20).map(logLine).join('')}</ul>` : '<p class="muted">Nothing settled yet. The first call settles at the end of its window; the record grows by up to four windows an hour while the bot runs.</p>'}
        <span class="fc-cursor" aria-hidden="true">▌</span>
      </div>
    </div>
  </div>
  <div class="card"><h2>Scoreboard <span class="badge sc-prov">PAPER FORECAST</span></h2>${score(d.tally, 'Live record')}${calibrationChart(d.tally)}${calibration(d.tally)}</div>
  ${d.backtest ? `<div class="card"><h2>The same model on past windows <span class="badge sc-prov">BACKTEST</span></h2><p class="muted" style="margin-top:0">${d.backtest.windows} past ${d.windowMinutes}-minute windows from the stored candles, each forecast from candles closed by its start. A backtest, not the live record: it can look better than the future will.</p>${score(d.backtest.tally, 'Backtest')}${calibrationChart(d.backtest.tally)}<ul class="fc-logs">${d.backtest.recent.map(logLine).join('')}</ul></div>` : ''}
  ${edgeCard(d)}
  <div class="card"><h2>How the call works</h2><p class="plain">Every ${d.windowMinutes} minutes, when a window opens, Mr. Cash reads the candles closed so far: the hour trend and how straight it was, the last fifteen minutes, how stretched price is from its average, RSI, and the Scanner's bias score. From these he gives a probability that price ends the window higher. At ${Math.round(d.line * 100)}% or more he calls up, at ${Math.round((1 - d.line) * 100)}% or less down, and in between he holds flat. When the window closes, the call is settled against the real close and scored with the Brier score, where 0.25 is a coin flip.</p><p class="muted pl-note">${esc(d.note)}</p><div class="row"><button class="chip" id="fc-refresh">${loading ? 'Reading…' : 'Check now'}</button></div></div>`
}

function homeView() {
  const box = $('dk-call'); if (!box || !desk) return
  const d = desk, c = d.current
  box.innerHTML = `<button class="fc-term fc-mini" data-tab="forecast" aria-label="Open the call desk">
    <span class="fc-bar-top"><i></i><i></i><i></i><span>the-call · ${esc(d.symbol)} · next ${d.windowMinutes}m</span><span class="badge sc-prov">PAPER FORECAST</span></span>
    <span class="fc-body">
      <span class="fc-line">› ${c ? `${callLine(c, d.line)} · <b id="fc-left-mini">${mmss(left())}</b> left · difficulty ${c.difficulty}/4` : `<span class="fc-flat">no call</span> · ${esc(statusText(d))}`}</span>
      ${d.log.slice(0, 3).map((r) => `<span class="fc-line fc-${r.result}">› ${hhmm(r.windowEnd)} settled <span class="fc-${r.outcome}">${ARROW[r.outcome]} ${r.outcome}</span> · ${r.call === 'flat' ? 'stayed flat' : `said ${ARROW[r.call]} ${r.call}`} · <em class="fc-res ${r.result}">${RESULT[r.result]}</em></span>`).join('')}
      ${!c && d.lastRead ? `<span class="fc-line">› last read: ${callLine(d.lastRead, d.line)} · <em class="fc-res void">STALE</em></span>` : ''}
      ${d.backtest ? `<span class="fc-line">› backtest ${d.backtest.tally.right}/${d.backtest.tally.calls} right (${pct(d.backtest.tally.hitRate)}) over ${d.backtest.windows} windows · skill ${d.backtest.tally.skill == null ? '—' : d.backtest.tally.skill.toFixed(3)} · <em class="fc-res void">BACKTEST</em></span>` : ''}
      <span class="fc-line fc-sum">› live ${d.tally.right}/${d.tally.calls} right (${pct(d.tally.hitRate)}) · ${d.tally.passed} passed · skill ${d.tally.skill == null ? '—' : d.tally.skill.toFixed(3)}${d.tally.status === 'OK' ? '' : ' · NOT ENOUGH DATA'}<span class="fc-cursor" aria-hidden="true">▌</span></span>
    </span>
  </button>`
}

function paint() {
  const form = $('fc-edge-form')
  if (form) { const fd = new FormData(form); for (const k of Object.keys(edge.form)) if (fd.has(k)) edge.form[k] = fd.get(k) }
  // Do not redraw the tab under someone who is typing in the edge check.
  if (!(form && form.contains(document.activeElement))) tabView()
  homeView()
}

function tickClock() {
  const l = mmss(left())
  const a = $('fc-left'), b = $('fc-left-mini')
  if (a) a.textContent = l
  if (b) b.textContent = l
  if (desk?.current && left() <= 0 && Date.now() - fetchedAt > 20_000) load()
}

function init() {
  const root = $('forecast-out')
  root?.addEventListener('click', (e) => {
    if (e.target.closest('#fc-refresh')) load(true)
    const w = e.target.closest('[data-win]'); if (w) { win = Number(w.dataset.win); desk = null; load(true) }
    if (e.target.closest('#fc-use-desk')) { const p = desk?.current?.pUp ?? desk?.lastRead?.pUp; if (p) { edge.form.p = Math.round(p * 1000) / 10; const i = document.querySelector('#fc-edge-form [name=p]'); if (i) i.value = edge.form.p } }
  })
  root?.addEventListener('submit', (e) => { if (e.target.id === 'fc-edge-form') { e.preventDefault(); runEdge() } })
  // Home: a slot under the markets strip, filled after every desk render.
  document.addEventListener('desk:rendered', () => {
    const markets = $('dk-markets')
    if (markets && !$('dk-call')) { const slot = document.createElement('div'); slot.id = 'dk-call'; markets.after(slot) }
    if (desk) homeView()
    if (Date.now() - fetchedAt > 60_000) load()
  })
  const section = $('tab-forecast')
  if (section) new MutationObserver(() => { if (!section.classList.contains('hidden') && Date.now() - fetchedAt > 20_000) load() }).observe(section, { attributes: true, attributeFilter: ['class'] })
  if (!ticker) ticker = setInterval(() => { if (document.visibilityState === 'visible') tickClock() }, 1000)
  setInterval(() => { if (document.visibilityState === 'visible') load() }, 60_000)
  load()
}

init()
