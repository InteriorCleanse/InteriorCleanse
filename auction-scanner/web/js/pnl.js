// The P/L estimator and the materials list, shared by Deals, Plan and Business.
// The server does the arithmetic (src/pnl.ts) so every screen agrees; this file
// only collects the numbers and shows each line with where it came from.
import { getJson, postJson, esc, money, debounce } from './api.js'
import { sheet, toast, loading, errorStrip } from './ui.js'

const BASIS = { yours: ['go', 'yours'], 'published fee': ['', 'published fee'], estimate: ['best', 'estimate'], 'working figure': ['wait', 'working figure'], spent: ['go', 'from your books'] }
const NEED = { always: ['go', 'Every car'], likely: ['wait', 'Likely'], check: ['', 'Check'] }
const VERDICT = { big: 'best', good: 'go', thin: 'wait', loss: 'hot', unknown: '' }

/** The materials list: grouped, each line with why and a price range. `done` ids show ticked when editable. */
export function materialsHtml(m, { done = [], editable = false } = {}) {
  const ticked = new Set(done)
  const groups = [...new Set(m.items.map((x) => x.group))]
  return `<div class="mats">
    <div class="mats-sum"><div><span class="mono dim">Expected</span><b class="num">${esc(money(m.expectedUsd))}</b><span class="mono dim">${esc(money(m.expectedLowUsd))}–${esc(money(m.expectedHighUsd))}</span></div>
      <div><span class="mono dim">If the checks are needed</span><b class="num">+${esc(money(m.checkLowUsd))}–${esc(money(m.checkHighUsd))}</b></div></div>
    ${groups.map((g) => `<div class="mats-g"><h4 class="mono">${esc(g)}</h4><ul>${m.items.filter((x) => x.group === g).map((x) => {
      const [tone, word] = NEED[x.need]
      const box = editable ? `<input type="checkbox" data-mat="${esc(x.id)}" ${ticked.has(x.id) ? 'checked' : ''} aria-label="${esc(x.name)} done" />` : ''
      return `<li class="${ticked.has(x.id) ? 'done' : ''}">${box}<div class="mats-main"><b>${esc(x.name)}</b> <span class="badge ${tone}">${word}</span><p class="dim">${esc(x.why)}</p></div><div class="mats-aside"><span class="mono mats-p">${esc(money(x.lowUsd))}–${esc(money(x.highUsd))}</span><a class="more" href="#parts/q/${encodeURIComponent(x.partQuery)}" data-part="${esc(x.partQuery)}">find parts</a></div></li>`
    }).join('')}</ul></div>`).join('')}
    <ul class="mats-notes dim">${m.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
  </div>`
}

const FIELDS = [
  ['buyUsd', 'Price you pay', 'The bid you expect to win at, or what you paid'],
  ['buyerFeeUsd', 'Buyer fee ($)', 'Blank uses the auction\'s published fee'],
  ['transportUsd', 'Transport ($)', 'Blank assumes 300 miles; type your quote'],
  ['taxTitlePct', 'Tax and title (%)', 'Your state\'s rate'],
  ['materialsUsd', 'Materials ($)', 'From the materials list; type your receipts'],
  ['partsUsd', 'Parts ($)', 'Anything the materials list does not cover'],
  ['labourUsd', 'Labour ($)', 'A shop, or what your time is worth'],
  ['holdingUsd', 'Holding ($)', 'Insurance, storage, registration while you hold it'],
  ['sellingUsd', 'Selling costs ($)', 'Listing fees, ads, a marketplace cut'],
]

/**
 * Open the estimator for a listing (`{ listingId }`) or a car in the books (`{ carId }`).
 * The numbers start from what Gavel knows; every field can be overwritten.
 */
