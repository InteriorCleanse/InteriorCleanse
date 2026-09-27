// Boot and routing. One page, screens switched by the URL hash.
import { getJson, postJson, setCsrf, esc } from './api.js'
import { toast } from './ui.js'
import * as feed from './feed.js'
import * as plan from './plan.js'
import * as watch from './watch.js'
import * as auctions from './auctions.js'
import * as playbook from './playbook.js'
import * as rental from './rental.js'
import * as settings from './settings.js'
import * as admin from './admin.js'

const SCREENS = { feed, plan, watch, auctions, playbook, rental, settings, admin }
const ctx = { me: null, feedKind: null }

function route() {
  const raw = location.hash.replace(/^#/, '') || 'feed'
  const [name, ...rest] = raw.split('/')
  const screen = SCREENS[name] ? name : 'feed'
  if (screen === 'admin' && ctx.me && ctx.me.role !== 'owner') { location.hash = '#feed'; return }
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.dataset.screen !== screen })
  document.querySelectorAll('.tabs a').forEach((a) => {
    const active = a.dataset.tab === screen || (screen === 'plan' && a.dataset.tab === 'feed')
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current')
  })
  const root = document.getElementById('screen-' + screen)
  SCREENS[screen].render(root, ctx, rest.map(decodeURIComponent))
  window.scrollTo({ top: 0, behavior: 'auto' })
  const main = document.getElementById('main')
  main.setAttribute('aria-label', screen[0].toUpperCase() + screen.slice(1))
}

export function setMode(kind, detail) {
  const chip = document.getElementById('mode-chip')
  chip.className = 'chip ' + (kind === 'LIVE' ? 'go' : kind === 'SAMPLE' ? 'hot' : '')
  chip.textContent = kind === 'LIVE' ? `Live · ${detail || 'source'}` : kind === 'SAMPLE' ? 'Sample data' : 'No source'
  chip.title = kind === 'LIVE' ? 'These are real listings from a connected source.' : kind === 'SAMPLE' ? 'These cars are SAMPLES. They are not real. Connect a source in Settings.' : 'No source is connected. See Settings.'
  ctx.feedKind = kind
}

function accountMenu() {
  const btn = document.getElementById('account-btn')
  const menu = document.getElementById('account-menu')
  const owner = ctx.me.role === 'owner'
  btn.textContent = (ctx.me.email || 'o')[0].toUpperCase()
  menu.innerHTML = `<div class="who dim">${esc(ctx.me.email)} · ${owner ? 'owner' : 'member'}</div>
    <a href="#settings" role="menuitem">Settings &amp; sources</a>
    ${owner ? '<a href="#admin" role="menuitem">Members (admin)</a>' : ''}
    <button type="button" role="menuitem" id="signout">Sign out</button>`
  const toggle = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)) }
  btn.addEventListener('click', () => toggle(menu.hidden))
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) toggle(false) })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false) })
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggle(false)))
  menu.querySelector('#signout').addEventListener('click', async () => {
    try { await postJson('/api/logout', {}) } catch { /* the cookie is gone either way */ }
    location.href = '/login'
  })
}

async function boot() {
  document.getElementById('mode-chip').addEventListener('click', () => { location.hash = '#settings' })
  try {
    ctx.me = await getJson('/api/me')
  } catch (e) {
    toast(e.message, 'hot')
    return
  }
  setCsrf(ctx.me.csrf)
  document.title = ctx.me.brand || 'Gavel'
  const live = (ctx.me.sources || []).filter((s) => s.kind === 'api' && s.connected)
  setMode(live.length ? 'LIVE' : 'EMPTY', live.map((s) => s.name).join(', '))
  accountMenu()
  window.addEventListener('hashchange', route)
  route()
}

boot()
