/**
 * POLITICIAN WATCHER, on the Big Money tab: the owner's list of members of
 * Congress, what they disclosed since the last check, whether it overlaps the
 * linked account, how much of the move is gone, and a three-line paper idea.
 *
 * Reads GET /api/watcher; posts settings, "Check now" and "Log as a paper
 * plan" with the CSRF token. Kestrel sends no order from here or anywhere.
 */
import { esc } from './api.js'

const $ = (id) => document.getElementById(id)
const usd = (n) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const ny = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const date = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?')
const glyph = (s) => `<i class="cc-g s-${s}" aria-hidden="true"></i>`
const ACTION = { 'PAPER IDEA': 'info', WATCH: 'warn', 'NO ACTION': 'idle', 'REVIEW HOLDING': 'warn' }
let data = null, busy = '', msg = ''

async function post(path, body) {
  const cfg = await fetch('/api/config', { credentials: 'same-origin' }).then((r) => r.json())
  const j = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify(body || {}) }).then((r) => r.json())
  if (!j.ok) throw new Error(j.error || 'The request failed.')
  return j.data
}
async function load() {
  try { const j = await fetch('/api/watcher', { credentials: 'same-origin' }).then((r) => r.json()); if (j.ok) data = j.data } catch { /* keep the last picture */ }
  paint()
}
async function act(kind, fn) { busy = kind; msg = ''; paint(); try { msg = (await fn()) || '' } catch (e) { msg = e.message } busy = ''; await load() }

function item(i) {
  const o = i.overlap, p = i.prices, plan = i.plan
  const overlap = !o.connected ? 'Brokerage account not linked, so overlap is unknown.' : o.held ? `You hold ${o.qty} ${esc(i.ticker)} (${usd(o.marketValue)}).` : `Not in your account.`
  const move = p.movePct == null ? esc(p.note) : `${usd(p.tradeDay)} on the day they traded → ${usd(p.now)} now (<b class="${p.movePct > 0 ? 'up' : p.movePct < 0 ? 'down' : ''}">${p.movePct > 0 ? '+' : ''}${p.movePct.toFixed(1)}%</b>)`
  return `<article class="pw-item">
    <header><b>${esc(i.who)}</b><span>${[i.chamber, i.party].filter(Boolean).map(esc).join(' · ')}</span></header>
    <div class="pw-trade"><span class="cc-tag s-${i.side === 'buy' ? 'ok' : i.side === 'sell' ? 'bad' : 'idle'}">${glyph(i.side === 'buy' ? 'ok' : i.side === 'sell' ? 'bad' : 'idle')}${esc(i.side.toUpperCase())}</span><b class="pw-tk">${esc(i.ticker)}</b><span>${esc(i.range || 'size not given')}</span></div>
    <dl class="pw-facts">
      <div><dt>Traded</dt><dd>${date(i.traded)}</dd></div>
      <div><dt>Disclosed</dt><dd>${date(i.reported)}${i.lagDays != null ? ` <small>${i.lagDays} days later</small>` : ''}</dd></div>
      <div><dt>Your account</dt><dd>${overlap}</dd></div>
      <div><dt>Move since</dt><dd>${move}</dd></div>
    </dl>
    <div class="pw-plan"><span class="cc-tag s-${ACTION[plan.action] || 'idle'}">${glyph(ACTION[plan.action] || 'idle')}${esc(plan.action)}</span>
      <ol>${plan.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
      ${plan.action === 'PAPER IDEA' ? `<button class="ghost" type="button" data-pw-log="${esc(i.key)}" ${busy ? 'disabled' : ''}>Log as a paper plan in my journal</button>` : ''}
    </div>
  </article>`
}

function paint() {
  const out = $('watcher-out'); if (!out) return
  if (!data) { out.innerHTML = '<div class="card"><p class="muted">Loading the watcher…</p></div>'; return }
  const s = data.settings, r = data.latest, q = data.quiver
  out.innerHTML = `<div class="card pw">
    <div class="cc-h"><h2>Politician watcher</h2><span class="badge sc-prov">PAPER IDEAS · SENDS NO ORDERS</span>
      <span>Quiver: ${esc(q.status)}${data.filingsAsOf ? ` · filings read ${esc(ny(data.filingsAsOf))}` : ''}${r ? ` · last check ${esc(ny(r.at))}` : ''}</span></div>
    <p class="pw-lede">Runs after every filings refresh (about every three hours and at 6:00 New York) and when you press Check now. Congress has up to 45 days to disclose, so part of any move is usually gone before you hear about it. The plan is a fixed rule, not a forecast; risk is the stock desk's 1%, never above your cap.</p>
    <form id="pw-form" class="pw-form" autocomplete="off">
      <label>Politicians <input name="names" value="${esc(s.names.join(', '))}" placeholder="e.g. Nancy Pelosi, Tuberville" maxlength="600"></label>
      <label>Risk cap % <input name="riskCapPct" value="${s.riskCapPct}" inputmode="decimal" size="4"></label>
      <button class="btn" type="submit" ${busy ? 'disabled' : ''}>${busy === 'save' ? 'Saving…' : 'Save list'}</button>
      <button class="ghost" type="button" id="pw-check" ${busy || !s.names.length ? 'disabled' : ''}>${busy === 'check' ? 'Checking…' : 'Check now'}</button>
    </form>
    ${msg ? `<p class="pw-msg">${esc(msg)}</p>` : ''}
    ${!r ? `<p class="cc-empty">${s.names.length ? 'No check yet. Press Check now, or wait for the next filings refresh.' : 'Add the members of Congress you want to follow, then save.'}</p>`
      : r.nothingNew ? `<div class="pw-none"><b>Nothing new</b><span>${esc(r.note === 'Nothing new.' ? `Checked ${ny(r.at)} for ${r.names.join(', ')}.` : r.note)}</span></div>`
      : `<p class="pw-note">${esc(r.note)}</p><div class="pw-items">${r.items.map(item).join('')}</div>`}
    ${data.recent.length > 1 ? `<details class="pw-more"><summary>Earlier checks</summary><ul>${data.recent.slice(1).map((x) => `<li><time>${esc(ny(x.at))}</time> ${esc(x.note)}</li>`).join('')}</ul></details>` : ''}
  </div>`
}

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'pw-form') return
  e.preventDefault()
  const f = new FormData(e.target)
  act('save', async () => { const s = await post('/api/watcher/settings', { names: String(f.get('names') || ''), riskCapPct: f.get('riskCapPct') }); return `Saved: watching ${s.names.length ? s.names.join(', ') : 'nobody'}, risk cap ${s.riskCapPct}%.` })
})
document.addEventListener('click', (e) => {
  if (e.target.closest('#pw-check')) { e.preventDefault(); act('check', async () => { await post('/api/watcher/check'); return '' }); return }
  const lg = e.target.closest('[data-pw-log]')
  if (lg) { e.preventDefault(); act('log', async () => { await post('/api/watcher/log', { key: lg.dataset.pwLog }); return 'Logged in your journal as an open paper plan. Nothing was sent anywhere.' }) }
})

if ($('watcher-out')) load()
document.addEventListener('click', (e) => { if (e.target.closest('[data-tab="bigmoney"]')) setTimeout(load, 50) })
