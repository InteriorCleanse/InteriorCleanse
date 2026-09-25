/**
 * BIG MONEY — what large and connected money has DISCLOSED, and what is
 * trading the most today. Reads `GET /api/bigmoney` (read-only) and draws it.
 *
 * Every figure comes from a named public source with its delay spelled out:
 * congress trades (STOCK Act, up to 45 days late, dollar ranges), insider
 * Form 4 filings (about two business days), off-exchange volume (FINRA), and
 * Alpaca's most-active list. Nothing here is a signal, and Mr. Cash does not
 * trade on it.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const $ = (id) => document.getElementById(id)
const usd = (n) => (n == null ? '—' : '$' + (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'k' : Math.round(n)))
const big = (n) => (n == null ? '—' : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n))
const when = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

let data = null, error = null, loading = false
let view = { ticker: '', side: 'all' }

async function load(refresh = false) {
  if (loading) return
  loading = true; render()
  try {
    const r = await fetch('/api/bigmoney' + (refresh ? '?refresh=1' : ''))
    if (r.status === 401) { error = 'Sign in again to see this.'; return }
    const j = await r.json()
    if (!j.ok) { error = j.error || 'No answer.'; return }
    data = j.data; error = null
  } catch { error = 'The server did not answer.' } finally { loading = false; render() }
}

const statusCls = (s) => (s === 'CONNECTED' ? 'live' : s === 'OVERRIDE' ? 'warn' : 'off')

function sourcesCard(d) {
  const row = (name, what, s) => `<div class="bm-src"><div><b>${esc(name)}</b> <span class="badge bm-st ${statusCls(s.status)}">${esc(s.status)}</span></div><div class="muted">${esc(what)}</div><div class="bm-src-d">${esc(s.detail)}</div></div>`
  return `<div class="card bm-sources"><div class="bm-head"><h2>Sources</h2><div class="row"><span class="muted">${d.asOf ? `Checked ${when(d.asOf)} · every few hours` : 'Not checked yet'}</span><button class="btn ghost" id="bm-refresh" ${loading ? 'disabled' : ''}>${loading ? 'Checking…' : 'Check now'}</button></div></div>
    <div class="bm-srcs">
      ${row('SEC EDGAR', 'Insider Form 4 filings · free · about 2 business days late', d.sources.sec)}
      ${row('Quiver Quantitative', 'Congress trades · off-exchange volume · paid key', d.sources.quiver)}
      ${row('Alpaca', 'Most-traded stocks and movers · your read-only keys', d.sources.alpaca)}
    </div></div>`
}

function digestCard(d) {
  return `<div class="card bm-digest"><h2>What the filings say <span class="badge bm-tag">DISCLOSED · last ${d.windowDays} days</span></h2><ul class="tk-list">${d.digest.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`
}

function boardCard(d) {
  if (!d.board.length) return `<div class="card"><h2>Where the money went</h2><p class="muted">NOT ENOUGH DATA: no filings from the connected sources yet. Connect a source above.</p></div>`
  const rows = d.board.slice(0, 25).map((b) => {
    const c = b.congress, i = b.insiders
    return `<tr class="${view.ticker === b.ticker ? 'on' : ''}" data-bmt="${esc(b.ticker)}">
      <td><b>${esc(b.ticker)}</b></td>
      <td>${c.buys || c.sells ? `<span class="win">${c.buys} buy${c.buys === 1 ? '' : 's'}</span> · <span class="loss">${c.sells} sell${c.sells === 1 ? '' : 's'}</span><div class="muted">${c.members.length} member${c.members.length === 1 ? '' : 's'}${c.lowSum ? ` · at least ${usd(c.lowSum)}` : ''}</div>` : '<span class="muted">—</span>'}</td>
      <td>${i.buys || i.sells ? `<span class="win">${i.buys} buy${i.buys === 1 ? '' : 's'} ${i.buyValue ? usd(i.buyValue) : ''}</span> · <span class="loss">${i.sells} sell${i.sells === 1 ? '' : 's'} ${i.sellValue ? usd(i.sellValue) : ''}</span>${i.planSells ? `<div class="muted">${i.planSells} under 10b5-1 plans</div>` : ''}` : '<span class="muted">—</span>'}</td>
      <td class="num">${b.offShare != null ? Math.round(b.offShare * 100) + '%' : '—'}</td>
      <td class="num">${b.volumeRank ? '#' + b.volumeRank : '—'}</td>
    </tr>${b.notes.length ? `<tr class="bm-note"><td></td><td colspan="4">${b.notes.map(esc).join(' ')}</td></tr>` : ''}`
  }).join('')
  return `<div class="card bm-board"><h2>Where the money went <span class="muted bm-sub">tap a ticker to filter the filings below</span></h2>
    <div class="scroll"><table class="pl-table bm-table"><tr><th>Ticker</th><th>Congress</th><th>Insiders (open market)</th><th class="num">Off-exchange</th><th class="num">Volume rank</th></tr>${rows}</table></div>
    <p class="muted pl-note">Counts and dollar amounts from filings only. Congress amounts are the low end of each disclosed range. Insider columns count open-market purchases (code P) and sales (code S) only; grants, option exercises and tax withholding are left out because they are not buying or selling decisions.</p></div>`
}

function leadersCard(d) {
  const top = d.mostActive.slice(0, 12), max = Math.max(1, ...top.map((m) => m.volume || 0))
  const mv = (list, cls) => list.slice(0, 6).map((m) => `<li><b>${esc(m.symbol)}</b><span class="${cls}">${m.changePct != null ? (m.changePct >= 0 ? '+' : '') + m.changePct.toFixed(1) + '%' : '—'}</span></li>`).join('')
  return `<div class="card bm-leaders"><h2>Most traded today <span class="badge bm-tag">VOLUME</span></h2>
    ${top.length ? `<ol class="bm-active">${top.map((m) => `<li><b>${esc(m.symbol)}</b><span class="bm-bar"><i style="width:${Math.max(3, Math.round(((m.volume || 0) / max) * 100))}%"></i></span><span class="num">${big(m.volume)}</span></li>`).join('')}</ol>` : '<p class="muted">NOT ENOUGH DATA: needs the Alpaca source.</p>'}
    ${d.gainers.length || d.losers.length ? `<div class="bm-movers"><div><h4>Up most</h4><ul>${mv(d.gainers, 'win')}</ul></div><div><h4>Down most</h4><ul>${mv(d.losers, 'loss')}</ul></div></div>` : ''}
    <p class="muted pl-note">Volume shows where trading is heaviest, not who is trading or which way. Big volume can be big buyers, big sellers, or both.</p></div>`
}

const sideOk = (s) => view.side === 'all' || view.side === s
const tickOk = (t) => !view.ticker || view.ticker === t

function congressCard(d) {
  const rows = d.congress.filter((c) => sideOk(c.side) && tickOk(c.ticker)).slice(0, 60)
  return `<div class="card"><h2>Congress trades <span class="badge bm-tag">STOCK ACT · up to 45 days late</span></h2>
    ${rows.length ? `<div class="scroll"><table class="pl-table bm-table"><tr><th>Reported</th><th>Member</th><th>Ticker</th><th>Trade</th><th>Amount</th><th class="num">Days late</th></tr>
    ${rows.map((c) => `<tr><td>${esc(c.reported ?? '—')}</td><td>${esc(c.who)}${c.chamber ? `<div class="muted">${esc(c.chamber)}${c.party ? ' · ' + esc(c.party) : ''}</div>` : ''}</td><td><b>${esc(c.ticker)}</b></td><td class="${c.side === 'buy' ? 'win' : c.side === 'sell' ? 'loss' : ''}">${esc(c.transaction)}</td><td>${esc(c.range ?? '—')}</td><td class="num">${c.lagDays ?? '—'}</td></tr>`).join('')}</table></div>`
    : `<p class="muted">${d.sources.quiver.status === 'CONNECTED' || d.sources.quiver.status === 'OVERRIDE' ? 'None match the filter.' : 'Needs the Quiver source.'}</p>`}</div>`
}

function insiderCard(d) {
  const rows = d.insiders.filter((i) => (view.side === 'all' ? true : i.side === view.side) && tickOk(i.ticker)).slice(0, 80)
  return `<div class="card"><h2>Insider trades <span class="badge bm-tag">SEC FORM 4 · about 2 business days late</span></h2>
    ${rows.length ? `<div class="scroll"><table class="pl-table bm-table"><tr><th>Date</th><th>Ticker</th><th>Insider</th><th>What</th><th class="num">Shares</th><th class="num">Price</th><th class="num">Value</th></tr>
    ${rows.map((i) => `<tr class="${i.side === 'other' ? 'bm-dim' : ''}"><td>${esc(i.date ?? '—')}</td><td><b>${esc(i.ticker)}</b></td><td>${esc(i.who)}${i.role ? `<div class="muted">${esc(i.role)}</div>` : ''}</td><td class="${i.side === 'buy' ? 'win' : i.side === 'sell' ? 'loss' : ''}">${esc(i.codeText)}${i.plan && i.side === 'sell' ? ' <span class="badge bm-plan">10b5-1 plan</span>' : ''}</td><td class="num">${big(i.shares)}</td><td class="num">${i.price ? '$' + i.price.toFixed(2) : '—'}</td><td class="num">${usd(i.value)}</td></tr>`).join('')}</table></div>`
    : `<p class="muted">${d.sources.sec.status === 'CONNECTED' || d.sources.sec.status === 'OVERRIDE' || d.sources.quiver.status === 'CONNECTED' ? 'None match the filter.' : 'Needs the SEC or Quiver source.'}</p>`}
    <p class="muted pl-note">Greyed rows are not buying or selling decisions (grants, exercises, tax withholding). A 10b5-1 sale was scheduled months ahead under a pre-arranged plan.</p></div>`
}

function filters(d) {
  const tickers = [...new Set(d.board.map((b) => b.ticker))].slice(0, 20)
  return `<div class="bm-filters"><div class="sp-chips">${[['all', 'All'], ['buy', 'Buys'], ['sell', 'Sells']].map(([k, l]) => `<button class="chip${view.side === k ? ' on' : ''}" data-bmside="${k}">${l}</button>`).join('')}</div>
    <div class="sp-chips">${view.ticker ? `<button class="chip on" data-bmt="">${esc(view.ticker)} ✕</button>` : tickers.map((t) => `<button class="chip" data-bmt="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`
}

function readCard() {
  return `<div class="card bm-read"><h2>How to read this</h2><ul class="tk-list">
    <li><b>It is late by law.</b> Members of Congress have up to 45 days to disclose a trade, and report a dollar range rather than an amount. Insiders file within about two business days.</li>
    <li><b>Insider sales are common; purchases are not.</b> Executives sell for taxes, diversification and planned schedules. An open-market purchase with their own cash is rarer.</li>
    <li><b>Off-exchange share</b> is how much of a stock's reported volume traded away from public exchanges, in dark pools and at wholesalers. A high share alone does not say which way money moved.</li>
    <li><b>Volume leaders</b> show where trading is heaviest today, not who is trading or why.</li>
    <li>None of this has been tested as a trading rule here. Research before acting, and remember Mr. Cash does not trade on it.</li>
  </ul></div>`
}

function render() {
  const root = $('bigmoney-out'); if (!root) return
  if (!data) { root.innerHTML = `<div class="card"><p class="muted">${error ? esc(error) : 'Loading…'}</p></div>`; return }
  root.innerHTML = `${sourcesCard(data)}${digestCard(data)}<div class="bm-grid">${boardCard(data)}${leadersCard(data)}</div>${filters(data)}<div class="bm-grid">${insiderCard(data)}${congressCard(data)}</div>${readCard()}
    <p class="muted pl-foot">${esc(data.note)}</p>`
}

function init() {
  const root = $('bigmoney-out'); if (!root) return
  render()
  root.addEventListener('click', (e) => {
    if (e.target.closest('#bm-refresh')) { load(true); return }
    const t = e.target.closest('[data-bmt]'); if (t) { view.ticker = view.ticker === t.dataset.bmt ? '' : t.dataset.bmt; render(); return }
    const s = e.target.closest('[data-bmside]'); if (s) { view.side = s.dataset.bmside; render() }
  })
  const section = $('tab-bigmoney')
  let last = 0
  const maybe = () => { if (section && !section.classList.contains('hidden') && Date.now() - last > 120_000) { last = Date.now(); load() } }
  if (section) new MutationObserver(maybe).observe(section, { attributes: true, attributeFilter: ['class'] })
  maybe()
}

init()
