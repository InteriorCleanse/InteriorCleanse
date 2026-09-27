// The Plan screen: the stub, the ledger, "never bid above", the walkthrough, the PAPER bid.
import { getJson, postJson, esc, money, debounce, safeUrl, reducedMotion } from './api.js'
import { stub, badges, stamp, toast, loading, errorStrip, sourceName } from './ui.js'

let current = null

function ledgerHtml(plan, inputs, listing) {
  const feeUnknown = /unknown|sliding/i.test(plan.lines.join(' ')) && !inputs.feePct
  const feeHelp = listing.kind === 'SAMPLE'
    ? `<span class="nocomps">SAMPLE car: there is no real auction house behind it. Type a fee percent to practise (eBay charges none; Cars &amp; Bids charges 5%).</span>`
    : feeUnknown ? `<span class="nocomps">This house uses a sliding scale. Look up the fee on its calculator and type the percent here.</span>` : `What the auction charges the winner on top of the hammer price. Leave blank to use the published rate.`
  const row = (k, v, input, help) => `<div class="line"><span>${k}</span>${input ? input : `<span class="v">${esc(v)}</span>`}${help ? `<span class="h">${help}</span>` : ''}</div>`
  return `<div class="ledger">
    ${row('Resale target', money(plan.resaleUsd), `<input type="number" id="p-resale" min="0" step="any" value="${esc(inputs.resaleUsd ?? plan.resaleUsd)}" aria-label="Resale target in dollars" />`, 'What you believe it sells for after fixes. Starts from the comps estimate.')}
    ${row('− Buyer fee', money(plan.buyerFeeUsd), `<input type="number" id="p-fee" min="0" max="30" step="any" placeholder="%" value="${esc(inputs.feePct ?? '')}" aria-label="Buyer fee percent" />`, feeHelp)}
    ${row('− Transport', money(plan.transportUsd), `<input type="number" id="p-dist" min="0" step="any" value="${esc(inputs.distanceMiles ?? '')}" placeholder="miles" aria-label="Distance in miles" />`, 'Miles from the car to you, at a typical open-carrier rate. Get a real quote before you bid.')}
    ${row('− Repairs', money(plan.repairsUsd), `<input type="number" id="p-rep" min="0" step="any" value="${esc(inputs.repairsUsd ?? '')}" placeholder="$" aria-label="Repairs in dollars" />`, 'Tyres, brakes, detail, whatever the photos and the inspection say.')}
    ${row('− Cushion for surprises', money(plan.reserveUsd))}
    ${row('− Your margin', money(plan.marginUsd), `<input type="number" id="p-margin" min="0" max="90" step="any" value="${esc(inputs.marginPct ?? '')}" placeholder="%" aria-label="Margin percent" />`, 'What you want left over, as a share of the resale price.')}
  </div>
  <div class="never"><span class="k mono">Never bid above</span><div class="n">${esc(money(plan.maxBidUsd))}</div>
    ${typeof plan.headroomUsd === 'number' ? `<div class="mono ${plan.headroomUsd < 0 ? 'nocomps' : 'dim'}">${plan.headroomUsd < 0 ? `The price is already ${esc(money(-plan.headroomUsd))} over your number. Not your car.` : `${esc(money(plan.headroomUsd))} of room above the price now.`}</div>` : ''}
  </div>
  <details style="margin-top:10px"><summary>Every line, in words</summary><ul class="why">${plan.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>`
}

