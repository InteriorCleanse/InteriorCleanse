// The Feed: filters, the scan, the lot tags.
import { getJson, postJson, del, esc, debounce, store, when } from './api.js'
import { cardHtml, wireCards, loading, errorStrip, toast } from './ui.js'
import { setMode } from './app.js'

const TIERS = [['all', 'All cars'], ['rental', 'Rental'], ['holds-value', 'Holds value'], ['enthusiast', 'Enthusiast'], ['supercar', 'Supercar']]
const state = { q: '', make: '', maxPrice: '', state: '', tier: 'all', starter: true, sample: true, sort: 'score', showHidden: false, seeded: false }
let watched = new Set()
let lastKind = null
let root = null
let seq = 0

function chipsHtml() {
  return `<div class="rail" id="rail">
    <div class="chips wrap tiers" role="toolbar" aria-label="Kind of car">${TIERS.map(([k, v]) => `<button class="chip" type="button" data-tier="${k}" aria-pressed="${state.tier === k}">${v}</button>`).join('')}</div>
    <div class="chips" role="toolbar" aria-label="Filters">
      <label class="switch" title="Hides salvage titles, damage beyond minor, cars that do not run, and cars over your price, mileage or age caps (Settings)."><input type="checkbox" id="f-starter" ${state.starter ? 'checked' : ''} /><span class="track" aria-hidden="true"></span><span class="mono">Starter mode</span></label>
      <input type="search" id="f-q" placeholder="Search a car" aria-label="Search" value="${esc(state.q)}" />
      <label class="inl mono">Max $<input type="number" id="f-max" placeholder="any" aria-label="Maximum price in dollars" min="0" step="any" value="${esc(state.maxPrice)}" /></label>
      <input type="search" id="f-state" placeholder="State" aria-label="US state, two letters" maxlength="2" style="width:80px" value="${esc(state.state)}" />
      <select id="f-sort" aria-label="Sort"><option value="score" ${state.sort === 'score' ? 'selected' : ''}>Best score</option><option value="ending" ${state.sort === 'ending' ? 'selected' : ''}>Ending soonest</option><option value="price" ${state.sort === 'price' ? 'selected' : ''}>Price low to high</option></select>
      <label class="switch" id="f-sample-wrap" hidden title="Sample cars are not real. They show what the app does until a source is connected."><input type="checkbox" id="f-sample" ${state.sample ? 'checked' : ''} /><span class="track" aria-hidden="true"></span><span class="mono">Show sample cars</span></label>
    </div>
    <div class="status mono" id="f-status"></div>
  </div>`
}

function params() {
  const p = new URLSearchParams()
  if (state.q) p.set('q', state.q)
  if (state.make) p.set('make', state.make)
  if (state.maxPrice) p.set('maxPrice', state.maxPrice)
  if (state.state) p.set('state', state.state)
  if (state.tier !== 'all') p.set('tier', state.tier)
  p.set('starter', state.starter && !state.showHidden ? '1' : '0')
  p.set('sample', state.sample ? '1' : '0')
  p.set('sort', state.sort)
  return p.toString()
}

async function toggleWatch(id, on) {
  if (on) await postJson('/api/watchlist', { listingId: id }); else await del('/api/watchlist/' + encodeURIComponent(id))
  if (on) watched.add(id); else watched.delete(id)
}

function emptyHtml(me) {
  const reasons = (me.sources || []).filter((s) => s.kind === 'api').map((s) => `<li><b>${esc(s.name)}:</b> ${esc(s.reason)}</li>`).join('')
  return `<div class="tag empty"><h2>No source connected</h2>
    <p>Gavel shows real cars only when a source is connected. It will never fill this screen with made-up cars pretending to be real.</p>
    <ul>${reasons}</ul>
    <p>Copy <code>.env.example</code> to <code>.env</code> in the Gavel folder, add the lines above, and restart. Or turn on sample cars (top of this screen) to see how the app works.</p>
  </div>`
}

