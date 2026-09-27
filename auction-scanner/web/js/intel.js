// Intel: the research desk (ask anything; web with a key, the knowledge base without),
// car intel from public databases, every house's policies, the regulations, and the glossary.
import { getJson, postJson, esc, safeUrl, store } from './api.js'
import { toast, loading, errorStrip } from './ui.js'

let kb = null
const ROLE = { buyer: 'Buyer', seller: 'Seller', flipper: 'Flipper', rental: 'Rental', dealer: 'Dealer' }

function policyHtml(p) {
  return `<details class="policy"><summary><b>${esc(p.name)}</b> <span class="mono dim">checked ${esc(p.checked)}</span></summary>
    <dl class="house" style="margin-top:10px">
      <dt>Who may buy</dt><dd>${esc(p.whoMayBuy)}</dd>
      <dt>Registering</dt><dd>${esc(p.registration.cost)} Needs: ${esc(p.registration.needs.join('; '))}.${p.registration.note ? ' ' + esc(p.registration.note) : ''}</dd>
      <dt>Deposit</dt><dd>${esc(p.deposit)}</dd>
      <dt>Paying</dt><dd>${esc(p.payment.window)} Methods: ${esc(p.payment.methods.join('; '))}. Late: ${esc(p.payment.late)}</dd>
      <dt>Fees</dt><dd><ul style="margin:0;padding-left:16px">${p.fees.map((f) => `<li><b>${esc(f.name)}:</b> ${esc(f.basis)}${f.note ? ` <span class="dim">${esc(f.note)}</span>` : ''}</li>`).join('')}</ul></dd>
      <dt>Pickup</dt><dd>${esc(p.pickup.window)} Storage: ${esc(p.pickup.storage)} Transport: ${esc(p.pickup.transport)}</dd>
      <dt>Disputes</dt><dd>${esc(p.disputes)}</dd>
      <dt>Bidding</dt><dd>${esc(p.bidding.style)} Extension: ${esc(p.bidding.extension)} Proxy: ${esc(p.bidding.proxy)} Increments: ${esc(p.bidding.increments)}</dd>
      <dt>Titles</dt><dd>${esc(p.titles)}</dd>
      <dt>Traps</dt><dd><ul style="margin:0;padding-left:16px">${p.gotchas.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></dd>
      ${p.sources.length ? `<dt>Verify</dt><dd>${p.sources.filter(safeUrl).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, '').slice(0, 48))}</a>`).join(' · ')}</dd>` : ''}
    </dl></details>`
}

function regHtml(r) {
  return `<details class="policy"><summary><b>${esc(r.title)}</b> <span class="pill ${r.scope === 'federal' ? 'go' : r.scope === 'state' ? 'wait' : ''}">${esc(r.scope)}</span>${r.variesByState ? ' <span class="mono dim">varies by state</span>' : ''}</summary>
    <p style="margin:10px 0 6px">${esc(r.summary)}</p>
    <div class="mono dim">Applies to: ${esc(r.appliesTo.map((a) => ROLE[a] || a).join(', '))} · checked ${esc(r.checked)}</div>
    <ol style="margin:8px 0 0;padding-left:20px">${r.whatToDo.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    ${r.sources.length ? `<div style="margin-top:6px;font-size:14px">Verify: ${r.sources.filter(safeUrl).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, '').slice(0, 48))}</a>`).join(' · ')}</div>` : ''}
  </details>`
}

