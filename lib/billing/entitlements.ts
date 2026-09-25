import { planFor, type Entitlements, type Plan, type PlanKey } from './plans'

/**
 * Entitlement enforcement.
 *
 * Two decisions shape this file, and both are about failure modes.
 *
 * **Failing payment does not mean instant lockout.** A card expires while
 * someone is on holiday; deleting their access on the hour the charge fails
 * loses a customer who would happily have paid. So a failed subscription enters
 * a grace period during which everything keeps working and the app says clearly
 * what is about to happen. After it, the workspace becomes read-only — data is
 * never deleted for non-payment, and export stays available, because holding
 * someone's own numbers hostage is not a retention strategy.
 *
 * **Over-limit is not the same as over-limit-and-growing.** A workspace that
 * downgrades to three seats with six members does not have three of them
 * ejected; it is blocked from *adding* more until it is back under. Enforcement
 * is on the action that would make things worse, never retroactive.
 */

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'

export type Subscription = {
  planKey: PlanKey
  status: SubscriptionStatus
  /** When the current paid period ends. */
  currentPeriodEnd: Date | null
  /** Set when a cancellation is scheduled but the period is still paid for. */
  cancelAt: Date | null
  /** When payment first failed, which starts the grace clock. */
  pastDueSince: Date | null
}

/** Long enough to reach a human, short enough not to be free service. */
export const GRACE_PERIOD_DAYS = 14

export type AccessLevel = 'full' | 'grace' | 'read_only'

export type Access = {
  level: AccessLevel
  plan: Plan
  entitlements: Entitlements
  /** What to tell the operator, or null when everything is fine. */
  notice: string | null
  /** Days left before read-only, when in grace. */
  graceDaysLeft: number | null
}

export function resolveAccess(subscription: Subscription, now = new Date()): Access {
  const plan = planFor(subscription.planKey)

  // A free workspace is not a failing paid one. It has the free plan's limits
  // and no payment state to worry about.
  if (plan.key === 'free' && subscription.status !== 'past_due') {
    return { level: 'full', plan, entitlements: plan.entitlements, notice: null, graceDaysLeft: null }
  }

  switch (subscription.status) {
    case 'trialing':
    case 'active': {
      const notice =
        subscription.cancelAt && subscription.cancelAt > now
          ? `Your subscription ends on ${formatDate(subscription.cancelAt)}. Everything keeps working until then.`
          : null
      return { level: 'full', plan, entitlements: plan.entitlements, notice, graceDaysLeft: null }
    }

    case 'past_due':
    case 'unpaid': {
      const since = subscription.pastDueSince ?? now
      const elapsedDays = (now.getTime() - since.getTime()) / 86_400_000
      const left = Math.max(0, Math.ceil(GRACE_PERIOD_DAYS - elapsedDays))

      if (left > 0) {
        return {
          level: 'grace',
          plan,
          entitlements: plan.entitlements,
          notice: `A payment failed. Everything keeps working for ${left} more ${left === 1 ? 'day' : 'days'} — update your card to avoid interruption.`,
          graceDaysLeft: left,
        }
      }

      return {
        level: 'read_only',
        plan,
        entitlements: readOnly(plan.entitlements),
        notice:
          'This workspace is read-only because a payment could not be taken. Your data is intact and export still works — update your card to restore full access.',
        graceDaysLeft: 0,
      }
    }

    case 'canceled':
    case 'incomplete':
    default: {
      const free = planFor('free')
      return {
        level: 'full',
        plan: free,
        entitlements: free.entitlements,
        notice:
          subscription.status === 'canceled'
            ? 'Your subscription has ended. The workspace is on the Free plan; your data is intact.'
            : null,
        graceDaysLeft: null,
      }
    }
  }
}

/**
 * Read-only keeps reading and export. A workspace in arrears can still see and
 * take its own numbers; it just cannot add to them or spend our money on model
 * calls.
 */
