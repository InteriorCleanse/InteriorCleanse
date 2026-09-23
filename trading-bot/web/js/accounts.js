/**
 * YOUR ACCOUNTS — the brokers you have linked, read-only, on the Desk.
 *
 * Lists which brokers are wired up (/api/brokers carries configured yes/no and
 * never a key) and, for each linked one, its read-only balance. Nothing here
 * can trade: the only routes it reads are the broker list and the read-only
 * portfolio routes that list names. An unlinked broker says so plainly.
 *
 * It fills the empty #dk-accounts slot each time the desk announces it has
 * drawn ('desk:rendered'), so desk.js keeps its rule of fetching /api/desk only.
 */
import { esc } from './api.js'

const usd = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—')
const READ_ONLY_ROUTE = /^\/api\/portfolio(\/[a-z]+)?$/

async function loadAccounts() {
  const box = document.getElementById('dk-accounts')
  if (!box) return
  try {
    const r = await fetch('/api/brokers'); const j = await r.json()
    if (!j.ok) throw new Error(j.error || 'could not read the broker list')
    const linked = j.data.brokers.filter((b) => b.configured && b.route && READ_ONLY_ROUTE.test(b.route))
    const rows = await Promise.all(linked.map(async (b) => {
      try {
        const pr = await fetch(b.route); const pj = await pr.json()
        const p = pj.data || {}
        const total = p.account ? (p.account.totalUsd ?? p.account.equity) : null
        return `<div class="dk-acct${p.connected ? '' : ' off'}"><b>${esc(b.name)}</b><span class="dk-acct-v">${p.connected ? usd(total) : 'not reachable'}</span><span class="muted">${esc(p.note || '')}</span></div>`
      } catch (e) { return `<div class="dk-acct off"><b>${esc(b.name)}</b><span class="dk-acct-v">not reachable</span><span class="muted">${esc(e.message)}</span></div>` }
    }))
    box.innerHTML = `<div class="dk-accounts-head"><b>Your accounts</b><span>read-only — he can see them, never trade them</span></div>${rows.length ? `<div class="dk-acct-row">${rows.join('')}</div>` : '<p class="muted dk-acct-empty">No accounts linked yet. Kraken and Alpaca can be linked read-only; docs/BROKER.md shows how, step by step.</p>'}`
  } catch (e) {
    box.innerHTML = `<p class="muted dk-acct-empty">Couldn't read your accounts: ${esc(e.message)}. Showing nothing rather than guessing.</p>`
  }
}

document.addEventListener('desk:rendered', () => { loadAccounts() })
