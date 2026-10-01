// The auction directory: who can buy where, what it costs, and whether Gavel reads it live.
import { getJson, esc, safeUrl, store } from './api.js'
import { loading, errorStrip } from './ui.js'

const ACCESS = { public: ['go', 'Anyone can buy'], 'public-some-states': ['wait', 'Public in many states'], dealer: ['hot', 'Dealer licence needed'], broker: ['wait', 'Through a broker'] }

export async function render(el) {
  el.innerHTML = `<div class="head"><div><h1>Auctions</h1><p>Every house worth knowing: who may buy there, what registering costs, the fee basis, and whether Gavel reads it live. Fees change, so every entry links to the page to verify.</p></div></div>${loading('Loading…')}`
  const q = (store('gavel-feed') || {}).q || ''
  let data
  try { data = await getJson('/api/auctions?q=' + encodeURIComponent(q)) } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const status = Object.fromEntries(data.sources.map((s) => [s.id, s]))
  el.innerHTML = `<div class="head"><div><h1>Auctions</h1><p>Every house worth knowing: who may buy there, what registering costs, the fee basis, and whether Gavel reads it live. Fees change, so every entry links to the page to verify.</p></div></div>
    <div class="strip wait">Gavel reads <b>eBay Motors</b>, <b>GSA Auctions</b> and <b>MarketCheck</b> live through their official APIs once they are connected. No other auction offers data to outside apps, and most forbid automated reading, so for those Gavel opens their search and you bring a lot in with <a href="#import">Send to Gavel</a>. Bidding always happens on the auction's own site.</div>
    ${data.groups.map((g) => {
      const houses = g.houses.map((id) => data.houses.find((h) => h.id === id)).filter(Boolean)
      return `<section class="hgroup"><h2>${esc(g.title)}</h2><p class="dim" style="margin:0 0 10px">${esc(g.bestFor)}</p><div class="guides">${houses.map(card).join('')}</div></section>`
    }).join('')}`

  function card(h) {
      const [tone, word] = ACCESS[h.access] || ['', h.access]
      const st = status[h.id]
      const live = st && st.connected ? '<span class="pill go">Gavel reads it live</span>' : h.api === 'official' ? '<span class="pill wait">API available — not connected</span>' : '<span class="pill">No public API</span>'
      return `<article class="panel house">
        <div class="row" style="justify-content:space-between;align-items:flex-start"><h3>${esc(h.name)}</h3><span class="pill ${tone}">${esc(word)}</span></div>
        <p style="margin:8px 0 0">${esc(h.best)}</p>
        <div class="row" style="margin-top:8px">${live}<span class="pill">${h.inPerson ? 'In person & online' : 'Online only'}</span></div>
        <dl><dt>Cars</dt><dd>${esc(h.inventory)}</dd><dt>Register</dt><dd>${esc(h.register)}</dd><dt>Buyer fee</dt><dd>${esc(h.buyerFee)} ${safeUrl(h.feeUrl) ? `<a href="${esc(h.feeUrl)}" target="_blank" rel="noopener noreferrer">Verify ↗</a>` : ''}</dd><dt>For you</dt><dd>${esc(h.starterNote)}</dd></dl>
        <div class="row">${safeUrl(h.searchUrl) ? `<a class="btn sm" href="${esc(h.searchUrl)}" target="_blank" rel="noopener noreferrer">Search their site ↗</a>` : ''}${safeUrl(h.url) ? `<a class="btn outline sm" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">Their site ↗</a>` : ''}</div>
      </article>`
  }
}
