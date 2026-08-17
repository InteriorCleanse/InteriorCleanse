import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  VaultError,
  maskSecret,
  openSecret,
  parseKeyMaterial,
  rewrapSecret,
  sealSecret,
  staticKeyProvider,
  type SecretContext,
} from '@/lib/vault'
import { STRIPE_LIVE_PREFIX, shopifyToken, stripeLiveKey } from './fixtures/secrets'

const KEY_A = randomBytes(32)
const KEY_B = randomBytes(32)

const kek = staticKeyProvider({ currentKeyId: 'k1', keys: new Map([['k1', KEY_A]]) })

const context: SecretContext = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  credentialId: '22222222-2222-4222-8222-222222222222',
  field: 'api_key',
}

const SECRET = stripeLiveKey('51QxAbCdEfGhIjKlMnOpQrStU')

describe('envelope encryption', () => {
  it('round-trips a secret', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    expect(await openSecret(sealed, context, kek)).toBe(SECRET)
  })

  it('never stores the plaintext anywhere in the sealed blob', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    const serialised = JSON.stringify(sealed)
    expect(serialised).not.toContain(SECRET)
    expect(serialised).not.toContain('sk_live')
    // Nor the key material itself.
    expect(serialised).not.toContain(KEY_A.toString('base64'))
  })

  it('produces different ciphertext every time, so equal secrets are not detectable', async () => {
    const a = await sealSecret(SECRET, context, kek)
    const b = await sealSecret(SECRET, context, kek)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.iv).not.toBe(b.iv)
    // And each seals under its own data key.
    expect(a.wrappedKey.material).not.toBe(b.wrappedKey.material)
  })

  it('refuses a ciphertext moved to another organization', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    await expect(
      openSecret(sealed, { ...context, organizationId: 'other-org' }, kek),
    ).rejects.toThrow(VaultError)
  })

  it('refuses a ciphertext moved to another credential row', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    await expect(
      openSecret(sealed, { ...context, credentialId: 'other-credential' }, kek),
    ).rejects.toThrow(VaultError)
  })

  it('refuses a ciphertext moved to another field', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    await expect(openSecret(sealed, { ...context, field: 'refresh_token' }, kek)).rejects.toThrow(
      VaultError,
    )
  })

  it('detects a tampered ciphertext rather than returning garbage', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    const bytes = Buffer.from(sealed.ciphertext, 'base64')
    bytes[0]! ^= 0xff
    await expect(
      openSecret({ ...sealed, ciphertext: bytes.toString('base64') }, context, kek),
    ).rejects.toThrow(/altered/i)
  })

  it('detects a tampered authentication tag', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    const tag = Buffer.from(sealed.tag, 'base64')
    tag[0]! ^= 0xff
    await expect(openSecret({ ...sealed, tag: tag.toString('base64') }, context, kek)).rejects.toThrow(
      VaultError,
    )
  })

  it('detects a tampered wrapped data key', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    const wrapped = Buffer.from(sealed.wrappedKey.material, 'base64')
    wrapped[wrapped.length - 1]! ^= 0xff
    await expect(
      openSecret(
        { ...sealed, wrappedKey: { ...sealed.wrappedKey, material: wrapped.toString('base64') } },
        context,
        kek,
      ),
    ).rejects.toThrow(VaultError)
  })

  it('cannot be opened by a different master key', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    const impostor = staticKeyProvider({ currentKeyId: 'k1', keys: new Map([['k1', KEY_B]]) })
    await expect(openSecret(sealed, context, impostor)).rejects.toThrow(VaultError)
  })

  it('refuses to seal an empty secret', async () => {
    await expect(sealSecret('', context, kek)).rejects.toThrow(VaultError)
  })

  it('rejects an unknown sealed-secret version rather than guessing', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    await expect(
      openSecret({ ...sealed, version: 2 as 1 }, context, kek),
    ).rejects.toThrow(/version/i)
  })

  it('round-trips unicode and long secrets', async () => {
    const long = `token_${'ü'.repeat(500)}_端`
    const sealed = await sealSecret(long, context, kek)
    expect(await openSecret(sealed, context, kek)).toBe(long)
  })
})

describe('key rotation', () => {
  const rotated = staticKeyProvider({
    currentKeyId: 'k2',
    keys: new Map([
      ['k2', KEY_B],
      ['k1', KEY_A],
    ]),
  })

  it('still opens data sealed under a retired key', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    expect(await openSecret(sealed, context, rotated)).toBe(SECRET)
  })

  it('rewraps under the current key without touching the ciphertext', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    const rewrapped = await rewrapSecret(sealed, rotated)

    expect(rewrapped.wrappedKey.keyId).toBe('k2')
    // The expensive part is untouched — this is the point of envelope encryption.
    expect(rewrapped.ciphertext).toBe(sealed.ciphertext)
    expect(rewrapped.iv).toBe(sealed.iv)
    expect(await openSecret(rewrapped, context, rotated)).toBe(SECRET)
  })

  it('is a no-op when already under the current key', async () => {
    const sealed = await sealSecret(SECRET, context, rotated)
    expect(await rewrapSecret(sealed, rotated)).toBe(sealed)
  })

  it('says which key is missing when a retired key was dropped too early', async () => {
    const sealed = await sealSecret(SECRET, context, kek)
    const onlyNew = staticKeyProvider({ currentKeyId: 'k2', keys: new Map([['k2', KEY_B]]) })
    await expect(openSecret(sealed, context, onlyNew)).rejects.toThrow(/"k1"/)
  })
})

describe('provider configuration', () => {
  it('is honest that a static environment key is not production-grade', () => {
    expect(kek.productionReady).toBe(false)
  })

  it('refuses a key that is not 256 bits', () => {
    expect(() => parseKeyMaterial('abc123', 'VAULT_MASTER_KEY')).toThrow(/64 hex/)
    expect(() => parseKeyMaterial('z'.repeat(64), 'VAULT_MASTER_KEY')).toThrow(/64 hex/)
  })

  it('accepts a well-formed key', () => {
    expect(parseKeyMaterial(KEY_A.toString('hex'), 'VAULT_MASTER_KEY')).toEqual(KEY_A)
  })

  it('refuses a current key id that is not configured', () => {
    expect(() =>
      staticKeyProvider({ currentKeyId: 'missing', keys: new Map([['k1', KEY_A]]) }),
    ).toThrow(VaultError)
  })
})

describe('maskSecret', () => {
  it('shows the vendor prefix and last four, and nothing else', () => {
    expect(maskSecret(stripeLiveKey('51QxAbCdEfGhIjKlMn4242'))).toBe(`${STRIPE_LIVE_PREFIX}••••4242`)
    expect(maskSecret(shopifyToken('abcdefghijklmnop1234'))).toBe('shpat_••••1234')
  })

  it('masks a short secret entirely rather than leaking a useful fraction', () => {
    expect(maskSecret('abc123')).toBe('••••••••')
  })

  it('never contains the middle of the secret', () => {
    const secret = stripeLiveKey('MIDDLEPARTISSECRET9999')
    expect(maskSecret(secret)).not.toContain('MIDDLEPART')
  })
})
