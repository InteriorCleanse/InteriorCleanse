/**
 * What this deployment is actually configured to do.
 *
 * Every optional dependency in this product degrades honestly: the assistant
 * says it is not configured, the billing page says plans cannot be changed
 * here, the integrations page says credentials cannot be stored. That is right
 * for a customer, but it scatters the answer across a dozen screens, and the
 * person who needs it whole is the operator deciding whether this deployment is
 * fit to take a paying customer.
 *
 * So this is one function that answers it, and the rules it follows are the
 * same ones the rest of the product follows:
 *
 * **A degraded configuration is named, not hidden.** An in-memory rate limiter
 * on several instances is not "rate limiting enabled", it is a limit multiplied
 * by the instance count. It says so.
 *
 * **Severity reflects consequence, not tidiness.** A missing email provider is
 * a `note`: notifications are still raised and shown. A static vault key on a
 * multi-tenant deployment is a `blocker`, because it is the difference between
 * custodying other people's API keys defensibly and not.
 *
 * **It reads the environment, never a stored flag.** A checklist that records
 * what somebody once ticked describes a past deployment. This describes the one
 * that is running.
 *
 * Nothing here returns a secret, a key id excepted — that identifies which key
 * sealed a row and is written in plaintext in the database already.
 */

import { isAssistantConfigured, isSupabaseConfigured } from './env'
import { isCalendarConfigured } from './calendar/oauth'
import { isDistributed } from './ratelimit'
import { isVaultConfigured } from './vault'

export type ReadinessLevel = 'ok' | 'note' | 'warning' | 'blocker'

export type ReadinessCheck = {
  id: string
  label: string
  level: ReadinessLevel
  /** What is true right now. */
  detail: string
  /** What to do about it, when there is something to do. */
  remedy: string | null
}

export type Readiness = {
  checks: ReadinessCheck[]
  blockers: number
  warnings: number
  /** True only when nothing is a blocker. Not "everything is green". */
  safeForCustomerData: boolean
}

const set = (name: string): boolean => Boolean(process.env[name]?.trim())

export function readiness(): Readiness {
  const checks: ReadinessCheck[] = [
    supabaseCheck(),
    vaultCheck(),
    rateLimitCheck(),
    billingCheck(),
    assistantCheck(),
    emailCheck(),
    scheduledJobsCheck(),
    calendarCheck(),
  ]

  const blockers = checks.filter((c) => c.level === 'blocker').length

  return {
    checks,
    blockers,
    warnings: checks.filter((c) => c.level === 'warning').length,
    safeForCustomerData: blockers === 0,
  }
}

function supabaseCheck(): ReadinessCheck {
  const configured = isSupabaseConfigured()
  return {
    id: 'database',
    label: 'Database and authentication',
    level: configured ? 'ok' : 'blocker',
    detail: configured
      ? 'Supabase is configured. Tenant isolation is enforced here by RLS, not by application code.'
      : 'Supabase is not configured. Nothing in the product works without it.',
    remedy: configured ? null : 'Set the three NEXT_PUBLIC_SUPABASE_* and SUPABASE_SERVICE_ROLE_KEY values.',
  }
}

function vaultCheck(): ReadinessCheck {
  if (!isVaultConfigured()) {
    return {
      id: 'vault',
      label: 'Credential vault',
      level: 'warning',
      detail:
        'No vault key is set, so integrations needing an API key refuse to connect. The product refuses rather than storing a secret it cannot defend, which is the correct failure — but no customer can connect Stripe or Shopify.',
      remedy: 'Generate one with `npm run keygen` and set VAULT_MASTER_KEY.',
    }
  }

  // The static provider is real encryption with a real weakness: one key, in an
  // environment variable, no hardware boundary, no per-unwrap audit trail.
  const usingKms = set('VAULT_KMS_KEY_ID')

  return {
    id: 'vault',
    label: 'Credential vault',
    level: usingKms ? 'ok' : 'blocker',
    detail: usingKms
      ? `Sealed with a KMS-held key encryption key (${process.env.VAULT_MASTER_KEY_ID?.trim() || 'k1'}).`
      : `Sealed with a static key from the environment (${process.env.VAULT_MASTER_KEY_ID?.trim() || 'k1'}). Encryption is real; the key has no hardware boundary and no per-unwrap audit trail. Acceptable for your own data, not for custodying other businesses' API keys.`,
    remedy: usingKms ? null : 'Wire lib/vault kmsProvider() to a real KMS before taking customer credentials.',
  }
}