async function load() {
  const my = ++seq
  const list = root.querySelector('#f-list')
  const status = root.querySelector('#f-status')
  list.innerHTML = loading(lastKind === 'LIVE' ? 'Reading the auctions…' : 'Scanning…')
  status.textContent = ''
  try {
    const [feed, watchlist] = await Promise.all([getJson('/api/feed?' + params()), getJson('/api/watchlist')])
    if (my !== seq) return
    watched = new Set(watchlist.map((w) => w.listingId))
    lastKind = feed.kind
    const me = window.__gavelMe
    setMode(feed.kind, feed.kind === 'LIVE' ? (me.sources || []).filter((s) => s.connected).map((s) => s.name).join(', ') : '')
    root.querySelector('#f-sample-wrap').hidden = feed.kind === 'LIVE'
    const bits = [`${feed.cards.length} car${feed.cards.length === 1 ? '' : 's'}`, `scanned ${when(feed.scannedAt)}`]
    if (state.starter && !state.showHidden && feed.hidden) bits.push(`<button class="lnk" type="button" id="f-why">Starter mode hid ${feed.hidden} — why?</button>`)
    if (state.starter && state.showHidden) bits.push(`<button class="lnk" type="button" id="f-why">showing hidden cars — hide them again</button>`)
    status.innerHTML = bits.join(' · ')
    const why = status.querySelector('#f-why')
    if (why) why.addEventListener('click', () => { state.showHidden = !state.showHidden; load() })
    let html = ''
    if (feed.kind === 'LIVE' && feed.errors && feed.errors.length) html += feed.errors.map((e) => errorStrip(e)).join('')
    if (feed.kind === 'SAMPLE') html += `<div class="strip wait"><b>Practice cars, not for sale.</b> ${me.role === 'owner' ? 'Real auctions appear here once a source is connected: <a href="#connect">Connect</a>.' : 'Use them to learn the plan. Real auctions appear here when the owner connects them.'}</div>`
    if (feed.kind === 'EMPTY') html += emptyHtml(me)
    else if (!feed.cards.length) html += `<div class="tag empty"><h2>Nothing matches</h2><p>Loosen a filter, or turn Starter mode off to see the cars it hid (each one says why).</p></div>`
    html += `<div class="feed">${feed.cards.map((c) => cardHtml(c, { watched: watched.has(c.listing.id), showBlocks: state.showHidden })).join('')}</div>`
    list.innerHTML = html
    wireCards(list, { onWatch: toggleWatch })
  } catch (e) {
    if (my !== seq) return
    list.innerHTML = errorStrip(e.message)
  }
}

export async function render(el, ctx) {
  window.__gavelMe = ctx.me
  if (root === el && el.querySelector('#f-list')) { load(); return } // back from Plan: refresh the cards, keep the filters
  root = el
  Object.assign(state, store('gavel-feed') || {})
  if (!state.seeded) {
    // First visit: start from what the member told setup, their goal and their cash.
    try {
      const s = await getJson('/api/settings')
      if (s.goal === 'rental') state.tier = 'rental'
      if (typeof s.cashUsd === 'number') state.maxPrice = String(s.cashUsd)
    } catch { /* the defaults stand */ }
    state.seeded = true
    store('gavel-feed', state)
  }
  el.innerHTML = `<div class="head"><div><h1>Feed</h1><p>Clean cars priced under what similar cars list for. The score says how big the gap is; the three lines say why.</p></div></div>${chipsHtml()}<div id="f-list"></div>`
  const save = () => store('gavel-feed', state)
  const reload = debounce(() => { save(); load() }, 350)
  el.querySelector('#f-starter').addEventListener('change', (e) => { state.starter = e.target.checked; state.showHidden = false; save(); load() })
  el.querySelector('#f-sample').addEventListener('change', (e) => { state.sample = e.target.checked; save(); load() })
  el.querySelector('#f-q').addEventListener('input', (e) => { state.q = e.target.value.trim(); reload() })
  el.querySelector('#f-max').addEventListener('input', (e) => { state.maxPrice = e.target.value; reload() })
  el.querySelector('#f-state').addEventListener('input', (e) => { state.state = e.target.value.trim().toUpperCase(); reload() })
  el.querySelector('#f-sort').addEventListener('change', (e) => { state.sort = e.target.value; save(); load() })
  el.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => {
    state.tier = b.dataset.tier
    el.querySelectorAll('[data-tier]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    save(); load()
  }))
  load()
}

export function refresh() { if (root) load() }
export { toast }
