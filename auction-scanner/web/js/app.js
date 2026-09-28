// Boot and routing. One page, screens switched by the URL hash.
import { getJson, postJson, setCsrf, esc } from './api.js'
import { toast, sheet } from './ui.js'
import * as feed from './feed.js'
import * as plan from './plan.js'
import * as watch from './watch.js'
import * as auctions from './auctions.js'
import * as playbook from './playbook.js'
import * as rental from './rental.js'
import * as settings from './settings.js'
import * as admin from './admin.js'
import * as sniper from './sniper.js'
import * as intel from './intel.js'
import * as home from './home.js'
import * as garage from './garage.js'
import * as setup from './setup.js'
import * as importer from './import.js'
import * as connect from './connect.js'

const SCREENS = { home, feed, plan, watch, auctions, playbook, rental, settings, admin, sniper, intel, garage, setup, import: importer, connect }
const ctx = { me: null, feedKind: null }

function route() {
  const raw = location.hash.replace(/^#/, '') || 'home'
  const [name, ...rest] = raw.split('/')
  const screen = SCREENS[name] ? name : 'home'
  document.body.classList.toggle('in-setup', screen === 'setup')
  if (screen === 'admin' && ctx.me && ctx.me.role !== 'owner') { location.hash = '#feed'; return }
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.dataset.screen !== screen })
  document.querySelectorAll('.tabs a').forEach((a) => {
    const grouped = ['watch', 'intel', 'auctions', 'playbook', 'rental', 'settings', 'admin', 'import', 'connect']
    const active = a.dataset.tab === screen || (screen === 'plan' && a.dataset.tab === 'feed') || (a.dataset.tab === 'more' && grouped.includes(screen))
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

function moreSheet() {
  const owner = ctx.me.role === 'owner'
  const items = [['#import', 'Import', 'Bring in a lot from Copart, IAA or any auction'], ['#watch', 'Watch', 'Cars you watch and your paper-bid record'], ['#intel', 'Intel', 'Ask the desk, car records, auction rules, the laws'], ['#auctions', 'Auctions', 'Every house: who may buy, fees, how to register'], ['#playbook', 'Playbook', 'The guides, dumbed down on purpose'], ['#rental', 'Rental', 'Your first rental car, ranked'], ['#connect', 'Connect', 'Sources, AI, hosting, payments: the go-live guide'], ['#settings', 'Settings', 'Starter rules, alerts, backup, sources']]
  if (owner) items.push(['#admin', 'Members', 'Access codes and Stripe'])
  const close = sheet(`<h2>More</h2><div class="list">${items.map(([h, t, d]) => `<a class="item morelink" href="${h}"><div class="main"><b>${t}</b><div class="dim" style="font-size:14px">${d}</div></div></a>`).join('')}</div><div class="row" style="margin-top:12px"><button class="btn outline" type="button" data-close>Close</button></div>`, { label: 'More screens' })
  document.querySelectorAll('#sheet-root .morelink').forEach((a) => a.addEventListener('click', () => close()))
}

function accountMenu() {
  const btn = document.getElementById('account-btn')
  const menu = document.getElementById('account-menu')
  const owner = ctx.me.role === 'owner'
  btn.textContent = (ctx.me.email || 'o')[0].toUpperCase()
  menu.innerHTML = `<div class="who dim">${esc(ctx.me.email)} · ${owner ? 'owner' : 'member'}</div>
    <a href="#connect" role="menuitem">Connect (go-live guide)</a>
    <a href="#settings" role="menuitem">Settings</a>
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

let lastUnread = null
/** Watch the Sniper's unread count; badge the tab and, when allowed, raise a browser notification. */
async function pollAlerts() {
  try {
    const st = await getJson('/api/sniper')
    const badge = document.getElementById('sniper-badge')
    if (badge) { badge.textContent = String(st.unread); badge.hidden = !st.unread }
    if (lastUnread !== null && st.unread > lastUnread && 'Notification' in window && Notification.permission === 'granted') {
      const a = st.alerts.find((x) => !x.read)
      if (a) {
        const n = new Notification('Gavel', { body: a.title, tag: 'gavel-' + a.id, icon: '/icon.svg' })
        n.onclick = () => { window.focus(); location.hash = a.listingId ? '#plan/' + encodeURIComponent(a.listingId) : '#sniper'; n.close() }
      }
    }
    lastUnread = st.unread
  } catch { /* a missed poll is harmless; the next one catches up */ }
}

async function boot() {
  document.getElementById('mode-chip').addEventListener('click', () => { location.hash = '#settings' })
  document.getElementById('more-btn').addEventListener('click', moreSheet)
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
  pollAlerts()
  setInterval(pollAlerts, 60_000)
}

boot()
