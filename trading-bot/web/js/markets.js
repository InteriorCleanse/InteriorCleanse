/**
 * MARKETS — every market Mr. Cash watches, READ-ONLY.
 *
 * Two views of `/api/markets`:
 *   - the strip on Home (one card per kind of market: crypto, stocks, forex,
 *     indexes), filled whenever the desk announces it has drawn;
 *   - the Markets tab: every market, its move, its trend, and what the scan
 *     noticed, newest first.
 *
 * It draws the payload and nothing else. Every price names its feed; a feed
 * that is not connected or failed says so instead of showing a number. There
 * is no control here that can place an order.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const KIND_LABEL = { crypto: 'Crypto', stock: 'Stocks', forex: 'Forex', index: 'Indexes' }
const KIND_ICON = {
  crypto: '<circle cx="12" cy="12" r="8.5"/><path d="M10 7.5h3.2a2.2 2.2 0 0 1 0 4.4H10zM10 11.9h3.8a2.3 2.3 0 0 1 0 4.6H10zM10 7.5v9M11 6v1.5M11 16.5V18"/>',
  stock: '<path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 3 5-6"/>',
  forex: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 8.5c-.6-.8-1.5-1.2-2.5-1.2-1.6 0-2.7.9-2.7 2.1 0 2.8 5.4 1.6 5.4 4.6 0 1.3-1.2 2.2-2.8 2.2-1.1 0-2.1-.5-2.7-1.3M12 5.8v1.5M12 16.7v1.5"/>',
  index: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/>',
}
const ic = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${KIND_ICON[k] || ''}</svg>`

function price(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 10) return n.toFixed(2)
  return n.toFixed(4)
}
const pct = (n) => (n === null || n === undefined ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`)

function spark(values, up) {
  if (!values || values.length < 2) return '<svg class="mk-spark none" viewBox="0 0 100 28" aria-hidden="true"></svg>'
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(26 - ((v - lo) / span) * 24).toFixed(2)}`).join(' ')
  return `<svg class="mk-spark ${up ? 'up' : 'down'}" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" /></svg>`
}

const PROV_TITLE = {
  'LIVE DATA': 'Read from the venue just now',
  'DELAYED FEED': 'A free data feed: one exchange\'s prints, a small slice of volume',
  OVERRIDE: 'This feed is pointed at an override URL, not the real venue',
  'NOT CONNECTED': 'No keys for this feed yet',
  UNAVAILABLE: 'The feed did not answer',
}
const prov = (p) => `<span class="mk-prov ${esc(String(p).replace(/\s+/g, '-'))}" title="${esc(PROV_TITLE[p] || '')}">${esc(p)}</span>`

let last = null

async function getMarkets(refresh) {
  const r = await fetch('/api/markets' + (refresh ? '?refresh=1' : ''))
  if (r.status === 401) { location.href = '/login'; return null }
  const j = await r.json()
  if (!j.ok) throw new Error(j.error || 'could not read the markets')
  last = j.data
  return j.data
}

/* ---------------- Home: one card per kind of market ---------------- */
function stripCard(kind, rows) {
  const lead = rows.find((r) => r.scan.price !== null) || rows[0]
  const s = lead.scan, up = (s.changePct24h ?? 0) >= 0
  const val = s.price === null
    ? `<div class="mk-card-none">${esc(lead.provenance === 'NOT CONNECTED' ? 'Not connected' : 'No data')}</div>`
    : `<div class="mk-card-px"><b>${price(s.price)}</b><span class="${up ? 'up' : 'down'}">${pct(s.changePct24h)}</span></div>${spark(s.spark, up)}`
  return `<button class="mk-card" data-tab="markets" title="${esc(lead.feed)}">
    <span class="mk-card-hd"><i class="mk-ic ${kind}">${ic(kind)}</i><b>${KIND_LABEL[kind]}</b><span class="mk-more">${rows.length} watched</span></span>
    <span class="mk-card-sym">${esc(lead.label)} ${prov(lead.provenance)}</span>
    ${val}
  </button>`
}

function renderStrip(d) {
  const box = document.getElementById('dk-markets')
  if (!box) return
  const kinds = ['crypto', 'stock', 'forex', 'index'].filter((k) => d.rows.some((r) => r.kind === k))
  const notes = d.rows.flatMap((r) => r.scan.notes.map((n) => ({ ...n, label: r.label }))).sort((a, b) => b.at - a.at)
  box.innerHTML = `
    <div class="mk-strip-hd"><b>Markets he's watching</b><span>${d.rows.length} markets, rescanned every ${d.everyMinutes} minutes · read-only</span></div>
    <div class="mk-strip">${kinds.map((k) => stripCard(k, d.rows.filter((r) => r.kind === k))).join('')}</div>
    ${notes.length ? `<p class="mk-latest"><i></i><b>${esc(notes[0].label)}</b> ${esc(notes[0].text)}</p>` : ''}`
}

