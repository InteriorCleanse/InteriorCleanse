// The first-car finder for a rental business (or a flip).
import { getJson, esc, money, store } from './api.js'
import { loading, errorStrip } from './ui.js'

const FIT = { in: ['go', 'In budget'], under: ['', 'Under budget'], stretch: ['wait', 'Stretch'], over: ['hot', 'Over budget'] }

export async function render(el, ctx) {
  const saved = store('gavel-rental') || { budget: ctx.me.cashUsd || 15000, use: 'p2p' }
  el.innerHTML = `<div class="head"><div><h1>Rental</h1><p>Your goal is a rental car company and a first car. Type your cash for one car, pick a road, and Gavel ranks the sensible candidates and lays out the first ten steps.</p></div></div>
    <div class="panel"><form id="r-form" class="row"><label class="f" style="min-width:200px">Cash for one car, all in ($) <input type="number" name="budget" min="0" step="any" value="${esc(saved.budget)}" /></label>
      <label class="f" style="min-width:220px">The road <select name="use"><option value="p2p" ${saved.use === 'p2p' ? 'selected' : ''}>Rent it on an app like Turo</option><option value="fleet" ${saved.use === 'fleet' ? 'selected' : ''}>My own rental fleet</option><option value="flip" ${saved.use === 'flip' ? 'selected' : ''}>Flip it for the next one</option></select></label>
      <button class="btn outline" type="submit" style="align-self:end">Update</button></form></div>
    <div id="r-out"></div>`
  const out = el.querySelector('#r-out')
  const go = async () => {
    const f = new FormData(el.querySelector('#r-form'))
    const budget = Number(f.get('budget')) || 0
    const use = String(f.get('use'))
    store('gavel-rental', { budget, use })
    out.innerHTML = loading('Ranking…')
    try {
      const r = await getJson(`/api/rental?budget=${encodeURIComponent(budget)}&use=${encodeURIComponent(use)}`)
      // The budget sentence leads; the cautions are one box; cars over budget wait behind one line.
      const [lead, ...cautions] = r.notes
      const card = (p) => { const [tone, word] = FIT[p.budgetFit]; return `<article class="panel"><div class="row" style="justify-content:space-between"><h3>${esc(p.make)} ${esc(p.model)}</h3><span class="pill ${tone}">${word}</span></div><div class="mono dim">${esc(p.years)} · roughly ${esc(money(p.roughBandUsd[0]))}–${esc(money(p.roughBandUsd[1]))}</div><p style="margin:8px 0 6px">${esc(p.whyPlain)}</p><div class="warnbox"><span class="k mono">Watch out</span> ${esc(p.watchOut)}</div><div class="row" style="margin-top:10px"><a class="btn outline sm" href="#feed" data-search="${esc(p.make + ' ' + p.model.split(' ')[0])}">Find one in the feed</a></div></article>` }
      const fits = r.picks.filter((p) => p.budgetFit !== 'over')
      const over = r.picks.filter((p) => p.budgetFit === 'over')
      out.innerHTML = `${lead ? `<p class="lead" style="margin:16px 0 4px">${esc(lead)}</p>` : ''}
        ${cautions.length ? `<div class="strip wait" style="margin-top:12px"><b>Before you buy</b><ul class="fire-steps">${cautions.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
        <div class="guides">${fits.map(card).join('')}</div>
        ${over.length ? `<details class="more-steps" style="margin-top:12px"><summary>${over.length} more over your ${esc(money(budget))}</summary><div class="guides" style="margin-top:8px">${over.map(card).join('')}</div></details>` : ''}
        <div class="panel" style="margin-top:16px"><h2>The first ten steps</h2><ol class="steps">${r.steps.map((s) => `<li><p>${esc(s)}</p></li>`).join('')}</ol><p class="dim" style="margin-top:8px;font-size:14px">The long version is in the Playbook: <a href="#playbook/rental-company">Starting a rental car company</a>.</p></div>`
      out.querySelectorAll('[data-search]').forEach((a) => a.addEventListener('click', () => {
        const st = store('gavel-feed') || {}
        st.q = a.dataset.search
        store('gavel-feed', st)
      }))
    } catch (e) { out.innerHTML = errorStrip(e.message) }
  }
  el.querySelector('#r-form').addEventListener('submit', (e) => { e.preventDefault(); go() })
  // A new road or cash amount re-ranks at once; the button is there for anyone who looks for one.
  el.querySelector('#r-form').addEventListener('change', () => go())
  go()
}
