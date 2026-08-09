import { describe, expect, it } from 'vitest'
import { type Actor, assertCan, can, ForbiddenError, isPlatformStaff } from '@/lib/authz'
import { TENANT_ROLES, type TenantRole } from '@/lib/roles'

const tenant = (role: TenantRole | null): Actor => ({
  userId: 'u1',
  tenantRole: role,
  platformRole: null,
})

describe('tenant capabilities', () => {
  it('grants read capabilities to every tenant role', () => {
    for (const role of TENANT_ROLES) {
      expect(can(tenant(role), 'data:view')).toBe(true)
      expect(can(tenant(role), 'assistant:query')).toBe(true)
    }
  })

  it('denies everything to a non-member', () => {
    const outsider = tenant(null)
    expect(can(outsider, 'data:view')).toBe(false)
    expect(can(outsider, 'workspace:view')).toBe(false)
    expect(can(outsider, 'assistant:query')).toBe(false)
  })

  it('escalates with role rank', () => {
    expect(can(tenant('viewer'), 'data:import')).toBe(false)
    expect(can(tenant('member'), 'data:import')).toBe(true)

    expect(can(tenant('member'), 'data:export')).toBe(false)
    expect(can(tenant('analyst'), 'data:export')).toBe(true)

    expect(can(tenant('analyst'), 'integrations:connect')).toBe(false)
    expect(can(tenant('tenant_admin'), 'integrations:connect')).toBe(true)
  })

  it('reserves workspace deletion and billing management for the owner', () => {
    expect(can(tenant('tenant_admin'), 'workspace:delete')).toBe(false)
    expect(can(tenant('tenant_owner'), 'workspace:delete')).toBe(true)

    expect(can(tenant('tenant_admin'), 'billing:manage')).toBe(false)
    expect(can(tenant('tenant_owner'), 'billing:manage')).toBe(true)
  })

  it('requires admin to approve an assistant write action', () => {
    // Approving a consequential external write is a commercial decision.
    expect(can(tenant('analyst'), 'assistant:approve_action')).toBe(false)
    expect(can(tenant('tenant_admin'), 'assistant:approve_action')).toBe(true)
  })
})

describe('platform vs tenant separation', () => {
  it('never grants platform capabilities through a tenant role', () => {
    for (const role of TENANT_ROLES) {
      const actor = tenant(role)
      expect(can(actor, 'platform:view_console')).toBe(false)
      expect(can(actor, 'platform:manage_staff')).toBe(false)
      expect(can(actor, 'platform:impersonate')).toBe(false)
      expect(can(actor, 'platform:manage_flags')).toBe(false)
    }
  })

  it('gives platform staff read access but not tenant write access', () => {
    const support: Actor = { userId: 'p1', tenantRole: null, platformRole: 'platform_support' }
    expect(can(support, 'data:view')).toBe(true)
    expect(can(support, 'audit:view')).toBe(true)

    // Reading is support. Writing requires real membership.
    expect(can(support, 'data:import')).toBe(false)
    expect(can(support, 'members:invite')).toBe(false)
    expect(can(support, 'workspace:update')).toBe(false)
  })

  it('scopes platform capabilities by platform role', () => {
    const owner: Actor = { userId: 'p1', tenantRole: null, platformRole: 'platform_owner' }
    const admin: Actor = { userId: 'p2', tenantRole: null, platformRole: 'platform_admin' }
    const support: Actor = { userId: 'p3', tenantRole: null, platformRole: 'platform_support' }

    expect(can(owner, 'platform:manage_staff')).toBe(true)
    expect(can(admin, 'platform:manage_staff')).toBe(false)
    expect(can(support, 'platform:manage_flags')).toBe(false)
    expect(can(admin, 'platform:manage_flags')).toBe(true)

    for (const actor of [owner, admin, support]) {
      expect(can(actor, 'platform:view_console')).toBe(true)
      expect(isPlatformStaff(actor)).toBe(true)
    }
  })
})

describe('impersonation', () => {
  it('blocks consequential actions even for a platform owner', () => {
    const impersonating: Actor = {
      userId: 'p1',
      tenantRole: 'tenant_owner',
      platformRole: 'platform_owner',
      impersonating: true,
    }

    // Read-only support is the whole point of impersonation.
    expect(can(impersonating, 'data:view')).toBe(true)
    expect(can(impersonating, 'workspace:view')).toBe(true)

    // Everything with a side effect stays closed.
    expect(can(impersonating, 'workspace:delete')).toBe(false)
    expect(can(impersonating, 'workspace:update')).toBe(false)
    expect(can(impersonating, 'billing:manage')).toBe(false)
    expect(can(impersonating, 'members:remove')).toBe(false)
    expect(can(impersonating, 'integrations:connect')).toBe(false)
    expect(can(impersonating, 'assistant:approve_action')).toBe(false)
    expect(can(impersonating, 'data:import')).toBe(false)
    expect(can(impersonating, 'platform:manage_staff')).toBe(false)
  })

  it('is the only difference between an impersonating and a real owner', () => {
    const real: Actor = { userId: 'u', tenantRole: 'tenant_owner', platformRole: null }
    const fake: Actor = { ...real, platformRole: 'platform_owner', impersonating: true }

    expect(can(real, 'billing:manage')).toBe(true)
    expect(can(fake, 'billing:manage')).toBe(false)
  })
})

describe('assertCan', () => {
  it('throws ForbiddenError carrying the capability', () => {
    try {
      assertCan(tenant('viewer'), 'billing:manage')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError)
      expect((error as ForbiddenError).capability).toBe('billing:manage')
      expect((error as ForbiddenError).status).toBe(403)
    }
  })

  it('passes silently when permitted', () => {
    expect(() => assertCan(tenant('tenant_owner'), 'billing:manage')).not.toThrow()
  })
})
