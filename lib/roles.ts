/** Role vocabulary. Mirrors the enums in supabase/migrations/0001. */

export const PLATFORM_ROLES = ['platform_owner', 'platform_admin', 'platform_support'] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

export const TENANT_ROLES = [
  'tenant_owner',
  'tenant_admin',
  'analyst',
  'member',
  'viewer',
] as const
export type TenantRole = (typeof TENANT_ROLES)[number]

/** Ranked so policy can say "admin or above" without enumerating roles. */
export const TENANT_ROLE_RANK: Record<TenantRole, number> = {
  tenant_owner: 400,
  tenant_admin: 300,
  analyst: 200,
  member: 100,
  viewer: 50,
}

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  tenant_owner: 'Owner',
  tenant_admin: 'Admin',
  analyst: 'Analyst',
  member: 'Member',
  viewer: 'Viewer',
}

export const TENANT_ROLE_DESCRIPTIONS: Record<TenantRole, string> = {
  tenant_owner: 'Full control, including billing and deleting the workspace.',
  tenant_admin: 'Manage the team, integrations, and settings. Cannot delete the workspace.',
  analyst: 'Read everything, export reports, and inspect integrations.',
  member: 'Use the assistant and import data.',
  viewer: 'Read-only access to dashboards and the assistant.',
}

export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && (TENANT_ROLES as readonly string[]).includes(value)
}

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value)
}
