/**
 * THE STOCK DESK — the owner's momentum / relative-strength strategy, running on
 * its own clock with a PAPER account.
 *
 * Reads GET /api/stocks; posts to /run, /pause, /flatten. Nothing on this page
 * reaches a broker: every fill is simulated and labelled PAPER.
 */
import { esc } from './api.js'

const $ = (id) => document.getElementById(id)
let snap = null, err = null, busy = '', loadedAt = 0

async function csrf() { const cfg = await fetch('/api/config', { credentials: 'same-origin' }).then((r) => r.json()); return cfg.csrf }
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': await csrf() }, body: JSON.stringify(body || {}) })
  const j = await r.json(); if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`); return j.data
}
async function load() {
  try { const j = await fetch('/api/stocks', { credentials: 'same-origin' }).then((r) => r.json()); if (!j.ok) throw new Error(j.error); snap = j.data; err = null; loadedAt = Date.now() } catch (e) { err = e.message }
  paint()
}

const usd = (n, d = 2) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
const pc = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const ct = (ms) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) + ' CT'
const when = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const PHASE = { regular: 'Trading hours', premarket: 'Premarket', closed: 'Market closed' }
const tone = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat')

/** A small area chart of the paper equity curve. Honest when there are too few points. */
function curve(points, start) {
  if (!points || points.length < 2) return `<div class="sk-curve-empty">The equity curve draws itself after a few cycles.</div>`
  const W = 520, H = 150, P = 6
  const vs = points.map((p) => p.v), lo = Math.min(start, ...vs), hi = Math.max(start, ...vs), span = hi - lo || 1
  const x = (k) => P + (k / (points.length - 1)) * (W - 2 * P), y = (v) => H - P - ((v - lo) / span) * (H - 2 * P)
  const line = points.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  const up = vs[vs.length - 1] >= start
  return `<svg class="sk-curve ${up ? 'up' : 'down'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Paper equity curve">
    <defs><linearGradient id="skg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <line x1="${P}" x2="${W - P}" y1="${y(start).toFixed(1)}" y2="${y(start).toFixed(1)}" class="sk-base"/>
    <path d="${line}L${x(points.length - 1).toFixed(1)},${H - P}L${P},${H - P}Z" fill="url(#skg)"/>
    <path d="${line}" class="sk-line"/></svg>`
}

function report(r) {
  const row = (k, v) => `<div class="sk-rr"><dt>${k}</dt><dd>${v}</dd></div>`
  return `<details class="sk-report"><summary><b>${esc(r.ticker)}</b><span class="sk-pill ${r.finalDecision === 'BUY' ? 'buy' : 'pass'}">${r.finalDecision}</span><span class="muted">confidence ${r.confidence} · ${when(r.at)}</span></summary>
    <dl>${row('Setup', esc(r.setup))}${row('Market regime', esc(r.marketRegime))}${row('Relative strength', esc(r.relativeStrength))}${row('Catalyst / news', esc(r.catalyst))}${row('Fundamentals', esc(r.fundamentals))}
    ${row('Entry', r.entry.toFixed(2))}${row('Stop / invalidation', r.stop.toFixed(2))}${row('Target', r.target.toFixed(2))}${row('Reward / risk', `${r.rewardRisk.toFixed(1)} : 1`)}${row('Position size', esc(r.positionSize))}
    ${row('Main risks', `<ul>${r.mainRisks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)}${row('Confidence', `${r.confidence} / 100`)}${row('Final decision', `<b>${r.finalDecision}</b> — ${esc(r.why)}`)}</dl></details>`
}

function paint() {
  const out = $('stocks-out'); if (!out) return
  if (!snap) { out.innerHTML = err ? `<div class="card"><div class="err">${esc(err)}</div></div>` : '<div class="card muted">Loading the stock desk…</div>'; return }
  const s = snap, a = s.account, sc = s.scan
  const reg = sc?.regime
  const open = s.positions
  out.innerHTML = `
  <section class="card sk-hero">
    <div class="sk-hero-l">
      <div class="sk-eyebrow">Stock desk <span class="badge sc-prov">PAPER</span><span class="sk-phase ${s.paused ? 'paused' : s.phase}">${s.paused ? 'Paused' : PHASE[s.phase]}</span></div>
      <div class="sk-equity">${usd(a.equity)}</div>
      <div class="sk-change ${tone(a.changePct)}">${pc(a.changePct)} <span>since the ${usd(a.startEquity, 0)} paper start</span></div>
      <div class="sk-facts">
        <div><span>Cash</span><b>${usd(a.cash)}</b></div>
        <div><span>Open</span><b>${open.length}</b></div>
        <div><span>Closed trades</span><b>${s.closedTrades}</b></div>
        <div><span>Next wake</span><b>${ct(s.nextWake)}</b></div>
      </div>
      <div class="sk-actions">
        <button class="btn" data-sk="run" ${busy || s.runsHere === false ? 'disabled' : ''}>${busy === 'run' ? 'Scanning…' : 'Scan now'}</button>
        <button class="btn ghost" data-sk="pause">${s.paused ? 'Resume' : 'Pause'}</button>
        ${open.length ? `<button class="btn ghost danger" data-sk="flatten">Flatten all</button>` : ''}
      </div>
    </div>
    <div class="sk-hero-r">${curve(s.equity, a.startEquity)}<div class="sk-curve-cap">${s.closedTrades < 20 ? 'NOT ENOUGH DATA to judge the strategy yet: ' : ''}${s.closedTrades} closed trade${s.closedTrades === 1 ? '' : 's'} on paper.</div></div>
  </section>
  ${s.runsHere === false ? `<section class="card sk-connect"><h2>The stock desk runs in the main Kestrel window</h2><p>This window is one of the extra fleet lanes, so it shows the stock desk but does not run it. Open the main window (the one started by <code>start-24-7.bat</code>, port 4173) to see its paper book and use Scan now.</p></section>` : ''}
  ${s.dataConnected === false && s.runsHere !== false ? `<section class="card sk-connect">
    <h2>Connect stock data to start</h2>
    <p>The desk is on its schedule, but it has no prices yet, so it cannot scan or trade. It needs free, read-only market data from Alpaca. Paper keys cannot move real money.</p>
    <ol>
      <li>Make a free account at <b>alpaca.markets</b>.</li>
      <li>Switch to <b>Paper Trading</b>, open <b>API Keys</b>, and generate a key pair.</li>
      <li>In the <code>trading-bot</code> folder, copy <code>.env.example</code> to <code>.env</code> and fill in <code>MRCASH_ALPACA_KEY</code> and <code>MRCASH_ALPACA_SECRET</code>.</li>
      <li>Restart Kestrel. The next scan fills this page.</li>
    </ol>
    <p class="muted sk-small">Keys stay on your computer in <code>.env</code>, which is never uploaded. Never paste them into a chat.</p>
  </section>` : ''}
  ${s.paused ? `<div class="card sk-warn"><b>Paused: no new buys.</b> ${open.length ? `Stops and exits on the ${open.length} open position${open.length === 1 ? '' : 's'} are still enforced every 15 minutes.` : 'Nothing is open.'} Resume to allow new buys.</div>` : ''}

  <section class="sk-grid">
    <div class="card">
      <h2>Market check <span class="sk-pill ${(reg?.state || 'UNKNOWN').toLowerCase()}">${reg?.state || 'NOT RUN'}</span></h2>
      ${reg ? `<ul class="sk-lines">${reg.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><div class="muted sk-small">${esc(sc.dataNote)}. Checked ${when(sc.at)}.</div>` : '<div class="muted">The first scan runs at the next wake, or press Scan now.</div>'}
      ${sc?.catalyst ? `<div class="sk-cat"><b>Catalyst day: ${esc(sc.catalyst.label)}</b><div>${sc.catalyst.gappers.map((g) => `${esc(g.symbol)} +${g.gapPct.toFixed(1)}%`).join(' · ')}</div>${sc.catalyst.headline ? `<div class="muted">"${esc(sc.catalyst.headline)}"</div>` : ''}<div class="sk-small">Second-order, smallest gap first: ${sc.catalyst.secondOrder.slice(0, 6).map((x) => `<b>${esc(x.symbol)}</b>${x.ownNews ? ' ★' : ''} ${x.gapPct >= 0 ? '+' : ''}${x.gapPct.toFixed(1)}%`).join(' · ')}</div></div>` : ''}
    </div>
    <div class="card">
      <h2>Theme rotation</h2>
      ${sc?.board?.length ? `<div class="sk-themes">${sc.board.slice(0, 8).map((t) => `<div class="sk-theme"><span>${esc(t.label)}</span><i class="${tone(t.dayPct)}" style="--w:${Math.min(100, Math.abs(t.dayPct) * 25)}%"></i><b class="${tone(t.dayPct)}">${pc(t.dayPct)}</b></div>`).join('')}</div>` : '<div class="muted">Appears after the first scan with stock data.</div>'}
    </div>
  </section>

  <section class="card">
    <h2>Positions</h2>
    ${open.length ? `<div class="sk-table"><table><thead><tr><th>Ticker</th><th>Theme</th><th class="num">Value</th><th class="num">Entry</th><th class="num">Last</th><th class="num">Stop</th><th class="num">Target</th><th class="num">R</th><th class="num">P&amp;L</th></tr></thead><tbody>
      ${open.map((p) => `<tr><td><b>${esc(p.symbol)}</b></td><td class="muted">${esc(p.themeLabel)}</td><td class="num">${usd(p.value)}</td><td class="num">${p.entry.toFixed(2)}</td><td class="num">${p.last.toFixed(2)}</td><td class="num">${p.stop.toFixed(2)}</td><td class="num">${p.target.toFixed(2)}</td><td class="num ${tone(p.r)}">${p.r >= 0 ? '+' : ''}${p.r.toFixed(2)}R</td><td class="num ${tone(p.pnl)}">${usd(p.pnl)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="sk-empty">All cash. No trade is a valid decision; it buys only when there is a clear edge.</div>'}
  </section>

  <section class="sk-grid">
    <div class="card">
      <h2>What it did</h2>
      ${s.cycles.length ? `<ol class="sk-log">${s.cycles.slice(0, 12).map((c) => `<li><time>${when(c.at)}</time><div>${c.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div></li>`).join('')}</ol>` : '<div class="muted">Nothing yet. The first wake writes here.</div>'}
    </div>
    <div class="card">
      <h2>Candidates this cycle</h2>
      ${sc?.evaluations?.length ? `<ul class="sk-cands">${sc.evaluations.map((e) => `<li><b>${esc(e.symbol)}</b><span class="sk-pill ${e.verdict.toLowerCase()}">${e.verdict}</span>${e.report ? `<em>${e.report.confidence}</em>` : ''}<p>${esc(e.reason)}</p></li>`).join('')}</ul>` : '<div class="muted">Candidates are judged during trading hours (8:30-3:00 CT), never at the bell.</div>'}
    </div>
  </section>

  <section class="card">
    <h2>Research reports</h2>
    <p class="muted sk-small">Written before every buy, in your format. A trade is placed only if the setup still holds up once the report is done.</p>
    ${s.reports.length ? s.reports.map(report).join('') : '<div class="muted">No buys yet, so no reports.</div>'}
  </section>

  ${s.fills.length ? `<section class="card"><h2>Paper fills</h2><div class="sk-table"><table><thead><tr><th>When</th><th>Side</th><th>Ticker</th><th class="num">Qty</th><th class="num">Price</th><th class="num">P&amp;L</th><th>Why</th></tr></thead><tbody>${s.fills.slice(0, 20).map((f) => `<tr><td class="muted">${when(f.at)}</td><td>${f.side}</td><td><b>${esc(f.symbol)}</b></td><td class="num">${f.qty}</td><td class="num">${f.price.toFixed(2)}</td><td class="num ${f.pnl === undefined ? '' : tone(f.pnl)}">${f.pnl === undefined ? '—' : usd(f.pnl)}</td><td class="muted">${esc(f.why)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}

  <details class="card sk-rules"><summary><b>The rules it follows</b> <span class="muted">your strategy, as written</span></summary>
    <ul>
      <li>Long US stocks only, in ${s.universe.names} tech and tech-adjacent leaders across ${s.universe.themes} themes. No options, shorts, crypto, leverage, inverse funds or margin. Cash is allowed; no trade is always a valid decision.</li>
      <li>Premarket scan at 8:15 CT. From 8:30 to 3:00 CT it wakes every 15 minutes: stops first, then positions, then new buys. Outside hours it sleeps in about-an-hour steps to the next 8:15.</li>
      <li>Market check before any buy: ${s.universe.check.join(', ')} (VIXY stands in for the VIX, IEF for rates), plus breadth and theme rotation. Risk-off means no new buys.</li>
      <li>DSC rule: curated universe only, no gaps above 3%, no overextended midday moves, no hype-only setups, a technical setup plus news, a catalyst or sector strength, and a clear invalidation point.</li>
      <li>Never at the bell. The first held pullback or breakout retest, about 30-60 minutes in, with the stop below the pullback low. On catalyst days the prior close is the thesis level.</li>
      <li>At most 25% of the account in one stock and about 3 positions per theme. Risk 1% of equity to the stop in a risk-on market, 0.5% when mixed.</li>
      <li>A breached stop sells the whole position that cycle, and a stop is never moved lower. It exits on a broken thesis, a risk-off market or relative strength breaking down, trims at 2R or when overextended, and holds winners while the trend holds.</li>
      <li>PAPER only: fills are simulated at the last 15-minute close plus a small slippage cost. There is no broker connection.</li>
    </ul>
  </details>`
}

function wire() {
  const section = $('tab-stocks'); if (!section) return
  section.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sk]'); if (!b || busy) return
    const act = b.dataset.sk
    if (act === 'flatten' && !confirm('Sell every open paper position at the last price?')) return
    busy = act; paint()
    try { snap = await post(act === 'run' ? '/api/stocks/run' : act === 'pause' ? '/api/stocks/pause' : '/api/stocks/flatten', act === 'pause' ? { on: !snap?.paused } : {}); err = null } catch (x) { err = x.message }
    busy = ''; paint()
  })
  new MutationObserver(() => { if (!section.classList.contains('hidden') && Date.now() - loadedAt > 30_000) load() }).observe(section, { attributes: true, attributeFilter: ['class'] })
  if (!section.classList.contains('hidden')) load()
  setInterval(() => { if (!section.classList.contains('hidden') && !document.hidden && !busy) load() }, 60_000)
}
wire()
window.loadStocks = load
