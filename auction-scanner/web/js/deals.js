// Deals: give a budget, get the real cars worth a look. Clean title, little or no
// damage, priced against similar cars, everything it costs inside the budget,
// ranked by estimated profit. The engine is src/finder.ts; nothing here guesses.
import { getJson, postJson, del, esc, money, debounce, store, safeUrl, closesText } from './api.js'
import { loading, errorStrip, toast, carName, sourceName } from './ui.js'
import { openPnl, openMaterials, openBought } from './pnl.js'

const QUICK = [3000, 5000, 10000, 15000, 25000, 40000]
const PROFITS = [['', 'Any'], ['1000', '$1k+'], ['2500', '$2.5k+'], ['5000', '$5k+']]
const YEARS = [['', 'Any year'], ['2012', '2012+'], ['2015', '2015+'], ['2018', '2018+']]
const REASON = {
  sample: 'practice cars', ended: 'auction ended', sold: 'already sold', 'no price': 'no price showing', 'too old': 'older than you asked for',
  title: 'title not clean', damage: 'too much damage', 'does not run': 'does not run',
  'could not price': 'too few similar cars to price', 'over budget': 'over your budget', 'no room': 'no room under the ceiling', 'small profit': 'profit under your floor',
}
const FIX = {
  'over budget': 'Raise the budget to bring these in.',
  'could not price': 'Connect eBay (free) or auto.dev (free tier) so more cars have similar cars to price against.',
  damage: 'Allow minor damage to see more, and price the repair first.',
  'no room': 'These already cost close to what similar cars sell for.',
  'small profit': 'These passed every check but would make less than your floor. Lower it to see them.',
  'too old': 'Allow older years to see more. Newer cars rarely sell this far under market at small budgets.',
}

let seq = 0

