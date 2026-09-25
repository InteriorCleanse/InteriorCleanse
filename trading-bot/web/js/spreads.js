/**
 * OPTION SPREADS — plan defined-risk spreads before YOU place them in your
 * broker's app. Its own tab, apart from the single-option calculators on the
 * Planner.
 *
 * Pick what you expect, pick a structure, type the strikes and each leg's
 * price from your broker's option chain. The page shows the most you can lose
 * and make, the break-evens, the payoff at expiry and how many spreads fit your
 * risk budget. Everything is computed here (web/js/spread-math.js). Nothing is
 * sent anywhere and nothing is placed; the only action copies a ticket to your
 * clipboard. Your last inputs are remembered in this browser only.
 */
import { STRUCTURES, VIEWS, spreadPlan, spreadTicket } from './spread-math.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const $ = (id) => document.getElementById(id)
const num = (id) => { const v = $(id)?.value; return v === '' || v === undefined || v === null ? null : Number(v) }
const usd = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const STORE = 'mrcash-spreads'
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch { return {} } }
const save = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)) } catch { /* private window: fine */ } }
const plannerAccount = () => { try { return JSON.parse(localStorage.getItem('mrcash-planner') || '{}') } catch { return {} } }

const field = (id, label, attrs = '') => `<label>${label}<input id="${id}" type="number" inputmode="decimal" step="any" ${attrs}></label>`
const fmt = (n) => String(Math.round(n * 100) / 100)
const err = (m) => `<p class="pl-err">${esc(m)}</p>`

let state = { view: 'up', structure: 'bull-call' }

function shell() {
  return `
  <div class="card sp-view">
    <h2>1 · What do you expect?</h2>
    <div class="sp-chips" role="radiogroup" aria-label="What you expect">${VIEWS.map((v) => `<button class="chip" role="radio" data-view="${v.id}">${esc(v.label)}</button>`).join('')}</div>
    <div class="sp-structs" id="sp-structs"></div>
  </div>

  <div class="card">
    <h2>2 · Strikes and prices</h2>
    <div class="pl-grid">
      <label>Symbol<input id="sp-sym" type="text" maxlength="20" placeholder="e.g. SPY"></label>
      <label>Expiry<input id="sp-exp" type="date"></label>
      ${field('sp-under', 'Stock price now (optional)')}
    </div>
    <div id="sp-legs" class="sp-legs"></div>
    <div class="pl-grid sp-more">
      ${field('sp-acct', 'Account size ($)', 'min="0"')}${field('sp-risk', 'Risk per trade (%)', 'min="0" max="100"')}
      ${field('sp-fee', 'Fee per contract ($)', 'min="0"')}${field('sp-mult', 'Contract multiplier', 'value="100"')}
    </div>
    <p class="muted pl-note">Type each leg's price from your broker's chain. The mid-point between bid and ask is a fair start; the price you actually get may be worse.</p>
  </div>

  <div class="card">
    <h2>3 · What it can make and lose <span class="badge sp-tag">Your numbers · at expiry</span></h2>
    <div id="sp-out" class="pl-out"></div>
  </div>

  <p class="muted pl-foot">This page only does the maths. It sends nothing and places nothing, and Mr. Cash does not trade options. You place the spread yourself, as one multi-leg order in your broker's app.</p>`
}

function renderStructs() {
  document.querySelectorAll('#spreads-out [data-view]').forEach((b) => { const on = b.dataset.view === state.view; b.classList.toggle('on', on); b.setAttribute('aria-checked', on) })
  const ids = Object.keys(STRUCTURES).filter((id) => STRUCTURES[id].view === state.view)
  if (!ids.includes(state.structure)) state.structure = ids[0]
  $('sp-structs').innerHTML = ids.map((id) => {
    const s = STRUCTURES[id]
    return `<button class="sp-struct${id === state.structure ? ' active' : ''}" data-struct="${id}" aria-pressed="${id === state.structure}">
      <span class="sp-struct-top"><b>${esc(s.name)}</b><span class="badge ${s.kind === 'debit' ? 'sp-debit' : 'sp-credit'}">${s.kind === 'debit' ? 'Debit · you pay' : 'Credit · you collect'}</span></span>
      <span class="sp-struct-fam">${esc(s.family)} · loss capped</span>
      <span class="sp-struct-blurb">${esc(s.blurb)}</span>
    </button>`
  }).join('')
}

