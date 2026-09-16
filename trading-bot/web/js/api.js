// The command-center's shared API helper. The first of the modular frontend
// files (Phase 17): small, dependency-free, same-origin fetch with the cookie
// session, plus a couple of formatting helpers the panels share.

export async function getJson(path) {
  const res = await fetch(path, { credentials: 'same-origin' })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const j = await res.json(); if (j && j.error) msg = j.error } catch { /* keep HTTP status */ }
    throw new Error(msg)
  }
  return res.json()
}

/** Escape text for safe insertion as HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** A signed R-multiple, e.g. +1.20R. */
export function fmtR(n) {
  return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + 'R'
}

/** New York clock label from an epoch ms. */
export function nyTime(ms) {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) } catch { return new Date(ms).toISOString() }
}
