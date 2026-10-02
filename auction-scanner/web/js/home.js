// Home: the command centre. What is ending soon, what the Sniper found, what you watch,
// how the practice and the business are going, and the one next thing to do.
import { getJson, esc, money, timeLeft, closesText, when } from './api.js'
import { loading, errorStrip, sourceName, carName } from './ui.js'

const GOAL = { rental: 'Building a rental fleet', flip: 'Flipping cars', keep: 'Finding your next car' }
let ticker = null

function tile(label, value, sub, href, tone = '') {
  return `<a class="tile big ${tone}" href="${href}"><div class="k mono">${esc(label)}</div><div class="v">${value}</div><div class="s">${esc(sub)}</div></a>`
}

function countdown(ms, dateOnly = false) {
  if (dateOnly) { const t = closesText({ endsAt: ms, endsAtDateOnly: true }); return `<span class="cd">${esc(t.text)}</span>` }
  const t = timeLeft(ms)
  return t ? `<span class="cd ${t.tone}" data-ends="${ms}">${esc(t.text)}</span>` : '<span class="cd dim">No end time</span>'
}

/** "New pick for My 911: 2014 Porsche 911" → the car in bold, what happened underneath. */
function alertParts(a) {
  const pick = /^New pick for (.+?): (.+)$/.exec(a.title)
  if (pick) return { car: pick[2], what: `Pick for ${pick[1]}` }
  const fired = /^PAPER bid fired: (.+)$/.exec(a.title)
  if (fired) return { car: fired[1], what: 'Paper bid fired' }
  return { car: a.title, what: '' }
}

/** The next few steps, then the rest folded away. */
function pathHtml(next) {
  const todo = next.filter((n) => !n.done)
  const item = (n) => `<li class="${n.done ? 'done' : ''}"><a href="${esc(n.href)}"><span class="tick" aria-hidden="true">${n.done ? '✓' : ''}</span><span><b>${esc(n.title)}</b><span class="dim">${esc(n.body)}</span></span></a><span class="sr-only">${n.done ? 'done' : 'to do'}</span></li>`
  const shown = todo.slice(0, 3)
  const others = next.filter((n) => !shown.includes(n))
  return `<h2>Your path <span class="mono dim">${next.length - todo.length} of ${next.length} done</span></h2>
    ${shown.length ? `<ol class="path">${shown.map(item).join('')}</ol>` : '<p>Every step is done. The Sniper keeps watching for you.</p>'}
    ${others.length ? `<details class="more-steps"><summary>All ${next.length} steps</summary><ol class="path">${others.map(item).join('')}</ol></details>` : ''}`
}

function bestHtml(p) {
  const l = p.card.listing
  const now = l.currentBidUsd ?? l.buyNowUsd
  const why = (p.card.score.reasons || [])[0]
  return `<a class="tag nextup best" href="#plan/${encodeURIComponent(l.id)}"><div class="body" style="padding:16px 18px">
      <div class="mono dim">Your best pick${l.kind === 'SAMPLE' ? ' · sample, for practice' : ''}${l.endsAt ? ' · ' + countdown(l.endsAt, l.endsAtDateOnly) : ''}</div>
      <h2 class="nt">${carName(l.title)}</h2>
      <div class="row" style="gap:18px;margin:6px 0 2px"><div><span class="k mono">Price now</span><div class="bn">${esc(money(now))}</div></div><div><span class="k mono">Never bid above</span><div class="bn" style="color:var(--go)">${esc(money(p.fire.maxBidUsd))}</div>${p.plan.feeUnknown && l.kind !== 'SAMPLE' ? '<span class="feenote">before the buyer fee</span>' : ''}</div></div>
      ${why ? `<p style="margin:4px 0 0">${esc(why)}</p>` : ''}
    </div><span class="go-arrow" aria-hidden="true">→</span></a>`
}

