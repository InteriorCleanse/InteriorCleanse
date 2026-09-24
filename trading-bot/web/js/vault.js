/**
 * THE VAULT — your real balances, behind a passcode and a six-digit code.
 *
 * The door is drawn in HTML, CSS and SVG (brushed steel, brass, bolts, a
 * combination dial and a handle wheel). It is dressing: the lock itself is on
 * the server (src/security/vault.ts), and this page only asks it. Opening the
 * vault spins the dial and wheel, draws the bolts and swings the door; under
 * reduced motion it simply opens.
 *
 * What is behind the door is READ-ONLY: the paper account (labelled PAPER) and
 * any broker you linked with read-only keys. Nothing here can place an order.
 * A broker that is not linked says so; a balance is never estimated.
 */
import { getJson, esc } from './api.js'

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const usd = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d }) : '—')
let statusTimer = null
let state = { configured: false, open: false, expiresAt: 0 }

async function postJson(path, body) {
  const cfg = await getJson('/api/config')
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify(body || {}) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`)
  return j.data
}

/* ---------------- the door ---------------- */
function dialSvg() {
  let ticks = ''
  for (let i = 0; i < 100; i++) {
    const a = (i / 100) * Math.PI * 2, long = i % 10 === 0, mid = i % 5 === 0
    const r1 = long ? 70 : mid ? 74 : 77, r2 = 82
    ticks += `<line x1="${(100 + Math.sin(a) * r1).toFixed(2)}" y1="${(100 - Math.cos(a) * r1).toFixed(2)}" x2="${(100 + Math.sin(a) * r2).toFixed(2)}" y2="${(100 - Math.cos(a) * r2).toFixed(2)}" stroke-width="${long ? 1.8 : 1}"/>`
  }
  let nums = ''
  for (let n = 0; n < 100; n += 10) {
    const a = (n / 100) * Math.PI * 2
    nums += `<text x="${(100 + Math.sin(a) * 58).toFixed(2)}" y="${(100 - Math.cos(a) * 58 + 4).toFixed(2)}">${n}</text>`
  }
  return `<svg class="vx-dial-svg" viewBox="0 0 200 200" aria-hidden="true">
    <defs>
      <radialGradient id="vxEnamel" cx="42%" cy="36%" r="75%"><stop offset="0" stop-color="#2a2d33"/><stop offset=".6" stop-color="#121418"/><stop offset="1" stop-color="#050608"/></radialGradient>
      <linearGradient id="vxGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e7b0"/><stop offset=".35" stop-color="#c79a45"/><stop offset=".6" stop-color="#fff0c2"/><stop offset="1" stop-color="#8a6526"/></linearGradient>
      <radialGradient id="vxKnob" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="#d9dde2"/><stop offset=".7" stop-color="#7d838b"/><stop offset="1" stop-color="#3b3f45"/></radialGradient>
    </defs>
    <circle cx="100" cy="100" r="96" fill="url(#vxGold)"/>
    <circle cx="100" cy="100" r="88" fill="url(#vxEnamel)"/>
    <g stroke="#e9cf86">${ticks}</g>
    <g class="vx-num" fill="#f1dca0">${nums}</g>
    <circle cx="100" cy="100" r="40" fill="url(#vxKnob)" stroke="#2a2d33" stroke-width="1"/>
    <g stroke="rgba(0,0,0,.35)" stroke-width="1.2">${Array.from({ length: 36 }, (_, i) => { const a = (i / 36) * Math.PI * 2; return `<line x1="${(100 + Math.sin(a) * 34).toFixed(2)}" y1="${(100 - Math.cos(a) * 34).toFixed(2)}" x2="${(100 + Math.sin(a) * 40).toFixed(2)}" y2="${(100 - Math.cos(a) * 40).toFixed(2)}"/>` }).join('')}</g>
  </svg>`
}

function wheelSvg() {
  const spokes = [0, 60, 120, 180, 240, 300].map((deg) => `<g transform="rotate(${deg} 150 150)">
      <rect x="143" y="30" width="14" height="100" rx="7" fill="url(#vxChrome)" stroke="rgba(0,0,0,.35)"/>
      <circle cx="150" cy="26" r="15" fill="url(#vxBall)" stroke="rgba(0,0,0,.35)"/>
    </g>`).join('')
  return `<svg class="vx-wheel-svg" viewBox="0 0 300 300" aria-hidden="true">
    <defs>
      <linearGradient id="vxChrome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a6068"/><stop offset=".3" stop-color="#f4f6f8"/><stop offset=".55" stop-color="#9aa0a8"/><stop offset=".8" stop-color="#e2e5e9"/><stop offset="1" stop-color="#4b5058"/></linearGradient>
      <radialGradient id="vxBall" cx="36%" cy="30%" r="70%"><stop offset="0" stop-color="#fff8e1"/><stop offset=".3" stop-color="#e8c878"/><stop offset=".75" stop-color="#9c7631"/><stop offset="1" stop-color="#5b4217"/></radialGradient>
      <radialGradient id="vxHub" cx="40%" cy="34%" r="70%"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".4" stop-color="#b6bcc3"/><stop offset="1" stop-color="#454a51"/></radialGradient>
    </defs>
    ${spokes}
    <circle cx="150" cy="150" r="34" fill="url(#vxHub)" stroke="rgba(0,0,0,.4)"/>
    <circle cx="150" cy="150" r="16" fill="url(#vxBall)"/>
  </svg>`
}

function ringText() {
  return `<svg class="vx-ring-svg" viewBox="0 0 400 400" aria-hidden="true">
    <defs><path id="vxRingPath" d="M200,200 m-176,0 a176,176 0 1,1 352,0 a176,176 0 1,1 -352,0"/></defs>
    <text><textPath href="#vxRingPath" startOffset="0">MR. CASH · PRIVATE RESERVE · TIME-LOCKED · TWO-KEY ENTRY · MR. CASH · PRIVATE RESERVE · TIME-LOCKED · TWO-KEY ENTRY ·</textPath></text>
  </svg>`
}

function door() {
  const bolts = Array.from({ length: 16 }, (_, i) => `<i class="vx-bolt" style="--a:${i * 22.5 + 11.25}deg"></i>`).join('')
  const rivets = Array.from({ length: 36 }, (_, i) => `<i class="vx-rivet" style="--a:${i * 10}deg"></i>`).join('')
  return `
  <div class="vx-stage">
    <div class="vx-interior" aria-hidden="true">
      <div class="vx-glow"></div>
      <div class="vx-shelf s1"><i></i><i></i><i></i></div>
      <div class="vx-shelf s2"><i></i><i></i></div>
    </div>
    <div class="vx-frame" aria-hidden="true">${rivets}</div>
    <div class="vx-door" aria-hidden="true">
      <div class="vx-face">
        ${bolts}
        <div class="vx-ring">${ringText()}</div>
        <div class="vx-wheel">${wheelSvg()}</div>
        <div class="vx-dial">${dialSvg()}</div>
        <i class="vx-pointer"></i>
        <div class="vx-plate"><b>Mr. Cash</b><span>Private vault</span></div>
      </div>
    </div>
    <i class="vx-hinge h1" aria-hidden="true"></i><i class="vx-hinge h2" aria-hidden="true"></i>
  </div>`
}

/* ---------------- the panels ---------------- */
function lockPanel(msg) {
  if (!state.configured) {
    return `<div class="vx-panel">
      <div class="vx-kicker">Two-key entry</div>
      <h2>Your vault is not set up yet</h2>
      <p>The vault opens only with a passcode you choose <em>and</em> a six-digit code from an authenticator app on your phone. Set it up once, on the computer that runs Mr. Cash:</p>
      <ol class="vx-steps">
        <li>Run <code>npm run vault:setup</code>. It prints a setup key.</li>
        <li>Add that key to your authenticator app (Google Authenticator, 1Password, Authy…).</li>
        <li>Put the two lines it shows into <code>.env</code>, choosing your passcode.</li>
        <li>Restart Mr. Cash. From then on your real balances live only in here.</li>
      </ol>
      <p class="vx-fine">Neither secret ever leaves that computer: not the repo, not a log, not this page.</p>
    </div>`
  }
  return `<form class="vx-panel" id="vx-form" autocomplete="off">
    <div class="vx-kicker">Two-key entry</div>
    <h2>Open the vault</h2>
    <label class="vx-field"><span>Passcode</span><input id="vx-pass" type="password" autocomplete="current-password" required minlength="6" maxlength="128" aria-label="Vault passcode"></label>
    <label class="vx-field"><span>Code from your authenticator app</span>
      <input id="vx-code" class="vx-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required aria-label="Six-digit code" placeholder="••••••"></label>
    <button class="btn vx-open" id="vx-submit" type="submit">Open vault</button>
    <p class="vx-msg" id="vx-msg" role="alert">${msg ? esc(msg) : ''}</p>
    <p class="vx-fine">Five wrong tries lock this device out for 15 minutes. The vault closes itself after 15 minutes idle.</p>
  </form>`
}

function acctCard(title, sub, body, cls = '', show = '') {
  return `<article class="vx-acct ${cls}"${show ? ` data-show="${show}"` : ''}><div class="vx-acct-hd"><b>${esc(title)}</b><span>${esc(sub)}</span></div>${body}</article>`
}

function balances(d) {
  const a = d.alpaca, k = d.kraken, p = d.paper
  const real = []
  if (a && a.connected && a.mode === 'LIVE' && a.account) real.push(a.account.equity)
  if (k && k.connected && k.account) real.push(k.account.totalUsd ?? k.account.equityUsd)
  const total = real.length ? real.reduce((s, v) => s + (Number(v) || 0), 0) : null
  const alpacaBody = a && a.connected && a.account
    ? `<div class="vx-big">${usd(a.account.equity)}</div><dl><dt>Cash</dt><dd>${usd(a.account.cash)}</dd><dt>Buying power</dt><dd>${usd(a.account.buyingPower)}</dd><dt>Positions</dt><dd>${a.positions.length}</dd></dl>
       ${a.positions.length ? `<ul class="vx-pos">${a.positions.slice(0, 8).map((x) => `<li><b>${esc(x.symbol)}</b><span>${x.qty} · ${usd(x.marketValue)}</span><em class="${x.unrealizedPl >= 0 ? 'up' : 'down'}">${usd(x.unrealizedPl)}</em></li>`).join('')}</ul>` : ''}`
    : `<p class="vx-none">${esc(a ? a.note : 'Not linked.')}</p>`
  const krakenBody = k && k.connected && k.account
    ? `<div class="vx-big">${usd(k.account.totalUsd ?? k.account.equityUsd)}</div>${k.holdings.length ? `<ul class="vx-pos">${k.holdings.slice(0, 10).map((h) => `<li><b>${esc(h.asset)}</b><span>${h.qty}</span></li>`).join('')}</ul>` : ''}`
    : `<p class="vx-none">${esc(k ? k.note : 'Not linked.')}</p>`
  const left = Math.max(0, Math.round((state.expiresAt - Date.now()) / 60000))
  const view = savedView()
  const tabs = [['all', 'All'], ['alpaca', 'Alpaca'], ['kraken', 'Kraken'], ['paper', 'Paper']]
  return `<div class="vx-panel vx-open-panel" data-view="${view}">
    <div class="vx-kicker">Vault open · closes in <span id="vx-left">${left}</span> min</div>
    <div class="vx-switch" role="tablist" aria-label="Which account">${tabs.map(([k, l]) => `<button type="button" role="tab" data-vx-view="${k}" aria-selected="${k === view}" class="${k === view ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="vx-total" data-show="all"><span>Held in your linked real accounts</span><b>${total === null ? 'No real account linked' : usd(total)}</b><em>read-only · as of ${new Date(d.asOf).toLocaleTimeString()}</em></div>
    <div class="vx-accts">
      ${acctCard('Alpaca', a && a.connected ? `${a.mode === 'LIVE' ? 'live account' : 'Alpaca paper account'} · read-only` : 'not linked', alpacaBody, a && a.connected ? '' : 'off', 'alpaca')}
      ${acctCard('Kraken', k && k.connected ? 'live account · read-only' : 'not linked', krakenBody, k && k.connected ? '' : 'off', 'kraken')}
      ${acctCard('Mr. Cash paper account', 'PAPER · simulated, no real money', `<div class="vx-big">${usd(p.equityUsd)}</div><dl><dt>Started with</dt><dd>${usd(p.startUsd)}</dd><dt>Closed trades</dt><dd>${p.trades}</dd><dt>Open now</dt><dd>${p.open}</dd></dl>`, 'paper', 'paper')}
    </div>
    <div class="vx-actions"><button class="btn ghost" id="vx-lock" type="button">Lock the vault</button></div>
    <p class="vx-fine">Balances are read with read-only keys. Nothing in the vault can move money or place an order.</p>
  </div>`
}

/* ---------------- the broker switcher ---------------- */
function savedView() { try { const v = localStorage.getItem('mrcash-vault-view'); return ['all', 'alpaca', 'kraken', 'paper'].includes(v) ? v : 'all' } catch { return 'all' } }
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-vx-view]')
  if (!b) return
  const panel = b.closest('.vx-open-panel'); if (!panel) return
  panel.dataset.view = b.dataset.vxView
  panel.querySelectorAll('[data-vx-view]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)) })
  try { localStorage.setItem('mrcash-vault-view', b.dataset.vxView) } catch { /* the choice just is not remembered */ }
})

