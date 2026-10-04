// Parts: pick the car, pick the part. eBay's own fitment search with live prices
// when eBay is connected; the big stores and salvage yards searched for this exact
// car either way; and the recalls a dealer fixes for free. Engine: src/parts.ts.
import { getJson, postJson, esc, money, safeUrl, store } from './api.js'
import { toast, loading, errorStrip, carName } from './ui.js'

const FITS = { exact: ['go', '✓ Fits this car'], possible: ['wait', '? May fit; check the part number'], 'not checked': ['', 'Fit not checked'] }

function vehicleQuery(v) {
  return v.carId ? `carId=${encodeURIComponent(v.carId)}` : new URLSearchParams({ year: v.year, make: v.make, model: v.model }).toString()
}

export async function render(el, ctx, args = []) {
  // #parts · #parts/car/<id> · #parts/car/<id>/<part> · #parts/q/<part>
  const [mode, a1, a2] = args
  const preCar = mode === 'car' ? a1 : null
  const preQ = mode === 'car' ? a2 : mode === 'q' ? a1 : null
  el.innerHTML = `<div class="head"><div><h1>Parts</h1><p>Pick the car you bought, then the part. Gavel searches for parts that fit that exact car.</p></div></div>${loading('Opening your books…')}`
  let g
  try { g = await getJson('/api/garage') } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const saved = store('gavel-parts') || {}
  const cars = g.cars
  const startCar = preCar || (cars.some((c) => c.id === saved.carId) ? saved.carId : cars[0] && cars[0].id) || ''
  el.innerHTML = `<div class="head"><div><h1>Parts</h1><p>Pick the car you bought, then the part. Gavel searches for parts that fit that exact car.</p></div></div>
    <section class="panel parts-pick" aria-label="Which car">
      <label class="f">Car <select id="p-car">${cars.map((c) => `<option value="${esc(c.id)}" ${c.id === startCar ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}<option value="" ${startCar ? '' : 'selected'}>Another car…</option></select></label>
      <div class="grid3 parts-other" id="p-other" ${startCar ? 'hidden' : ''}>
        <label class="f">Year <input type="number" id="p-year" min="1950" max="2050" value="${esc(saved.year || '')}" /></label>
        <label class="f">Make <input type="text" id="p-make" maxlength="40" value="${esc(saved.make || '')}" placeholder="Toyota" /></label>
        <label class="f">Model <input type="text" id="p-model" maxlength="60" value="${esc(saved.model || '')}" placeholder="Camry" /></label>
      </div>
      <form class="ask" id="p-form"><label class="sr-only" for="p-q">Part</label><input id="p-q" type="text" maxlength="80" placeholder="Which part? front brake pads, headlight, key fob…" value="${esc(preQ || '')}" autocomplete="off" /><button class="btn" type="submit">Find parts</button></form>
      <div id="p-cats"></div>
    </section>
    <div id="p-intel"></div>
    <div id="p-out" aria-live="polite"></div>`

  const sel = el.querySelector('#p-car')
  const other = el.querySelector('#p-other')
  const qBox = el.querySelector('#p-q')
  const out = el.querySelector('#p-out')
  const vehicle = () => {
    if (sel.value) return { carId: sel.value }
    return { year: el.querySelector('#p-year').value, make: el.querySelector('#p-make').value.trim(), model: el.querySelector('#p-model').value.trim() }
  }
  const remember = () => { const v = vehicle(); store('gavel-parts', v.carId ? { ...saved, carId: v.carId } : { ...v, carId: '' }) }

  let info = null
  async function loadCar() {
    const v = vehicle()
    el.querySelector('#p-cats').innerHTML = ''
    el.querySelector('#p-intel').innerHTML = ''
    if (!v.carId && !(v.year && v.make && v.model)) return
    try { info = await getJson('/api/parts?' + vehicleQuery(v)) } catch (e) { el.querySelector('#p-cats').innerHTML = errorStrip(e.message); info = null; return }
    const groups = [...new Set(info.categories.map((c) => c.group))]
    el.querySelector('#p-cats').innerHTML = `<p class="mono dim parts-car">${esc(info.vehicle.year)} ${esc(info.vehicle.make)} ${esc(info.vehicle.model)}${info.vehicle.vin ? ' · VIN ' + esc(info.vehicle.vin) : ''}</p>
      ${groups.map((g2) => `<div class="parts-g"><span class="mono dim">${esc(g2)}</span><div class="chips wrap">${info.categories.filter((c) => c.group === g2).map((c) => `<button type="button" class="chip" data-pq="${esc(c.query)}">${esc(c.name)}</button>`).join('')}</div></div>`).join('')}`
    el.querySelectorAll('[data-pq]').forEach((b) => b.addEventListener('click', () => { qBox.value = b.dataset.pq; search() }))
    loadIntel(info.vehicle)
    if (qBox.value.trim()) search()
  }

  async function loadIntel(v) {
    const box = el.querySelector('#p-intel')
    box.innerHTML = ''
    try {
      const i = await getJson('/api/intel?' + new URLSearchParams({ year: v.year, make: v.make, model: v.model }))
      const rec = i.recalls || []
      const top = (i.complaints && i.complaints.topComponents) || []
      if (!rec.length && !top.length) return
      box.innerHTML = `<section class="panel parts-intel"><h2>Before you buy a part</h2>
        ${rec.length ? `<div class="strip go"><b>${rec.length} recall${rec.length === 1 ? '' : 's'} on record.</b> A dealer fixes a recall free, whoever owns the car. Call one with the VIN before you buy any of these parts.</div><ul class="recalls">${rec.slice(0, 6).map((r) => `<li><b>${esc(r.component)}</b><span class="mono dim">${esc(r.campaign)}</span><p class="dim">${esc(r.summary.slice(0, 220))}${r.summary.length > 220 ? '…' : ''}</p></li>`).join('')}</ul>` : ''}
        ${top.length ? `<p class="dim">What owners of this car complain about most (NHTSA): tap one to look for the parts.</p><div class="chips wrap">${top.map((t) => `<button type="button" class="chip" data-pq="${esc(t.component.toLowerCase().split(':')[0])}">${esc(t.component)} <span class="mono">${t.count}</span></button>`).join('')}</div>` : ''}
        <p class="mono dim src">${esc(i.source || 'NHTSA public data')}</p></section>`
      box.querySelectorAll('[data-pq]').forEach((b) => b.addEventListener('click', () => { qBox.value = b.dataset.pq; search() }))
    } catch { /* the intel is extra; the part search works without it */ }
  }

  async function search() {
    const q = qBox.value.trim()
    if (!q || !info) return
    remember()
    out.innerHTML = loading('Searching for parts that fit…')
    let r
    try { r = await getJson('/api/parts?' + vehicleQuery(vehicle()) + '&q=' + encodeURIComponent(q)) } catch (e) { out.innerHTML = errorStrip(e.message); return }
    const carId = vehicle().carId
    const live = r.items.length
      ? `<div class="parts-grid">${r.items.map((p) => {
          const [tone, word] = FITS[p.fits]
          const img = safeUrl(p.image)
          const url = safeUrl(p.url)
          return `<article class="part"><div class="part-img">${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : ''}</div><div class="part-body"><span class="badge ${tone}">${word}</span><h3>${esc(p.title)}</h3><div class="part-meta mono dim">${esc([p.condition, p.freeShipping ? 'free shipping' : null, p.seller].filter(Boolean).join(' · '))}</div>
            <div class="part-foot"><b class="num">${p.priceUsd !== undefined ? esc(money(p.priceUsd)) : '—'}</b>${url ? `<a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">On eBay ↗</a>` : ''}${carId && p.priceUsd !== undefined ? `<button class="btn outline sm" type="button" data-log="${esc(p.priceUsd)}" data-label="${esc(('Parts: ' + p.title).slice(0, 80))}">Log as a cost</button>` : ''}</div></div></article>`
        }).join('')}</div><p class="mono dim src">Live from eBay's fitment search. Fit is the seller's claim: match the part number or the VIN before you pay.</p>`
      : r.ebayConnected
        ? `<div class="strip info">${r.error ? esc(r.error) : 'eBay has no listing for this part that it says fits this car. Try a simpler word, or the stores below.'}</div>`
        : `<div class="strip info">Live prices that fit appear here when eBay is connected${ctx.me.role === 'owner' ? ' (free keys, on the Connect screen)' : ''}. The stores below search for this exact car now.</div>`
    out.innerHTML = `<section class="parts-res"><h2>${esc(carName(`${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`))} · ${esc(r.query)}</h2>${live}
      <h3 class="parts-h">Search the stores</h3><div class="stores">${r.links.map((l) => `<a class="store" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(l.store)} ↗</b><span class="badge ${l.kind === 'used' ? 'wait' : ''}">${l.kind === 'used' ? 'used' : l.kind === 'catalog' ? 'catalog' : 'new'}</span><span class="dim">${esc(l.note)}</span></a>`).join('')}</div>
      <p class="mono dim src">Prices are on each store's own page; Gavel only builds the search.</p></section>`
    out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    out.querySelectorAll('[data-log]').forEach((b) => b.addEventListener('click', async () => {
      try { await postJson(`/api/garage/${encodeURIComponent(carId)}/cost`, { label: b.dataset.label, usd: Number(b.dataset.log) }); toast('Logged as a cost in your books.') } catch (e) { toast(e.message, 'hot') }
    }))
  }

  sel.addEventListener('change', () => { other.hidden = !!sel.value; remember(); loadCar() })
  el.querySelectorAll('#p-other input').forEach((i) => i.addEventListener('change', () => { remember(); loadCar() }))
  el.querySelector('#p-form').addEventListener('submit', (e) => { e.preventDefault(); if (!info) loadCar().then(search); else search() })
  if (!cars.length) other.hidden = false
  loadCar()
}
