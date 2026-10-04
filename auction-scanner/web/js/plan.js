// The Plan screen: the stub, the ledger, "never bid above", the walkthrough, the PAPER bid.
import { getJson, postJson, esc, money, debounce, safeUrl, reducedMotion } from './api.js'
import { stub, badges, stamp, toast, loading, errorStrip, sourceName, carName } from './ui.js'
import { HOUSES } from './houses.js'
import { openPnl, openMaterials } from './pnl.js'

let current = null

/** One plain line for what the number is still missing, instead of a warning per field. */
function missingLine(feeUnknown, plan, sample) {
  // A practice car has no auction, so no fee to look up.
  if (sample) feeUnknown = false
  const missing = [feeUnknown ? 'the buyer fee' : '', plan.taxTitleUsd === undefined ? 'tax and title' : ''].filter(Boolean)
  if (!missing.length) return ''
  const tooHigh = feeUnknown || plan.cashUsd !== undefined
  return `<div class="warn-line">Still to type above: ${missing.join(' and ')}.${tooHigh ? ' Until then this number is too high.' : ''}</div>`
}

function ledgerHtml(plan, inputs, listing) {
  const feeUnknown = plan.feeUnknown && !inputs.feePct
  const flip = plan.goal === 'flip'
  // Every field shows the number the plan is using, typed or assumed; only what you change is sent back.
  const shown = (k, v) => esc(inputs[k] ?? v ?? '')
  const feeHelp = listing.kind === 'SAMPLE'
    ? `<span class="nocomps">SAMPLE car: there is no real auction house behind it. Type a fee percent to practise (eBay charges none; Cars &amp; Bids charges 5%).</span>`
    : feeUnknown ? `<span class="nocomps">This house uses a sliding scale. Look up the fee on its calculator and type the percent here.</span>` : inputs.feePct !== undefined ? `Remembered for every ${esc(sourceName(listing.source))} plan.` : `What the auction charges the winner on top of the hammer price. Leave blank to use the published rate.`
  const row = (k, v, input, help) => `<div class="line"><span>${k}</span>${input ? input : `<span class="v">${esc(v)}</span>`}${help ? `<span class="h">${help}</span>` : ''}</div>`
  return `<div class="ledger">
    ${row(flip ? 'Resale target' : 'Market value', money(plan.resaleUsd), `<input type="number" id="p-resale" min="0" step="any" value="${shown('resaleUsd', plan.resaleUsd)}" aria-label="${flip ? 'Resale target' : 'Market value'} in dollars" />`, flip ? 'What you believe it sells for after fixes. Starts from the comps estimate.' : 'What cars like it sell for. Starts from the comps estimate.')}
    ${row('− Buyer fee', money(plan.buyerFeeUsd), `<input type="number" id="p-fee" min="0" max="30" step="any" placeholder="%" value="${esc(inputs.feePct ?? '')}" aria-label="Buyer fee percent" />`, feeHelp)}
    ${row(plan.cashUsd !== undefined ? '− Tax and title' : 'Tax and title', plan.taxTitleUsd !== undefined ? money(plan.taxTitleUsd) : 'not set', `<input type="number" id="p-tax" min="0" max="20" step="any" placeholder="%" value="${shown('taxTitlePct', plan.taxTitlePct)}" aria-label="Tax and title percent" />`, `${plan.taxTitleUsd !== undefined ? `<b>${esc(money(plan.taxTitleUsd))}.</b> ` : ''}Sales tax on a car plus the title fee in your state and county, as a percent. ${plan.cashUsd !== undefined ? 'Paid from your cash, so it counts inside it.' : 'Paid at the DMV; it does not change what the car is worth.'} ${plan.taxTitleUsd !== undefined ? 'Remembered for every plan.' : 'Look it up once; Gavel remembers it.'}`)}
    ${row('− Transport', money(plan.transportUsd), `<input type="number" id="p-dist" min="0" step="any" value="${shown('distanceMiles', plan.distanceMiles)}" placeholder="miles" aria-label="Distance in miles" />`, `<b>${esc(money(plan.transportUsd))}.</b> ${plan.distanceAssumed && inputs.distanceMiles === undefined ? 'Assumed ' + esc(plan.distanceMiles) + ' miles: type the real distance. ' : 'Miles from the car to you. '}A typical open-carrier rate; get a real quote before you bid.`)}
    ${row('− Repairs', money(plan.repairsUsd), `<input type="number" id="p-rep" min="0" step="any" value="${esc(inputs.repairsUsd ?? '')}" placeholder="$" aria-label="Repairs in dollars" />`, 'Tyres, brakes, detail, whatever the photos and the inspection say.')}
    ${row('− Cushion for surprises', money(plan.reserveUsd))}
    ${row(flip ? '− Your margin' : '− Under market by', money(plan.marginUsd), `<input type="number" id="p-margin" min="0" max="90" step="any" value="${shown('marginPct', Math.round(plan.marginFraction * 100))}" placeholder="%" aria-label="${flip ? 'Margin' : 'Discount to market'} percent" />`, `<b>${esc(money(plan.marginUsd))}.</b> ${flip ? 'Percent of the resale price you want left over.' : 'Percent under market value you insist on, so you never pay retail.'}`)}
  </div>
  <div class="never"><span class="k mono">Never bid above</span><div class="n">${esc(money(plan.maxBidUsd))}</div>
    ${missingLine(feeUnknown, plan, listing.kind === 'SAMPLE')}
    <div class="mono ${typeof plan.cashUsd === 'number' && plan.cashNeededUsd > plan.cashUsd ? 'nocomps' : 'dim'}">Cash you need on the day: about ${esc(money(plan.cashNeededUsd))}${typeof plan.cashUsd === 'number' ? ` of your ${esc(money(plan.cashUsd))}` : ''}${plan.taxTitleUsd === undefined ? ', plus tax and title' : ', tax and title included'}.</div>
    ${plan.limitedBy === 'cash' ? '<div class="mono dim">Lowered to fit your cash.</div>' : ''}
    ${typeof plan.headroomUsd === 'number' ? `<div class="mono ${plan.headroomUsd < 0 ? 'nocomps' : 'dim'}">${plan.headroomUsd < 0 ? `The price is already ${esc(money(-plan.headroomUsd))} over your number. Not your car.` : `${esc(money(plan.headroomUsd))} of room above the price now.`}</div>` : ''}
  </div>
  <details style="margin-top:10px"><summary>Every line, in words</summary><ul class="why">${plan.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>`
}

