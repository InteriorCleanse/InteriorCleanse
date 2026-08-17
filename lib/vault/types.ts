/**
 * The tenant credential vault.
 *
 * This is the highest-consequence code in the product. A workspace hands us a
 * live Stripe secret key or a Shopify token; if that leaks, the damage is to
 * *their* business, not ours, and no amount of good behaviour elsewhere makes
 * up for it. So the design starts from what happens when things go wrong:
 *
 *   - **A database dump must be worthless on its own.** Ciphertext lives in
 *     Postgres; the key that opens it does not. A `pg_dump` in a backup bucket,
 *     a leaked read replica, or a successful SQL injection yields sealed bytes.
 *   - **One compromised key must not open everything.** Every secret gets its
 *     own random data key. The master key wraps data keys and never touches
 *     plaintext, so compromising one wrapped data key exposes one secret.
 *   - **Rotation must not require re-encrypting every secret.** Envelope
 *     encryption means rotating the master key rewraps data keys — a cheap
 *     operation over small blobs — rather than re-sealing every credential.
 *   - **A ciphertext must not be portable.** Each seal binds the organization,
 *     the credential id, and the field name as additional authenticated data,
 *     so a row copied into another tenant's table fails to open rather than
 *     silently decrypting into the wrong hands.
 *
 * The master key itself is behind this interface rather than read from an
 * environment variable at the call site, because the production answer is a
 * KMS — where the key material never leaves the HSM and every unwrap is
 * logged — and the local answer is a static key. Those must be swappable
 * without touching a single caller.
 */

export type WrappedKey = {
  /** Which KEK wrapped this. Rotation writes a new id; old ids stay readable. */
  keyId: string
  /** Base64 of the wrapped data key. */
  material: string
}

export type KeyEncryptionKeyProvider = {
  /** Stable identifier for the *current* key, recorded on every sealed value. */
  readonly currentKeyId: string
  readonly label: string
  /**
   * Whether this provider is safe for production. A single static key held in
   * an environment variable is not, and says so rather than letting a launch
   * assume otherwise.
   */
  readonly productionReady: boolean
  wrap: (dataKey: Buffer) => Promise<WrappedKey>
  /** Unwraps with the named key, which may be an older one after a rotation. */
  unwrap: (wrapped: WrappedKey) => Promise<Buffer>
}

/**
 * A sealed secret, as stored. Nothing here is secret on its own: the whole
 * point is that these columns can appear in a leaked backup without the
 * plaintext being recoverable.
 */
export type SealedSecret = {
  /** Base64 AES-256-GCM ciphertext. */
  ciphertext: string
  /** Base64 96-bit nonce. Never reused — generated per seal. */
  iv: string
  /** Base64 128-bit authentication tag. */
  tag: string
  /** The data key, wrapped by the KEK. */
  wrappedKey: WrappedKey
  /** Format version, so a future change can be migrated rather than guessed. */
  version: 1
}

/**
 * Context bound into the ciphertext as additional authenticated data. Changing
 * any of it makes the value fail to open — which is the property that stops a
 * ciphertext being moved between tenants, credentials, or fields.
 */
export type SecretContext = {
  organizationId: string
  credentialId: string
  /** The field being sealed, e.g. `api_key`, `refresh_token`. */
  field: string
}

export class VaultError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_configured'
      | 'bad_key'
      | 'tampered'
      | 'wrong_context'
      | 'unknown_key_version',
  ) {
    super(message)
    this.name = 'VaultError'
  }
}
