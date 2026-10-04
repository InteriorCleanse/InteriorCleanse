// Business: every company's books, profit per company and overall, and a partner
// that reads them and says what to do next. Only what the member types goes in;
// the arithmetic is src/business.ts, the advice src/advisor.ts.
import { getJson, postJson, del, esc, money, when, store } from './api.js'
import { toast, loading, errorStrip, sheet, carName } from './ui.js'
import { openPnl, materialsHtml } from './pnl.js'

const STATUS = { owned: ['', 'Owned'], fixing: ['wait', 'Fixing'], listed: ['', 'Listed'], rented: ['go', 'Rented'], sold: ['go', 'Sold'] }
const KIND = { flip: 'Flips', rental: 'Rentals', mixed: 'Flips and rentals' }
const COSTS = ['Buyer fee', 'Transport', 'Inspection', 'Parts', 'Labour', 'Detail', 'Tyres', 'Registration and tax', 'Insurance', 'Storage']
const OVERHEAD = ['Dealer licence', 'Business insurance', 'Lot rent', 'Software', 'Accounting', 'Tools']
const TONE = { hot: 'hot', best: 'best', wait: 'wait', go: 'go', '': '' }
const today = () => new Date().toISOString().slice(0, 10)
const signed = (n) => (n > 0 ? '+' : '') + money(n)
const toneOf = (n) => (n > 0 ? 'go' : n < 0 ? 'hot' : '')

function companyOptions(companies, selected) {
  return `<option value="">No company yet</option>${companies.map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`
}

function carForm(companies, companyId) {
  return `<form id="g-form"><h2>Add a car you bought</h2><p class="dim" style="font-size:14px">Only what you type goes in. Add each cost afterwards.</p>
    <div class="grid2"><label class="f">Name <input type="text" name="title" required maxlength="120" placeholder="2017 Toyota Camry SE" /></label>
      <label class="f">Purchase price ($) <input type="number" name="purchaseUsd" min="1" step="any" required /></label>
      <label class="f">Company <select name="companyId">${companyOptions(companies, companyId)}</select></label>
      <label class="f">Target sale price ($) <input type="number" name="targetSaleUsd" min="1" step="any" placeholder="optional" /></label>
      <label class="f">Year <input type="number" name="year" min="1950" max="2050" step="1" /></label>
      <label class="f">Make <input type="text" name="make" maxlength="40" /></label>
      <label class="f">Model <input type="text" name="model" maxlength="60" /></label>
      <label class="f">Miles <input type="number" name="mileage" min="0" step="1" /></label>
      <label class="f">VIN <input type="text" name="vin" maxlength="17" style="font-family:var(--mono)" /></label>
      <label class="f">Bought from <input type="text" name="boughtFrom" maxlength="80" placeholder="GSA Auctions, Copart, a private seller" /></label>
      <label class="f">Date bought <input type="date" name="boughtAt" value="${today()}" /></label></div>
    <div class="row" style="margin-top:14px"><button class="btn" type="submit">Add to the books</button><button class="btn outline" type="button" data-close>Cancel</button></div></form>`
}

function moneyForm(kind) {
  const labels = kind === 'cost' ? COSTS : kind === 'overhead' ? OVERHEAD : ['Turo payout', 'Rental payment', 'Sale']
  const title = kind === 'cost' ? 'Add a cost' : kind === 'overhead' ? 'Add a business cost' : 'Add income'
  return `<form id="m-form"><h2>${title}</h2>${kind === 'overhead' ? '<p class="dim" style="font-size:14px">A cost of the company, not of one car.</p>' : ''}
    <div class="chips wrap" style="margin-bottom:10px">${labels.map((l) => `<button type="button" class="chip" data-label="${esc(l)}">${esc(l)}</button>`).join('')}</div>
    <div class="grid2"><label class="f">What for <input type="text" name="label" required maxlength="80" /></label>
      <label class="f">Amount ($) <input type="number" name="usd" min="0.01" step="any" required /></label>
      <label class="f">Date <input type="date" name="date" value="${today()}" /></label></div>
    ${kind === 'income' ? '<p class="dim" style="font-size:14px">Income called "Sale" marks the car sold on that date.</p>' : ''}
    <div class="row" style="margin-top:14px"><button class="btn" type="submit">Add</button><button class="btn outline" type="button" data-close>Cancel</button></div></form>`
}