/** Why the car scores what it does: the main reason open, the full list one tap away. */
function whyHtml(card) {
  const reasons = card.score.reasons || []
  const flags = (card.score.redFlags || []).filter((f) => !/^SAMPLE/.test(f))
  if (!reasons.length && !flags.length) return ''
  return `<details class="panel why-panel" style="margin-top:16px"><summary><h2>Why it scores ${esc(card.score.total)}</h2>${reasons[0] ? `<span>${esc(reasons[0])}</span>` : ''}<span class="mono dim">${flags.length ? `${flags.length} red flag${flags.length === 1 ? '' : 's'} · ` : ''}every reason</span></summary>
    ${card.demand ? `<p class="mono dim" style="margin-top:10px">Kind: ${esc(card.demand.tags.map(tierName).join(' · '))}</p>` : ''}
    ${reasons.length > 1 ? `<ul class="why">${reasons.slice(1).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${flags.length ? `<div class="flags"><span class="k mono">Red flags</span><ul>${flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}</details>`
}

function tierName(t) {
  return t === 'holds-value' ? 'Holds value' : t[0].toUpperCase() + t.slice(1)
}

/** A supercar's checks before bidding. Shown above the bid button, because they decide whether to bid at all. */
function supercarHtml(plan) {
  if (!plan.supercar) return ''
  return `<div class="panel sc" style="margin-top:16px"><h2>Before you bid on a supercar</h2>
    <p>The number above already keeps a bigger cushion (${esc(money(plan.reserveUsd))}). These decide whether to bid at all. <a href="#playbook/supercar">Read the supercar guide</a>.</p>
    <ol class="fire-steps">${plan.supercar.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div>`
}

/** The first sentence, and the rest. A step shows its first sentence; the rest waits behind Read more. */
function splitFirst(text) {
  const m = /^(.{20,}?[.!?])\s+(\S[\s\S]*)$/.exec(String(text || ''))
  return m && m[2].length > 40 ? [m[1], m[2]] : [String(text || ''), '']
}

/**
 * No estimate yet: the member can price the car in a couple of minutes by adding
 * three sold prices for the same model. Gavel opens the searches; it never reads them.
 */
function priceItHtml(l, est) {
  if (l.kind === 'SAMPLE' || est.ok) return ''
  if (!l.year || !l.make || !l.model) return `<div class="panel" id="p-price"><h2>Price this car yourself</h2><p>The listing does not say its year, make and model, so Gavel cannot match sold prices to it. Import it with those filled in, then add sold prices here.</p></div>`
  const car = `${l.year} ${l.make} ${String(l.model).split(' ').slice(0, 2).join(' ')}`
  const ebay = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(car)}&_sacat=6001&LH_Sold=1&LH_Complete=1`
  const web = `https://www.google.com/search?q=${encodeURIComponent(car + ' sold price')}`
  const have = est.comps || 0
  return `<div class="panel" id="p-price"><h2>Price this car yourself</h2>
    <p style="margin-top:0"><b>Gavel needs 3 sold prices for a ${esc(car)} to say what it is worth. It has ${have}.</b> Two minutes: open a search, add what similar cars sold for.</p>
    <div class="row"><a class="btn outline sm" href="${esc(ebay)}" target="_blank" rel="noopener noreferrer">eBay sold listings ↗</a><a class="btn outline sm" href="${esc(web)}" target="_blank" rel="noopener noreferrer">Search the web ↗</a></div>
    <ol class="fire-steps"><li>Pick sold cars of the same make and model, ${l.year - 1} to ${l.year + 1}.</li><li>Type what each sold for and when; the miles too if shown.</li><li>After the third, the estimate and the bid plan appear on this page.</li></ol>
    <form id="p-sold" class="grid2" style="margin-top:8px">
      <label class="f">Sold for ($) <input name="soldUsd" type="number" min="1" step="any" required /></label>
      <label class="f">Sold on <input name="soldAt" type="date" required /></label>
      <label class="f">Year <input name="year" type="number" min="${l.year - 1}" max="${l.year + 1}" value="${l.year}" required /></label>
      <label class="f">Miles (if shown) <input name="mileage" type="number" min="0" step="any" /></label>
      <label class="f">Where <select name="source">${[['ebay', 'eBay Motors'], ['bat', 'Bring a Trailer'], ['carsandbids', 'Cars & Bids'], ...HOUSES.filter(([h]) => !['ebay', 'bat', 'carsandbids', 'marketcheck'].includes(h)), ['other', 'Somewhere else']].map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>
      <div class="row" style="grid-column:1/-1"><button class="btn" type="submit">Add this sold price</button></div>
    </form></div>`
}

function walkthroughHtml(w, sample = false) {
  // The SAMPLE strip at the top of the plan already says it; the warnings keep what is new.
  const warnings = (w.warnings || []).filter((x) => !(sample && /SAMPLE/.test(x)))
  return `<div class="mono dim">Explained by: ${esc(w.source === 'ai' ? 'AI · checked against the rules' : 'the rules')}</div>
    <h2 style="margin:6px 0 8px">${esc(w.title)}</h2>
    <ol class="steps">${w.steps.map((s) => { const [first, rest] = splitFirst(s.body); return `<li><div><b>${esc(s.title)}</b><p>${esc(first)}</p>${rest ? `<details class="more"><summary>Read more</summary><p>${esc(rest)}</p></details>` : ''}</div></li>` }).join('')}</ol>
    ${warnings.length ? `<div class="warnings"><span class="k mono">Warnings</span><ul>${warnings.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${w.note ? `<p class="dim" style="margin-top:8px;font-size:14px">${esc(w.note)}</p>` : ''}`
}

export async function render(el, ctx, [id]) {
  if (!id) { el.innerHTML = `<div class="head"><h1>Plan</h1></div><div class="tag empty"><p>Open a car from the Feed or your Watchlist and press <b>Plan my bid</b>.</p><a class="btn" href="#feed">Go to the feed</a></div>`; return }
  el.innerHTML = `<div class="head"><div><a href="#feed" class="mono">← Back to the feed</a><h1 style="margin-top:6px">Plan my bid</h1></div></div>${loading('Working out the number…')}`
  let card
  try { card = await getJson('/api/listing/' + encodeURIComponent(id)) } catch (e) { el.innerHTML += errorStrip(e.message); return }
  current = card
  const l = card.listing
  const sample = l.kind === 'SAMPLE'
  const inputs = {}
  const openUrl = sample ? null : safeUrl(l.url)
  el.innerHTML = `<div class="head"><div><a href="#feed" class="mono">← Back to the feed</a><h1 style="margin-top:6px">${carName(l.title)}</h1><p class="mono">${esc(sourceName(l.source))}${l.vin ? ' · VIN ' + esc(l.vin) : ' · no VIN in the listing'}</p></div>
      <div class="row"><button class="btn outline sm" type="button" id="p-pnl">P/L</button><button class="btn outline sm" type="button" id="p-mats">Materials</button><button class="btn outline sm" type="button" id="p-print">Print</button>${openUrl ? `<a class="btn outline sm" href="${esc(openUrl)}" target="_blank" rel="noopener noreferrer">Open the lot ↗</a>` : ''}</div></div>
    ${sample ? '<div class="strip"><b>SAMPLE car.</b> Nothing here can be bought. Use it to practise the plan.</div>' : ''}
    ${(l.photos || []).map(safeUrl).filter(Boolean).length ? `<div class="gallery" role="list" aria-label="Photos from the listing">${(l.photos || []).map(safeUrl).filter(Boolean).slice(0, 16).map((u, i) => `<a role="listitem" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="Photo ${i + 1} of the car" loading="lazy" /></a>`).join('')}</div><p class="dim" style="font-size:14px;margin:6px 0 16px">Zoom every photo. Mismatched paint, uneven gaps and new parts on an old car usually mean a repaired crash.</p>` : ''}
    <div class="plan">
      <div>
        <div class="tag" style="display:grid;grid-template-columns:1fr 132px"><div class="body" style="padding-left:14px"><div class="mono dim">The car</div><div class="money"><div><span class="k mono">${typeof l.currentBidUsd === 'number' ? 'Current bid' : 'Buy now'}</span><div class="now">${esc(money(typeof l.currentBidUsd === 'number' ? l.currentBidUsd : l.buyNowUsd))}</div></div>
          <div><span class="k mono">${card.estimate.ok ? 'Similar cars sell for' : 'Similar cars'}</span><div class="comps ${card.estimate.ok ? '' : 'nocomps'}">${card.estimate.ok ? esc(money(card.estimate.valueUsd)) : 'Not enough comps'}</div><div class="receipt mono">${card.estimate.ok ? esc(card.estimate.method) : esc(card.estimate.reason)}</div></div></div>${badges(l)}</div>${stub(card.score, { big: true })}</div>
        ${priceItHtml(l, card.estimate)}
        ${whyHtml(card)}
        <div class="panel receipt-paper" style="margin-top:16px"><div class="r-head"><h2>The number</h2><span class="mono">Itemised · every dollar</span></div><div id="p-ledger">${ledgerHtml(card.plan, inputs, l)}</div></div>
        ${supercarHtml(card.plan)}
        <div class="panel"><h2>Bid</h2>
          <p class="before-bid"><b>Before you bid:</b> do the first four checks in <button class="lnk" type="button" id="p-to-walk">How to buy this car</button>.</p>
          <p>Paper means nothing was sent to the auction. Practise here, then place the real bid on the auction's own site, and never go above your number.</p>
          <div class="row"><label class="f" style="flex:1;min-width:160px">Your max bid <input type="number" id="p-max" min="1" step="any" value="${card.plan.maxBidUsd || ''}" /></label>
            <label class="f" style="flex:2;min-width:200px">Note (optional) <input type="text" id="p-note" maxlength="500" placeholder="Why this number" /></label></div>
          <div class="row" style="margin-top:10px"><button class="btn hot" type="button" id="p-bid">Place a PAPER bid</button></div>
          <div id="p-receipt"></div>
        </div>
      </div>
      <div class="panel" id="p-walk">${walkthroughHtml(card.walkthrough, sample)}
        ${ctx.me.ai && ctx.me.ai.available
          ? '<div class="row" style="margin-top:12px"><button class="btn outline sm" type="button" id="p-ai">Explain it again with AI</button></div>'
          : ctx.me.role === 'owner' && ctx.me.ai ? `<p class="dim" style="font-size:14px;margin-top:12px">${esc(ctx.me.ai.reason)}</p>` : ''}
      </div>
    </div>`

  const FIELDS = { '#p-resale': 'resaleUsd', '#p-fee': 'feePct', '#p-tax': 'taxTitlePct', '#p-dist': 'distanceMiles', '#p-rep': 'repairsUsd', '#p-margin': 'marginPct' }
  const edited = new Set()
  const replan = debounce(async () => {
    for (const [sel, key] of Object.entries(FIELDS)) {
      if (!edited.has(key) || !el.querySelector(sel)) continue
      const v = el.querySelector(sel).value
      inputs[key] = v === '' ? undefined : Number(v)
    }
    try {
      // A fee or tax rate is a fact about the house or your state: remember it for every plan.
      const remember = (edited.has('feePct') && inputs.feePct !== undefined) || (edited.has('taxTitlePct') && inputs.taxTitlePct !== undefined)
      const plan = await postJson('/api/plan', { listingId: l.id, ...inputs, remember })
      current.plan = plan
      const active = document.activeElement && document.activeElement.id
      el.querySelector('#p-ledger').innerHTML = ledgerHtml(plan, inputs, l)
      wireLedger()
      if (active) { const again = el.querySelector('#' + active); if (again) { again.focus(); try { again.setSelectionRange(again.value.length, again.value.length) } catch { /* number inputs */ } } }
      el.querySelector('#p-max').value = plan.maxBidUsd || ''
    } catch (e) { toast(e.message, 'hot') }
  }, 400)
  const wireLedger = () => el.querySelectorAll('#p-ledger input').forEach((i) => i.addEventListener('input', () => { const key = FIELDS['#' + i.id]; if (key) edited.add(key); replan() }))
  wireLedger()

  el.querySelector('#p-print').addEventListener('click', () => window.print())
  el.querySelector('#p-pnl').addEventListener('click', () => openPnl({ listingId: l.id }))
  el.querySelector('#p-mats').addEventListener('click', () => openMaterials(l.id))
  const soldForm = el.querySelector('#p-sold')
  if (soldForm) soldForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = new FormData(soldForm)
    const miles = String(f.get('mileage') || '')
    try {
      await postJson('/api/import', {
        title: `${f.get('year')} ${l.make} ${l.model}`, year: Number(f.get('year')), make: l.make, model: l.model,
        soldUsd: Number(f.get('soldUsd')), soldAt: Date.parse(String(f.get('soldAt')) + 'T12:00:00'),
        mileage: miles === '' ? undefined : Number(miles), source: String(f.get('source') || 'other'),
      })
      toast('Sold price added.')
      await render(el, ctx, [id]) // re-price with it, and stay where the member was working
      const back = el.querySelector('#p-price') || el.querySelector('.never')
      if (back) back.scrollIntoView({ block: 'center' })
    } catch (err) { toast(err.message, 'hot') }
  })
  el.querySelector('#p-to-walk').addEventListener('click', () => el.querySelector('#p-walk').scrollIntoView({ behavior: 'smooth', block: 'start' }))
  const aiBtn = el.querySelector('#p-ai')
  if (aiBtn) aiBtn.addEventListener('click', async (e) => {
    e.target.disabled = true
    const walk = el.querySelector('#p-walk')
    try {
      const w = await postJson('/api/explain', { listingId: l.id })
      walk.innerHTML = walkthroughHtml(w, sample)
    } catch (err) { toast(err.message, 'hot') } finally { e.target.disabled = false }
  })
  el.querySelector('#p-bid').addEventListener('click', async () => {
    const btn = el.querySelector('#p-bid')
    const max = Number(el.querySelector('#p-max').value)
    if (!Number.isFinite(max) || max <= 0) { toast('Type your max bid first.', 'hot'); return }
    if (current.plan && max > current.plan.maxBidUsd) {
      const ok = window.confirm(`That is above your "never bid above" number of ${money(current.plan.maxBidUsd)}. Record it anyway as a paper bid?`)
      if (!ok) return
    }
    btn.disabled = true
    try {
      const r = await postJson('/api/bid', { listingId: l.id, maxBidUsd: max, note: el.querySelector('#p-note').value })
      el.querySelector('#p-receipt').innerHTML = `<div class="receiptbox">${stamp(r.mode, 'hot', reducedMotion() ? 'big' : 'big press')}
        <div class="mono dim">Paper bid recorded</div><div><b>${esc(r.paperBid.title)}</b></div><div class="mono">Max ${esc(money(r.paperBid.maxBidUsd))}</div>
        <p style="margin:6px 0 0">${esc(r.message)}</p>
        <div class="row" style="margin-top:8px">${r.openUrl ? `<a class="btn" href="${esc(r.openUrl)}" target="_blank" rel="noopener noreferrer">Open the lot with this number ↗</a>` : ''}<a class="btn outline sm" href="#watch">See my paper bids</a></div></div>`
      toast('Paper bid recorded. Nothing was sent to the auction.')
    } catch (e) { toast(e.message, 'hot') } finally { btn.disabled = false }
  })
}