/* ---------------- flow ---------------- */
function root() { return document.getElementById('vault-out') }

function renderClosed(msg) {
  const out = root(); if (!out) return
  out.innerHTML = `<div class="vx-room ${state.configured ? '' : 'unset'}">${door()}${lockPanel(msg)}</div>`
  const form = document.getElementById('vx-form')
  if (form) {
    form.addEventListener('submit', onSubmit)
    const code = document.getElementById('vx-code')
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6) })
    setTimeout(() => document.getElementById('vx-pass')?.focus(), 50)
  }
}

async function onSubmit(e) {
  e.preventDefault()
  const pass = document.getElementById('vx-pass').value
  const code = document.getElementById('vx-code').value
  const btn = document.getElementById('vx-submit'), msg = document.getElementById('vx-msg')
  btn.disabled = true; msg.textContent = ''
  try {
    const r = await postJson('/api/vault/unlock', { passcode: pass, code })
    state.open = true; state.expiresAt = r.expiresAt
    await openSequence()
  } catch (err) {
    btn.disabled = false
    msg.textContent = err.message
    const room = document.querySelector('.vx-room')
    room?.classList.remove('denied'); void room?.offsetWidth; room?.classList.add('denied')
    document.getElementById('vx-code').value = ''
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms))

async function openSequence() {
  const room = document.querySelector('.vx-room')
  const panel = room?.querySelector('.vx-panel')
  let data = null
  try { data = (await getJson('/api/vault/portfolio')).data } catch (e) { renderClosed(e.message); return }
  if (room && !REDUCED) {
    panel?.classList.add('leaving')
    room.classList.add('turning')
    await wait(1300)
    room.classList.add('unbolted')
    await wait(550)
    room.classList.add('open')
    await wait(900)
  }
  showOpen(data)
}

