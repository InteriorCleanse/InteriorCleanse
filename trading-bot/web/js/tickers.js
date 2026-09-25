/**
 * TICKERS — what to know about SPY, ES, NVDA, TSLA and AAPL before trading
 * them yourself.
 *
 * Two kinds of information, never mixed and always labelled:
 * - RIGHT NOW: read from the existing market watch (`GET /api/markets`,
 *   read-only), with the watch's own provenance label. ES is not watched, and
 *   the page says so rather than inventing a number.
 * - REFERENCE: contract facts and the usual calendar, from
 *   web/js/tickers-data.js. Dates that follow a published rule (third Friday,
 *   the ES roll) are computed; report dates are shown as usual months only.
 *
 * Nothing here trades, and nothing here is a forecast.
 */
import { TICKERS, ORDER, GROUPS, PROXY_NOTE, REVIEWED, futuresCalendar, nextMonthlyExpiry, esSpy, moveValue } from './tickers-data.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const $ = (id) => document.getElementById(id)
const STORE = 'mrcash-tickers'
const px = (n) => (n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toFixed(2))
const day = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

let current = (() => { try { const v = localStorage.getItem(STORE); return ORDER.includes(v) ? v : 'SPY' } catch { return 'SPY' } })()
let markets = { rows: [], asOf: 0, error: null, loading: false }

async function loadMarkets() {
  if (markets.loading) return
  markets.loading = true
  try {
    const r = await fetch('/api/markets')
    if (r.status === 401) { markets.error = 'Sign in again to see prices.'; return }
    const j = await r.json()
    if (!j.ok) { markets.error = j.error || 'The market watch did not answer.'; return }
    markets = { rows: j.data.rows || [], asOf: j.data.asOf || 0, error: null, loading: false }
  } catch { markets.error = 'The market watch did not answer.' } finally { markets.loading = false; render() }
}

const rowFor = (sym) => markets.rows.find((r) => r.symbol === sym) || null

function spark(values) {
  if (!values || values.length < 2) return ''
  const W = 160, H = 36, lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - lo) / span) * (H - 4)).toFixed(1)}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  return `<svg class="tk-spark ${up ? 'up' : 'down'}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}"/></svg>`
}

