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
const KIND_LABEL = { crypto: 'Crypto', stock: 'Stocks', forex: 'Forex', index: 'Indexes & funds' }
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
    ${s.setup ? `<details class="mk-row-setup"><summary>${pips(s.setup)} ${esc(s.setup.summary)}</summary>${s.setup.checks.map((c) => `<p class="${c.lean}"><b>${esc(c.label)}</b> ${esc(c.text)}</p>`).join('')}${s.setup.invalidation ? `<p class="inval"><b>Invalidation</b> ${esc(s.setup.invalidation.text)}</p>` : ''}</details>` : ''}
    ${s.notes.length ? `<ul class="mk-notes">${s.notes.slice(0, 2).map((n) => `<li>${esc(n.text)} <time>${new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></li>`).join('')}</ul>` : ''}
  </div>`
}

const LEAN_WORD = { bull: 'leans up', bear: 'leans down', none: 'no clear lean' }
const CHECK_ICON = {
  trend: '<path d="m4 16 5-5 4 4 7-8"/><path d="M15 7h5v5"/>',
  momentum: '<path d="M5 20V12M10 20V8M15 20v-6M20 20V5"/>',
  levels: '<path d="M4 7h16M4 17h16"/><path d="m8 12 3-3 3 3 3-3"/>',
  volume: '<rect x="4" y="10" width="3" height="10"/><rect x="10.5" y="5" width="3" height="15"/><rect x="17" y="12" width="3" height="8"/>',
  context: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5"/>',
}
const cic = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${CHECK_ICON[k] || ''}</svg>`
const pips = (st) => `<span class="mk-pips ${st.lean}" aria-label="${st.aligned} of ${st.total} checks line up">${Array.from({ length: st.total }, (_, i) => `<i class="${i < st.aligned ? 'on' : ''}"></i>`).join('')}</span>`

/** The scan overview: what the watch is doing right now, in numbers from the rows. */
function overview(d) {
  const o = d.overview || { markets: d.rows.length, signals: 0, alerts24h: 0, setups: 0 }
  return `<section class="mk-over">
    <div class="mk-over-hd"><span class="mk-scan"><i></i>Scan ${d.asOf ? 'running' : 'starting'}</span><span>every ${d.everyMinutes} minutes · last ${d.asOf ? new Date(d.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
    <div class="mk-kpis">
      <div><b>${o.markets}</b><span>markets</span></div>
      <div><b>${o.signals}</b><span>signals on the board</span></div>
      <div><b>${o.alerts24h}</b><span>alerts in 24h</span></div>
      <div><b class="${o.setups ? 'hot' : ''}">${o.setups}</b><span>setups lining up</span></div>
    </div>
    <table class="mk-table"><thead><tr><th>Market</th><th>Status</th><th>Signals</th><th>Top result</th></tr></thead><tbody>
      ${d.groups.map((g) => `<tr><td><i class="mk-ic ${g.kind}">${ic(g.kind)}</i>${esc(g.label)}</td><td><span class="mk-dot ${g.live ? 'on' : ''}"></span>${g.live ? `${g.live}/${g.rows} updating` : 'closed or not connected'}</td><td>${g.signals}</td><td>${g.top ? esc(g.top) : '<span class="muted">nothing yet</span>'}</td></tr>`).join('')}
    </tbody></table>
  </section>`
}

/** One market's checklist, in the shape of the analysis card: five checks, the count, the invalidation. */
function setupCard(r) {
  const st = r.scan.setup
  return `<article class="mk-setup ${st.lean}">
    <div class="mk-setup-hd"><div><b>${esc(r.label)}</b><span>${esc(r.symbol)} · 1h · ${prov(r.provenance)}</span></div>
      <div class="mk-q"><span class="mk-lean ${st.lean}">${LEAN_WORD[st.lean]}</span>${pips(st)}<em>${st.aligned} of ${st.total} line up</em></div></div>
    <div class="mk-checks">${st.checks.map((c) => `<div class="mk-check ${c.lean}"><i>${cic(c.key)}</i><div><b>${esc(c.label)}</b><p>${esc(c.text)}</p></div><span class="mk-arrow" aria-label="${c.lean === 'bull' ? 'leans up' : c.lean === 'bear' ? 'leans down' : 'no lean'}">${c.lean === 'bull' ? '▲' : c.lean === 'bear' ? '▼' : '–'}</span></div>`).join('')}</div>
    <p class="mk-inval">${st.invalidation ? `<b>Invalidation</b> ${esc(st.invalidation.text)}` : '<b>No lean</b> The checks disagree, so there is nothing to be wrong about yet.'}</p>
  </article>`
}

function renderTab(d) {
  const out = document.getElementById('markets-out')
  if (!out) return
  const kinds = ['crypto', 'stock', 'forex', 'index'].filter((k) => d.rows.some((r) => r.kind === k))
  const notes = d.rows.flatMap((r) => r.scan.notes.map((n) => ({ ...n, label: r.label }))).sort((a, b) => b.at - a.at).slice(0, 12)
  // A refresh redraws the page; keep the setups fold as the reader left it.
  const wasOpen = !!document.getElementById('mk-setups-fold')?.open
  const ranked = d.rows.filter((r) => r.scan.setup && r.scan.setup.lean !== 'none').sort((a, b) => b.scan.setup.aligned - a.scan.setup.aligned).slice(0, 4)
  out.innerHTML = `
    <section class="mk-hero">
      <div><h2>Every market, watched around the clock</h2>
      <p>${esc(d.note)}</p></div>
    </section>
    ${overview(d)}
    <h3 class="mk-h">Every market</h3>
    <div class="mk-grid">
      ${kinds.map((k) => `<section class="mk-group"><h3><i class="mk-ic ${k}">${ic(k)}</i>${KIND_LABEL[k]}</h3>${d.rows.filter((r) => r.kind === k).map(row).join('')}</section>`).join('')}
    </div>
    <details class="mk-setups-fold" id="mk-setups-fold">
      <summary><span class="mk-h">Setups worth a look</span><span class="mk-fold-sum">${ranked.length ? `${ranked.map((r) => `${esc(r.label)} ${pips(r.scan.setup)}`).join(' · ')}` : 'no market has a clear lean right now'}</span></summary>
      <p class="mk-fold-note">Five checks per market (trend, momentum, key levels, volume, context) and where the idea would be wrong. A checklist, not a forecast.</p>
      ${ranked.length ? `<div class="mk-setups">${ranked.map(setupCard).join('')}</div>` : '<p class="muted mk-none-yet">No market has a clear lean right now. That is an answer too.</p>'}
    </details>
    <section class="mk-feed">
      <h3>What the scan noticed</h3>
      ${notes.length ? `<ul>${notes.map((n) => `<li><b>${esc(n.label)}</b><span>${esc(n.text)}</span><time>${new Date(n.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</time></li>`).join('')}</ul>` : '<p class="muted">Nothing notable in the last few hours. New observations also land in the bell.</p>'}
    </section>
    <p class="mk-foot">Feeds: crypto from Binance's public candles; forex from Kraken's public FX book (a crypto venue's rate, not the interbank rate); stocks and index ETFs from Alpaca's free IEX feed with your read-only keys. Hourly candles. An index is watched through the ETF that tracks it. Observations, not signals: nothing on this page can place an order.</p>`
  if (wasOpen) document.getElementById('mk-setups-fold').open = true
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