function showOpen(d) {
  const out = root(); if (!out) return
  out.innerHTML = `<div class="vx-room turning unbolted open is-open">${door()}${balances(d)}</div>`
  document.getElementById('vx-lock')?.addEventListener('click', lockNow)
  startStatus()
}

async function lockNow() {
  try { await postJson('/api/vault/lock', {}) } catch { /* the cookie clears either way on expiry */ }
  state.open = false
  const room = document.querySelector('.vx-room')
  if (room && !REDUCED) { room.classList.remove('is-open'); room.querySelector('.vx-panel')?.classList.add('leaving'); room.classList.remove('open'); await wait(900); room.classList.remove('unbolted'); await wait(400); room.classList.remove('turning'); await wait(500) }
  stopStatus()
  renderClosed()
}

function stopStatus() { if (statusTimer) { clearInterval(statusTimer); statusTimer = null } }
function startStatus() {
  stopStatus()
  statusTimer = setInterval(async () => {
    const tab = document.getElementById('tab-portfolio')
    if (!tab || tab.classList.contains('hidden')) { stopStatus(); return }
    try {
      const s = (await getJson('/api/vault/status')).data
      if (!s.open) { state.open = false; stopStatus(); renderClosed('The vault closed itself after a quiet spell.'); return }
      state.expiresAt = s.expiresAt
      const left = document.getElementById('vx-left'); if (left) left.textContent = String(Math.max(0, Math.round((s.expiresAt - Date.now()) / 60000)))
    } catch { /* keep showing what we have */ }
  }, 30_000)
}

async function loadVault() {
  const out = root(); if (!out) return
  try {
    state = { ...state, ...(await getJson('/api/vault/status')).data }
  } catch (e) {
    out.innerHTML = `<div class="plain">Couldn't reach the vault: ${esc(e.message)}.</div>`
    return
  }
  if (state.open) {
    try { showOpen((await getJson('/api/vault/portfolio')).data); return } catch { state.open = false }
  }
  renderClosed()
}
window.loadVaultRoom = loadVault