export async function render(el, ctx) {
  const saved = store('gavel-deals') || {}
  const state = { budget: Number(saved.budget) || Number(ctx.me.cashUsd) || 15000, damage: saved.damage === 'none' ? 'none' : 'minor', minYear: YEARS.some(([y]) => y === saved.minYear) ? saved.minYear : '', minProfit: PROFITS.some(([v]) => v === saved.minProfit) ? saved.minProfit : '2500' }
  el.innerHTML = `<div class="head"><div><h1>Deals</h1><p>Your budget in, real cars out: clean title, little or no damage, every cost counted, biggest estimated profit first.</p></div></div>
    <section class="budget-dial panel" aria-label="Your budget">
      <div class="bd-top">
        <label class="bd-label mono" for="d-budget">Budget for one car, all in</label>
        <div class="bd-amount"><span class="bd-cur">$</span><input id="d-budget" type="number" inputmode="numeric" min="500" step="500" value="${state.budget}" aria-describedby="d-help" /></div>
      </div>
      <input id="d-range" class="bd-range" type="range" min="2000" max="100000" step="500" value="${Math.min(100000, Math.max(2000, state.budget))}" aria-label="Budget slider" />
      <div class="bd-row">
        <div class="chips wrap" role="group" aria-label="Quick budgets">${QUICK.map((b) => `<button type="button" class="chip" data-b="${b}" aria-pressed="${b === state.budget}">$${b / 1000}k</button>`).join('')}</div>
        <div class="bd-ctl"><span class="mono dim">Profit at least</span><div class="seg bd-seg" role="group" aria-label="Profit at least">${PROFITS.map(([v, w]) => `<button type="button" data-pf="${v}" aria-pressed="${state.minProfit === v}">${w}</button>`).join('')}</div></div>
        <div class="bd-ctl"><span class="mono dim">Model year</span><div class="seg bd-seg" role="group" aria-label="Model year">${YEARS.map(([y, w]) => `<button type="button" data-yr="${y}" aria-pressed="${state.minYear === y}">${w}</button>`).join('')}</div></div>
        <div class="bd-ctl"><span class="mono dim">Damage</span><div class="seg bd-seg" role="group" aria-label="Damage allowed"><button type="button" data-dmg="none" aria-pressed="${state.damage === 'none'}">No damage</button><button type="button" data-dmg="minor" aria-pressed="${state.damage === 'minor'}">Minor ok</button></div></div>
      </div>
      <p class="dim bd-help" id="d-help">All in means the price, the auction's buyer fee, transport, the materials the car will likely need, and a $750 cushion. Tax and title count too once you set your percent in Settings.</p>
    </section>
    <div id="d-out" aria-live="polite"></div>`

  const out = el.querySelector('#d-out')
  const box = el.querySelector('#d-budget')
  const range = el.querySelector('#d-range')
  const save = () => store('gavel-deals', state)
  const sync = (from) => {
    if (from !== 'box') box.value = String(state.budget)
    if (from !== 'range') range.value = String(Math.min(100000, Math.max(2000, state.budget)))
    el.querySelectorAll('[data-b]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.b) === state.budget)))
  }
  const run = debounce(() => load(), 450)
  box.addEventListener('input', () => { const v = Number(box.value); if (Number.isFinite(v) && v >= 500) { state.budget = v; sync('box'); save(); run() } })
  range.addEventListener('input', () => { state.budget = Number(range.value); sync('range'); save(); run() })
  el.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => { state.budget = Number(b.dataset.b); sync(); save(); load() }))
  el.querySelectorAll('[data-dmg]').forEach((b) => b.addEventListener('click', () => {
    state.damage = b.dataset.dmg
    el.querySelectorAll('[data-dmg]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    save(); load()
  }))
  el.querySelectorAll('[data-pf]').forEach((b) => b.addEventListener('click', () => {
    state.minProfit = b.dataset.pf
    el.querySelectorAll('[data-pf]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    save(); load()
  }))
  el.querySelectorAll('[data-yr]').forEach((b) => b.addEventListener('click', () => {
    state.minYear = b.dataset.yr
    el.querySelectorAll('[data-pf]').forEach((b) => b.addEventListener('click', () => {
    state.minProfit = b.dataset.pf
    el.querySelectorAll('[data-pf]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    save(); load()
  }))
  el.querySelectorAll('[data-yr]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    save(); load()
  }))

  async function load() {
    const my = ++seq
    out.classList.add('busy')
    if (!out.children.length) out.innerHTML = skeleton()
    let r
    try { r = await getJson(`/api/deals?budget=${encodeURIComponent(state.budget)}&damage=${state.damage}${state.minYear ? '&minYear=' + state.minYear : ''}${state.minProfit ? '&minProfit=' + state.minProfit : ''}`) } catch (e) { if (my === seq) { out.classList.remove('busy'); out.innerHTML = errorStrip(`Deals could not be loaded: ${e.message} Try again in a moment.`) } return }
    if (my !== seq) return
    out.classList.remove('busy')
    out.innerHTML = resultsHtml(r, state, ctx)
    wire(out)
  }
  load()
}

function skeleton() {
  return `<div class="deal-list">${[0, 1, 2].map(() => '<div class="deal skel" aria-hidden="true"><div class="sk-photo"></div><div class="sk-lines"><i></i><i></i><i></i></div></div>').join('')}</div><p class="sr-only">Finding deals…</p>`
}

function summaryHtml(r) {
  const ex = Object.entries(r.excluded || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  const top = ex[0]
  return `<div class="deal-summary">
    <div class="ds-figs">
      <div><span class="mono dim">Cars read</span><b class="num">${r.considered}</b></div>
      <div><span class="mono dim">Deals</span><b class="num ok">${r.deals.length}</b></div>
      <div><span class="mono dim">Leads</span><b class="num lead">${r.leads.length}</b></div>
    </div>
    ${ex.length ? `<details class="ds-why"><summary>Why ${ex.reduce((s, [, n]) => s + n, 0)} cars were left out</summary><ul>${ex.map(([k, n]) => `<li><span class="num">${n}</span> ${esc(REASON[k] || k)}</li>`).join('')}</ul>${top && FIX[top[0]] ? `<p class="dim">${esc(FIX[top[0]])}</p>` : ''}</details>` : ''}
  </div>`
}

function resultsHtml(r, state, ctx) {
  const sample = r.kind === 'SAMPLE'
  const head = sample
    ? `<div class="strip wait"><b>Practice cars, not for sale.</b> ${ctx.me.role === 'owner' ? 'Connect a live source on <a href="#connect">Connect</a> and this screen ranks real auctions.' : 'Real deals appear here when the owner connects a live auction source.'}</div>`
    : r.kind === 'EMPTY' ? `<div class="strip wait"><b>No source connected.</b> There are no cars to rank yet.</div>` : ''
  let body = ''
  if (r.deals.length) {
    body += `<h2 class="deal-h">Deals <span class="mono dim">valued on sold or asking prices</span></h2><div class="deal-list">${r.deals.map((d, i) => dealHtml(d, i + 1)).join('')}</div>`
  } else if (r.kind !== 'EMPTY') {
    body += `<div class="panel deal-none"><h2>No confirmed deals at ${esc(money(state.budget))}${state.minProfit ? ` making ${esc(money(Number(state.minProfit)))} or more` : ''} right now</h2><p>A confirmed deal needs at least 3 sold or asking prices for the same car, a clean title, and room under your ceiling. ${r.leads.length ? 'The leads below passed every other check.' : r.excluded && r.excluded['small profit'] ? `${r.excluded['small profit']} more passed every check with a smaller profit; lower the floor to see them.` : 'Try a bigger budget, an older year, or allow minor damage.'}</p></div>`
  }
  if (r.leads.length) {
    body += `<h2 class="deal-h">Leads <span class="mono dim">every check passed · value rests on open bids</span></h2><div class="deal-list">${r.leads.map((d, i) => dealHtml(d, i + 1, true)).join('')}</div>`
  }
  return head + summaryHtml(r) + body
}

/** The money in one bar: what you pay (price, fee, tax, transport, cushion), then the estimated profit, out to what similar cars go for. */
function moneyBar(d) {
  const total = Math.max(d.resaleUsd, d.allInUsd)
  const parts = [
    ['price', d.priceUsd, 'Price now'],
    ['fee', d.buyerFeeUsd, 'Buyer fee'],
    ['tax', d.taxTitleUsd || 0, 'Tax and title'],
    ['move', d.transportUsd, 'Transport'],
    ['mat', d.materialsUsd || 0, 'Materials'],
    ['cush', d.cushionUsd, 'Cushion'],
    ['profit', Math.max(0, d.spreadUsd), 'Est. profit'],
  ].filter(([, v]) => v > 0)
  const ceilPct = Math.min(100, (d.ceilingUsd / total) * 100)
  return `<div class="mbar" role="img" aria-label="${esc(parts.map(([, v, t]) => `${t} ${money(v)}`).join(', '))}; similar cars ${esc(money(d.resaleUsd))}; never bid above ${esc(money(d.ceilingUsd))}.">
    <div class="mbar-track">${parts.map(([k, v]) => `<i class="seg-${k}" style="--w:${((v / total) * 100).toFixed(2)}%"></i>`).join('')}<b class="mbar-ceil" style="left:${ceilPct.toFixed(2)}%" title="Never bid above ${esc(money(d.ceilingUsd))}"></b></div>
    <div class="mbar-key mono">${parts.map(([k, v, t]) => `<span><i class="seg-${k}"></i>${esc(t)} ${esc(money(v))}</span>`).join('')}</div>
  </div>`
}

function dealHtml(d, rank, lead = false) {
  const l = d.listing
  const photo = safeUrl(l.photos && l.photos[0])
  const t = closesText(l)
  const where = [l.location && l.location.city, l.location && l.location.state].filter(Boolean).join(', ')
  const basis = d.estimate && d.estimate.basis ? `${d.estimate.basis.sold} sold · ${d.estimate.basis.asks} asking · ${d.estimate.basis.bids} open bids` : `${d.comps} similar cars`
  const open = l.kind !== 'SAMPLE' && safeUrl(l.url)
  return `<article class="deal ${lead ? 'is-lead' : ''}" data-id="${esc(l.id)}">
    <a class="deal-photo" href="#plan/${encodeURIComponent(l.id)}" aria-label="Open the plan for ${esc(l.title)}">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" />` : `<span class="deal-plate" aria-hidden="true">${esc((l.make || '?')[0])}</span>`}
      <span class="deal-rank">${lead ? 'Lead' : '#' + rank}</span>${t ? `<span class="deal-clock ${t.tone}">${esc(t.text)}</span>` : ''}</a>
    <div class="deal-body">
      <h3 class="deal-title">${carName(l.title)}</h3>
      <div class="mono dim deal-sub">${esc([l.mileage !== undefined ? l.mileage.toLocaleString('en-US') + ' mi' : 'miles not stated', where || 'location not stated', sourceName(l.source)].join(' · '))}</div>
      <div class="deal-profit">
        <div>${d.spreadUsd >= 2500 && d.spreadPct >= 0.3 ? '<span class="tier best">Big margin</span>' : d.spreadUsd >= 1000 ? '<span class="tier go">Good margin</span>' : ''}<span class="mono dim">Est. profit</span><b class="num">${esc(money(d.spreadUsd))}</b><span class="mono pct">${Math.round(d.spreadPct * 100)}% on ${esc(money(d.allInUsd))} all in</span></div>
        <div class="deal-ceiling"><span class="mono dim">Never bid above</span><b class="num">${esc(money(d.ceilingUsd))}</b></div>
      </div>
      ${moneyBar(d)}
      <div class="deal-facts"><span class="badge go">✓ Clean title</span><span class="badge ${l.damage === 'none' ? 'go' : 'wait'}">${l.damage === 'none' ? '✓ No damage' : '! Minor damage'}</span><span class="badge ${l.runsAndDrives === true ? 'go' : 'wait'}">${l.runsAndDrives === true ? '✓ Runs & drives' : '? Runs: not stated'}</span></div>
      <div class="deal-evidence ${lead ? 'lead' : 'ok'}"><span class="mono">${lead ? 'Lead' : 'Confirmed'}</span> similar cars ${esc(money(d.resaleUsd))} · ${esc(basis)}${d.confidence === 'thin' ? ' · thin' : ''}</div>
      <details class="deal-cautions"><summary>${d.cautions.length} thing${d.cautions.length === 1 ? '' : 's'} to check before you bid</summary><ul>${d.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>
      <div class="actions"><a class="btn sm" href="#plan/${encodeURIComponent(l.id)}">View plan</a>${open ? `<a class="btn outline sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Open auction ↗</a>` : ''}<button class="btn outline sm" type="button" data-pnl>P/L</button><button class="btn outline sm" type="button" data-mats>Materials ${esc(money(d.materialsUsd || 0))}</button><button class="btn outline sm" type="button" data-watch>Watch</button><button class="more" type="button" data-bought>I bought it</button></div>
    </div>
  </article>`
}

function wire(root) {
  root.querySelectorAll('[data-pnl]').forEach((b) => b.addEventListener('click', () => openPnl({ listingId: b.closest('[data-id]').dataset.id })))
  root.querySelectorAll('[data-bought]').forEach((b) => b.addEventListener('click', () => openBought(b.closest('[data-id]').dataset.id)))
  root.querySelectorAll('[data-mats]').forEach((b) => b.addEventListener('click', () => openMaterials(b.closest('[data-id]').dataset.id)))
  root.querySelectorAll('[data-watch]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('[data-id]').dataset.id
    const on = b.getAttribute('aria-pressed') !== 'true'
    try {
      if (on) await postJson('/api/watchlist', { listingId: id }); else await del('/api/watchlist/' + encodeURIComponent(id))
      b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Watching' : 'Watch'
      toast(on ? 'Saved to your watchlist.' : 'Removed from your watchlist.')
    } catch (e) { toast(e.message, 'hot') }
  }))
}

