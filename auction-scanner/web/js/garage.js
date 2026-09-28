// Garage: the business ledger. Every car you bought, every dollar in and out, net per car.
import { getJson, postJson, del, esc, money, when } from './api.js'
import { toast, loading, errorStrip, sheet } from './ui.js'

const STATUS = { owned: ['', 'Owned'], fixing: ['wait', 'Fixing'], listed: ['', 'Listed'], rented: ['go', 'Rented'], sold: ['go', 'Sold'] }
const COSTS = ['Buyer fee', 'Transport', 'Inspection', 'Parts', 'Labour', 'Detail', 'Tyres', 'Registration and tax', 'Insurance', 'Storage']
const today = () => new Date().toISOString().slice(0, 10)

function carForm() {
  return `<form id="g-form"><h2>Add a car you bought</h2><p class="dim" style="font-size:14px">Only what you type goes in. You can add every cost afterwards.</p>
    <div class="grid2"><label class="f">Name <input type="text" name="title" required maxlength="120" placeholder="2017 Toyota Camry SE" /></label>
      <label class="f">Purchase price ($) <input type="number" name="purchaseUsd" min="1" step="any" required /></label>
      <label class="f">Year <input type="number" name="year" min="1950" max="2050" step="1" /></label>
      <label class="f">Make <input type="text" name="make" maxlength="40" /></label>
      <label class="f">Model <input type="text" name="model" maxlength="60" /></label>
      <label class="f">VIN <input type="text" name="vin" maxlength="17" style="font-family:var(--mono)" /></label>
      <label class="f">Bought from <input type="text" name="boughtFrom" maxlength="80" placeholder="eBay Motors, Copart, a private seller" /></label>
      <label class="f">Date bought <input type="date" name="boughtAt" value="${today()}" /></label></div>
    <div class="row" style="margin-top:14px"><button class="btn" type="submit">Add to the garage</button><button class="btn outline" type="button" data-close>Cancel</button></div></form>`
}

function moneyForm(kind) {
  const labels = kind === 'cost' ? COSTS : ['Turo payout', 'Rental payment', 'Sale']
  return `<form id="m-form"><h2>${kind === 'cost' ? 'Add a cost' : 'Add income'}</h2>
    <div class="chips wrap" style="margin-bottom:10px">${labels.map((l) => `<button type="button" class="chip" data-label="${esc(l)}">${esc(l)}</button>`).join('')}</div>
    <div class="grid2"><label class="f">What for <input type="text" name="label" required maxlength="80" /></label>
      <label class="f">Amount ($) <input type="number" name="usd" min="0.01" step="any" required /></label>
      <label class="f">Date <input type="date" name="date" value="${today()}" /></label></div>
    ${kind === 'income' ? '<p class="dim" style="font-size:14px">An income called "Sale" marks the car sold on that date.</p>' : ''}
    <div class="row" style="margin-top:14px"><button class="btn" type="submit">Add</button><button class="btn outline" type="button" data-close>Cancel</button></div></form>`
}