export async function openPnl(ref) {
  const close = sheet(`<div class="pnl" id="pnl-root">${loading('Working out the numbers…')}</div>`, { label: 'Profit and loss' })
  const root = document.getElementById('pnl-root')
  let pre
  try { pre = await getJson('/api/pnl/prefill?' + new URLSearchParams(ref)) } catch (e) { root.innerHTML = errorStrip(e.message); return }
  const books = pre.kind === 'BOOKS'
  const start = { ...pre.input }
  const val = (k) => (start[k] === undefined || start[k] === null ? '' : String(Math.round(start[k] * 100) / 100))
  const fields = books ? FIELDS.filter(([k]) => !['buyUsd', 'buyerFeeUsd', 'transportUsd', 'taxTitlePct'].includes(k)) : FIELDS
  root.innerHTML = `<h2>Profit and loss</h2><p class="mono dim pnl-car">${esc(pre.title)}${pre.kind === 'SAMPLE' ? ' · SAMPLE' : ''}</p>
    <div class="pnl-hero" id="pnl-hero" aria-live="polite"></div>
    <label class="f pnl-sale">Sell for ($)<input type="number" inputmode="numeric" min="0" step="50" name="saleUsd" value="${val('saleUsd')}" placeholder="What it will sell for" />
      <span class="dim">${pre.estimate ? `Similar cars: ${esc(money(pre.estimate.valueUsd))} (${pre.estimate.comps} cars, ${esc(money(pre.estimate.low))}–${esc(money(pre.estimate.high))}). An estimate, not a price.` : books ? 'Your target. Price it against similar cars, not against what you paid.' : 'Not enough similar cars to estimate it. Look up recent sold prices for this exact car.'}</span></label>
    ${books ? `<p class="dim pnl-books">Spent so far: <b>${esc(money(pre.totals.spentUsd))}</b> · income so far ${esc(money(pre.totals.incomeUsd))}. Add only what is still to come below.</p>` : ''}
    <form class="pnl-form grid2" id="pnl-form" autocomplete="off">${fields.map(([k, label, hint]) => `<label class="f">${esc(label)}<input type="number" inputmode="decimal" min="0" step="any" name="${k}" value="${val(k)}" /><span class="dim">${esc(hint)}</span></label>`).join('')}
      <label class="check"><input type="checkbox" name="cushion" ${books ? '' : 'checked'} /> Keep a $750 cushion for surprises</label></form>
    <div id="pnl-out"></div>
    <div class="row pnl-actions">${books ? '<button class="btn" type="button" id="pnl-save">Save the sale price as my target</button>' : ''}<button class="btn outline" type="button" data-close>Close</button></div>`
  const form = root.querySelector('#pnl-form')
  const saleBox = root.querySelector('[name=saleUsd]')
  let touchedMaterials = false
  form.materialsUsd && form.materialsUsd.addEventListener('input', () => { touchedMaterials = true })

  const body = () => {
    const b = { ...start }
    for (const [k] of fields) { const v = form[k].value.trim(); if (v === '') delete b[k]; else b[k] = Number(v) }
    const s = saleBox.value.trim(); if (s === '') delete b.saleUsd; else b.saleUsd = Number(s)
    b.cushion = form.cushion.checked
    b.materialsFromRanges = !!start.materialsFromRanges && !touchedMaterials
    return b
  }
  const draw = (p) => {
    const tone = VERDICT[p.verdict]
    root.querySelector('#pnl-hero').innerHTML = p.profitUsd === undefined
      ? `<div class="pnl-big"><span class="mono dim">Break even at</span><b class="num">${esc(money(p.breakEvenUsd))}</b></div><p>${esc(p.verdictText)}</p>`
      : `<div class="pnl-big ${tone}"><span class="mono dim">Estimated ${p.profitUsd >= 0 ? 'profit' : 'loss'}</span><b class="num">${esc(money(p.profitUsd))}</b><span class="mono">${p.roiPct !== undefined ? Math.round(p.roiPct * 100) + '% on the money in' : ''}</span></div><p>${esc(p.verdictText)}</p>`
    root.querySelector('#pnl-out').innerHTML = `<table class="pnl-lines"><tbody>${p.lines.map((l) => {
      const [t, w] = BASIS[l.basis] || ['', l.basis]
      return `<tr><td>${esc(l.label)}${l.note ? `<span class="dim">${esc(l.note)}</span>` : ''}</td><td><span class="badge ${t}">${esc(w)}</span></td><td class="num">${esc(money(l.usd))}</td></tr>`
    }).join('')}<tr class="tot"><td>All in</td><td></td><td class="num">${esc(money(p.costUsd))}</td></tr>${p.saleUsd !== undefined ? `<tr><td>Sale</td><td><span class="badge best">${start.saleUsd !== undefined && Number(saleBox.value) === start.saleUsd && !books ? 'estimate' : 'yours'}</span></td><td class="num">${esc(money(p.saleUsd))}</td></tr><tr class="tot ${p.profitUsd >= 0 ? 'in' : 'out'}"><td>${p.profitUsd >= 0 ? 'Profit' : 'Loss'}</td><td></td><td class="num">${esc(money(p.profitUsd))}</td></tr>` : ''}</tbody></table>
      <div class="pnl-marks"><div><span class="mono dim">Break even</span><b class="num">${esc(money(p.breakEvenUsd))}</b></div><div><span class="mono dim">Big margin at</span><b class="num">${esc(money(p.bigProfitSaleUsd))}</b></div></div>
      ${p.scenarios.length ? `<div class="pnl-scen">${p.scenarios.map((s) => `<div class="${s.profitUsd >= 0 ? '' : 'neg'}"><span class="dim">${esc(s.label)}</span><b class="num">${esc(money(s.profitUsd))}</b><span class="mono dim">sells for ${esc(money(s.saleUsd))}</span></div>`).join('')}</div>` : ''}
      ${p.missing.length ? `<div class="strip wait"><b>Not counted yet:</b> ${p.missing.map(esc).join(' ')}</div>` : ''}`
  }
  const run = async () => {
    try { draw(await postJson('/api/pnl', body())) } catch (e) { root.querySelector('#pnl-out').innerHTML = errorStrip(e.message) }
  }
  const later = debounce(run, 250)
  root.addEventListener('input', later)
  root.addEventListener('change', later)
  const save = root.querySelector('#pnl-save')
  if (save) save.addEventListener('click', async () => {
    const v = saleBox.value.trim()
    try { await postJson('/api/garage/' + encodeURIComponent(ref.carId), { targetSaleUsd: v === '' ? null : Number(v) }); toast('Target sale price saved.'); close() } catch (e) { toast(e.message, 'hot') }
  })
  run()
  return close
}

/** A materials sheet for a listing. */
export async function openMaterials(listingId) {
  const close = sheet(`<div id="mat-root">${loading('Listing what this car will need…')}</div>`, { label: 'Materials' })
  const root = document.getElementById('mat-root')
  try {
    const m = await getJson('/api/materials?listingId=' + encodeURIComponent(listingId))
    root.innerHTML = `<h2>What this car will need</h2><p class="mono dim">${esc(m.title)}</p>${materialsHtml(m)}<div class="row" style="margin-top:14px"><button class="btn outline" type="button" data-close>Close</button></div>`
    root.querySelectorAll('[data-part]').forEach((a) => a.addEventListener('click', () => close()))
  } catch (e) { root.innerHTML = errorStrip(e.message) }
  return close
}