function priceBlock(r) {
  const sc = r.scan || {}
  if (!Number.isFinite(sc.price)) return `<p class="muted">NOT ENOUGH DATA: no price yet.</p>`
  const ch = Number.isFinite(sc.changePct24h) ? sc.changePct24h : null
  return `<div class="tk-price"><b>$${px(sc.price)}</b>${ch !== null ? `<span class="${ch >= 0 ? 'win' : 'loss'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</span>` : ''}${spark(sc.spark)}</div>
    <div class="tk-facts">
      <span>Trend <b>${esc(sc.trend ?? '—')}</b></span>
      <span>Volatility <b>${esc(sc.volatility ?? '—')}</b></span>
      ${sc.high24h != null && sc.low24h != null ? `<span>Range <b>${px(sc.low24h)} – ${px(sc.high24h)}</b></span>` : ''}
      ${sc.prevDay ? `<span>Yesterday <b>${px(sc.prevDay.low)} – ${px(sc.prevDay.high)}</b></span>` : ''}
    </div>
    <p class="muted tk-src">${esc(sc.statusText || '')} ${esc(r.feed || '')}${r.error ? ` · ${esc(r.error)}` : ''}. Read-only, from the Markets watch; it describes the price, it does not predict it.</p>`
}

function nowCard(t) {
  const waiting = markets.loading || !markets.asOf
  if (!t.watched) {
    const pr = t.proxy ? rowFor(t.proxy) : null
    return `<div class="card tk-now"><h2>Right now <span class="badge tk-prov off">NOT WATCHED</span></h2>
      <p class="muted">Mr. Cash has no futures data feed, so there is no ${esc(t.symbol)} price here, and none is estimated.${t.proxy ? ` The nearest market it does watch is <b>${esc(t.proxy)}</b>: ${esc(PROXY_NOTE[t.proxy] || 'a fund')}. Its price is not the future's price.` : ''}</p>
      ${pr ? `<div class="tk-proxy"><div class="tk-proxy-h"><b>${esc(t.proxy)}</b> <span class="badge tk-prov ${pr.provenance === 'LIVE DATA' ? 'live' : 'off'}">${esc(pr.provenance)}</span> <span class="badge tk-prov off">STAND-IN, NOT ${esc(t.symbol)}</span></div>${priceBlock(pr)}</div>`
        : t.proxy ? `<p class="muted">${waiting ? 'Reading the market watch…' : `${esc(t.proxy)} is not on the watchlist (MRCASH_WATCHLIST).`}</p>` : ''}
    </div>`
  }
  const r = rowFor(t.symbol)
  if (markets.error && !r) return `<div class="card tk-now"><h2>Right now</h2><p class="muted">${esc(markets.error)}</p></div>`
  if (!r) return `<div class="card tk-now"><h2>Right now</h2><p class="muted">${waiting ? 'Reading the market watch…' : `${esc(t.symbol)} is not on the watchlist (MRCASH_WATCHLIST).`}</p></div>`
  const sc = r.scan || {}
  return `<div class="card tk-now"><h2>Right now <span class="badge tk-prov ${r.provenance === 'LIVE DATA' ? 'live' : 'off'}">${esc(r.provenance)}</span></h2>
    ${priceBlock(r)}
    ${sc.setup ? `<p class="tk-setup"><b>Checklist:</b> ${esc(sc.setup.summary)} <span class="muted">(a count of plain checks, not a signal)</span></p>` : ''}
  </div>`
}

function contractCard(t) {
  const o = t.options, c = t.contract
  const rows = [
    ['What it is', t.what],
    c ? ['Contract', `${c.size}. One tick is ${+c.tick.toFixed(6)} (${c.unit}) = $${c.tickValue}; a 1.00 move is $${c.multiplier.toLocaleString('en-US')}.`] : null,
    c ? ['Smaller size', c.micro] : null,
    c ? ['Months', c.months] : null,
    c ? ['Settlement', `${c.settlement}.`] : null,
    c ? ['Last trading day', c.lastTradeText] : null,
    ['Options', `$${o.multiplier.toLocaleString('en-US')} per 1.00 move, settle into ${o.settlement}. ${o.exercise === 'american' ? 'American-style: can be exercised any day.' : t.exerciseText}`],
    ['Option expiries', o.expiries],
    ['Strikes', o.strikes],
    ['Hours', t.session],
  ].filter(Boolean)
  return `<div class="card"><h2>The contract</h2><table class="tk-table">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></div>`
}

function calendarCard(t, now) {
  const mo = nextMonthlyExpiry(now)
  const items = [
    `<li><b>Next monthly options expiry:</b> ${day(mo.date)}${mo.quarterly ? ' (quarterly: stock options, index options and futures all expire the same day, "quad witching")' : ''}.</li>`,
  ]
  if (t.contract) {
    const f = futuresCalendar(t.symbol, now)
    items.unshift(`<li><b>Front contract:</b> ${f.front.code}, last trades ${day(f.front.last)} (${f.daysToLast} day${f.daysToLast === 1 ? '' : 's'}).${f.outBy ? ` ${esc(f.outByText)}: ${day(f.outBy)}.` : ''}${f.active !== f.front.code ? ` <span class="amber">That date has passed: traders are in ${f.active} now.</span>` : ''}</li>`,
      `<li><b>Next contract:</b> ${f.next.code}, last trades ${day(f.next.last)}.</li>`)
    // Stock-style third-Friday expiry does not apply to options on commodity or Treasury futures.
    if (t.contract.physical) items.splice(2, 1)
  }
  items.push(`<li><b>Earnings:</b> ${esc(t.earningsText)}</li>`, `<li><b>Dividends:</b> ${esc(t.dividendText)}</li>`)
  if (t.history) items.push(`<li><b>${t.contract ? 'History' : 'Splits'}:</b> ${esc(t.history)}</li>`)
  return `<div class="card"><h2>Calendar</h2><ul class="tk-list">${items.join('')}</ul>
    <p class="muted pl-note">Contract dates follow the exchange's published rules and are worked out here on weekdays only; exchange holidays can move them. ${t.contract ? 'Options on futures usually stop trading before the future does; check the exchange calendar.' : 'Earnings are the usual months only. Confirm the exact date on the company\'s investor-relations page.'}</p></div>`
}

function listCard(title, items) {
  return `<div class="card"><h2>${esc(title)}</h2><ul class="tk-list">${items.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>`
}

function spreadsCard(t) {
  return `<div class="card"><h2>For option spreads</h2><ul class="tk-list">${t.spreadNotes.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    <div class="row"><button class="btn" data-plan="${esc(t.symbol)}">Plan a spread on ${esc(t.symbol)}</button><span class="muted">Opens the Spreads tab with ${esc(t.symbol)}'s contract size filled in.</span></div></div>`
}

function moveCard(t) {
  const c = t.contract
  return `<div class="card"><h2>What a move is worth</h2>
    <div class="pl-grid">
      <label>Contracts<input id="tk-mv-n" type="number" inputmode="decimal" step="any" value="1"></label>
      <label>Price move (${esc(c.unit)})<input id="tk-mv-x" type="number" inputmode="decimal" step="any" value="1"></label>
    </div>
    <div id="tk-mv-out" class="pl-out"></div>
    <p class="muted pl-note">${esc(c.size)}; one tick is $${c.tickValue}. ${esc(c.micro)}.</p></div>`
}

function renderMove() {
  const out = $('tk-mv-out'); if (!out) return
  const r = moveValue(current, { contracts: Number($('tk-mv-n').value), move: Number($('tk-mv-x').value) })
  if (!r) { out.innerHTML = ''; return }
  out.innerHTML = `<div class="pl-kpis"><div><span>Profit or loss</span><b>$${r.dollars.toLocaleString('en-US')}</b></div><div><span>Ticks</span><b>${r.ticks.toLocaleString('en-US')}</b></div><div><span>Per tick, per contract</span><b>$${r.perTick}</b></div></div>`
}

function converterCard() {
  return `<div class="card"><h2>ES and SPY side by side</h2>
    <div class="pl-grid">
      <label>ES contracts<input id="tk-es-n" type="number" inputmode="decimal" step="any" value="1"></label>
      <label>ES move (index points)<input id="tk-es-pts" type="number" inputmode="decimal" step="any" value="10"></label>
    </div>
    <div id="tk-es-out" class="pl-out"></div>
    <p class="muted pl-note">Rule of thumb only: SPY is about the S&P 500 ÷ 10, and ES carries dividends and interest in its price, so the true ratio drifts.</p></div>`
}

function renderConverter() {
  const out = $('tk-es-out'); if (!out) return
  const r = esSpy({ esContracts: Number($('tk-es-n').value), esPoints: Number($('tk-es-pts').value) })
  out.innerHTML = `<div class="pl-kpis">
    <div><span>ES profit or loss</span><b>$${r.esDollars.toLocaleString('en-US')}</b></div>
    <div><span>≈ SPY shares</span><b>${r.spyShares.toLocaleString('en-US')}</b></div>
    <div><span>≈ SPY option contracts</span><b>${r.spyOptionContracts}</b></div>
    <div><span>≈ SPY move</span><b>$${r.spyMoveDollars.toFixed(2)}</b></div>
  </div>`
}

function linksCard() {
  return `<div class="card tk-links"><h2>How they connect</h2><ul class="tk-list">
    <li><b>ES</b> is $50 × the S&P 500; <b>SPY</b> is about the S&P 500 ÷ 10. The same index, so they move together; ES also trades overnight.</li>
    <li><b>NVDA</b> and <b>AAPL</b> are among the largest weights in the S&P 500, and <b>TSLA</b> has been a member since December 2020. Their earnings nights can move SPY and ES on their own.</li>
    <li><b>NQ</b> is where NVDA, AAPL and TSLA weigh most, so it usually swings harder than ES.</li>
    <li><b>ZN</b> moves opposite to the 10-year yield. Rising yields tend to weigh on growth stocks (NQ) and on gold, which pays no interest.</li>
    <li><b>GC</b> and <b>SI</b> move together, silver more violently. <b>CL</b> and <b>NG</b> are both energy but answer to different things: oil to OPEC+ and the world economy, gas to US weather and storage.</li>
    <li>All of them react to the same macro calendar: Fed decisions, CPI and the jobs report.</li>
  </ul></div>`
}

function render() {
  const root = $('tickers-out'); if (!root) return
  const t = TICKERS[current], now = new Date()
  const focus = document.activeElement?.id
  const keep = { n: $('tk-es-n')?.value, pts: $('tk-es-pts')?.value, mvn: $('tk-mv-n')?.value, mvx: $('tk-mv-x')?.value, sym: $('tk-mv-n') ? current : null }
  root.innerHTML = `
    <div class="tk-chips" role="tablist" aria-label="Ticker">${GROUPS.map((g) => `<div class="tk-group"><span>${esc(g.label)}</span>${g.symbols.map((s) => `<button class="chip${s === current ? ' on' : ''}" role="tab" aria-selected="${s === current}" data-ticker="${s}">${s}</button>`).join('')}</div>`).join('')}</div>
    <div class="tk-head"><h2>${esc(t.symbol)} <span class="muted">${esc(t.name)}</span></h2><span class="badge tk-kind">${esc(t.kind)}</span></div>
    <div class="tk-grid">
      ${nowCard(t)}
      ${contractCard(t)}
      ${calendarCard(t, now)}
      ${t.contract ? moveCard(t) : ''}
      ${t.symbol === 'ES' ? converterCard() : ''}
      ${listCard('What moves it', t.drivers)}
      ${spreadsCard(t)}
      ${linksCard()}
    </div>
    <p class="muted pl-foot">Reference facts reviewed ${esc(REVIEWED)}. Specifications and schedules change: confirm them with the company, the exchange and your broker. Nothing on this page is a forecast, and Mr. Cash does not trade these markets.</p>`
  if (t.contract) {
    if (keep.mvn != null && keep.sym === current) { $('tk-mv-n').value = keep.mvn; $('tk-mv-x').value = keep.mvx }
    renderMove()
  }
  if (t.symbol === 'ES') {
    if (keep.n != null) $('tk-es-n').value = keep.n
    if (keep.pts != null) $('tk-es-pts').value = keep.pts
    renderConverter()
  }
  if (focus && $(focus)) $(focus).focus()
}

function init() {
  const root = $('tickers-out'); if (!root) return
  render()
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-ticker]')
    if (c) { current = c.dataset.ticker; try { localStorage.setItem(STORE, current) } catch { /* fine */ } render(); return }
    const p = e.target.closest('[data-plan]')
    if (p) {
      if (typeof window.showTab === 'function') window.showTab('spreads')
      window.dispatchEvent(new CustomEvent('mrcash:spread-underlying', { detail: p.dataset.plan }))
    }
  })
  root.addEventListener('input', (e) => { if (e.target.id === 'tk-es-n' || e.target.id === 'tk-es-pts') renderConverter(); if (e.target.id === 'tk-mv-n' || e.target.id === 'tk-mv-x') renderMove() })
  // Jumps here from the Spreads tab's "More about …" button.
  window.addEventListener('mrcash:ticker', (e) => { if (TICKERS[e.detail]) { current = e.detail; render() } })
  // Read the market watch when the tab is opened, and at most once a minute while it stays open.
  const section = $('tab-tickers')
  let last = 0
  const maybeLoad = () => { if (section && !section.classList.contains('hidden') && Date.now() - last > 60_000) { last = Date.now(); loadMarkets() } }
  if (section) new MutationObserver(maybeLoad).observe(section, { attributes: true, attributeFilter: ['class'] })
  setInterval(maybeLoad, 15_000)
  maybeLoad()
}

init()