function companyForm(c) {
  return `<form id="c-form"><h2>${c ? 'Edit company' : 'Add a company'}</h2><p class="dim" style="font-size:14px">Each company keeps its own books: its cars, its overhead, its profit.</p>
    <div class="grid2"><label class="f">Name <input type="text" name="name" required maxlength="60" value="${c ? esc(c.name) : ''}" placeholder="Northside Flips LLC" /></label>
      <label class="f">What it does <select name="kind">${Object.entries(KIND).map(([k, w]) => `<option value="${k}" ${c && c.kind === k ? 'selected' : ''}>${w}</option>`).join('')}</select></label></div>
    <div class="row" style="margin-top:14px"><button class="btn" type="submit">${c ? 'Save' : 'Add the company'}</button><button class="btn outline" type="button" data-close>Cancel</button>${c ? '<button class="more" type="button" id="c-del">Delete company</button>' : ''}</div></form>`
}

/** Twelve months of cash in and out, with the net as a line. */
function chartHtml(months) {
  const W = 600, H = 150, pad = 18
  const max = Math.max(1, ...months.map((m) => Math.max(m.inUsd, m.outUsd)))
  const bw = (W - pad * 2) / months.length
  const y = (v) => H - pad - (v / max) * (H - pad * 2)
  const mid = (i) => pad + bw * i + bw / 2
  const netMax = Math.max(1, ...months.map((m) => Math.abs(m.netUsd)))
  const ny = (v) => H / 2 - (v / netMax) * (H / 2 - pad)
  const line = months.map((m, i) => `${i ? 'L' : 'M'}${mid(i).toFixed(1)},${ny(m.netUsd).toFixed(1)}`).join(' ')
  const label = (k) => new Date(k + '-15').toLocaleDateString('en-US', { month: 'short' })
  return `<figure class="biz-chart" role="img" aria-label="Cash in and out over the last twelve months">
    <svg viewBox="0 0 ${W} ${H + 18}" preserveAspectRatio="none">
      ${months.map((m, i) => `<rect class="c-out" x="${(mid(i) - bw * 0.36).toFixed(1)}" y="${y(m.outUsd).toFixed(1)}" width="${(bw * 0.34).toFixed(1)}" height="${(H - pad - y(m.outUsd)).toFixed(1)}" rx="2"><title>${label(m.month)}: out ${money(m.outUsd)}</title></rect><rect class="c-in" x="${(mid(i) + bw * 0.02).toFixed(1)}" y="${y(m.inUsd).toFixed(1)}" width="${(bw * 0.34).toFixed(1)}" height="${(H - pad - y(m.inUsd)).toFixed(1)}" rx="2"><title>${label(m.month)}: in ${money(m.inUsd)}</title></rect><text x="${mid(i).toFixed(1)}" y="${H + 14}" text-anchor="middle">${label(m.month)}</text>`).join('')}
      <path class="c-net" d="${line}" pathLength="100" />
    </svg>
    <figcaption class="mono"><span><i class="c-in"></i>In</span><span><i class="c-out"></i>Out</span><span><i class="c-net"></i>Net</span></figcaption>
  </figure>`
}

function kpis(s) {
  const t = (k, v, sub, tone = '') => `<div class="tile ${tone}"><div class="k mono">${k}</div><div class="v num">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`
  return `<div class="biz-kpis">
    ${t('Profit', esc(signed(s.profitUsd)), `sold cars in full · cars you own by income and running costs · less ${esc(money(s.overheadUsd))} overhead`, toneOf(s.profitUsd))}
    ${t('Realised', esc(signed(s.realisedNetUsd)), `on ${s.sold} sold`, toneOf(s.realisedNetUsd))}
    ${t('Held in cars', esc(money(s.heldUsd)), `paid for ${s.active} you own`)}
    ${t('Cash flow', esc(signed(s.netUsd)), 'every dollar in − out', toneOf(s.netUsd))}
    ${t('Income', esc(money(s.incomeUsd)), `${esc(money(s.salesUsd))} sales · ${esc(money(s.rentalIncomeUsd))} rent`)}
    ${t('Spent', esc(money(s.carSpendUsd + s.overheadUsd)), `${esc(money(s.overheadUsd))} overhead`)}
    ${t('Per sale', s.avgProfitPerSaleUsd !== undefined ? esc(signed(s.avgProfitPerSaleUsd)) : '—', s.avgDaysToSell !== undefined ? `${s.avgDaysToSell} days to sell` : 'after a sale')}
    ${t('Return', s.roiPct !== undefined ? Math.round(s.roiPct * 100) + '%' : '—', s.rentalPerCarMonthUsd !== undefined ? `on sold cars · rent ${esc(money(s.rentalPerCarMonthUsd))}/car/mo` : 'on sold cars')}
  </div>`
}