function renderLegs() {
  const s = STRUCTURES[state.structure]
  const saved = (load().legs || {})[state.structure] || {}
  $('sp-legs').innerHTML = `
    <div class="pl-grid sp-strikes">${s.slots.map((label, i) => field(`sp-k${i}`, esc(label))).join('')}</div>
    <table class="pl-table sp-legtable"><tr><th>Leg</th><th>Strike</th><th class="num">Price per share</th></tr>
    ${s.legs.map((l, i) => `<tr><td><span class="${l.side > 0 ? 'win' : 'loss'}">${l.side > 0 ? 'Buy' : 'Sell'}</span> ${l.qty} ${l.type}</td><td class="sp-legk" data-slot="${l.slot}">—</td><td class="num"><input id="sp-p${i}" type="number" inputmode="decimal" step="any" min="0" aria-label="Price of leg ${i + 1}"></td></tr>`).join('')}
    </table>`
  s.slots.forEach((_, i) => { if (saved.k?.[i] != null) $(`sp-k${i}`).value = saved.k[i] })
  s.legs.forEach((_, i) => { if (saved.p?.[i] != null) $(`sp-p${i}`).value = saved.p[i] })
}

/** The payoff at expiry, drawn exactly (it is straight between strikes). Profit above the line, loss below. */
function chart(p, spot, width) {
  // Drawn at the width it is shown, so the labels stay readable on a phone.
  const W = Math.round(Math.max(300, Math.min(900, width || 640))), H = W < 520 ? 190 : 230, padL = 56, padR = 12, padT = 12, padB = 26
  const pts = p.curve.points, x0 = p.curve.from, x1 = p.curve.to
  const yMax = Math.max(p.maxProfit, 1), yMin = -Math.max(p.maxLoss, 1)
  const X = (x) => padL + ((x - x0) / (x1 - x0)) * (W - padL - padR)
  const Y = (y) => padT + ((yMax - y) / (yMax - yMin)) * (H - padT - padB)
  const line = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join('')
  const area = `${line}L${X(x1).toFixed(1)},${Y(0).toFixed(1)}L${X(x0).toFixed(1)},${Y(0).toFixed(1)}Z`
  const strikes = [...new Set(p.legs.map((l) => l.strike))]
  const tick = (x, label, cls) => `<line x1="${X(x).toFixed(1)}" x2="${X(x).toFixed(1)}" y1="${padT}" y2="${H - padB}" class="${cls}"/><text x="${X(x).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="sp-ax">${esc(label)}</text>`
  return `<svg class="sp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profit or loss at expiry: most ${usd(p.maxProfit)}, worst ${usd(-p.maxLoss)}${p.breakevens.length ? ', break-even ' + p.breakevens.map(fmt).join(' and ') : ''}">
    <defs>
      <clipPath id="sp-up"><rect x="0" y="0" width="${W}" height="${Y(0).toFixed(1)}"/></clipPath>
      <clipPath id="sp-dn"><rect x="0" y="${Y(0).toFixed(1)}" width="${W}" height="${(H - Y(0)).toFixed(1)}"/></clipPath>
    </defs>
    <path d="${area}" class="sp-fill-win" clip-path="url(#sp-up)"/>
    <path d="${area}" class="sp-fill-loss" clip-path="url(#sp-dn)"/>
    <line x1="${padL}" x2="${W - padR}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="sp-zero"/>
    ${strikes.map((k) => tick(k, k, 'sp-k')).join('')}
    ${spot ? `<line x1="${X(spot).toFixed(1)}" x2="${X(spot).toFixed(1)}" y1="${padT}" y2="${H - padB}" class="sp-spot"/><text x="${(X(spot) + 4).toFixed(1)}" y="${H - padB - 5}" class="sp-ax sp-spot-t">now</text>` : ''}
    <path d="${line}" class="sp-line"/>
    <text x="${padL - 6}" y="${(Y(yMax) + 4).toFixed(1)}" text-anchor="end" class="sp-ax win">${usd(p.maxProfit)}</text>
    <text x="${padL - 6}" y="${(Y(0) + 4).toFixed(1)}" text-anchor="end" class="sp-ax">$0</text>
    <text x="${padL - 6}" y="${(Y(yMin) + 4).toFixed(1)}" text-anchor="end" class="sp-ax loss">${usd(-p.maxLoss)}</text>
    ${p.breakevens.map((b) => `<circle cx="${X(b).toFixed(1)}" cy="${Y(0).toFixed(1)}" r="3.5" class="sp-be"/>`).join('')}
  </svg>`
}

