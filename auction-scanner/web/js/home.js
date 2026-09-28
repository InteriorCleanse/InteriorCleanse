// Home: the command centre. What is ending soon, what the Sniper found, what you watch,
// how the practice and the business are going, and the one next thing to do.
import { getJson, esc, money, timeLeft, when } from './api.js'
import { stamp, loading, errorStrip, sourceName } from './ui.js'

const GOAL = { rental: 'Building a rental fleet', flip: 'Flipping cars', keep: 'Finding your next car' }
let ticker = null

function tile(label, value, sub, href, tone = '') {
  return `<a class="tile big ${tone}" href="${href}"><div class="k mono">${esc(label)}</div><div class="v">${value}</div><div class="s">${esc(sub)}</div></a>`
}

function countdown(ms) {
  const t = timeLeft(ms)
  return t ? `<span class="cd ${t.tone}" data-ends="${ms}">${esc(t.text)}</span>` : '<span class="cd dim">No end time</span>'
}

export async function render(el, ctx) {
  if (ticker) { clearInterval(ticker); ticker = null }
  el.innerHTML = `<div class="head"><div><h1>Home</h1></div></div>${loading('Pulling everything together…')}`
  let h
  try { h = await getJson('/api/home') } catch (e) { el.innerHTML += errorStrip(e.message); return }
  if (!h.onboarded && !sessionStorage.getItem('gavel-setup-skipped')) { location.hash = '#setup'; return }
  const nextUp = h.next.find((n) => !n.done)
  const done = h.next.filter((n) => n.done).length
  const netTone = h.garage.netUsd > 0 ? 'go' : h.garage.netUsd < 0 ? 'hot' : ''
  el.innerHTML = `<div class="head"><div><h1>Home</h1><p>${esc(h.goal ? GOAL[h.goal] : 'Your auction desk')}. ${h.liveSource ? 'Reading live auctions.' : 'No live source yet, so the feed shows SAMPLE cars.'}</p></div>
      <div class="row"><a class="btn" href="#sniper">Sniper</a><a class="btn outline" href="#feed">Browse the feed</a></div></div>
    ${nextUp ? `<a class="tag nextup" href="${esc(nextUp.href)}"><div class="body" style="padding:16px 18px"><div class="mono dim">Next step · ${done} of ${h.next.length} done</div><h2 class="nt">${esc(nextUp.title)}</h2><p style="margin:4px 0 0">${esc(nextUp.body)}</p></div><span class="go-arrow" aria-hidden="true">→</span></a>` : ''}
    <div class="tiles four">
      ${tile('Sniper', `${h.sniper.active}`, `${h.sniper.active === 1 ? 'target' : 'targets'} hunting · ${h.sniper.picks} pick${h.sniper.picks === 1 ? '' : 's'}`, '#sniper')}
      ${tile('Alerts', `${h.alerts.unread}`, h.alerts.unread ? 'new since you looked' : 'all caught up', '#sniper', h.alerts.unread ? 'hot' : '')}
      ${tile('Paper record', `${h.paper.won}<small>/${h.paper.won + h.paper.lost}</small>`, `won of decided · ${h.paper.open} open`, '#watch')}
      ${tile('Garage net', esc(money(h.garage.netUsd)), `${h.garage.cars} car${h.garage.cars === 1 ? '' : 's'} · ${esc(money(h.garage.incomeUsd))} in`, '#garage', netTone)}
    </div>
    <div class="homegrid">
      <section class="panel">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">Ending soon</h2><a class="mono" href="#sniper">All picks</a></div>
        ${h.sniper.endingSoon.length ? `<div class="list">${h.sniper.endingSoon.map((p) => { const l = p.card.listing; return `<a class="item row-link" href="#plan/${encodeURIComponent(l.id)}"><div class="main"><b>${esc(l.title)}</b>${l.kind === 'SAMPLE' ? ' ' + stamp('Sample', 'hot') : ''}<div class="mono dim">${esc(sourceName(l.source))} · now ${esc(money(l.currentBidUsd ?? l.buyNowUsd))} · never above ${esc(money(p.fire.maxBidUsd))}</div></div><div class="right">${countdown(l.endsAt)}<div class="mono dim">score ${p.card.score.total}</div></div></a>` }).join('')}</div>` : `<p class="dim">${h.sniper.active ? 'Nothing with a clock on it right now. The Sniper keeps looking.' : 'Set a Sniper target and the cars it finds will count down here.'}</p>`}
      </section>
      <section class="panel">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">Latest alerts</h2>${h.alerts.unread ? `<span class="pill hot">${h.alerts.unread} new</span>` : ''}</div>
        ${h.alerts.latest.length ? `<div class="list">${h.alerts.latest.map((a) => `<a class="item row-link ${a.read ? '' : 'unread'}" href="${a.listingId ? '#plan/' + encodeURIComponent(a.listingId) : '#sniper'}"><div class="main"><b>${esc(a.title)}</b><div class="mono dim">${esc(when(a.at))}</div></div></a>`).join('')}</div>` : '<p class="dim">The Sniper writes here when it finds a pick or fires a paper bid.</p>'}
      </section>
      <section class="panel">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">Watching</h2><a class="mono" href="#watch">Watchlist</a></div>
        ${h.watch.length ? `<div class="list">${h.watch.map((w) => `<a class="item row-link" href="#plan/${encodeURIComponent(w.listingId)}"><div class="main"><b>${esc(w.title)}</b><div class="mono dim">${w.priceUsd ? 'saved at ' + esc(money(w.priceUsd)) : ''}</div></div><div class="right">${w.endsAt ? countdown(w.endsAt) : ''}</div></a>`).join('')}</div>` : '<p class="dim">Press Watch on any car and it counts down here.</p>'}
      </section>
      <section class="panel">
        <h2>Your path</h2>
        <ol class="path">${h.next.map((n) => `<li class="${n.done ? 'done' : ''}"><a href="${esc(n.href)}"><span class="tick" aria-hidden="true">${n.done ? '✓' : ''}</span><span><b>${esc(n.title)}</b><span class="dim">${esc(n.body)}</span></span></a><span class="sr-only">${n.done ? 'done' : 'to do'}</span></li>`).join('')}</ol>
      </section>
    </div>`
  ticker = setInterval(() => {
    if (!document.body.contains(el) || el.hidden) { clearInterval(ticker); ticker = null; return }
    el.querySelectorAll('[data-ends]').forEach((n) => { const t = timeLeft(Number(n.dataset.ends)); if (t) { n.textContent = t.text; n.className = 'cd ' + t.tone } })
  }, 30_000)
}
