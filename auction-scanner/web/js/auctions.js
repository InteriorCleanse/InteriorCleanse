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
    <div class="strip wait">Gavel reads <b>eBay Motors</b> live through its official API. No other auction publishes an API to the public, so for the rest Gavel opens their search and tells you how to register. Bidding always happens on the auction's own site.</div>
    <div class="guides">${data.houses.map((h) => {
      const [tone, word] = ACCESS[h.access] || ['', h.access]
      const st = status[h.id]
      const live = st && st.connected ? '<span class="pill go">Gavel reads it live</span>' : h.api === 'official' ? '<span class="pill wait">API available — not connected</span>' : '<span class="pill">No public API</span>'
      return `<article class="panel house">
        <div class="row" style="justify-content:space-between;align-items:flex-start"><h3>${esc(h.name)}</h3><span class="pill ${tone}">${esc(word)}</span></div>
        <p style="margin:8px 0 0">${esc(h.best)}</p>
        <div class="row" style="margin-top:8px">${live}<span class="pill">${h.inPerson ? 'In person & online' : 'Online only'}</span></div>
        <dl><dt>Cars</dt><dd>${esc(h.inventory)}</dd><dt>Register</dt><dd>${esc(h.register)}</dd><dt>Buyer fee</dt><dd>${esc(h.buyerFee)} ${safeUrl(h.feeUrl) ? `<a href="${esc(h.feeUrl)}" target="_blank" rel="noopener noreferrer">Verify ↗</a>` : ''}</dd><dt>For you</dt><dd>${esc(h.starterNote)}</dd></dl>
        <div class="row">${safeUrl(h.searchUrl) ? `<a class="btn sm" href="${esc(h.searchUrl)}" target="_blank" rel="noopener noreferrer">Search ${esc(h.name.split(' ')[0])} ↗</a>` : ''}${safeUrl(h.url) ? `<a class="btn outline sm" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">Their site ↗</a>` : ''}</div>
      </article>`
    }).join('')}</div>`
}
