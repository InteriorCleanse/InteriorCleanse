/**
 * TRADE PLANNER — work out your stop, size and targets before YOU place a
 * trade in TradingView or your broker's app.
 *
 * Three calculators: shares or coins, option contracts, and a strike
 * comparison. Everything is computed in this page from the numbers you type
 * (web/js/plan-math.js). Nothing is sent anywhere and nothing is placed: the
 * only button that "does" something copies a summary to your clipboard, to
 * paste next to the order ticket. Your last account size and risk % are
 * remembered in this browser only, for convenience.
 */
import { sharePlan, optionPlan, strikeCompare, ticketText } from './plan-math.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const $ = (id) => document.getElementById(id)
const num = (id) => { const v = $(id)?.value; return v === '' || v === undefined ? null : Number(v) }
const usd = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const STORE = 'mrcash-planner'
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch { return {} } }
const save = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)) } catch { /* private window: fine */ } }

const field = (id, label, attrs = '') => `<label>${label}<input id="${id}" type="number" inputmode="decimal" step="any" ${attrs}></label>`
const warn = (list) => (list && list.length ? `<ul class="pl-warn">${list.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '')
const err = (m) => `<p class="pl-err">${esc(m)}</p>`

function shell() {
  return `
  <div class="card pl-shared">
    <h2>Your account</h2>
    <div class="pl-grid">${field('pl-acct', 'Account size ($)', 'min="0"')}${field('pl-risk', 'Risk per trade (%)', 'min="0" max="100" value="1"')}</div>
    <p class="muted pl-note">Used by both calculators below. Remembered in this browser only.</p>
  </div>

  <div class="card">
    <h2>Shares or coins</h2>
    <div class="pl-grid">
      <label>Symbol<input id="pl-sym" type="text" maxlength="20" placeholder="e.g. SPY, BTC"></label>
      ${field('pl-entry', 'Entry price')}${field('pl-stop', 'Stop-loss price')}${field('pl-target', 'Target (optional)')}
      <label class="pl-check"><input id="pl-frac" type="checkbox"> Fractional (crypto)</label>
    </div>
    <div id="pl-share-out" class="pl-out"></div>
  </div>

  <div class="card">
    <h2>Options: how many contracts</h2>
    <div class="pl-grid">
      ${field('pl-prem', 'Option price (premium per share)')}${field('pl-pstop', 'Stop on the premium (optional)')}
      ${field('pl-fee', 'Fee per contract ($, optional)', 'min="0"')}${field('pl-mult', 'Contract multiplier', 'value="100"')}
    </div>
    <div id="pl-opt-out" class="pl-out"></div>
  </div>

  <div class="card">
    <h2>Compare strikes</h2>
    <div class="pl-grid">
      <label>Type<select id="pl-type"><option value="call">Call</option><option value="put">Put</option></select></label>
      ${field('pl-under', 'Stock price now')}${field('pl-tgt', 'Where you think it is at expiry')}
    </div>
    <div class="pl-strikes">${[1, 2, 3, 4].map((i) => `<div class="pl-strike">${field(`pl-k${i}`, `Strike ${i}`)}${field(`pl-p${i}`, `Premium ${i}`)}</div>`).join('')}</div>
    <p class="muted pl-note">Type the strikes and prices from your broker's option chain. The table is <b>at expiration</b>: it ignores time value, implied volatility and the odds of getting there — so the cheapest, furthest strike often wins this table and usually expires worthless. Liquidity matters too: prefer strikes with a tight bid-ask spread and real open interest.</p>
    <div id="pl-strike-out" class="pl-out"></div>
  </div>

  <p class="muted pl-foot">This page only does the maths. It sends nothing and places nothing — you place the trade yourself, in TradingView or your broker's app.</p>`
}

