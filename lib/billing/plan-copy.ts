import { z } from 'zod'
import { PLANS, PLAN_ORDER, type Plan, type PlanKey } from './plans'

/**
 * Applying owner-edited copy over the plan catalogue.
 *
 * A pure function over the code-defined plans and whatever rows exist in
 * `plan_copy_overrides`. Three things it will not do, each the reason a
 * separate module exists rather than a `select *` in the pricing page:
 *
 *   - **It cannot change a price.** The override shape has no price field, so
 *     an operator with database access still cannot make the pricing page
 *     disagree with Stripe through this path.
 *   - **It cannot change an entitlement.** Same reason. What a plan allows is
 *     enforced on every request from `PLANS`, and this function returns those
 *     entitlements untouched.
 *   - **It cannot invent a plan.** Keys outside `PLAN_ORDER` are ignored, so a
 *     stray row cannot put a fifth tier on the pricing page.
 *
 * Blank strings and empty arrays mean "no override", not "blank it out": an
 * operator clearing a field in the form gets the code default back, which is
 * the only sensible meaning of clearing it.
 */

export const planCopySchema = z.object({
  planKey: z.enum(['free', 'starter', 'growth', 'scale']),
  name: z.string().trim().max(40).optional(),
  audience: z.string().trim().max(160).optional(),
  highlights: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
  limitations: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
})

export type PlanCopyOverride = {
  plan_key: string
  name: string | null
  audience: string | null
  highlights: string[] | null
  limitations: string[] | null
}

export function applyPlanCopy(overrides: readonly PlanCopyOverride[]): Record<PlanKey, Plan> {
  const byKey = new Map(overrides.map((o) => [o.plan_key, o]))
  const result = {} as Record<PlanKey, Plan>

  for (const key of PLAN_ORDER) {
    const base = PLANS[key]
    const override = byKey.get(key)

    result[key] = override
      ? {
          ...base,
          name: nonEmpty(override.name) ?? base.name,
          audience: nonEmpty(override.audience) ?? base.audience,
          highlights: nonEmptyList(override.highlights) ?? base.highlights,
          limitations: nonEmptyList(override.limitations) ?? base.limitations,
          // Stated rather than relied upon: these two are what the override
          // must never be able to reach.
          displayPriceMinor: base.displayPriceMinor,
          entitlements: base.entitlements,
        }
      : base
  }

  return result
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function nonEmptyList(value: string[] | null | undefined): string[] | null {
  const cleaned = (value ?? []).map((v) => v.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned : null
}
