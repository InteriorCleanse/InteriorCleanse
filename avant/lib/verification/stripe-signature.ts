/**
 * Stripe webhook signature check, on Web Crypto so it runs anywhere.
 * Header format: `t=<unix>,v1=<hex hmac>[,v1=...]`; the signed payload is
 * `${t}.${rawBody}`. Rejects anything outside the tolerance window.
 */

const enc = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header || !secret) return false
  const parts = header.split(',').map((p) => p.trim().split('='))
  const t = Number(parts.find(([k]) => k === 't')?.[1])
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '')
  if (!Number.isFinite(t) || sigs.length === 0) return false
  if (Math.abs(nowSec - t) > toleranceSec) return false
  const expected = await hmacHex(secret, `${t}.${rawBody}`)
  return sigs.some((s) => safeEqualHex(s, expected))
}

export async function stripeSignatureHeader(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${rawBody}`)}`
}