function carHtml(c) {
  const [tone, word] = STATUS[c.status] || STATUS.owned
  const t = c.totals
  const entries = [...c.costs.map((m) => ({ ...m, kind: 'cost' })), ...c.income.map((m) => ({ ...m, kind: 'income' }))].sort((a, b) => b.date - a.date)
  return `<article class="panel gcar" data-id="${esc(c.id)}">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3>${esc(c.title)}</h3><div class="mono dim">${esc([c.boughtFrom, 'bought ' + when(c.boughtAt), t.daysOwned + ' days', c.vin ? 'VIN ' + c.vin : null, c.channel].filter(Boolean).join(' · '))}</div></div>
      <label class="f" style="min-width:150px">Status <select data-status aria-label="Status of ${esc(c.title)}">${Object.entries(STATUS).map(([k, [, w]]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${w}</option>`).join('')}</select></label></div>
    <div class="tiles" style="margin-top:12px"><div class="tile"><div class="k mono">Spent</div><div class="v">${esc(money(t.spentUsd))}</div></div><div class="tile"><div class="k mono">Income</div><div class="v">${esc(money(t.incomeUsd))}</div></div><div class="tile ${t.netUsd > 0 ? 'go' : t.netUsd < 0 ? 'hot' : ''}"><div class="k mono">Net</div><div class="v">${esc(money(t.netUsd))}</div></div></div>
    <details><summary>${entries.length + 1} entr${entries.length ? 'ies' : 'y'}</summary><div class="list">
      <div class="item"><div class="main"><b>Purchase</b><div class="mono dim">${esc(when(c.boughtAt))}</div></div><span class="mono">−${esc(money(c.purchaseUsd))}</span></div>
      ${entries.map((m) => `<div class="item" data-entry="${esc(m.id)}"><div class="main"><b>${esc(m.label)}</b><div class="mono dim">${esc(when(m.date))}</div></div><span class="mono ${m.kind === 'income' ? 'in' : ''}">${m.kind === 'income' ? '+' : '−'}${esc(money(m.usd))}</span><button class="more" type="button" data-rm-entry aria-label="Remove ${esc(m.label)}">remove</button></div>`).join('')}
    </div></details>
    <div class="actions"><button class="btn sm" type="button" data-add="cost">Add a cost</button><button class="btn outline sm" type="button" data-add="income">Add income</button><button class="more" type="button" data-rm-car>Remove car</button></div>
  </article>`
}

export async function render(el) {
  el.innerHTML = `<div class="head"><div><h1>Garage</h1></div></div>${loading('Opening the books…')}`
  let g
  try { g = await getJson('/api/garage') } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const s = g.summary
  el.innerHTML = `<div class="head"><div><h1>Garage</h1><p>The business ledger. Every car you bought, every dollar in and out. Only what you type goes in.</p></div><div class="row"><button class="btn" id="g-add">Add a car</button></div></div>
    <div class="tiles four">
      <div class="tile big"><div class="k mono">Cars</div><div class="v">${s.cars}</div><div class="s">${s.active} active · ${s.sold} sold</div></div>
      <div class="tile big"><div class="k mono">Spent</div><div class="v">${esc(money(s.spentUsd))}</div><div class="s">purchases and every cost</div></div>
      <div class="tile big"><div class="k mono">Income</div><div class="v">${esc(money(s.incomeUsd))}</div><div class="s">rentals and sales</div></div>
      <div class="tile big ${s.netUsd > 0 ? 'go' : s.netUsd < 0 ? 'hot' : ''}"><div class="k mono">Net</div><div class="v">${esc(money(s.netUsd))}</div><div class="s">${s.bestTitle ? 'best: ' + esc(s.bestTitle) : 'income minus spend'}</div></div>
    </div>
    ${g.cars.length ? `<div class="garage">${g.cars.map(carHtml).join('')}</div>` : `<div class="tag empty"><h2>No cars yet</h2><p>When you buy your first car, add it here with what you paid. Then log each cost (fees, transport, fixes) and each dollar it earns. The net tells you whether the business works.</p></div>`}`
  const reload = () => render(el)
  el.querySelector('#g-add').addEventListener('click', () => {
    const close = sheet(carForm(), { label: 'Add a car' })
    document.querySelector('#g-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const f = Object.fromEntries(new FormData(e.target).entries())
      if (f.boughtAt) f.boughtAt = Date.parse(f.boughtAt + 'T12:00:00')
      try { await postJson('/api/garage', f); close(); toast('Added to the garage.'); reload() } catch (err) { toast(err.message, 'hot') }
    })
  })
  el.querySelectorAll('.gcar').forEach((card) => {
    const id = card.dataset.id
    card.querySelector('[data-status]').addEventListener('change', async (e) => { try { await postJson('/api/garage/' + encodeURIComponent(id), { status: e.target.value }); reload() } catch (err) { toast(err.message, 'hot') } })
    card.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
      const kind = b.dataset.add
      const close = sheet(moneyForm(kind), { label: kind === 'cost' ? 'Add a cost' : 'Add income' })
      const form = document.querySelector('#m-form')
      form.querySelectorAll('[data-label]').forEach((c) => c.addEventListener('click', () => { form.label.value = c.dataset.label; form.usd.focus() }))
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.target).entries())
        if (f.date) f.date = Date.parse(f.date + 'T12:00:00')
        try { await postJson(`/api/garage/${encodeURIComponent(id)}/${kind}`, f); close(); reload() } catch (err) { toast(err.message, 'hot') }
      })
    }))
    card.querySelectorAll('[data-rm-entry]').forEach((b) => b.addEventListener('click', async () => { try { await del(`/api/garage/${encodeURIComponent(id)}/entry/${encodeURIComponent(b.closest('[data-entry]').dataset.entry)}`); reload() } catch (err) { toast(err.message, 'hot') } }))
    card.querySelector('[data-rm-car]').addEventListener('click', async () => { if (!window.confirm('Remove this car and all its entries?')) return; try { await del('/api/garage/' + encodeURIComponent(id)); reload() } catch (err) { toast(err.message, 'hot') } })
  })
}
