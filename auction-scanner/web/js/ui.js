// Shared pieces of the interface: toasts, sheets, the grade stamp, the score
// stub and the lot-tag card. Every string from the server passes through esc().
import { houseName } from './houses.js'
import { esc, money, moneyK, miles, pct, safeUrl, closesText, reducedMotion } from './api.js'

export function toast(text, tone = '') {
  const root = document.getElementById('toasts')
  const t = document.createElement('div')
  t.className = 'toast ' + tone
  t.textContent = text
  // One message at a time: a fixed mistake's warning never lingers next to what happened since.
  root.replaceChildren(t)
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), reducedMotion() ? 0 : 200) }, 6000)
}

/** A bottom sheet (phone) or centred dialog (desktop). Returns close(). */
export function sheet(html, { label = 'Dialog' } = {}) {
  const root = document.getElementById('sheet-root')
  root.innerHTML = `<div class="scrim" role="presentation"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${html}</div></div>`
  const scrim = root.firstElementChild
  const dlg = scrim.firstElementChild
  const previous = document.activeElement
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    const done = () => {
      // A new sheet opened in the meantime stays open.
      if (root.firstElementChild === scrim) { root.classList.remove('closing'); root.innerHTML = '' }
      if (previous && previous.focus) previous.focus()
    }
    // The sheet slides away before it goes; with reduced motion it simply goes.
    if (reducedMotion()) return done()
    root.classList.add('closing')
    setTimeout(done, 200)
  }
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close() })
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
    if (e.key === 'Tab') {
      const f = [...dlg.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  })
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close))
  const first = dlg.querySelector('button, [href], input, select, textarea')
  ;(first || dlg).focus()
  return close
}

const GRADE_TONE = { steal: 'go', 'good deal': 'go', fair: 'wait', pass: '', unpriced: 'hollow' }
const GRADE_WORD = { steal: 'Steal', 'good deal': 'Good deal', fair: 'Fair', pass: 'Pass', unpriced: 'Unpriced' }

/** A car's name, escaped, with hyphenated model names (MX-5, F-150) kept on one line. */
export function carName(title) {
  return esc(title).replace(/(\S+-\S+)/g, '<span class="nw">$1</span>')
}

export function stamp(word, tone = '', extra = '') {
  return `<span class="stamp ${tone} ${extra}">${esc(word)}</span>`
}

/** The tear-off stub: label, discount, numeral, /100, ten ticks, the grade stamp. */
export function stub(score, { big = false } = {}) {
  const g = score.grade
  const n = g === 'unpriced' ? '—' : String(score.total)
  const filled = g === 'unpriced' ? 0 : Math.round(score.total / 10)
  const ticks = Array.from({ length: 10 }, (_, i) => `<i class="${i < filled ? 'on' : ''}" style="--k:${i}"></i>`).join('')
  const disc = typeof score.discount === 'number' ? `<span class="mono dim">${esc(pct(score.discount))} under comps</span>` : ''
  const sr = g === 'unpriced' ? 'Not scored: not enough comparable cars.' : `Steal score ${score.total} out of 100, ${GRADE_WORD[g]}${typeof score.discount === 'number' ? `, ${pct(score.discount)} under comparable listings` : ''}.`
  return `<div class="stub" role="img" aria-label="${esc(sr)}">
    <span class="mono dim">Steal score</span>${disc}
    <span class="n${big ? ' stub-n' : ''}" aria-hidden="true">${n}</span><span class="mono dim" aria-hidden="true">/100</span>
    <span class="ticks" aria-hidden="true">${ticks}</span>
    ${stamp(GRADE_WORD[g], GRADE_TONE[g], reducedMotion() ? '' : 'press')}
  </div>`
}

