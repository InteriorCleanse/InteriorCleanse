// Connect: the go-live guide, with the live status of every connection.
import { getJson, esc, safeUrl } from './api.js'
import { loading, errorStrip } from './ui.js'

export async function render(el) {
  el.innerHTML = `<div class="head"><div><h1>Connect</h1></div></div>${loading('Checking every connection…')}`
  let c
  try { c = await getJson('/api/connect') } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const groups = [...new Set(c.items.map((i) => i.group))]
  // Steps say https://your-domain; on a running server the real address is known.
  const here = (t) => location.protocol === 'https:' ? t.replace(/https:\/\/your-domain/g, location.origin) : t
  for (const i of c.items) i.steps = i.steps.map(here)
  // What must be true before a stranger pays: the owner-only items, in order, plus a test sign-in.
  const before = c.items.filter((i) => i.ownerOnly)
  const left = before.filter((i) => !i.done)
  const firstSubscriber = before.length ? `<div class="strip ${left.length ? 'wait' : 'go'}" style="margin-top:12px"><b>Before your first subscriber: ${before.length - left.length} of ${before.length} done.</b>
    ${left.length ? `Still to do: ${left.map((i) => esc(i.name)).join(' · ')}.` : 'Gavel is ready to take members.'}
    Then add yourself on <a href="#admin">Members</a> with a second email and sign in on your phone, to see exactly what a member sees.</div>` : ''
  el.innerHTML = `<div class="head"><div><h1>Connect</h1><p>Everything that turns Gavel from a demo into your business: the auction sources, the AI, running it online, and getting paid. Each card says what it unlocks, what it costs, and exactly what to do.</p></div></div>
    <div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${c.done} of ${c.total} connected</h2><span class="mono dim">Secrets go in the server's environment (.env), never in the code</span></div><div class="bar" style="margin-top:10px"><i style="width:${Math.round((c.done / c.total) * 100)}%"></i></div></div>
    ${firstSubscriber}
    ${groups.map((g) => `<h2 style="margin:24px 0 10px">${esc(g)}</h2><div class="garage">${c.items.filter((i) => i.group === g).map((i) => `<article class="panel conn ${i.done ? 'done' : ''}">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><h3>${esc(i.name)}</h3><span class="pill ${i.done ? 'go' : 'wait'}">${i.done ? (i.id === 'import' ? 'Always on' : 'Connected') : 'Not yet'}</span></div>
      <p style="margin:8px 0 4px">${esc(i.unlocks)}</p><div class="mono dim">Cost: ${esc(i.cost)}</div>
      ${i.done ? '' : `<ol class="fire-steps" style="margin-top:10px">${i.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`}
      ${i.env.length ? `<div style="margin-top:8px">${i.env.map((e) => `<code>${esc(e)}</code>`).join(' ')}</div>` : ''}
      ${i.link && safeUrl(i.link) && !i.done ? `<div class="row" style="margin-top:10px"><a class="btn sm" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">Open ${esc(new URL(i.link).hostname.replace(/^www\./, ''))} ↗</a></div>` : ''}
      ${i.id === 'import' && !i.done ? '<div class="row" style="margin-top:10px"><a class="btn sm" href="#import">Open Import</a></div>' : ''}
    </article>`).join('')}</div>`).join('')}
    <p class="dim" style="margin-top:20px;font-size:14px">The full walkthrough, with hosting options and the order to do things in, is in docs/GO_LIVE.md in the Gavel folder.</p>`
}
