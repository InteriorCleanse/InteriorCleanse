/**
 * Request signing, mirrored from the app's lib/vault-client.ts:
 *   HMAC-SHA256(key, METHOD \n PATH \n TS \n SHA256_HEX(body)), base64url.
 * Web Crypto only, so it runs on workerd, Cloudflare and open-compute alike.
 */

const enc = new TextEncoder()

function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function decodeSecret(secret: string): Uint8Array {
  return b64urlDecode(secret.trim().replace(/=+$/, '')).slice(0, 32)
}

export async function verifyRequest(
  method: string,
  path: string,
  ts: string | null,
  sig: string | null,
  body: string,
  secret: Uint8Array,
  nowSec = Math.floor(Date.now() / 1000),
  windowSec = 300,
): Promise<boolean> {
  if (!ts || !sig || secret.length < 32) return false
  const t = Number(ts)
  if (!Number.isInteger(t) || Math.abs(nowSec - t) > windowSec) return false
  let given: Uint8Array
  try {
    given = b64urlDecode(sig)
  } catch {
    return false
  }
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${method}\n${path}\n${t}\n${await sha256Hex(body)}`)))
  if (expected.length !== given.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ given[i]
  return diff === 0
}
