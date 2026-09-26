/**
 * THE CALL — up or down over the next window, on paper, with the working.
 *
 * Reads GET /api/forecast (PAPER FORECAST). Two views of the same desk:
 *   - the "The call" tab: the live call, its readings, the settled log,
 *     the scoreboard against a coin flip, calibration, and the BACKTEST;
 *   - a compact terminal on Home, under the markets strip.
 * Nothing here places an order; the desk has no execution path at all.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const $ = (id) => document.getElementById(id)
const pct = (v) => (v == null ? '—' : Math.round(v * 100) + '%')
const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const ARROW = { up: '▲', down: '▼', flat: '·', unchanged: '=' }
const RESULT = { right: 'RIGHT', wrong: 'WRONG', passed: 'PASSED', void: 'VOID' }

let desk = null, err = null, loading = false, fetchedAt = 0, ticker = null

async function load(force = false) {
  if (loading) return
  loading = true
  try {
    const r = await fetch('/api/forecast' + (force ? '?refresh=1' : ''), { credentials: 'same-origin' })
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

function tabView() {
  const root = $('forecast-out'); if (!root) return
  if (err && !desk) { root.innerHTML = `<div class="card"><p class="pl-err">${esc(err)}</p></div>`; return }
  if (!desk) { root.innerHTML = '<div class="card"><p class="muted">Opening the desk…</p></div>'; return }
  const d = desk, c = d.current
  root.innerHTML = `
  <div class="fc-term">
    <div class="fc-bar-top"><i></i><i></i><i></i><span>mr-cash · the-call · ${esc(d.symbol)} · ${d.windowMinutes}m</span><span class="badge sc-prov">PAPER FORECAST</span></div>
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
  <div class="card"><h2>Scoreboard <span class="badge sc-prov">PAPER FORECAST</span></h2>${score(d.tally, 'Live record')}${calibration(d.tally)}</div>
  ${d.backtest ? `<div class="card"><h2>The same model on past windows <span class="badge sc-prov">BACKTEST</span></h2><p class="muted" style="margin-top:0">${d.backtest.windows} past ${d.windowMinutes}-minute windows from the stored candles, each forecast from candles closed by its start. A backtest, not the live record: it can look better than the future will.</p>${score(d.backtest.tally, 'Backtest')}<ul class="fc-logs">${d.backtest.recent.map(logLine).join('')}</ul></div>` : ''}
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

function paint() { tabView(); homeView() }

function tickClock() {
  const l = mmss(left())
  const a = $('fc-left'), b = $('fc-left-mini')
  if (a) a.textContent = l
  if (b) b.textContent = l
  if (desk?.current && left() <= 0 && Date.now() - fetchedAt > 20_000) load()
}

function init() {
  const root = $('forecast-out')
  root?.addEventListener('click', (e) => { if (e.target.closest('#fc-refresh')) load(true) })
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