async function fillStrip() {
  const box = document.getElementById('dk-markets')
  if (!box) return
  if (last) renderStrip(last)
  try { const d = await getMarkets(false); if (d) renderStrip(d) } catch (e) { if (!last) box.innerHTML = `<p class="muted">Markets unavailable: ${esc(e.message)}</p>` }
}
document.addEventListener('desk:rendered', () => { fillStrip() })

/* ---------------- The Markets tab ---------------- */
const TREND = { uptrend: 'uptrend', downtrend: 'downtrend', range: 'ranging' }

function row(r) {
  const s = r.scan, up = (s.changePct24h ?? 0) >= 0
  return `<div class="mk-row ${s.price === null ? 'dead' : ''}">
    <div class="mk-name"><b>${esc(r.label)}</b><span>${esc(r.symbol)} · ${prov(r.provenance)}</span></div>
    <div class="mk-px">${s.price === null ? '<b class="none">—</b>' : `<b>${price(s.price)}</b><span class="${up ? 'up' : 'down'}">${pct(s.changePct24h)}</span>`}</div>
    ${spark(s.spark, up)}
    <div class="mk-state">${s.price === null ? `<span class="mk-why">${esc(r.error || s.statusText)}</span>` : `<span class="mk-trend ${esc(s.trend || '')}">${esc(s.trend ? TREND[s.trend] : 'NOT ENOUGH DATA')}${s.strength !== null ? ` · ${s.strength}/100` : ''}</span><span class="mk-status ${esc(s.status)}">${esc(s.statusText)}</span>`}</div>
    ${s.notes.length ? `<ul class="mk-notes">${s.notes.slice(0, 2).map((n) => `<li>${esc(n.text)} <time>${new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></li>`).join('')}</ul>` : ''}
  </div>`
}

function renderTab(d) {
  const out = document.getElementById('markets-out')
  if (!out) return
  const kinds = ['crypto', 'stock', 'forex', 'index'].filter((k) => d.rows.some((r) => r.kind === k))
  const notes = d.rows.flatMap((r) => r.scan.notes.map((n) => ({ ...n, label: r.label }))).sort((a, b) => b.at - a.at).slice(0, 12)
  out.innerHTML = `
    <section class="mk-hero">
      <div><h2>Every market, watched around the clock</h2>
      <p>${esc(d.note)}</p></div>
      <div class="mk-hero-stats">${d.groups.map((g) => `<span><i class="mk-ic ${g.kind}">${ic(g.kind)}</i>${esc(g.label)} <b>${g.live}/${g.rows}</b> updating</span>`).join('')}</div>
    </section>
    <div class="mk-grid">
      ${kinds.map((k) => `<section class="mk-group"><h3><i class="mk-ic ${k}">${ic(k)}</i>${KIND_LABEL[k]}</h3>${d.rows.filter((r) => r.kind === k).map(row).join('')}</section>`).join('')}
    </div>
    <section class="mk-feed">
      <h3>What the scan noticed</h3>
      ${notes.length ? `<ul>${notes.map((n) => `<li><b>${esc(n.label)}</b><span>${esc(n.text)}</span><time>${new Date(n.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</time></li>`).join('')}</ul>` : '<p class="muted">Nothing notable in the last few hours. New observations also land in the bell.</p>'}
    </section>
    <p class="mk-foot">Feeds: crypto from Binance's public candles; forex from Kraken's public FX book (a crypto venue's rate, not the interbank rate); stocks and index ETFs from Alpaca's free IEX feed with your read-only keys. Hourly candles. An index is watched through the ETF that tracks it. Observations, not signals: nothing on this page can place an order.</p>`
}

async function loadMarkets(refresh = false) {
  const out = document.getElementById('markets-out')
  const status = document.getElementById('markets-status')
  if (!out) return
  if (last && !refresh) renderTab(last)
  if (status) status.textContent = refresh ? 'rescanning…' : ''
  try {
    const d = await getMarkets(refresh)
    if (d) { renderTab(d); if (status) status.textContent = `checked ${new Date(d.asOf).toLocaleTimeString()}` }
  } catch (e) {
    out.innerHTML = `<div class="plain">Couldn't read the markets just now: ${esc(e.message)}. Showing you nothing rather than making something up.</div>`
    if (status) status.textContent = 'failed'
  }
}
window.loadMarkets = loadMarkets
document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-markets-refresh')) loadMarkets(true)
})