function partnerHtml(b) {
  return `<section class="partner panel" aria-label="Your business partner">
    <div class="partner-head"><div class="partner-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z"/></svg></div>
      <div><span class="mono dim">Your partner</span><h2>${esc(b.headline)}</h2><p class="dim">${esc(b.sub)}</p></div></div>
    <ol class="advice">${b.items.map((a, i) => `<li ${i >= 4 ? 'data-extra hidden' : ''} class="adv ${TONE[a.tone]}"><span class="adv-dot" aria-hidden="true"></span><div><div class="adv-top"><b>${esc(a.title)}</b><span class="kind mono">${esc(a.kind)}</span></div><p>${esc(a.body)}</p>${a.href && a.action ? `<a class="more" href="${esc(a.href)}">${esc(a.action)} →</a>` : ''}</div></li>`).join('') || '<li class="adv"><div><p>Nothing needs you right now.</p></div></li>'}</ol>
    ${b.items.length > 4 ? `<button type="button" class="more adv-more" id="adv-more" aria-expanded="false">${b.items.length - 4} more from your partner</button>` : ''}
    <form class="ask" id="ask-form"><label class="sr-only" for="ask-q">Ask your partner</label><input id="ask-q" type="text" maxlength="1000" placeholder="Ask about your business: which company makes more? what should I list it at?" autocomplete="off" /><button class="btn" type="submit">Ask</button></form>
    <div class="ask-chips chips wrap">${['How much profit have I made?', 'Which company makes more?', 'What should I list my cars at?', 'How much can I spend next?'].map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div id="ask-out" aria-live="polite"></div>
  </section>`
}