function initials(l) {
  const s = (l.make || l.title || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return s || '?'
}

function titleStatusBadge(t) {
  if (t === 'clean') return `<span class="badge go">Clean title</span>`
  if (t === 'unknown') return `<span class="badge wait">Title not stated</span>`
  return `<span class="badge hot">${esc(t)} title</span>`
}
function damageBadge(d) {
  if (d === 'none') return `<span class="badge go">No damage</span>`
  if (d === 'minor') return `<span class="badge">Minor damage</span>`
  if (d === 'unknown') return `<span class="badge wait">Damage not stated</span>`
  return `<span class="badge hot">${esc(d)} damage</span>`
}
function runsBadge(r) {
  if (r === true) return `<span class="badge go">Runs &amp; drives</span>`
  if (r === false) return `<span class="badge hot">Does not run</span>`
  return `<span class="badge wait">Runs? not stated</span>`
}

export function badges(l, now = Date.now(), { clock = true } = {}) {
  const out = [titleStatusBadge(l.titleStatus), damageBadge(l.damage), runsBadge(l.runsAndDrives)]
  if (l.hasKeys === true) out.push('<span class="badge">Keys</span>')
  const t = clock ? closesText(l, now) : null
  if (t) out.push(`<span class="badge ${t.tone === 'dim' ? '' : t.tone}">${esc(t.text)}</span>`)
  else if (l.saleType === 'buy-now') out.push('<span class="badge">Buy now</span>')
  return `<div class="badges">${out.join('')}</div>`
}

export function sourceName(id) {
  return houseName(id)
}

/**
 * One lot tag. `card` = {listing, estimate, score, demand?}. `opts.watched`
 * marks the pin, `opts.showBlocks` prints why starter mode would hide it.
 */
export function cardHtml(card, opts = {}) {
  const l = card.listing
  const sample = l.kind === 'SAMPLE'
  const photo = safeUrl(l.photos && l.photos[0])
  const t = closesText(l)
  const lot = `<span class="lot mono">${esc(sourceName(l.source))}${t ? ' · ' + esc(t.text.replace('Ends in ', '')) : ''}</span>`
  const photoHtml = photo
    ? `<img src="${esc(photo)}" alt="" loading="lazy" />`
    : `<div class="plate" aria-hidden="true">${esc(initials(l))}<small>${sample ? 'Sample — no photo' : 'No photo from the source'}</small></div>`
  const asking = typeof l.currentBidUsd === 'number' ? l.currentBidUsd : l.buyNowUsd
  const priceLabel = typeof l.currentBidUsd === 'number' ? 'Current bid' : typeof l.buyNowUsd === 'number' ? 'Buy now' : 'Price'
  const bidsNote = typeof l.currentBidUsd === 'number' ? `${typeof l.bidCount === 'number' ? l.bidCount + ' bids · ' : ''}not the final price` : (typeof l.buyNowUsd === 'number' && typeof l.currentBidUsd === 'number' ? `or buy now ${money(l.buyNowUsd)}` : '')
  const est = card.estimate
  const compsHtml = est.ok
    ? `<div><span class="k mono">Comps</span><div class="comps">${esc(money(est.valueUsd))}</div><div class="receipt mono">${esc(moneyK(est.low))}–${esc(moneyK(est.high))} · ${est.comps} comps</div></div>`
    : `<div><span class="k mono">Comps</span><div class="comps nocomps">Not enough comps</div><div class="receipt mono">${esc(String(est.comps))} found · 3 needed${sample ? '' : ` · <a href="#plan/${encodeURIComponent(l.id)}">price it yourself</a>`}</div></div>`
  const sub = [miles(l.mileage), l.location && [l.location.city, l.location.state].filter(Boolean).join(', '), l.vin ? 'VIN ' + l.vin.slice(-6) : null].filter(Boolean).join(' · ')
  // The badges and the price line already say these; the card shows the rest, and every reason stays one tap away.
  const said = /^(Clean title|No damage|Seller says it runs|Current bid, not the final|How the score works|On the demand list)/
  const reasons = card.score.reasons || []
  const lead = reasons.filter((r) => !said.test(r)).slice(0, 2)
  // The demand line is shown in its own words below, so it is not repeated in the full list.
  const rest = reasons.filter((r) => !lead.includes(r) && !(card.demand && /^On the demand list/.test(r)))
  const why = lead.map((r) => `<li>${esc(r)}</li>`).join('')
  const moreN = rest.length
  const flags = (card.score.redFlags || []).filter((f) => !/^SAMPLE/.test(f))
  const flagsHtml = flags.length ? `<div class="flags"><span class="k mono">Red flags</span><ul>${flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''
  const blocks = opts.showBlocks && !card.score.starterOk ? `<div class="strip wait" style="margin:12px 0 0">Starter mode would hide this: ${esc(card.score.starterBlocks.join(' '))}</div>` : ''
  const demand = card.demand ? `<li><b>${esc((card.demand.tags || [card.demand.tier]).map((t) => t === 'holds-value' ? 'Holds value' : t[0].toUpperCase() + t.slice(1)).join(' · '))}:</b> ${esc(card.demand.why)}</li>` : ''
  // A sample has no lot to open, so no button that cannot be pressed.
  const openBtn = sample
    ? ''
    : safeUrl(l.url) ? `<a class="btn outline sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Open the lot ↗</a>` : ''
  return `<article class="tag settle" data-id="${esc(l.id)}">
    ${sample ? '<div class="band">Sample. Not a real car.</div>' : ''}
    <div class="photo">${photoHtml}${lot}${sample ? stamp('Sample', 'hot') : ''}</div>
    <div class="tagbody">
      <div class="body">
        <h3 class="title">${carName(l.title)}</h3>
        <div class="subline mono">${esc(sub || '')}</div>
        <div class="money">
          <div><span class="k mono">${priceLabel}</span><div class="now">${esc(money(asking))}</div><div class="receipt mono">${esc(bidsNote)}</div></div>
          ${compsHtml}
        </div>
        ${badges(l, Date.now(), { clock: false })}
        <ul class="why">${why}${demand}</ul>
        ${moreN ? `<button class="more" type="button" data-more>${moreN} more reason${moreN === 1 ? '' : 's'}</button><ul class="why" data-more-list hidden>${rest.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        ${flagsHtml}
        ${blocks}
        <div class="actions">
          <a class="btn sm" href="#plan/${encodeURIComponent(l.id)}">Plan my bid</a>
          ${openBtn}
          <button class="btn outline sm ${opts.watched ? 'on' : ''}" type="button" data-watch aria-pressed="${opts.watched ? 'true' : 'false'}">${opts.watched ? 'Watching' : 'Watch'}</button>
        </div>
      </div>
      ${stub(card.score)}
    </div>
  </article>`
}

/** Wire the buttons inside rendered cards. */
export function wireCards(root, { onWatch } = {}) {
  root.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => {
    const list = b.nextElementSibling
    list.hidden = !list.hidden
    b.textContent = list.hidden ? b.textContent.replace('Fewer', `${list.children.length} more`) : 'Fewer reasons'
  }))
  root.querySelectorAll('[data-watch]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('[data-id]').dataset.id
    const on = b.getAttribute('aria-pressed') === 'true'
    b.disabled = true
    try {
      await onWatch(id, !on)
      b.setAttribute('aria-pressed', String(!on))
      b.classList.toggle('on', !on)
      b.textContent = !on ? 'Watching' : 'Watch'
    } catch (e) { toast(e.message, 'hot') } finally { b.disabled = false }
  }))
}

export function loading(text) { return `<div class="loading mono">${esc(text)}</div>` }
export function errorStrip(text) { return `<div class="strip">${esc(text)}</div>` }
