// Import: bring in a lot from any auction. The Send to Gavel button, a paste, typing it in, or a CSV.
// Gavel reads only what you hand it; nothing here visits another site.
import { getJson, postJson, del, esc, money, when } from './api.js'
import { toast, loading, errorStrip, sourceName } from './ui.js'

const SOURCES = [['copart', 'Copart'], ['iaa', 'IAA'], ['ebay', 'eBay Motors'], ['carsandbids', 'Cars & Bids'], ['bat', 'Bring a Trailer'], ['manheim', 'Manheim'], ['adesa', 'ADESA / OPENLANE'], ['acv', 'ACV'], ['govdeals', 'GovDeals'], ['gsa', 'GSA Auctions'], ['collector', 'Mecum / Barrett-Jackson'], ['local', 'Local auction'], ['other', 'Somewhere else']]
const LABEL = { title: 'Name', vin: 'VIN', mileage: 'Miles', titleStatus: 'Title', damage: 'Damage', runsAndDrives: 'Runs and drives', currentBidUsd: 'Current bid', endsAt: 'End time', soldUsd: 'Sold for', soldAt: 'Sold on' }

function bookmarklet() {
  const origin = location.origin
  const code = `(function(){var d={u:location.href,t:((document.body&&document.body.innerText)||'').slice(0,15000)};window.open('${origin}/#import/'+encodeURIComponent(JSON.stringify(d)),'_blank');})();`
  return 'javascript:' + code
}