function renderOut() {
  const out = $('sp-out'); if (!out) return
  const s = STRUCTURES[state.structure]
  s.legs.forEach((l, i) => { const td = document.querySelectorAll('#sp-legs .sp-legk')[i]; if (td) td.textContent = num(`sp-k${l.slot}`) ?? '—' })
  const strikes = s.slots.map((_, i) => num(`sp-k${i}`)), premiums = s.legs.map((_, i) => num(`sp-p${i}`))
  const all = load(); all.legs = { ...(all.legs || {}), [state.structure]: { k: strikes, p: premiums } }
  save({ ...all, view: state.view, structure: state.structure, acct: $('sp-acct').value, risk: $('sp-risk').value, fee: $('sp-fee').value, sym: $('sp-sym').value })
  if (strikes.some((k) => k === null) || premiums.some((q) => q === null)) { out.innerHTML = `<p class="muted">Enter all ${s.slots.length} strikes and the price of each leg to see the most it can lose, the most it can make and the break-evens.</p>`; return }
  const spot = num('sp-under')
  const p = spreadPlan({ structure: state.structure, strikes, premiums, underlying: spot, multiplier: num('sp-mult') ?? 100, feePerContract: num('sp-fee') ?? 0, account: num('sp-acct'), riskPct: num('sp-risk') })
  if (!p.ok) { out.innerHTML = err(p.error); return }
  const n = p.sizing.ok ? p.sizing.spreads : 1
  out.innerHTML = `
    <div class="pl-kpis">
      <div><span>${p.kind === 'debit' ? 'You pay' : 'You collect'}</span><b>${usd(p.netDollars)}</b></div>
      <div><span>Most you can lose</span><b class="loss">${usd(-p.maxLoss)}</b></div>
      <div><span>Most you can make</span><b class="win">${usd(p.maxProfit)}</b></div>
      <div><span>Break-even${p.breakevens.length > 1 ? 's' : ''}</span><b>${p.breakevens.map(fmt).join(' · ') || '—'}</b></div>
      <div><span>Reward : risk</span><b>${p.rr} : 1</b></div>
      <div><span>Spreads that fit</span><b>${p.sizing.ok ? p.sizing.spreads : '—'}</b></div>
    </div>
    <p class="pl-line">Per spread, with ${p.contractsPerSpread} contracts and ${usd(p.openFees)} in opening fees included.${p.sizing.ok ? ` ${p.sizing.spreads} spread${p.sizing.spreads === 1 ? '' : 's'} can lose at most <b>${usd(p.sizing.totalMaxLoss)}</b> of your ${usd(p.sizing.budget)} budget.` : ` <span class="muted">${esc(p.sizing.error)}</span>`}${p.atSpot !== null ? ` If the price is still ${spot} at expiry: <b class="${p.atSpot >= 0 ? 'win' : 'loss'}">${usd(p.atSpot)}</b>.` : ''}</p>
    ${chart(p, spot, out.clientWidth)}
    ${p.warnings.length ? `<ul class="pl-warn">${p.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    <ul class="sp-rules">
      <li>Enter it as <b>one</b> multi-leg order at a limit price, never leg by leg: legging in can leave you with only half the spread.</li>
      <li>Close or roll before the final day if the price is near a sold strike. Where it settles decides whether you are assigned, and you may not know until the next morning.</li>
      <li>These numbers are at expiry. Before then the spread trades at whatever the market prices it, and the odds of reaching any price are not shown here.</li>
    </ul>
    <div class="row"><button class="btn ghost" id="sp-copy">Copy the order ticket</button><span class="muted" id="sp-copy-out"></span></div>`
  $('sp-copy')?.addEventListener('click', async () => {
    const t = spreadTicket(p, { symbol: $('sp-sym')?.value?.trim().toUpperCase(), expiry: $('sp-exp')?.value, spreads: n })
    try { await navigator.clipboard.writeText(t); $('sp-copy-out').textContent = 'Copied. Paste it next to your broker\'s spread ticket.' } catch { $('sp-copy-out').textContent = t }
  })
}

function init() {
  const root = $('spreads-out'); if (!root) return
  root.innerHTML = shell()
  const s = load(), pl = plannerAccount()
  if (s.view && VIEWS.some((v) => v.id === s.view)) state.view = s.view
  if (s.structure && STRUCTURES[s.structure]) state.structure = s.structure
  $('sp-acct').value = s.acct || pl.acct || ''
  $('sp-risk').value = s.risk || pl.risk || '1'
  if (s.fee) $('sp-fee').value = s.fee
  if (s.sym) $('sp-sym').value = s.sym
  renderStructs(); renderLegs(); renderOut()
  root.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]'); if (v) { state.view = v.dataset.view; renderStructs(); renderLegs(); renderOut(); return }
    const b = e.target.closest('[data-struct]'); if (b) { state.structure = b.dataset.struct; renderStructs(); renderLegs(); renderOut() }
  })
  // The Planner's pointer to this tab.
  document.addEventListener('click', (e) => { const j = e.target.closest('#tab-planner [data-tab="spreads"]'); if (j && typeof window.showTab === 'function') window.showTab('spreads') })
  root.addEventListener('input', renderOut)
  root.addEventListener('change', renderOut)
}

init()