function rateLimitCheck(): ReadinessCheck {
  const distributed = isDistributed()

  return {
    id: 'ratelimit',
    label: 'Rate limiting',
    level: distributed ? 'ok' : 'warning',
    detail: distributed
      ? 'Shared across instances, applied atomically in the store, so the limit is the limit however many instances are running.'
      : 'In-memory: correct on a single instance. On several — any serverless deployment — each keeps its own count, so the effective limit on the assistant is the policy multiplied by the instance count.',
    remedy: distributed
      ? null
      : 'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN before running more than one instance.',
  }
}

function billingCheck(): ReadinessCheck {
  const key = set('STRIPE_SECRET_KEY')
  const webhook = set('STRIPE_WEBHOOK_SECRET')
  const prices = ['STRIPE_PRICE_STARTER', 'STRIPE_PRICE_GROWTH', 'STRIPE_PRICE_SCALE'].filter(set)

  if (!key) {
    return {
      id: 'billing',
      label: 'Billing',
      level: 'note',
      detail: 'Stripe is not configured. Everything else works; nobody can change plan.',
      remedy: 'Set STRIPE_SECRET_KEY and the price ids when you are ready to charge.',
    }
  }

  if (!webhook) {
    // Worse than no billing at all: money can be taken and entitlements will
    // never change, because entitlements are read from our mirror of Stripe.
    return {
      id: 'billing',
      label: 'Billing',
      level: 'blocker',
      detail:
        'Stripe is configured but STRIPE_WEBHOOK_SECRET is not. Checkout can take money and no plan will ever change, because entitlements are read from our mirrored subscription rather than from Stripe live.',
      remedy: 'Register the webhook endpoint and set STRIPE_WEBHOOK_SECRET.',
    }
  }

  const live = process.env.STRIPE_SECRET_KEY?.trim().includes('_live_')

  return {
    id: 'billing',
    label: 'Billing',
    level: prices.length === 3 ? 'ok' : 'warning',
    detail: `Stripe configured in ${live ? 'live' : 'test'} mode with ${prices.length} of 3 prices set.`,
    remedy: prices.length === 3 ? null : 'Set the remaining STRIPE_PRICE_* values or those plans cannot be bought.',
  }
}

function assistantCheck(): ReadinessCheck {
  const configured = isAssistantConfigured()
  return {
    id: 'assistant',
    label: 'Assistant',
    level: configured ? 'ok' : 'note',
    detail: configured
      ? 'Configured. This is the only endpoint with unbounded cost, so watch its spend and its rate limit together.'
      : 'No API key. The dock says the assistant is not configured; dashboards, imports and briefings are unaffected because they compute locally.',
    remedy: configured ? null : 'Set ANTHROPIC_API_KEY to enable it.',
  }
}

function emailCheck(): ReadinessCheck {
  const configured = set('RESEND_API_KEY') && set('EMAIL_FROM')
  return {
    id: 'email',
    label: 'Email delivery',
    level: configured ? 'ok' : 'note',
    detail: configured
      ? 'Configured. Deliverability still depends on SPF, DKIM and DMARC on the sending domain — an alert that lands in spam is not an alert.'
      : 'No provider. Notifications are still raised, recorded and shown in the app; each delivery row says no provider is configured rather than reporting a failure.',
    remedy: configured ? null : 'Set RESEND_API_KEY and EMAIL_FROM to send email.',
  }
}

function scheduledJobsCheck(): ReadinessCheck {
  const configured = set('CRON_SECRET')
  return {
    id: 'cron',
    label: 'Scheduled jobs',
    level: configured ? 'ok' : 'warning',
    detail: configured
      ? 'Configured. Connector syncs and the notification sweep can run on a schedule.'
      : 'No CRON_SECRET, so both scheduled endpoints return 404 to everyone. Connector data goes stale and no briefing or alert is ever sent on its own; "Sync now" and on-demand briefings still work.',
    remedy: configured ? null : 'Set CRON_SECRET and point a scheduler at the two endpoints hourly.',
  }
}

function calendarCheck(): ReadinessCheck {
  const providers = (['google', 'outlook'] as const).filter(isCalendarConfigured)
  return {
    id: 'calendar',
    label: 'Calendar connections',
    level: 'note',
    detail:
      providers.length === 0
        ? 'Neither provider is configured. The read-only iCalendar feed works regardless.'
        : `Configured: ${providers.join(', ')}. Google requires app verification before more than a handful of accounts can grant calendar.readonly.`,
    remedy: providers.length === 0 ? 'Set GOOGLE_CLIENT_ID/SECRET or MICROSOFT_CLIENT_ID/SECRET.' : null,
  }
}
