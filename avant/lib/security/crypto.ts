/**
 * Cryptography on Web Crypto only, so the same code runs in Node, in the
 * Next.js edge middleware and inside the vault Worker (Cloudflare or
 * open-compute).
 *
 *  - `seal` / `open`: AES-256-GCM with a random 96-bit IV and associated
 *    data, serialised as `v1.<keyId>.<iv>.<ciphertext>` in base64url. The key
 *    id lets keys rotate: new data uses the current key, old data still opens
 *    with the previous one.
 *  - `sign` / `verify`: HMAC-SHA-256, constant-time comparison.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Accepts standard or url-safe base64. */
export function decodeKey(b64: string): Uint8Array {
  return b64urlDecode(b64.trim().replace(/=+$/, ''))
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  crypto.getRandomValues(out)
  return out
}

export function randomId(bytes = 18): string {
  return b64urlEncode(randomBytes(bytes))
}

async function keyId(raw: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw as BufferSource))
  return b64urlEncode(digest.slice(0, 6))
}

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error('Encryption keys must be 32 bytes')
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function seal(plaintext: string, key: Uint8Array, aad = ''): Promise<string> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) as BufferSource },
    await aesKey(key),
    enc.encode(plaintext) as BufferSource,
  )
  return `v1.${await keyId(key)}.${b64urlEncode(iv)}.${b64urlEncode(new Uint8Array(ct))}`
}

/** Tries each key whose id matches; returns null on any failure. */
export async function open(sealed: string, keys: Uint8Array[], aad = ''): Promise<string | null> {
  const parts = sealed.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return null
  const [, kid, ivText, ctText] = parts
  for (const key of keys) {
    if ((await keyId(key)) !== kid) continue
    try {
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64urlDecode(ivText) as BufferSource, additionalData: enc.encode(aad) as BufferSource },
        await aesKey(key),
        b64urlDecode(ctText) as BufferSource,
      )
      return dec.decode(pt)
    } catch {
      return null
    }
  }
  return null
}

async function hmacKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

export async function hmac(message: string, key: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(key), enc.encode(message) as BufferSource))
}

export async function sign(message: string, key: Uint8Array): Promise<string> {
  return b64urlEncode(await hmac(message, key))
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function verify(message: string, signature: string, key: Uint8Array): Promise<boolean> {
  let given: Uint8Array
  try {
    given = b64urlDecode(signature)
  } catch {
    return false
  }
  return timingSafeEqual(await hmac(message, key), given)
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
