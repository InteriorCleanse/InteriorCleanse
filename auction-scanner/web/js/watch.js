// Watchlist and PAPER bids.
import { getJson, postJson, del, esc, money, when } from './api.js'
import { stamp, toast, loading, errorStrip, sourceName } from './ui.js'

export async function render(el) {
  el.innerHTML = `<div class="head"><div><h1>Watch</h1><p>Cars you are watching, and the paper bids you have practised with. Paper means nothing was sent to any auction.</p></div></div>${loading('Loading…')}`
  let watch, paper
  try { [watch, paper] = await Promise.all([getJson('/api/watchlist'), getJson('/api/paper')]) } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const s = paper.summary
  el.innerHTML = `<div class="head"><div><h1>Watch</h1><p>Cars you are watching, and the paper bids you have practised with. Paper means nothing was sent to any auction.</p></div></div>
    <div class="panel"><h2>Watching (${watch.length})</h2>
      ${watch.length ? `<div class="list">${watch.map((w) => `<div class="item" data-id="${esc(w.listingId)}"><div class="main"><b>${esc(w.title)}</b> ${w.snapshot && w.snapshot.kind === 'SAMPLE' ? stamp('Sample', 'hot') : ''}<div class="mono dim">${esc(sourceName(w.snapshot ? w.snapshot.source : ''))} · ${esc(money(w.snapshot ? (w.snapshot.currentBidUsd ?? w.snapshot.buyNowUsd) : undefined))} when saved · ${esc(when(w.addedAt))}</div></div><div class="row"><a class="btn sm" href="#plan/${encodeURIComponent(w.listingId)}">Plan</a><button class="btn outline sm" type="button" data-unwatch>Remove</button></div></div>`).join('')}</div>` : '<p class="dim">Nothing yet. Press <b>Watch</b> on a card in the Feed.</p>'}
    </div>
    <div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Paper bids</h2>${stamp('Paper', 'hot')}</div>
      <div class="tiles" style="margin-top:12px"><div class="tile"><div class="k mono">Open</div><div class="v">${s.open}</div></div><div class="tile"><div class="k mono">Won</div><div class="v">${s.won}</div></div><div class="tile"><div class="k mono">Lost</div><div class="v">${s.lost}</div></div><div class="tile"><div class="k mono">Total max</div><div class="v" style="font-size:22px">${esc(money(s.totalMaxUsd))}</div></div></div>
      ${paper.bids.length ? `<div class="list">${paper.bids.slice().reverse().map((b) => `<div class="item"><div class="main"><b>${esc(b.title)}</b><div class="mono">Max ${esc(money(b.maxBidUsd))} · ${esc(b.mode)} · ${esc(when(b.placedAt))}</div>${b.note ? `<div class="dim" style="font-size:14px">${esc(b.note)}</div>` : ''}</div><label class="f" style="min-width:200px">How it ended <select data-outcome="${esc(b.id)}"><option value="open" ${b.outcome === 'open' ? 'selected' : ''}>Still open</option><option value="won" ${b.outcome === 'won' ? 'selected' : ''}>Won (at or under my max)</option><option value="lost" ${b.outcome === 'lost' ? 'selected' : ''}>Lost (went above my max)</option><option value="withdrawn" ${b.outcome === 'withdrawn' ? 'selected' : ''}>Withdrawn</option></select></label></div>`).join('')}</div>` : '<p class="dim">No paper bids yet. Open a car, press <b>Plan my bid</b>, then <b>Place a PAPER bid</b>.</p>'}
      <p class="dim" style="margin-top:10px;font-size:14px">Over ten cars this record shows whether your numbers run too low, too high, or just right.</p>
    </div>`
  el.querySelectorAll('[data-unwatch]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('.item').dataset.id
    try { await del('/api/watchlist/' + encodeURIComponent(id)); render(el) } catch (e) { toast(e.message, 'hot') }
  }))
  el.querySelectorAll('[data-outcome]').forEach((sel) => sel.addEventListener('change', async () => {
    const v = sel.value
    if (v === 'open') { toast('Choose won, lost or withdrawn.'); return }
    try { await postJson('/api/paper/' + encodeURIComponent(sel.dataset.outcome) + '/outcome', { outcome: v }); render(el) } catch (e) { toast(e.message, 'hot') }
  }))
}
