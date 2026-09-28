/**
 * Client for the privacy vault (services/vault). Every request is signed:
 *
 *   x-avant-ts:  unix seconds
 *   x-avant-sig: HMAC-SHA256(key, METHOD \n PATH \n TS \n SHA256(body))
 *
 * The vault rejects anything older than five minutes or unsigned. It only
 * ever receives ciphertext, sealed in lib/driver-record.ts.
 */

import { b64urlEncode, hex, sign } from './security/crypto'
import { vaultSigningKey } from './security/keys'

export function vaultConfigured(): boolean {
  return Boolean(process.env.AVANT_VAULT_URL && process.env.AVANT_VAULT_SIGNING_KEY)
}

async function sha256Hex(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
}

export async function signVaultRequest(method: string, path: string, body: string, key: Uint8Array, ts = Math.floor(Date.now() / 1000)) {
  const sig = await sign(`${method}\n${path}\n${ts}\n${await sha256Hex(body)}`, key)
  return { 'x-avant-ts': String(ts), 'x-avant-sig': sig }
}

async function call(method: 'GET' | 'PUT' | 'DELETE', key: string, body = ''): Promise<Response> {
  const signing = vaultSigningKey()
  if (!signing) throw new Error('AVANT_VAULT_SIGNING_KEY is not set')
  const path = `/v1/records/${encodeURIComponent(key)}`
  const headers = await signVaultRequest(method, path, body, signing)
  const res = await fetch(new URL(path, process.env.AVANT_VAULT_URL), {
    method,
    headers: { ...headers, 'content-type': 'text/plain' },
    body: method === 'PUT' ? body : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  return res
}

export async function vaultGet(key: string): Promise<string | null> {
  const res = await call('GET', key)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`vault GET ${res.status}`)
  return res.text()
}

export async function vaultPut(key: string, sealed: string): Promise<void> {
  const res = await call('PUT', key, sealed)
  if (!res.ok) throw new Error(`vault PUT ${res.status}`)
}

export async function vaultDelete(key: string): Promise<void> {
  const res = await call('DELETE', key)
  if (!res.ok && res.status !== 404) throw new Error(`vault DELETE ${res.status}`)
}

export { b64urlEncode }
