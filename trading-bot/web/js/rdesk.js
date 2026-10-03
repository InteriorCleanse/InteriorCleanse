/**
 * THE RESEARCH DESK — six roles in one room, and at most three decision cards a day.
 *
 * Reads GET /api/rdesk; posts to /config, /choice, /drill; reads /dryrun.
 * Research only: nothing on this page trades or reaches the engine. Every
 * decision is the owner's.
 */
import { esc, nyTime } from './api.js'

const $ = (id) => document.getElementById(id)
const ROLES = [
  ['Scout', 'the scanner', 'Checks the watchlist on a schedule against your rules.'],
  ['Hunter', 'the checklist', 'Scores each flag against your six-line checklist.'],
  ['Reporter', 'news and mood', 'Finds why it moved: confirmed news or a rumour.'],
  ['Whale', 'big money', 'Insider buying and selling from public filings.'],
  ['Skeptic', 'the risk officer', 'Argues against every idea and checks your limits.'],
  ['Chief', 'head of desk', 'Sends you at most three decision cards a day.'],
]
const KIND = { crypto: 'Crypto', forex: 'Forex', stock: 'Stocks', index: 'Funds' }
let snap = null, err = null, busy = '', dry = null, drill = null, loadedAt = 0, dirty = false

async function csrf() { const cfg = await fetch('/api/config', { credentials: 'same-origin' }).then((r) => r.json()); return cfg.csrf }
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': await csrf() }, body: JSON.stringify(body || {}) })
  const j = await r.json(); if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`); return j.data
}
async function load() {
  try { const j = await fetch('/api/rdesk', { credentials: 'same-origin' }).then((r) => r.json()); if (!j.ok) throw new Error(j.error); snap = j.data; err = null; loadedAt = Date.now() } catch (e) { err = e.message }
  paint()
}

const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const initials = (w) => w.slice(0, 2).toUpperCase()

function card(c) {
  const row = (k, v) => `<div class="rk-row"><dt>${k}</dt><dd>${v}</dd></div>`
  return `<article class="rk-card ${c.choice ? 'done' : ''}">
    <div class="rk-card-hd"><span class="rk-label">DECISION CARD</span><b>${esc(c.label)}</b><span class="badge sc-prov">RESEARCH</span><button type="button" class="web-check" data-web-preset="catalyst" data-web-symbol="${esc(String(c.key).split(':').pop())}" title="Ask the web what is behind this move (AI research, not a signal)">Check the web</button></div>
    <dl>
      ${row('What happened', esc(c.whatHappened))}
      ${row('Why', esc(c.why))}
      ${row('Big money', esc(c.bigMoney))}
      ${row('Fit', esc(c.fit))}
      ${row('Against it', esc(c.against))}
      ${row('What proves it wrong', esc(c.provesWrong))}
      ${row('Limits', `<span class="badge good">${esc(c.limits)}</span>`)}
      ${row('Sources', c.sources.length ? c.sources.map((s) => `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${esc(s.source)}</a> <small>${esc(nyTime(s.time))} ET</small>`).join(' · ') : '—')}
    </dl>
    <footer><span class="muted">Your options:</span>${[['research', 'Research more'], ['watch', 'Add to watch'], ['ignore', 'Ignore']].map(([k, l]) => `<button type="button" class="chip ${c.choice === k ? 'on' : ''}" data-choice="${k}" data-id="${esc(c.id)}">${l}</button>`).join('')}<small class="muted">${esc(nyTime(c.at))} ET · click the sources before you decide</small></footer>
  </article>`
}

function room(log) {
  if (!log.length) return '<p class="muted">The room is quiet: no scan has run yet. The first scheduled scan is on the list below, or run the fire drill.</p>'
  return `<ol class="rk-chat">${log.slice(0, 60).map((p) => `<li class="rk-msg who-${p.who.toLowerCase()}"><span class="rk-av" aria-hidden="true">${initials(p.who)}</span><div><div class="rk-meta"><b>${esc(p.who)}</b><time>${esc(time(p.at))}</time>${p.tag && p.tag.length ? `<span class="rk-tags">${p.tag.map((t) => `@${esc(t)}`).join(' ')}</span>` : ''}</div><p>${esc(p.text)}</p></div></li>`).join('')}</ol>`
}

function files(s) {
  const c = s.config
  const n = (name, v, step, min, max, label) => `<label class="rk-in"><span>${label}</span><input type="number" name="${name}" value="${esc(v)}" step="${step}" min="${min}" max="${max}"></label>`
  const byKind = {}
  for (const m of s.markets) (byKind[m.kind] ||= []).push(m)
  return `<form id="rk-files" class="rk-files">
    <fieldset><legend>watchlist.md <small>tick what the desk watches; none ticked means every watched market</small></legend>
      ${Object.entries(byKind).map(([k, ms]) => `<div class="rk-wl"><b>${esc(KIND[k] || k)}</b>${ms.map((m) => `<label class="rk-check"><input type="checkbox" name="wl" value="${esc(m.key)}" ${c.watchlist.includes(m.key) ? 'checked' : ''}> ${esc(m.label)}</label>`).join('')}</div>`).join('') || '<p class="muted">The market watch has no rows yet.</p>'}
    </fieldset>
    <fieldset><legend>rules.md <small>when Scout flags something</small></legend>
      ${n('stockMovePct', c.rules.stockMovePct, 0.5, 0.5, 50, 'Stock or fund moves at least (%)')}${n('coinMovePct', c.rules.coinMovePct, 0.5, 0.5, 80, 'Coin moves in 24h at least (%)')}${n('fxMovePct', c.rules.fxMovePct, 0.1, 0.1, 20, 'Currency pair moves at least (%)')}${n('volumeMult', c.rules.volumeMult, 0.1, 1.1, 20, 'Volume at least (× usual)')}
      <label class="rk-check"><input type="checkbox" name="extremes" ${c.rules.extremes ? 'checked' : ''}> Flag a new high or low of the stored window</label>
    </fieldset>
    <fieldset><legend>setups.md <small>your checklist; Hunter never changes it</small></legend>
      <ol class="rk-list"><li>Is there a confirmed news reason?</li><li>Is it a company or project I actually understand? <small>(tick below)</small></li><li>Is the move in the same direction as the stored window's trend?</li><li>No earnings or big scheduled event in the next 7 days?</li><li>Is volume above normal?</li><li>Could I explain this idea to a friend in two sentences? <small>(yours, on the card)</small></li></ol>
      <div class="rk-wl"><b>I understand</b>${s.markets.map((m) => `<label class="rk-check"><input type="checkbox" name="und" value="${esc(m.key)}" ${c.understood.includes(m.key) ? 'checked' : ''}> ${esc(m.label)}</label>`).join('')}</div>
      ${n('minPass', c.minPass, 1, 1, 6, 'Lines that must PASS before Chief considers it')}
    </fieldset>
    <fieldset><legend>risk-limits.md <small>Skeptic checks every idea against these</small></legend>
      ${n('maxCardsPerDay', c.limits.maxCardsPerDay, 1, 0, 10, 'Decision cards a day, at most')}${n('maxNewIdeasPerWeek', c.limits.maxNewIdeasPerWeek, 1, 0, 50, 'New ideas a week, at most')}
      <div class="rk-wl"><b>No ideas about</b>${Object.entries(KIND).map(([k, l]) => `<label class="rk-check"><input type="checkbox" name="ex" value="${k}" ${c.limits.excludeKinds.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <p class="muted">The guide's other lines stay yours to keep: no borrowed money, no options, nothing you cannot explain in one sentence, and review the same day if an idea goes against you by your line.</p>
    </fieldset>
    <div class="row"><button class="btn" type="submit" ${busy === 'save' ? 'disabled' : ''}>${busy === 'save' ? 'Saving…' : 'Save my files'}</button>${dirty ? '<span class="muted">Unsaved changes</span>' : ''}</div>
  </form>`
}

function paint() {
  const root = $('rdesk-out'); if (!root) return
  if (!snap) { root.innerHTML = err ? `<div class="card"><p class="pl-err">${esc(err)}</p></div>` : '<div class="card"><p class="muted">Opening the desk…</p></div>'; return }
  const s = snap
  const form = $('rk-files'); const keep = form && form.contains(document.activeElement)
  const last = {}; for (const p of s.log) if (!last[p.who]) last[p.who] = p.at
  const next = s.schedule.map((x) => `${x.who} ${x.at} ${x.days === 'every day' ? 'daily' : x.days === 'Sundays' ? 'Sun' : 'Mon–Fri'}`).join(' · ')
  const html = `
  <div class="card rk-hero">
    <div class="rd-kicker">Research desk · six roles, your rules · <span class="badge sc-prov">RESEARCH ONLY</span></div>
    <h2 class="rk-big">${s.cardsToday.length ? `${s.cardsToday.length} decision card${s.cardsToday.length === 1 ? '' : 's'} today` : 'Nothing needs you today'}</h2>
    <p class="rd-line">Scout flags, Hunter scores, Reporter explains, Whale adds the big-money angle, Skeptic tries to kill it, and Chief sends you only what survives: at most ${s.config.limits.maxCardsPerDay} a day. ${s.heldToday.length ? `${s.heldToday.length} idea${s.heldToday.length === 1 ? '' : 's'} were logged today and not sent.` : ''}</p>
    <div class="rk-roles">${ROLES.map(([w, t, d]) => `<div class="rk-role who-${w.toLowerCase()}" title="${esc(d)}"><span class="rk-av">${initials(w)}</span><b>${w}</b><small>${t}</small><em>${last[w] ? `last ${time(last[w])}` : 'quiet'}</em></div>`).join('')}</div>
    <div class="row"><button class="chip" id="rk-drill" type="button" ${busy === 'drill' ? 'disabled' : ''}>${busy === 'drill' ? 'Running…' : 'Fire drill: scan now'}</button><button class="chip" id="rk-dry" type="button" ${busy === 'dry' ? 'disabled' : ''}>${busy === 'dry' ? 'Replaying…' : 'Dry-run my rules'}</button></div>
    ${drill ? `<p class="muted">Fire drill: ${drill.steps.map((x) => `${esc(x.step)} ${x.ms} ms`).join(' · ')}. ${drill.cards.length ? `${drill.cards.length} card${drill.cards.length === 1 ? '' : 's'} sent.` : 'Nothing qualified.'}</p>` : ''}
    <p class="muted rd-note">Schedule (New York time): ${esc(next)}.</p>
  </div>
  ${s.cardsToday.length ? `<div class="rk-cards">${s.cardsToday.map(card).join('')}</div>` : ''}
  ${dry ? `<div class="card"><h2>Dry run: how noisy are my rules? <span class="badge sc-prov">STORED HISTORY</span></h2><p class="rd-line">${esc(dry.advice)}</p><div class="scroll"><table class="pd-tbl"><thead><tr><th>Day</th><th class="num">Flags</th><th>Which</th></tr></thead><tbody>${dry.byDay.slice().reverse().map((d) => `<tr><td>${esc(d.day)}</td><td class="num">${d.flags}</td><td>${esc(d.which.slice(0, 6).join(', '))}${d.which.length > 6 ? '…' : ''}</td></tr>`).join('')}</tbody></table></div><p class="muted pl-note">${dry.daysChecked} stored days replayed. The guide's target is 0 to 3 flags a day.</p></div>` : ''}
  <div class="rk-two">
    <div class="card"><h2>The room <span class="muted">newest first</span></h2>${room(s.log)}</div>
    <div>
      <div class="card"><h2>Logged, not sent</h2>${s.heldToday.length ? `<ul class="rk-held">${s.heldToday.map((h) => `<li><b>${esc(h.label)}</b><span>${esc(h.why)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing held today.</p>'}</div>
      <div class="card"><h2>Scorecard <span class="badge sc-prov">5 and 20 market days later</span></h2><table class="pd-tbl"><thead><tr><th>Alert rule</th><th class="num">Cards</th><th class="num">+5d went the flag's way</th><th class="num">+20d</th></tr></thead><tbody>${s.scorecard.map((r) => `<tr><td>${esc(r.rule)}</td><td class="num">${r.cards}</td><td class="num">${r.checked5 ? `${r.followed5}/${r.checked5}` : '—'}</td><td class="num">${r.checked20 ? `${r.followed20}/${r.checked20}` : '—'}</td></tr>`).join('')}</tbody></table><p class="muted pl-note">${s.scorecard.every((r) => r.status !== 'OK') ? 'NOT ENOUGH DATA: under 10 checked cards per rule. ' : ''}A tally, not advice: it shows which of your rules catch real moves and which only make noise.</p></div>
      ${s.review ? `<div class="card"><h2>Chief's weekly review <small class="muted">${esc(nyTime(s.review.at))} ET</small></h2><ul class="cd-how">${s.review.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
    </div>
  </div>
  ${s.cards.length > s.cardsToday.length ? `<div class="card"><h2>Earlier cards</h2><ul class="rk-held">${s.cards.filter((c) => !s.cardsToday.some((t) => t.id === c.id)).map((c) => `<li><b>${esc(c.label)}</b><span>${esc(nyTime(c.at))} ET · ${esc(c.fit)} · ${c.choice ? `you chose: ${esc(c.choice)}` : 'no choice recorded'}</span></li>`).join('')}</ul></div>` : ''}
  <div class="card"><h2>Your files <span class="badge sc-prov">ONLY YOU CHANGE THESE</span></h2>${files(s)}</div>
  <div class="card"><h2>What will not happen</h2><ul class="cd-how">
    <li>Nothing here trades, logs into a broker or moves money. The desk reads public data and writes cards; you decide.</li>
    <li>No role edits your files. Chief's weekly review suggests; it never changes a rule.</li>
    <li>History is the stored window, days rather than months. The guide's "12-month high" and "3-month trend" are measured over what is stored, and every card says so.</li>
    <li>A card is a starting point. Click the sources before you act.</li>
  </ul><p class="muted pl-note">${esc(s.note)}</p></div>`
  if (keep) { const f = root.querySelector('#rk-files'); root.innerHTML = html; if (f) root.querySelector('#rk-files').replaceWith(f) } else root.innerHTML = html
}

function readForm(f) {
  const fd = new FormData(f)
  const num = (k) => Number(fd.get(k))
  return {
    watchlist: fd.getAll('wl').map(String), understood: fd.getAll('und').map(String), minPass: num('minPass'),
    rules: { stockMovePct: num('stockMovePct'), coinMovePct: num('coinMovePct'), fxMovePct: num('fxMovePct'), volumeMult: num('volumeMult'), extremes: fd.get('extremes') === 'on' },
    limits: { maxCardsPerDay: num('maxCardsPerDay'), maxNewIdeasPerWeek: num('maxNewIdeasPerWeek'), excludeKinds: fd.getAll('ex').map(String) },
  }
}

function init() {
  const section = $('tab-rdesk'); if (!section) return
  section.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return
    try {
      if (b.id === 'rk-drill') { busy = 'drill'; paint(); drill = await post('/api/rdesk/drill'); busy = ''; await load() }
      else if (b.id === 'rk-dry') { busy = 'dry'; paint(); const j = await fetch('/api/rdesk/dryrun', { credentials: 'same-origin' }).then((r) => r.json()); dry = j.ok ? j.data : null; busy = ''; paint() }
      else if (b.dataset.choice) { await post('/api/rdesk/choice', { id: b.dataset.id, choice: b.dataset.choice }); await load() }
    } catch (x) { busy = ''; err = x.message; paint() }
  })
  section.addEventListener('input', (e) => { if (e.target.closest('#rk-files')) dirty = true })
  section.addEventListener('submit', async (e) => {
    if (e.target.id !== 'rk-files') return
    e.preventDefault()
    busy = 'save'; paint()
    try { await post('/api/rdesk/config', readForm(e.target)); dirty = false } catch (x) { err = x.message } finally { busy = ''; await load() }
  })
  new MutationObserver(() => { if (!section.classList.contains('hidden') && Date.now() - loadedAt > 60_000) load() }).observe(section, { attributes: true, attributeFilter: ['class'] })
  if (!section.classList.contains('hidden')) load()
  setInterval(() => { if (!section.classList.contains('hidden') && !document.hidden && !dirty && Date.now() - loadedAt > 60_000) load() }, 30_000)
}

init()