function carHtml(c, companies) {
  const t = c.totals
  const entries = [...c.costs.map((m) => ({ ...m, kind: 'cost' })), ...c.income.map((m) => ({ ...m, kind: 'income' }))].sort((a, b) => b.date - a.date)
  const inIt = Math.max(0, t.spentUsd - t.incomeUsd)
  const doneN = (c.materialsDone || []).length
  const due = c.materials.items.filter((x) => x.need !== 'check').length
  return `<article class="panel gcar" data-id="${esc(c.id)}">
    <div class="gcar-top"><div><h3>${carName(c.title)}</h3><div class="mono dim">${esc([c.boughtFrom, 'bought ' + when(c.boughtAt), t.daysOwned + ' days', c.mileage ? c.mileage.toLocaleString('en-US') + ' mi' : null, c.vin ? 'VIN ' + c.vin : null].filter(Boolean).join(' · '))}</div></div>
      <div class="gcar-sel"><label class="f">Company <select data-company aria-label="Company for ${esc(c.title)}">${companyOptions(companies, c.companyId)}</select></label>
      <label class="f">Status <select data-status aria-label="Status of ${esc(c.title)}">${Object.entries(STATUS).map(([k, [, w]]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${w}</option>`).join('')}</select></label></div></div>
    <div class="gcar-figs"><div><span class="mono dim">Spent</span><b class="num">${esc(money(t.spentUsd))}</b></div><div><span class="mono dim">Income</span><b class="num">${esc(money(t.incomeUsd))}</b></div>${c.status === 'sold' ? `<div class="${toneOf(t.netUsd)}"><span class="mono dim">Profit</span><b class="num">${esc(signed(t.netUsd))}</b></div>` : `<div><span class="mono dim">Running costs</span><b class="num">${esc(money(t.spentUsd - c.purchaseUsd))}</b></div>`}
      ${c.status !== 'sold' ? `<div><span class="mono dim">Break even</span><b class="num">${esc(money(inIt))}</b></div><div><span class="mono dim">Target sale</span><b class="num">${c.targetSaleUsd ? esc(money(c.targetSaleUsd)) : '—'}</b>${c.targetSaleUsd ? `<span class="mono ${toneOf(c.targetSaleUsd - inIt)}">${esc(signed(c.targetSaleUsd - inIt))} if it sells</span>` : ''}</div>` : ''}</div>
    <details><summary>${entries.length + 1} entr${entries.length ? 'ies' : 'y'}</summary><div class="list">
      <div class="item"><div class="main"><b>Purchase</b><div class="mono dim">${esc(when(c.boughtAt))}</div></div><span class="mono">−${esc(money(c.purchaseUsd))}</span></div>
      ${entries.map((m) => `<div class="item" data-entry="${esc(m.id)}"><div class="main"><b>${esc(m.label)}</b><div class="mono dim">${esc(when(m.date))}</div></div><span class="mono ${m.kind === 'income' ? 'in' : ''}">${m.kind === 'income' ? '+' : '−'}${esc(money(m.usd))}</span><button class="more" type="button" data-rm-entry aria-label="Remove ${esc(m.label)}">remove</button></div>`).join('')}
    </div></details>
    <div class="actions"><button class="btn sm" type="button" data-add="cost">Add a cost</button><button class="btn outline sm" type="button" data-add="income">Add income</button><button class="btn outline sm" type="button" data-pnl>P/L</button><button class="btn outline sm" type="button" data-mats>Materials ${doneN}/${due}</button><a class="btn outline sm" href="#parts/car/${encodeURIComponent(c.id)}">Find parts</a><button class="more" type="button" data-rm-car>Remove car</button></div>
  </article>`
}

export async function render(el, ctx, args = []) {
  el.innerHTML = `<div class="head"><div><h1>Business</h1></div></div>${loading('Opening the books…')}`
  let b
  try { b = await getJson('/api/business') } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const companies = b.companies
  const pick = args[0] && (args[0] === 'none' || companies.some((c) => c.id === args[0])) ? args[0] : (store('gavel-biz') || {}).co
  const sel = pick === 'none' && b.report.unassigned ? 'none' : companies.some((c) => c.id === pick) ? pick : ''
  const rep = sel === 'none' ? { stats: b.report.unassigned, months: null } : sel ? b.report.companies.find((c) => c.company.id === sel) : { stats: b.report.overall, months: b.report.months }
  const company = companies.find((c) => c.id === sel)
  const cars = b.cars.filter((c) => !sel || (sel === 'none' ? !c.companyId : c.companyId === sel))
  const reload = () => render(el, ctx, [sel])

  el.innerHTML = `<div class="head"><div><h1>Business</h1><p>Every company's books, profit per company and overall, and a partner reading them with you.</p></div>
      <div class="row"><button class="btn" id="b-car">Add a car</button><button class="btn outline" id="b-co">Add a company</button></div></div>
    ${partnerHtml(b.briefing)}
    <nav class="biz-tabs chips wrap" aria-label="Which books">
      <button type="button" class="chip" data-co="" aria-pressed="${!sel}">All companies <span class="mono ${toneOf(b.report.overall.profitUsd)}">${esc(signed(b.report.overall.profitUsd))}</span></button>
      ${b.report.companies.map((r) => `<button type="button" class="chip" data-co="${esc(r.company.id)}" aria-pressed="${sel === r.company.id}">${esc(r.company.name)} <span class="mono ${toneOf(r.stats.profitUsd)}">${esc(signed(r.stats.profitUsd))}</span></button>`).join('')}
      ${b.report.unassigned ? `<button type="button" class="chip" data-co="none" aria-pressed="${sel === 'none'}">No company <span class="mono">${b.report.unassigned.cars}</span></button>` : ''}
    </nav>
    <section class="biz-books">
      <div class="biz-title"><h2>${sel === 'none' ? 'Cars in no company' : company ? esc(company.name) : 'All companies'}${company ? ` <span class="badge">${esc(KIND[company.kind])}</span>` : ''}</h2>${company ? '<button class="more" type="button" id="b-edit">Edit</button>' : ''}</div>
      ${kpis(rep.stats)}
      ${rep.months ? chartHtml(rep.months) : ''}
      ${!sel && b.report.companies.length ? `<div class="biz-board">${[...b.report.companies].sort((x, y) => y.stats.profitUsd - x.stats.profitUsd).map((r) => {
        const top = Math.max(1, ...b.report.companies.map((x) => Math.abs(x.stats.profitUsd)))
        return `<button type="button" class="board-row" data-co="${esc(r.company.id)}"><span class="board-name"><b>${esc(r.company.name)}</b><span class="dim">${esc(KIND[r.company.kind])} · ${r.stats.cars} car${r.stats.cars === 1 ? '' : 's'}${r.stats.roiPct !== undefined ? ` · ${Math.round(r.stats.roiPct * 100)}% return` : ''}</span></span><span class="board-bar"><i class="${toneOf(r.stats.profitUsd)}" style="--w:${((Math.abs(r.stats.profitUsd) / top) * 100).toFixed(1)}%"></i></span><b class="num ${toneOf(r.stats.profitUsd)}">${esc(signed(r.stats.profitUsd))}</b></button>`
      }).join('')}</div>` : ''}
      ${company ? `<div class="panel overhead"><div class="row" style="justify-content:space-between"><h3>Business costs</h3><button class="btn outline sm" type="button" id="b-oh">Add a business cost</button></div>
        ${company.overhead.length ? `<div class="list">${[...company.overhead].sort((x, y) => y.date - x.date).map((o) => `<div class="item" data-oh="${esc(o.id)}"><div class="main"><b>${esc(o.label)}</b><div class="mono dim">${esc(when(o.date))}</div></div><span class="mono">−${esc(money(o.usd))}</span><button class="more" type="button" data-rm-oh aria-label="Remove ${esc(o.label)}">remove</button></div>`).join('')}</div>` : '<p class="dim">Licences, insurance, a lot, software: costs of the company, not of one car.</p>'}</div>` : ''}
    </section>
    ${cars.length ? `<div class="garage">${cars.map((c) => carHtml(c, companies)).join('')}</div>` : `<div class="tag empty"><h2>${b.cars.length ? 'No cars in these books yet' : 'No cars yet'}</h2><p>${companies.length ? 'When you buy a car, add it with what you paid and pick its company.' : 'Start with your companies: a flip company and a rental company keep separate books. Then add each car you buy.'} Log every cost and every dollar it earns; the books tell you what each company really makes.</p></div>`}`

  const moreBtn = el.querySelector('#adv-more')
  if (moreBtn) moreBtn.addEventListener('click', () => {
    const open = moreBtn.getAttribute('aria-expanded') !== 'true'
    el.querySelectorAll('.advice [data-extra]').forEach((x) => { x.hidden = !open })
    moreBtn.setAttribute('aria-expanded', String(open))
    moreBtn.textContent = open ? 'Show less' : `${b.briefing.items.length - 4} more from your partner`
  })

  // Partner: ask a question.
  const out = el.querySelector('#ask-out')
  const ask = async (q) => {
    if (!q.trim()) return
    out.innerHTML = loading('Reading your books…')
    try {
      const a = await postJson('/api/assistant/ask', { question: q })
      out.innerHTML = `<div class="answer"><p class="mono dim">${esc(q)}</p>${a.answer.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')}<p class="mono dim src">${a.source === 'ai' ? 'Written by Claude from your books only.' : 'Answered from your books by Gavel\'s rules. Turn on AI in Connect for any question.'}</p></div>`
    } catch (e) { out.innerHTML = errorStrip(e.message) }
  }
  el.querySelector('#ask-form').addEventListener('submit', (e) => { e.preventDefault(); ask(el.querySelector('#ask-q').value) })
  el.querySelectorAll('[data-q]').forEach((b2) => b2.addEventListener('click', () => { el.querySelector('#ask-q').value = b2.dataset.q; ask(b2.dataset.q) }))

  // Which books.
  el.querySelectorAll('[data-co]').forEach((x) => x.addEventListener('click', () => { store('gavel-biz', { co: x.dataset.co }); render(el, ctx, [x.dataset.co]) }))

  // Companies.
  const companySheet = (c) => {
    const close = sheet(companyForm(c), { label: c ? 'Edit company' : 'Add a company' })
    document.querySelector('#c-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const f = Object.fromEntries(new FormData(e.target).entries())
      try {
        const saved = await postJson(c ? '/api/companies/' + encodeURIComponent(c.id) : '/api/companies', f)
        close(); toast(c ? 'Saved.' : `${saved.name} added.`); store('gavel-biz', { co: saved.id }); render(el, ctx, [saved.id])
      } catch (err) { toast(err.message, 'hot') }
    })
    const delBtn = document.querySelector('#c-del')
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!window.confirm(`Delete ${c.name}? Its cars stay in the books with no company; its business costs go.`)) return
      try { await del('/api/companies/' + encodeURIComponent(c.id)); close(); store('gavel-biz', { co: '' }); render(el, ctx, ['']) } catch (err) { toast(err.message, 'hot') }
    })
  }
  el.querySelector('#b-co').addEventListener('click', () => companySheet(null))
  const edit = el.querySelector('#b-edit')
  if (edit) edit.addEventListener('click', () => companySheet(company))

  const moneySheet = (kind, url, done) => {
    const close = sheet(moneyForm(kind), { label: kind === 'cost' ? 'Add a cost' : kind === 'overhead' ? 'Add a business cost' : 'Add income' })
    const form = document.querySelector('#m-form')
    form.querySelectorAll('[data-label]').forEach((c) => c.addEventListener('click', () => { form.label.value = c.dataset.label; form.usd.focus() }))
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const f = Object.fromEntries(new FormData(e.target).entries())
      if (f.date) f.date = Date.parse(f.date + 'T12:00:00')
      try { await postJson(url, f); close(); done() } catch (err) { toast(err.message, 'hot') }
    })
  }
  const oh = el.querySelector('#b-oh')
  if (oh) oh.addEventListener('click', () => moneySheet('overhead', `/api/companies/${encodeURIComponent(company.id)}/overhead`, reload))
  el.querySelectorAll('[data-rm-oh]').forEach((x) => x.addEventListener('click', async () => {
    try { await del(`/api/companies/${encodeURIComponent(company.id)}/overhead/${encodeURIComponent(x.closest('[data-oh]').dataset.oh)}`); reload() } catch (err) { toast(err.message, 'hot') }
  }))

  // Cars.
  el.querySelector('#b-car').addEventListener('click', () => {
    const close = sheet(carForm(companies, sel && sel !== 'none' ? sel : ''), { label: 'Add a car' })
    document.querySelector('#g-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const f = Object.fromEntries([...new FormData(e.target).entries()].filter(([, v]) => v !== ''))
      if (f.boughtAt) f.boughtAt = Date.parse(f.boughtAt + 'T12:00:00')
      try { await postJson('/api/garage', f); close(); toast('Added to the books.'); reload() } catch (err) { toast(err.message, 'hot') }
    })
  })
  el.querySelectorAll('.gcar').forEach((card) => {
    const id = card.dataset.id
    const car = b.cars.find((c) => c.id === id)
    const patch = async (body) => { try { await postJson('/api/garage/' + encodeURIComponent(id), body); reload() } catch (err) { toast(err.message, 'hot') } }
    card.querySelector('[data-status]').addEventListener('change', (e) => patch({ status: e.target.value }))
    card.querySelector('[data-company]').addEventListener('change', (e) => patch({ companyId: e.target.value }))
    card.querySelectorAll('[data-add]').forEach((x) => x.addEventListener('click', () => moneySheet(x.dataset.add, `/api/garage/${encodeURIComponent(id)}/${x.dataset.add}`, reload)))
    card.querySelector('[data-pnl]').addEventListener('click', () => openPnl({ carId: id }))
    card.querySelector('[data-mats]').addEventListener('click', () => {
      const close = sheet(`<h2>Materials</h2><p class="mono dim">${esc(car.title)}</p><p class="dim" style="font-size:14px">Tick each one as it is done. Log what it cost with Add a cost, so the books hold your real number.</p>${materialsHtml(car.materials, { done: car.materialsDone || [], editable: true })}<div class="row" style="margin-top:14px"><button class="btn" type="button" id="mat-save">Save</button><button class="btn outline" type="button" data-close>Close</button></div>`, { label: 'Materials' })
      const root = document.getElementById('sheet-root')
      root.querySelectorAll('[data-part]').forEach((a) => a.setAttribute('href', `#parts/car/${encodeURIComponent(id)}/${encodeURIComponent(a.dataset.part)}`))
      root.querySelectorAll('[data-part]').forEach((a) => a.addEventListener('click', () => close()))
      root.querySelectorAll('[data-mat]').forEach((x) => x.addEventListener('change', () => x.closest('li').classList.toggle('done', x.checked)))
      root.querySelector('#mat-save').addEventListener('click', async () => {
        const done = [...root.querySelectorAll('[data-mat]:checked')].map((x) => x.dataset.mat)
        try { await postJson('/api/garage/' + encodeURIComponent(id), { materialsDone: done }); close(); reload() } catch (err) { toast(err.message, 'hot') }
      })
    })
    card.querySelectorAll('[data-rm-entry]').forEach((x) => x.addEventListener('click', async () => { try { await del(`/api/garage/${encodeURIComponent(id)}/entry/${encodeURIComponent(x.closest('[data-entry]').dataset.entry)}`); reload() } catch (err) { toast(err.message, 'hot') } }))
    card.querySelector('[data-rm-car]').addEventListener('click', async () => { if (!window.confirm('Remove this car and all its entries?')) return; try { await del('/api/garage/' + encodeURIComponent(id)); reload() } catch (err) { toast(err.message, 'hot') } })
  })
}