function localDt(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localDate(ms) {
  return ms ? localDt(ms).slice(0, 10) : ''
}

function day(ms) {
  return ms ? new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

function sel(name, value, opts) {
  return `<select name="${name}">${opts.map(([v, t]) => `<option value="${v}" ${String(value ?? '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`
}

function formHtml(f = {}, found = [], missing = [], usedAi = false) {
  const tri = (v) => (v === true ? 'true' : v === false ? 'false' : '')
  const isSold = f.soldUsd !== undefined && f.soldUsd !== null && f.soldUsd !== ''
  return `<form id="i-form" class="panel">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Check the lot</h2>${usedAi ? '<span class="pill">Read with AI</span>' : ''}</div>
    ${isSold ? '<div class="strip go" style="margin-top:10px">This reads as a <b>finished sale</b>. Saved, its price sharpens the estimate for every car like it. It will not appear in your Feed. If the car is still for sale, clear <b>Sold for</b>.</div>' : ''}
    ${found.length || missing.length ? `<p style="margin:8px 0 4px">${found.length ? `Found: ${found.filter((k) => LABEL[k]).map((k) => `<span class="pill go">${LABEL[k]}</span>`).join(' ')}` : ''}</p>${missing.length ? `<p style="margin:0 0 8px">Not on the page: ${missing.map((k) => `<span class="pill wait">${LABEL[k] || k}</span>`).join(' ')} <span class="dim" style="font-size:14px">Fill in what you know. A blank stays blank.</span></p>` : ''}` : '<p class="dim" style="font-size:14px">Type what the listing says. A blank stays blank; Gavel never guesses.</p>'}
    <div class="grid2">
      <label class="f">Name <input name="title" required maxlength="140" value="${esc(f.title || '')}" placeholder="2019 Toyota Camry SE" /></label>
      <label class="f">Auction ${sel('source', f.source || 'other', SOURCES)}</label>
      <label class="f">Year <input name="year" type="number" min="1950" max="2050" value="${esc(f.year || '')}" /></label>
      <label class="f">Make <input name="make" maxlength="40" value="${esc(f.make || '')}" /></label>
      <label class="f">Model <input name="model" maxlength="60" value="${esc(f.model || '')}" /></label>
      <label class="f">VIN <input name="vin" maxlength="17" value="${esc(f.vin || '')}" style="font-family:var(--mono)" /></label>
      <label class="f">Miles <input name="mileage" type="number" min="0" step="any" value="${esc(f.mileage ?? '')}" /></label>
      <label class="f">Title ${sel('titleStatus', f.titleStatus || 'unknown', [['unknown', 'Not stated'], ['clean', 'Clean'], ['salvage', 'Salvage'], ['rebuilt', 'Rebuilt'], ['flood', 'Flood'], ['lemon', 'Lemon'], ['parts-only', 'Parts only']])}</label>
      <label class="f">Damage ${sel('damage', f.damage || 'unknown', [['unknown', 'Not stated'], ['none', 'None'], ['minor', 'Minor'], ['moderate', 'Moderate'], ['severe', 'Severe']])}</label>
      <label class="f">Runs and drives ${sel('runsAndDrives', tri(f.runsAndDrives), [['', 'Not stated'], ['true', 'Yes'], ['false', 'No']])}</label>
      <label class="f">Keys ${sel('hasKeys', tri(f.hasKeys), [['', 'Not stated'], ['true', 'Yes'], ['false', 'No']])}</label>
      <label class="f">Current bid ($) <input name="currentBidUsd" type="number" min="0" step="any" value="${esc(f.currentBidUsd ?? '')}" ${isSold ? 'disabled' : ''} /></label>
      <label class="f">Buy now ($) <input name="buyNowUsd" type="number" min="0" step="any" value="${esc(f.buyNowUsd ?? '')}" ${isSold ? 'disabled' : ''} /></label>
      <label class="f">Ends <input name="endsAt" type="datetime-local" value="${esc(localDt(f.endsAt))}" ${isSold ? 'disabled' : ''} /></label>
      <label class="f">Lot number <input name="lotNumber" maxlength="40" value="${esc(f.lotNumber || '')}" /></label>
      <label class="f">City <input name="city" maxlength="60" value="${esc(f.city || '')}" /></label>
      <label class="f">State <input name="state" maxlength="2" value="${esc(f.state || '')}" placeholder="TX" /></label>
      <label class="f">Lot link <input name="url" type="url" maxlength="500" value="${esc(f.url || '')}" /></label>
    </div>
    <h3 style="margin:18px 0 4px">Already sold?</h3>
    <p class="dim" style="margin:0 0 8px;font-size:14px">Only for a finished sale, such as a Bring a Trailer result or a lot you won. Gavel keeps it as a sold price: real money paid, the best comparable there is.</p>
    <div class="grid2">
      <label class="f">Sold for ($) <input name="soldUsd" type="number" min="0" step="any" value="${esc(f.soldUsd ?? '')}" /></label>
      <label class="f">Sold on <input name="soldAt" type="date" value="${esc(localDate(f.soldAt))}" /></label>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn" type="submit" id="i-save">${isSold ? 'Save the sold price' : 'Save and plan my bid'}</button><button class="btn outline" type="button" id="i-cancel">Start over</button></div>
  </form>`
}

export async function render(el, ctx, [payload]) {
  el.innerHTML = `<div class="head"><div><h1>Import</h1><p>Bring in a lot from any auction: Copart, IAA, Bring a Trailer, Cars & Bids, a dealer. Gavel scores it against live comparables and writes the bid plan.</p></div></div>
    <div class="grid2" style="align-items:start">
      <div class="panel"><h2>One click: the Send to Gavel button</h2>
        <p>Drag this button to your browser's bookmarks bar once:</p>
        <p><a class="btn hot" id="bm" href="#" title="Drag me to your bookmarks bar">Send to Gavel</a></p>
        <ol class="fire-steps"><li>Open any lot page (you must be signed in to the auction if it needs it).</li><li>Click <b>Send to Gavel</b> in your bookmarks bar.</li><li>Gavel opens here with the lot read. Check it, save it, plan your bid.</li></ol>
        <p class="dim" style="font-size:14px">It hands Gavel the text you can already see on that page, nothing more. On a phone, use the paste box instead.</p></div>
      <div class="panel"><h2>Paste a lot</h2>
        <form id="p-form"><label class="f">Lot link (optional) <input name="url" type="url" placeholder="https://www.copart.com/lot/…" /></label>
        <label class="f" style="margin-top:8px">The lot page text <textarea name="text" rows="6" placeholder="Select all on the lot page, copy, and paste here." required></textarea></label>
        <div class="row" style="margin-top:10px"><button class="btn" type="submit">Read it</button><button class="btn outline" type="button" id="p-manual">Type it in instead</button></div></form></div>
    </div>
    <div id="i-work"></div>
    <div class="panel"><h2>Many lots at once: a CSV</h2><p class="dim" style="font-size:14px">Export your search or watchlist as a CSV from your auction account, then upload it here. Gavel uses the columns it recognises (year, make, model, VIN, odometer, damage, title, bid, sale date, location) and tells you which.</p>
      <form id="c-form" class="row"><label class="f" style="min-width:200px">Auction ${sel('source', 'copart', SOURCES)}</label><label class="switch" style="align-self:end"><input type="checkbox" id="c-sold" /><span class="track"></span>These are sold results</label><label class="btn outline" style="cursor:pointer;align-self:end">Choose a CSV<input type="file" id="c-file" accept=".csv,text/csv" hidden /></label></form><div id="c-out"></div></div>
    <div class="panel" id="i-list">${loading('Loading your imports…')}</div>
    <div class="panel" id="s-list">${loading('Loading your sold prices…')}</div>`
  el.querySelector('#bm').setAttribute('href', bookmarklet())
  el.querySelector('#bm').addEventListener('click', (e) => { e.preventDefault(); toast('Drag the button to your bookmarks bar, then click it on any lot page.') })
  const work = el.querySelector('#i-work')

  const showForm = (f, found, missing, usedAi) => {
    work.innerHTML = formHtml(f, found, missing, usedAi)
    work.scrollIntoView({ behavior: 'smooth', block: 'start' })
    work.querySelector('#i-cancel').addEventListener('click', () => { work.innerHTML = '' })
    const form = work.querySelector('#i-form')
    // A sold price turns the form into a sold result: the for-sale fields step aside.
    form.soldUsd.addEventListener('input', () => {
      const sold = form.soldUsd.value.trim() !== ''
      for (const n of ['currentBidUsd', 'buyNowUsd', 'endsAt']) form[n].disabled = sold
      form.querySelector('#i-save').textContent = sold ? 'Save the sold price' : 'Save and plan my bid'
    })
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const data = Object.fromEntries(new FormData(e.target).entries())
      if (data.endsAt) data.endsAt = Date.parse(data.endsAt)
      if (!data.soldUsd) { delete data.soldUsd; delete data.soldAt } else if (data.soldAt) data.soldAt = Date.parse(data.soldAt + 'T12:00:00')
      for (const k of ['runsAndDrives', 'hasKeys']) data[k] = data[k] === 'true' ? true : data[k] === 'false' ? false : undefined
      try {
        const r = await postJson('/api/import', data)
        if (r.sold) {
          toast('Saved as a sold price. Estimates for cars like it now use it.')
          work.innerHTML = ''
          loadSold()
          return
        }
        toast('Saved. Here is your plan.')
        location.hash = '#plan/' + encodeURIComponent(r.listing.id)
      } catch (err) { toast(err.message, 'hot') }
    })
  }

  const read = async (text, url) => {
    work.innerHTML = loading('Reading the lot…')
    try { const r = await postJson('/api/import/parse', { text, url }); showForm(r.fields, r.found, r.missing, r.usedAi) } catch (err) { work.innerHTML = errorStrip(err.message) }
  }
  el.querySelector('#p-form').addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); read(String(f.get('text') || ''), String(f.get('url') || '')) })
  el.querySelector('#p-manual').addEventListener('click', () => showForm({}, [], [], false))

  el.querySelector('#c-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const out = el.querySelector('#c-out')
    out.innerHTML = loading('Reading the CSV…')
    try {
      const r = await postJson('/api/import/csv', { csv: await file.text(), source: el.querySelector('#c-form select').value, sold: el.querySelector('#c-sold').checked })
      const parts = [`Added ${r.added} lot${r.added === 1 ? '' : 's'} for sale`, `${r.sold} sold price${r.sold === 1 ? '' : 's'}`]
      if (r.skipped) parts.push(`skipped ${r.skipped} without a name or year, make and model`)
      if (r.undated) parts.push(`skipped ${r.undated} sold row${r.undated === 1 ? '' : 's'} with no sale date (Gavel needs the date to know the price is recent)`)
      out.innerHTML = `<div class="strip go" style="margin-top:10px">${esc(parts.join(', '))}. Columns used: ${Object.values(r.used).map((c) => `<code>${esc(c)}</code>`).join(' ') || 'none recognised'}.</div>`
      loadList()
      loadSold()
    } catch (err) { out.innerHTML = errorStrip(err.message) }
    e.target.value = ''
  })

  const loadList = async () => {
    const box = el.querySelector('#i-list')
    try {
      const list = await getJson('/api/imports')
      box.innerHTML = `<h2>Your imported lots (${list.length})</h2>${list.length ? `<div class="list">${list.slice(0, 100).map((l) => `<div class="item" data-id="${esc(l.id)}"><div class="main"><b>${esc(l.title)}</b><div class="mono dim">${esc([sourceName(l.source), l.lotNumber ? 'lot ' + l.lotNumber : null, l.currentBidUsd ? 'bid ' + money(l.currentBidUsd) : l.buyNowUsd ? 'buy now ' + money(l.buyNowUsd) : null, l.endsAt ? 'ends ' + when(l.endsAt) : null].filter(Boolean).join(' · '))}</div></div><div class="row"><a class="btn sm" href="#plan/${encodeURIComponent(l.id)}">Plan</a><button class="btn outline sm" type="button" data-rm>Remove</button></div></div>`).join('')}</div>` : '<p class="dim">Nothing imported yet. Imported lots also appear in your Feed and the Sniper hunts them.</p>'}`
      box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => { try { await del('/api/imports/' + encodeURIComponent(b.closest('[data-id]').dataset.id)); loadList() } catch (err) { toast(err.message, 'hot') } }))
    } catch (err) { box.innerHTML = errorStrip(err.message) }
  }
  const loadSold = async () => {
    const box = el.querySelector('#s-list')
    try {
      const list = await getJson('/api/sold')
      box.innerHTML = `<h2>Sold prices you added (${list.length})</h2><p class="dim" style="font-size:14px;margin-top:0">Each one sharpens the estimate for the same make and model within a model year. Sales older than two years are kept here but left out of estimates.</p>${list.length ? `<div class="list">${list.slice(0, 100).map((l) => `<div class="item" data-id="${esc(l.id)}"><div class="main"><b>${esc(l.title)}</b><div class="mono dim">${esc([sourceName(l.source), 'sold ' + money(l.soldUsd), day(l.soldAt), l.mileage ? l.mileage.toLocaleString('en-US') + ' mi' : null].filter(Boolean).join(' · '))}</div></div><div class="row"><button class="btn outline sm" type="button" data-rm>Remove</button></div></div>`).join('')}</div>` : '<p class="dim">None yet. On a sold result page (Bring a Trailer, Cars & Bids, your won lots), click Send to Gavel or paste it above. For many at once, upload a sold or won-lots CSV with "These are sold results" on.</p>'}`
      box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => { try { await del('/api/sold/' + encodeURIComponent(b.closest('[data-id]').dataset.id)); loadSold() } catch (err) { toast(err.message, 'hot') } }))
    } catch (err) { box.innerHTML = errorStrip(err.message) }
  }
  loadList()
  loadSold()

  if (payload) {
    try {
      const d = JSON.parse(payload)
      history.replaceState(null, '', '#import')
      const u = d && typeof d.u === 'string' ? d.u : ''
      const t = d && typeof d.t === 'string' ? d.t.slice(0, 15000) : ''
      el.querySelector('#p-form input[name=url]').value = u
      if (t.trim()) { el.querySelector('#p-form textarea').value = t; read(t, u) }
      else if (u) { showForm({ url: u }, [], [], false); toast('Only the link came through. Fill in what the lot page says.') }
    } catch { toast('That button click did not carry a readable page. Paste the lot text instead.', 'hot') }
  }
}
