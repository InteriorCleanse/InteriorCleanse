export const ADMIN_COOKIE = 'ic_admin'

const MAX_AGE_SECONDS = 60 * 60 * 12

/**
 * Signed admin session tokens.
 *
 * The cookie holds `expiry.signature`, never the password — a cookie carrying
 * the raw password hands it to anyone who reads the browser jar, and a cookie
 * carrying an unsigned flag is forgeable by anyone who guesses the format.
 *
 * Built on Web Crypto rather than `node:crypto` because `middleware.ts` runs
 * on the Edge runtime, where the Node module does not exist. Web Crypto is
 * present in both runtimes, so middleware and route handlers share this code.
 */

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET
  if (!value) {
    throw new Error(
      'ADMIN_SESSION_SECRET is not configured. Generate one with `openssl rand -hex 32`.'
    )
  }
  return value
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const fromHex = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export async function createSessionToken(): Promise<string> {
  const expiry = String(Date.now() + MAX_AGE_SECONDS * 1000)
  const sig = await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(expiry))
  return `${expiry}.${toHex(sig)}`
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const [expiry, signature] = token.split('.')
  if (!expiry || !signature || !/^[0-9a-f]+$/.test(signature)) return false

  // subtle.verify is constant-time, so a wrong signature leaks no timing.
  const valid = await crypto.subtle.verify(
    'HMAC',
    await key(),
    fromHex(signature),
    new TextEncoder().encode(expiry)
  )
  if (!valid) return false

  const expiresAt = Number(expiry)
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

/** Length-independent comparison so login can't be narrowed by timing. */
export function checkPassword(candidate: string): boolean {
  const actual = process.env.ADMIN_PASSWORD
  if (!actual) throw new Error('ADMIN_PASSWORD is not configured.')

  const a = new TextEncoder().encode(candidate)
  const b = new TextEncoder().encode(actual)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_SECONDS,
}