function readOnly(entitlements: Entitlements): Entitlements {
  return {
    ...entitlements,
    members: 0,
    connectedIntegrations: 0,
    assistantMessagesPerMonth: 0,
    notificationRules: 0,
    emailNotifications: false,
    // Deliberately preserved: taking your data with you must never be the thing
    // that gets switched off.
    csvExport: true,
  }
}

export type LimitCheck =
  | { allowed: true }
  | { allowed: false; reason: string; upgradeTo: PlanKey | null }

/**
 * Checks an action that would consume one more of a limited resource.
 *
 * Note the `current >= limit` comparison: this is asked *before* adding, so
 * being exactly at the limit blocks. Off-by-one here either lets everyone have
 * one extra seat or blocks the last one someone paid for.
 */
export function checkLimit(input: {
  access: Access
  resource: 'members' | 'connectedIntegrations' | 'assistantMessagesPerMonth' | 'notificationRules'
  current: number
}): LimitCheck {
  const limit = input.access.entitlements[input.resource]
  if (limit === null) return { allowed: true }

  if (input.access.level === 'read_only') {
    return {
      allowed: false,
      reason: 'This workspace is read-only until the outstanding payment is settled.',
      upgradeTo: null,
    }
  }

  if (input.current < limit) return { allowed: true }

  return {
    allowed: false,
    reason: overLimitMessage(input.resource, limit, input.current),
    upgradeTo: nextPlanWithMore(input.access.plan.key, input.resource),
  }
}

export function checkFeature(
  access: Access,
  feature: 'emailNotifications' | 'calendarFeed' | 'csvExport' | 'apiAccess',
): LimitCheck {
  if (access.entitlements[feature]) return { allowed: true }

  if (access.level === 'read_only') {
    return {
      allowed: false,
      reason: 'This workspace is read-only until the outstanding payment is settled.',
      upgradeTo: null,
    }
  }

  return {
    allowed: false,
    reason: `${FEATURE_LABELS[feature]} is not included in the ${access.plan.name} plan.`,
    upgradeTo: nextPlanWithFeature(access.plan.key, feature),
  }
}

const FEATURE_LABELS = {
  emailNotifications: 'Email alerts',
  calendarFeed: 'Calendar subscription',
  csvExport: 'CSV export',
  apiAccess: 'API access',
} as const

const RESOURCE_LABELS = {
  members: 'seats',
  connectedIntegrations: 'connected sources',
  assistantMessagesPerMonth: 'assistant questions this month',
  notificationRules: 'alert rules',
} as const

function overLimitMessage(
  resource: keyof typeof RESOURCE_LABELS,
  limit: number,
  current: number,
): string {
  const label = RESOURCE_LABELS[resource]
  if (current > limit) {
    // The post-downgrade case. Nothing was taken away; more cannot be added.
    return `This workspace has ${current} ${label} but the plan allows ${limit}. Nothing has been removed — you cannot add more until you are back under the limit or on a larger plan.`
  }
  return `You have used all ${limit} ${label} on this plan.`
}

import { PLAN_ORDER, PLANS } from './plans'

function nextPlanWithMore(
  from: PlanKey,
  resource: 'members' | 'connectedIntegrations' | 'assistantMessagesPerMonth' | 'notificationRules',
): PlanKey | null {
  const currentLimit = PLANS[from].entitlements[resource]
  for (const key of PLAN_ORDER.slice(PLAN_ORDER.indexOf(from) + 1)) {
    const candidate = PLANS[key].entitlements[resource]
    if (candidate === null || (currentLimit !== null && candidate > currentLimit)) return key
  }
  return null
}

function nextPlanWithFeature(
  from: PlanKey,
  feature: 'emailNotifications' | 'calendarFeed' | 'csvExport' | 'apiAccess',
): PlanKey | null {
  for (const key of PLAN_ORDER.slice(PLAN_ORDER.indexOf(from) + 1)) {
    if (PLANS[key].entitlements[feature]) return key
  }
  return null
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