function walkthroughHtml(w) {
  return `<div class="mono dim">Explained by: ${esc(w.source === 'ai' ? 'AI · checked against the rules' : 'the rules')}</div>
    <h2 style="margin:6px 0 8px">${esc(w.title)}</h2>
    <ol class="steps">${w.steps.map((s) => `<li><div><b>${esc(s.title)}</b><p>${esc(s.body)}</p></div></li>`).join('')}</ol>
    ${w.warnings && w.warnings.length ? `<div class="warnings"><span class="k mono">Warnings</span><ul>${w.warnings.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
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
  el.innerHTML = `<div class="head"><div><a href="#feed" class="mono">← Back to the feed</a><h1 style="margin-top:6px">${esc(l.title)}</h1><p class="mono">${esc(sourceName(l.source))}${l.vin ? ' · VIN ' + esc(l.vin) : ' · no VIN in the listing'}</p></div>
      <div class="row"><button class="btn outline sm" type="button" id="p-print">Print</button>${openUrl ? `<a class="btn outline sm" href="${esc(openUrl)}" target="_blank" rel="noopener noreferrer">Open the lot ↗</a>` : ''}</div></div>
    ${sample ? '<div class="strip"><b>SAMPLE car.</b> Nothing here can be bought. Use it to practise the plan.</div>' : ''}
    <div class="plan">
      <div>
        <div class="tag" style="display:grid;grid-template-columns:1fr 132px"><div class="body" style="padding-left:14px"><div class="mono dim">The car</div><div class="money"><div><span class="k mono">${typeof l.currentBidUsd === 'number' ? 'Current bid' : 'Buy now'}</span><div class="now">${esc(money(typeof l.currentBidUsd === 'number' ? l.currentBidUsd : l.buyNowUsd))}</div></div>
          <div><span class="k mono">Comps</span><div class="comps ${card.estimate.ok ? '' : 'nocomps'}">${card.estimate.ok ? esc(money(card.estimate.valueUsd)) : 'Not enough comps'}</div><div class="receipt mono">${card.estimate.ok ? esc(card.estimate.method) : esc(card.estimate.reason)}</div></div></div>${badges(l)}</div>${stub(card.score, { big: true })}</div>
        <div class="panel" style="margin-top:16px"><h2>The number</h2><div id="p-ledger">${ledgerHtml(card.plan, inputs, l)}</div></div>
        <div class="panel"><h2>Bid</h2>
          <p>Paper means nothing was sent to the auction. Practise here, then place the real bid on the auction's own site, and never go above your number.</p>
          <div class="row"><label class="f" style="flex:1;min-width:160px">Your max bid <input type="number" id="p-max" min="1" step="any" value="${card.plan.maxBidUsd || ''}" /></label>
            <label class="f" style="flex:2;min-width:200px">Note (optional) <input type="text" id="p-note" maxlength="500" placeholder="Why this number" /></label></div>
          <div class="row" style="margin-top:10px"><button class="btn hot" type="button" id="p-bid">Place a PAPER bid</button></div>
          <div id="p-receipt"></div>
        </div>
      </div>
      <div class="panel" id="p-walk">${walkthroughHtml(card.walkthrough)}
        <div class="row" style="margin-top:12px"><button class="btn outline sm" type="button" id="p-ai">${ctx.me.ai && ctx.me.ai.available ? 'Explain it again with AI' : 'Explain it again'}</button><span class="dim" style="font-size:14px">${esc(ctx.me.ai && ctx.me.ai.available ? '' : ctx.me.ai ? ctx.me.ai.reason : '')}</span></div>
      </div>
    </div>`

  const replan = debounce(async () => {
    const g = (sel) => { const v = el.querySelector(sel).value; return v === '' ? undefined : Number(v) }
    inputs.resaleUsd = g('#p-resale'); inputs.feePct = g('#p-fee'); inputs.distanceMiles = g('#p-dist'); inputs.repairsUsd = g('#p-rep'); inputs.marginPct = g('#p-margin')
    try {
      const plan = await postJson('/api/plan', { listingId: l.id, ...inputs })
      current.plan = plan
      const active = document.activeElement && document.activeElement.id
      el.querySelector('#p-ledger').innerHTML = ledgerHtml(plan, inputs, l)
      wireLedger()
      if (active) { const again = el.querySelector('#' + active); if (again) { again.focus(); try { again.setSelectionRange(again.value.length, again.value.length) } catch { /* number inputs */ } } }
      el.querySelector('#p-max').value = plan.maxBidUsd || ''
    } catch (e) { toast(e.message, 'hot') }
  }, 400)
  const wireLedger = () => el.querySelectorAll('#p-ledger input').forEach((i) => i.addEventListener('input', replan))
  wireLedger()

  el.querySelector('#p-print').addEventListener('click', () => window.print())
  el.querySelector('#p-ai').addEventListener('click', async (e) => {
    e.target.disabled = true
    const walk = el.querySelector('#p-walk')
    try {
      const w = await postJson('/api/explain', { listingId: l.id })
      walk.innerHTML = walkthroughHtml(w)
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