function answerHtml(r) {
  if (r.source === 'web') {
    return `<div class="answer"><div class="mono dim">AI research · ${r.searches} search${r.searches === 1 ? '' : 'es'} · ${esc(r.model)}</div><div class="prose">${esc(r.answer).replace(/\n/g, '<br />')}</div>
      ${r.citations && r.citations.length ? `<div class="mono dim" style="margin-top:10px">Sources</div><ol class="sources">${r.citations.filter((c) => safeUrl(c.url)).map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.title || c.url)}</a>${c.quote ? `<div class="dim" style="font-size:13px">“${esc(c.quote)}”</div>` : ''}</li>`).join('')}</ol>` : ''}
      <p class="dim" style="font-size:14px;margin-top:8px">${esc(r.note)}</p></div>`
  }
  return `<div class="answer"><p class="dim" style="font-size:14px">${esc(r.note)}</p>${r.hits.length ? r.hits.map((h) => `<div class="hit"><span class="pill">${esc(h.kind)}</span> <b>${esc(h.title)}</b><div style="font-size:14px">${esc(h.snippet)}</div>${h.kind === 'guide' ? `<a href="#playbook/${esc(h.id)}">Open the guide</a>` : ''}</div>`).join('') : '<p>Nothing in the built-in notes matches. Try other words, or add an Anthropic key so the desk can search the web.</p>'}</div>`
}

export async function render(el, ctx, [sub]) {
  el.innerHTML = `<div class="head"><div><h1>Intel</h1><p>Ask the desk anything about buying at auction. Look a car up in the public record. Read how every house works and the laws that bite.</p></div></div>${loading('Loading…')}`
  if (!kb) { try { kb = await getJson('/api/knowledge') } catch (e) { el.innerHTML += errorStrip(e.message); return } }
  const webOn = ctx.me.research && ctx.me.research.available
  const last = store('gavel-intel') || { year: 2019, make: 'Toyota', model: 'Camry' }
  el.innerHTML = `<div class="head"><div><h1>Intel</h1><p>Ask the desk anything about buying at auction. Look a car up in the public record. Read how every house works and the laws that bite.</p></div></div>
    <div class="panel"><h2>Ask the desk</h2>
      <p class="dim" style="font-size:14px">${webOn ? 'The desk searches the live web and cites its sources.' : esc(ctx.me.research ? ctx.me.research.reason : 'Answers come from the built-in notes.')}</p>
      <form id="ask" class="row"><input type="text" name="q" placeholder="Can I buy at Copart in my state without a licence?" style="flex:1;min-width:240px" aria-label="Your question" /><button class="btn" type="submit">Ask</button></form>
      <div class="chips" style="margin-top:8px">${['What fees does IAA charge a public buyer?', 'How does the 20-year odometer rule work?', 'Does sniping work on Bring a Trailer?', 'What is a rebuilt title worth?'].map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div id="ask-out"></div></div>
    <div class="panel"><h2>Car intel from the public record</h2>
      <p class="dim" style="font-size:14px">Recalls, owner complaints and crash-test stars from NHTSA, and fuel economy from fueleconomy.gov. Free, no key, no history of the individual car.</p>
      <form id="ci" class="row"><input type="number" name="year" min="1990" max="2030" value="${esc(last.year)}" style="width:110px" aria-label="Year" /><input type="text" name="make" value="${esc(last.make)}" placeholder="Make" style="width:150px" aria-label="Make" /><input type="text" name="model" value="${esc(last.model)}" placeholder="Model" style="width:170px" aria-label="Model" /><button class="btn outline" type="submit">Look it up</button></form>
      <div id="ci-out"></div></div>
    <div class="panel"><h2>How each house works</h2><p class="dim" style="font-size:14px">Registration, deposit, payment window, every fee line, pickup, disputes and the closing rule. Numbers carry the month they were checked and a link to verify.</p>${kb.policies.map(policyHtml).join('')}</div>
    <div class="panel"><h2>The laws that bite</h2><p class="dim" style="font-size:14px">Federal rules are stated. State rules say "varies by state" and which office to ask.</p>${kb.regulations.map(regHtml).join('')}</div>
    <div class="panel"><h2>Glossary</h2><input type="search" id="gl-q" placeholder="Filter terms" aria-label="Filter the glossary" style="margin-bottom:10px" /><dl class="house" id="gl">${kb.glossary.map((g) => `<dt>${esc(g.term)}</dt><dd>${esc(g.meaning)}</dd>`).join('')}</dl></div>`

  const ask = async (q) => {
    const out = el.querySelector('#ask-out')
    out.innerHTML = loading(webOn ? 'Searching the web…' : 'Searching the notes…')
    try { out.innerHTML = answerHtml(await postJson('/api/research', { question: q })) } catch (e) { out.innerHTML = errorStrip(e.message) }
  }
  el.querySelector('#ask').addEventListener('submit', (e) => { e.preventDefault(); const q = new FormData(e.target).get('q'); if (String(q).trim()) ask(String(q).trim()) })
  el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { el.querySelector('#ask input').value = b.dataset.q; ask(b.dataset.q) }))
  el.querySelector('#ci').addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const q = { year: Number(f.get('year')), make: String(f.get('make')).trim(), model: String(f.get('model')).trim() }
    store('gavel-intel', q)
    const out = el.querySelector('#ci-out')
    out.innerHTML = loading('Asking NHTSA and fueleconomy.gov…')
    try {
      const i = await getJson(`/api/intel?year=${q.year}&make=${encodeURIComponent(q.make)}&model=${encodeURIComponent(q.model)}`)
      out.innerHTML = `<div class="tiles" style="margin-top:12px">
        <div class="tile"><div class="k mono">Recalls</div><div class="v">${i.recalls ? i.recalls.length : '?'}</div></div>
        <div class="tile"><div class="k mono">Complaints</div><div class="v">${i.complaints ? i.complaints.count : '?'}</div></div>
        <div class="tile"><div class="k mono">Crash stars</div><div class="v">${i.safety && i.safety.overall ? i.safety.overall + '/5' : '?'}</div></div>
        <div class="tile"><div class="k mono">MPG combined</div><div class="v">${i.mpg && i.mpg.combined ? i.mpg.combined : '?'}</div></div></div>
        ${i.summary.length ? `<ul class="why">${i.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
        ${i.notes.length ? `<div class="strip wait">${esc(i.notes.join(' '))}</div>` : ''}
        ${i.recalls && i.recalls.length ? `<details style="margin-top:8px"><summary>Recalls on record (${i.recalls.length})</summary><ul style="padding-left:18px">${i.recalls.slice(0, 15).map((r) => `<li><b>${esc(r.component)}</b> ${esc(r.campaign)}: ${esc(r.summary)}</li>`).join('')}</ul></details>` : ''}
        ${i.complaints && i.complaints.topComponents.length ? `<details style="margin-top:8px"><summary>What owners complain about</summary><ul style="padding-left:18px">${i.complaints.topComponents.map((c) => `<li>${esc(c.component)}: ${c.count}</li>`).join('')}</ul>${i.complaints.sample.map((s) => `<p class="dim" style="font-size:14px">“${esc(s)}”</p>`).join('')}</details>` : ''}
        <p class="dim" style="font-size:14px;margin-top:8px">${esc(i.source)}</p>`
    } catch (err) { out.innerHTML = errorStrip(err.message) }
  })
  el.querySelector('#gl-q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase()
    const dl = el.querySelector('#gl')
    dl.innerHTML = kb.glossary.filter((g) => !q || (g.term + ' ' + g.meaning).toLowerCase().includes(q)).map((g) => `<dt>${esc(g.term)}</dt><dd>${esc(g.meaning)}</dd>`).join('') || '<dd class="dim">No term matches.</dd>'
  })
  if (sub === 'ask') el.querySelector('#ask input').focus()
}
