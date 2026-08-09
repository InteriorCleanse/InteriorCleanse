import type { PlatformRole, TenantRole } from './roles'
import { PLATFORM_ROLES, TENANT_ROLE_RANK } from './roles'

/**
 * Central authorization module.
 *
 * Pure functions over (actor, resource) — no I/O, no framework types — so the
 * rules are unit-testable without a database and identical on the server, in
 * middleware, and in tests. UI visibility is not authorization: components may
 * call these to hide controls, but every mutation re-checks server-side and
 * Postgres RLS backstops both (see supabase/migrations/0002_rls_and_policies.sql).
 *
 * Three separate layers, deliberately:
 *   1. RLS       — the guarantee. Cannot be forgotten.
 *   2. This file — the policy. Readable, testable, one definition per rule.
 *   3. UI        — the affordance. Cosmetic only.
 */

export type Actor = {
  userId: string
  /** Tenant role in the organization being acted on, or null if not a member. */
  tenantRole: TenantRole | null
  /** Platform role, or null for ordinary customers. */
  platformRole: PlatformRole | null
  /** True while acting as another tenant via support impersonation. */
  impersonating?: boolean
}

export type Capability =
  // Workspace
  | 'workspace:view'
  | 'workspace:update'
  | 'workspace:delete'
  // Team
  | 'members:view'
  | 'members:invite'
  | 'members:update_role'
  | 'members:remove'
  // Data and analysis
  | 'data:view'
  | 'data:import'
  | 'data:export'
  // Assistant
  | 'assistant:query'
  | 'assistant:approve_action'
  // Integrations
  | 'integrations:view'
  | 'integrations:connect'
  | 'integrations:disconnect'
  // Billing
  | 'billing:view'
  | 'billing:manage'
  // Audit
  | 'audit:view'
  // Platform
  | 'platform:view_console'
  | 'platform:manage_flags'
  | 'platform:impersonate'
  | 'platform:manage_staff'

/** Minimum tenant role required for each tenant-scoped capability. */
const TENANT_REQUIREMENTS: Record<Capability, TenantRole | null> = {
  'workspace:view': 'viewer',
  'workspace:update': 'tenant_admin',
  'workspace:delete': 'tenant_owner',

  'members:view': 'viewer',
  'members:invite': 'tenant_admin',
  'members:update_role': 'tenant_admin',
  'members:remove': 'tenant_admin',

  'data:view': 'viewer',
  'data:import': 'member',
  'data:export': 'analyst',

  'assistant:query': 'viewer',
  // Approving a write action is a commercial decision, not a reporting one.
  'assistant:approve_action': 'tenant_admin',

  'integrations:view': 'analyst',
  'integrations:connect': 'tenant_admin',
  'integrations:disconnect': 'tenant_admin',

  'billing:view': 'tenant_admin',
  'billing:manage': 'tenant_owner',

  'audit:view': 'tenant_admin',

  // Platform capabilities are never reachable through a tenant role.
  'platform:view_console': null,
  'platform:manage_flags': null,
  'platform:impersonate': null,
  'platform:manage_staff': null,
}

/** Platform capabilities and the platform roles that hold them. */
const PLATFORM_GRANTS: Record<PlatformRole, Capability[]> = {
  platform_owner: [
    'platform:view_console',
    'platform:manage_flags',
    'platform:impersonate',
    'platform:manage_staff',
  ],
  platform_admin: ['platform:view_console', 'platform:manage_flags', 'platform:impersonate'],
  platform_support: ['platform:view_console', 'platform:impersonate'],
}

/**
 * Capabilities that remain forbidden while impersonating, regardless of role.
 * Support may look; it may not spend money, change access, or delete a tenant.
 */
const IMPERSONATION_FORBIDDEN: ReadonlySet<Capability> = new Set<Capability>([
  'workspace:delete',
  'workspace:update',
  'members:invite',
  'members:update_role',
  'members:remove',
  'billing:manage',
  'integrations:connect',
  'integrations:disconnect',
  'assistant:approve_action',
  'data:import',
  'platform:manage_staff',
])

function tenantRoleSatisfies(actual: TenantRole | null, required: TenantRole | null): boolean {
  if (required === null) return false
  if (actual === null) return false
  return TENANT_ROLE_RANK[actual] >= TENANT_ROLE_RANK[required]
}

/**
 * The single authorization question. Everything else in the product should
 * route through this rather than testing roles inline.
 */
export function can(actor: Actor, capability: Capability): boolean {
  if (actor.impersonating && IMPERSONATION_FORBIDDEN.has(capability)) return false

  if (actor.platformRole) {
    if (PLATFORM_GRANTS[actor.platformRole].includes(capability)) return true

    // Platform staff get read-only reach into tenant data for support. Write
    // capabilities are not inherited — staff must be an actual member to write.
    const READ_ONLY: ReadonlySet<Capability> = new Set<Capability>([
      'workspace:view',
      'members:view',
      'data:view',
      'integrations:view',
      'billing:view',
      'audit:view',
    ])
    if (READ_ONLY.has(capability)) return true
  }

  return tenantRoleSatisfies(actor.tenantRole, TENANT_REQUIREMENTS[capability])
}

/** Throwing variant for server actions and route handlers. */
export class ForbiddenError extends Error {
  readonly status = 403
  constructor(public readonly capability: Capability) {
    super(`Not permitted: ${capability}`)
    this.name = 'ForbiddenError'
  }
}

export function assertCan(actor: Actor, capability: Capability): void {
  if (!can(actor, capability)) throw new ForbiddenError(capability)
}

export function isPlatformStaff(actor: Actor): boolean {
  return actor.platformRole !== null && PLATFORM_ROLES.includes(actor.platformRole)
}