function renderShares() {
  const out = $('pl-share-out'); if (!out) return
  const entry = num('pl-entry'), stop = num('pl-stop')
  if (entry === null || stop === null) { out.innerHTML = '<p class="muted">Enter an entry and a stop to size the trade.</p>'; return }
  const p = sharePlan({ account: num('pl-acct'), riskPct: num('pl-risk'), entry, stop, target: num('pl-target'), whole: !$('pl-frac')?.checked })
  if (!p.ok) { out.innerHTML = err(p.error); return }
  out.innerHTML = `
    <div class="pl-kpis">
      <div><span>${p.side === 'long' ? 'Buy' : 'Sell short'}</span><b>${p.qty}</b></div>
      <div><span>You risk</span><b>${usd(p.risk)}</b></div>
      <div><span>Position</span><b>${usd(p.notional)}</b></div>
      <div><span>Reward : risk</span><b>${p.rr === null ? '—' : p.rr + ' R'}</b></div>
    </div>
    <p class="pl-line">Targets: ${p.targets.map((t) => `<b>${t.r}R</b> ${t.price}`).join(' · ')}</p>
    ${warn(p.warnings)}
    <div class="row"><button class="btn ghost" id="pl-copy">Copy for TradingView</button><span class="muted" id="pl-copy-out"></span></div>`
  $('pl-copy')?.addEventListener('click', async () => {
    const t = ticketText(p, { symbol: $('pl-sym')?.value?.trim().toUpperCase(), entry, stop })
    try { await navigator.clipboard.writeText(t); $('pl-copy-out').textContent = 'Copied — paste it next to the order ticket.' } catch { $('pl-copy-out').textContent = t }
  })
}

function renderOptions() {
  const out = $('pl-opt-out'); if (!out) return
  if (num('pl-prem') === null) { out.innerHTML = '<p class="muted">Enter the option price to size the trade.</p>'; return }
  const p = optionPlan({ account: num('pl-acct'), riskPct: num('pl-risk'), premium: num('pl-prem'), stopPremium: num('pl-pstop'), multiplier: num('pl-mult') ?? 100, feePerContract: num('pl-fee') ?? 0 })
  if (!p.ok) { out.innerHTML = err(p.error); return }
  out.innerHTML = `
    <div class="pl-kpis">
      <div><span>Contracts</span><b>${p.contracts}</b></div>
      <div><span>Total cost</span><b>${usd(p.cost)}</b></div>
      <div><span>Loss at your stop</span><b>${p.stopPremium === null ? '—' : usd(p.lossAtStop)}</b></div>
      <div><span>Worst case</span><b>${usd(p.lossWorst)}</b></div>
    </div>
    ${warn(p.warnings)}`
}

function renderStrikes() {
  const out = $('pl-strike-out'); if (!out) return
  const strikes = [1, 2, 3, 4].map((i) => ({ strike: num(`pl-k${i}`), premium: num(`pl-p${i}`) })).filter((s) => s.strike !== null && s.premium !== null)
  if (num('pl-under') === null || num('pl-tgt') === null || !strikes.length) { out.innerHTML = '<p class="muted">Enter the stock price, your target and at least one strike with its premium.</p>'; return }
  const r = strikeCompare({ type: $('pl-type').value, underlying: num('pl-under'), target: num('pl-tgt'), strikes, multiplier: num('pl-mult') ?? 100 })
  if (!r.ok) { out.innerHTML = err(r.error); return }
  out.innerHTML = `<div class="scroll"><table class="pl-table"><tr><th>Strike</th><th></th><th class="num">Premium</th><th class="num">Break-even</th><th class="num">Move needed</th><th class="num">Max loss</th><th class="num">At your target</th></tr>
    ${r.rows.map((x) => `<tr${x.strike === r.bestAtTarget ? ' class="pl-best"' : ''}><td>${x.strike}</td><td><span class="pill">${x.moneyness}</span></td><td class="num">${x.premium}</td><td class="num">${x.breakeven}</td><td class="num">${x.moveToBreakevenPct > 0 ? '+' : ''}${x.moveToBreakevenPct}%</td><td class="num">${usd(-x.maxLoss)}</td><td class="num ${x.pnlAtTarget >= 0 ? 'win' : 'loss'}">${usd(x.pnlAtTarget)} (${x.returnAtTargetPct}%)</td></tr>`).join('')}
    </table></div>
    <p class="muted pl-note">${r.bestAtTarget === null ? 'None of these strikes makes money if the stock is exactly at your target on expiry day.' : `Strike ${r.bestAtTarget} makes the most if the stock is exactly at your target on expiry day. That is not the same as the best trade — see the note above.`}</p>`
}

function renderAll() {
  save({ acct: $('pl-acct')?.value, risk: $('pl-risk')?.value })
  renderShares(); renderOptions(); renderStrikes()
}

function init() {
  const root = $('planner-out'); if (!root) return
  root.innerHTML = shell()
  const s = load()
  if (s.acct) $('pl-acct').value = s.acct
  if (s.risk) $('pl-risk').value = s.risk
  root.addEventListener('input', renderAll)
  root.addEventListener('change', renderAll)
  renderAll()
}

init()
