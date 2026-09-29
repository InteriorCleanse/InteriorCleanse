// Gavel's talk with its own server: same-origin fetch, the session cookie, the
// safety (CSRF) token on every change, and the small formatters every screen shares.

let csrf = ''
export function setCsrf(token) { csrf = token || '' }

async function call(path, init = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  if (res.status === 401) {
    location.href = '/login'
    throw new Error('Sign in first.')
  }
  let body = null
  try { body = await res.json() } catch { body = null }
  if (!res.ok) throw new Error((body && body.error) || `The server answered ${res.status}.`)
  return body
}

export function getJson(path) { return call(path) }
export function postJson(path, data) {
  return call(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gavel-csrf': csrf }, body: JSON.stringify(data || {}) })
}
export function del(path) { return call(path, { method: 'DELETE', headers: { 'x-gavel-csrf': csrf } }) }

/** Escape text before it goes into HTML. Every server string goes through this. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** Only http(s) URLs may be used in href or src. Anything else becomes null. */
export function safeUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null }

export function money(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  const r = Math.round(n)
  return (r < 0 ? '−$' : '$') + Math.abs(r).toLocaleString('en-US')
}
export function moneyK(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return n >= 10_000 ? '$' + (n / 1000).toFixed(n >= 100_000 ? 0 : 1) + 'k' : money(n)
}
export function miles(n) { return typeof n === 'number' ? n.toLocaleString('en-US') + ' mi' : null }
export function pct(fraction) { return typeof fraction === 'number' ? Math.round(fraction * 100) + '%' : '—' }

export function timeLeft(endsAt, now = Date.now()) {
  if (typeof endsAt !== 'number') return null
  const ms = endsAt - now
  if (ms <= 0) return { text: 'Ended', tone: 'dim' }
  const h = Math.floor(ms / 3_600_000)
  const d = Math.floor(h / 24)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (d >= 1) return { text: `Ends in ${d}d ${h % 24}h`, tone: '' }
  if (h >= 1) return { text: `Ends in ${h}h ${m}m`, tone: h < 6 ? 'wait' : '' }
  return { text: `Ends in ${m} min`, tone: 'hot' }
}

/** A listing's time left; or, when the source gives only a closing date (GSA), that date and never a made-up countdown. */
export function closesText(l, now = Date.now()) {
  if (l && l.endsAtDateOnly && typeof l.endsAt === 'number') {
    if (l.endsAt - now <= 0) return { text: 'Ended', tone: 'dim' }
    // endsAt is the end of that day, US Eastern; step back a few hours to name the day itself.
    return { text: `Closes ${new Date(l.endsAt - 6 * 3_600_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, tone: '' }
  }
  return timeLeft(l && l.endsAt, now)
}

export function when(ms) {
  try { return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export function debounce(fn, ms) {
  let t
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}

export function store(key, value) {
  try {
    if (value === undefined) { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null }
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* this device forgets; nothing depends on it */ }
  return value
}