export async function render(el, ctx) {
  if (ticker) { clearInterval(ticker); ticker = null }
  el.innerHTML = `<div class="head"><div><h1>Home</h1></div></div>${loading('Pulling everything together…')}`
  let h
  try { h = await getJson('/api/home') } catch (e) { el.innerHTML += errorStrip(e.message); return }
  if (!h.onboarded && !sessionStorage.getItem('gavel-setup-skipped')) { location.hash = '#setup'; return }
  const best = h.sniper.best
  const nextUp = h.next.find((n) => !n.done)
  // With a best pick, that card is the next thing to do; the rest of the path waits in "Your path" below.
  const showNext = nextUp && !best
  const done = h.next.filter((n) => n.done).length
  const netTone = h.garage.netUsd > 0 ? 'go' : h.garage.netUsd < 0 ? 'hot' : ''
  el.innerHTML = `<div class="head"><div><h1>Home</h1><p>${esc(h.goal ? GOAL[h.goal] : 'Your auction desk')}. ${h.liveSource ? 'Reading live auctions.' : 'No live source yet, so the feed shows SAMPLE cars.'}</p></div></div>
    ${best ? bestHtml(best) : ''}
    ${showNext ? `<a class="tag nextup" href="${esc(nextUp.href)}"><div class="body" style="padding:16px 18px"><div class="mono dim">Next step · ${done} of ${h.next.length} done</div><h2 class="nt">${esc(nextUp.title)}</h2><p style="margin:4px 0 0">${esc(nextUp.body)}</p></div><span class="go-arrow" aria-hidden="true">→</span></a>` : ''}
    <div class="tiles four">
      ${tile('Sniper', `${h.sniper.active}`, `${h.sniper.active === 1 ? 'target' : 'targets'} hunting · ${h.sniper.picks} pick${h.sniper.picks === 1 ? '' : 's'}`, '#sniper')}
      ${tile('Alerts', `${h.alerts.unread}`, h.alerts.unread ? 'new since you looked' : 'all caught up', '#sniper', h.alerts.unread ? 'hot' : '')}
      ${tile('Paper record', `${h.paper.won}<small>/${h.paper.won + h.paper.lost}</small>`, `won of decided · ${h.paper.open} open`, '#watch')}
      ${tile('Garage net', esc(money(h.garage.netUsd)), `${h.garage.cars} car${h.garage.cars === 1 ? '' : 's'} · ${esc(money(h.garage.incomeUsd))} in`, '#garage', netTone)}
    </div>
    <div class="homegrid">
      <section class="panel">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">Ending soon</h2><a class="mono" href="#sniper">All picks</a></div>
        ${h.sniper.endingSoon.length ? `<div class="list">${h.sniper.endingSoon.map((p) => { const l = p.card.listing; return `<a class="item row-link" href="#plan/${encodeURIComponent(l.id)}"><div class="main"><b>${carName(l.title)}</b><div class="mono dim">${esc(sourceName(l.source))} · now ${esc(money(l.currentBidUsd ?? l.buyNowUsd))} · never above ${esc(money(p.fire.maxBidUsd))}</div></div><div class="right">${countdown(l.endsAt, l.endsAtDateOnly)}<div class="mono dim">score ${p.card.score.total}</div></div></a>` }).join('')}</div>` : `<p class="dim">${h.sniper.active ? 'Nothing with a clock on it right now. The Sniper keeps looking.' : 'Set a Sniper target and the cars it finds will count down here.'}</p>`}
      </section>
      <section class="panel">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">Latest alerts</h2>${h.alerts.unread ? `<span class="pill hot">${h.alerts.unread} new</span>` : ''}</div>
        ${h.alerts.latest.length ? `<div class="list">${h.alerts.latest.map((a) => { const x = alertParts(a); return `<a class="item row-link ${a.read ? '' : 'unread'}" href="${a.listingId ? '#plan/' + encodeURIComponent(a.listingId) : '#sniper'}"><div class="main"><b>${carName(x.car)}</b><div class="mono dim">${esc([x.what, when(a.at)].filter(Boolean).join(' · '))}</div></div></a>` }).join('')}</div>` : '<p class="dim">The Sniper writes here when it finds a pick or fires a paper bid.</p>'}
      </section>
      ${h.watch.length ? `<section class="panel">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">Watching</h2><a class="mono" href="#watch">Watchlist</a></div>
        <div class="list">${h.watch.map((w) => `<a class="item row-link" href="#plan/${encodeURIComponent(w.listingId)}"><div class="main"><b>${carName(w.title)}</b><div class="mono dim">${w.priceUsd ? 'saved at ' + esc(money(w.priceUsd)) : ''}</div></div><div class="right">${w.endsAt ? countdown(w.endsAt) : ''}</div></a>`).join('')}</div>
      </section>` : ''}
      <section class="panel">${pathHtml(h.next)}</section>
    </div>`
  ticker = setInterval(() => {
    if (!document.body.contains(el) || el.hidden) { clearInterval(ticker); ticker = null; return }
    el.querySelectorAll('[data-ends]').forEach((n) => { const t = timeLeft(Number(n.dataset.ends)); if (t) { n.textContent = t.text; n.className = 'cd ' + t.tone } })
  }, 30_000)
}
