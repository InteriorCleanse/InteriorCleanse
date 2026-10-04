/**
 * Refuses passwords already published in data breaches, using the Have I
 * Been Pwned range API with k-anonymity: only the first five characters of
 * the password's SHA-1 leave the server, and the response is padded, so
 * neither the password nor whether it matched can be learned from the
 * traffic.
 *
 * Fails open after a short timeout: an outage there must never stop people
 * signing up. Set AVANT_PWNED_CHECK=0 to turn it off (tests, air-gapped).
 */

import { createHash } from 'node:crypto'

export async function passwordBreached(password: string): Promise<boolean> {
  if (process.env.AVANT_PWNED_CHECK === '0') return false
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'AVANT-password-check' },
      signal: AbortSignal.timeout(2_500),
    })
    if (!res.ok) return false
    const body = await res.text()
    for (const line of body.split('\n')) {
      const [hash, count] = line.trim().split(':')
      if (hash === suffix && Number(count) > 0) return true
    }
    return false
  } catch {
    return false
  }
}

export const BREACHED_MESSAGE = 'That password has appeared in a data breach elsewhere, so it isn’t safe to use. Choose another.'
