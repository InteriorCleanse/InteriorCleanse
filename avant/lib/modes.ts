/** What is really configured, so the UI never claims more than it does. */

import { isDemo } from './security/keys'
import { stripeIdentityConfigured } from './verification/stripe-identity'
import { vaultConfigured } from './vault-client'

export interface Modes {
  demoKeys: boolean
  payments: boolean
  identity: boolean
  vault: boolean
  ai: boolean
  demoVerifyAllowed: boolean
}

export function modes(): Modes {
  const identity = stripeIdentityConfigured()
  return {
    demoKeys: isDemo(),
    payments: Boolean(process.env.STRIPE_SECRET_KEY),
    identity,
    vault: vaultConfigured(),
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    demoVerifyAllowed: !identity || process.env.AVANT_ALLOW_DEMO_VERIFY === '1',
  }
}
