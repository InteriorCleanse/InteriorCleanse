// Operator session: a short HMAC-signed token in an httpOnly cookie. No
// database, no third-party — just proof that whoever holds the cookie knew the
// operator password. Uses Web Crypto so the same code verifies in the Edge
// middleware and in Node route handlers.

export const OP_COOKIE = 'gck_op'
const TTL_SECONDS = 60 * 60 * 12 // 12 hours

// The signing secret. Prefer a dedicated secret; fall back to the operator
// password so a single env var is enough to get started. Both are set in
// Vercel, never in the repo.
function secret(): string | null {
  return process.env.OPERATOR_SESSION_SECRET || process.env.OPERATOR_PASSWORD || null
}

export function operatorAuthConfigured(): boolean {
  return !!process.env.OPERATOR_PASSWORD
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(data: string, key: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return new Uint8Array(sig)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// Build a signed token valid for TTL_SECONDS. Returns null if no secret.
export async function createOperatorToken(): Promise<string | null> {
  const key = secret()
  if (!key) return null
  const payload = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ exp: Date.now() + TTL_SECONDS * 1000 })),
  )
  const sig = b64urlEncode(await hmac(payload, key))
  return `${payload}.${sig}`
}

// Verify a token's signature and expiry.
export async function verifyOperatorToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const key = secret()
  if (!key) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  try {
    const expected = await hmac(payload, key)
    if (!timingSafeEqual(b64urlDecode(sig), expected)) return false
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as { exp?: number }
    return typeof data.exp === 'number' && data.exp > Date.now()
  } catch {
    return false
  }
}

// Constant-time-ish password check (lengths differ, but avoids early return on
// the common prefix). The password itself never leaves the server.
export async function checkOperatorPassword(input: string): Promise<boolean> {
  const expected = process.env.OPERATOR_PASSWORD
  if (!expected || !input) return false
  const enc = new TextEncoder()
  // Compare HMACs of each side under an ephemeral key so length isn't leaked.
  const k = crypto.getRandomValues(new Uint8Array(32))
  const key = b64urlEncode(k)
  const a = await hmac(input, key)
  const b = await hmac(expected, key)
  return timingSafeEqual(a, b)
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: TTL_SECONDS,
  }
}
