import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  asAnon,
  asServiceRole,
  asUser,
  createUser,
  hasTestDatabase,
  migrate,
} from './support/db'

/**
 * Tenant isolation, asserted against a real Postgres.
 *
 * `docs/TEST_PLAN.md` names ten assertions and calls them the highest-value gap
 * in the product. These are those ten, plus the cases that turned out to matter
 * once the schema grew past Checkpoint 1: the credential vault, commerce data,
 * and the roles the application actually connects as.
 *
 * Run them with a database:
 *
 *     RLS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/aurelis_test \
 *       npx vitest run tests/rls.integration.test.ts
 *
 * Without one they skip loudly rather than passing quietly — a green suite that
 * silently omitted the isolation tests would be worse than no suite.
 */

const ORG_A = 'Tenant A Ltd'
const ORG_B = 'Tenant B Ltd'

const PG_INSUFFICIENT_PRIVILEGE = '42501'
const PG_CHECK_VIOLATION = '23514'
const PG_UNIQUE_VIOLATION = '23505'

describe.skipIf(!hasTestDatabase)('RLS: tenant isolation', () => {
  let db: Client
  /** Owner of A, owner of B, a viewer in A, and an outsider with no workspace. */
  let ownerA: string
  let ownerB: string
  let viewerA: string
  let outsider: string
  let orgA: string
  let orgB: string

  beforeAll(async () => {
    db = await migrate()

    ownerA = await createUser(db, 'owner-a@example.com')
    ownerB = await createUser(db, 'owner-b@example.com')
    viewerA = await createUser(db, 'viewer-a@example.com')
    outsider = await createUser(db, 'outsider@example.com')

    // Fixtures are built as the schema owner. That is the service role's job in
    // production; nothing is *asserted* here, only arranged.
    const mkOrg = async (name: string, slug: string, creator: string) => {
      const { rows } = await db.query<{ id: string }>(
        'insert into public.organizations (name, slug, created_by) values ($1, $2, $3) returning id',
        [name, slug, creator],
      )
      return rows[0]!.id
    }

    orgA = await mkOrg(ORG_A, 'tenant-a', ownerA)
    orgB = await mkOrg(ORG_B, 'tenant-b', ownerB)

    await db.query(
      `insert into public.organization_members (organization_id, user_id, role, status)
       values ($1, $2, 'viewer', 'active')`,
      [orgA, viewerA],
    )
  }, 60_000)

  afterAll(async () => {
    await db?.end()
  })

  // ── 1 ──────────────────────────────────────────────────────────────────────

  it("does not show tenant A another tenant's organization", async () => {
    await asUser(db, ownerA, async (s) => {
      const other = await s.query('select id from public.organizations where id = $1', [orgB])
      expect(other.rowCount).toBe(0)

      // Their own is visible, so the zero above is isolation and not a broken
      // fixture or a policy that denies everything.
      const own = await s.query('select id from public.organizations where id = $1', [orgA])
      expect(own.rowCount).toBe(1)

      // And an unqualified select — the shape a forgotten WHERE clause takes —
      // returns only their own workspace.
      const all = await s.query<{ id: string }>('select id from public.organizations')
      expect(all.rows.map((r) => r.id)).toEqual([orgA])
    })
  })

  // ── 2 ──────────────────────────────────────────────────────────────────────

  it("does not show tenant A another tenant's membership rows", async () => {
    await asUser(db, ownerA, async (s) => {
      const other = await s.query(
        'select id from public.organization_members where organization_id = $1',
        [orgB],
      )
      expect(other.rowCount).toBe(0)

      const own = await s.query<{ user_id: string }>(
        'select user_id from public.organization_members where organization_id = $1',
        [orgA],
      )
      expect(own.rows.map((r) => r.user_id).sort()).toEqual([ownerA, viewerA].sort())
    })
  })

  // ── 3 ──────────────────────────────────────────────────────────────────────

  it('refuses a viewer trying to promote themselves', async () => {
    await asUser(db, viewerA, async (s) => {
      const updated = await s.query(
        `update public.organization_members set role = 'tenant_owner'
         where organization_id = $1 and user_id = $2`,
        [orgA, viewerA],
      )
      // Silent: RLS filters the row out of the UPDATE rather than raising.
      // Asserting only "did not throw" here would prove nothing.
      expect(updated.rowCount).toBe(0)
    })

    const { rows } = await db.query<{ role: string }>(
      'select role from public.organization_members where organization_id = $1 and user_id = $2',
      [orgA, viewerA],
    )
    expect(rows[0]!.role).toBe('viewer')
  })

  it('refuses a viewer trying to delete their way out of a role', async () => {
    await asUser(db, viewerA, async (s) => {
      const deleted = await s.query(
        'delete from public.organization_members where organization_id = $1 and user_id = $2',
        [orgA, viewerA],
      )
      expect(deleted.rowCount).toBe(0)
    })
  })

  // ── 4 ──────────────────────────────────────────────────────────────────────

  it('refuses to demote the last owner of a workspace', async () => {
    await asUser(db, ownerA, async (s) => {
      const failure = await s.refused(
        `update public.organization_members set role = 'tenant_admin'
         where organization_id = $1 and user_id = $2`,
        [orgA, ownerA],
      )
      expect(failure.code).toBe(PG_CHECK_VIOLATION)
      expect(failure.message).toMatch(/last owner/i)
    })
  })

  it('refuses to delete the last owner of a workspace', async () => {
    await asUser(db, ownerA, async (s) => {
      const failure = await s.refused(
        'delete from public.organization_members where organization_id = $1 and user_id = $2',
        [orgA, ownerA],
      )
      expect(failure.code).toBe(PG_CHECK_VIOLATION)
    })
  })

  it('allows demoting an owner once a second owner exists', async () => {
    // The guard has to stop at orphaning, not at every owner change — otherwise
    // handing a workspace over would be impossible.
    await asUser(db, ownerA, async (s) => {
      const promoted = await s.query(
        `update public.organization_members set role = 'tenant_owner'
         where organization_id = $1 and user_id = $2`,
        [orgA, viewerA],
      )
      expect(promoted.rowCount).toBe(1)
      const demoted = await s.query(
        `update public.organization_members set role = 'tenant_admin'
         where organization_id = $1 and user_id = $2`,
        [orgA, ownerA],
      )
      expect(demoted.rowCount).toBe(1)
    })
  })

  // ── 5 ──────────────────────────────────────────────────────────────────────

  it('hides platform_staff from ordinary users', async () => {
    await db.query(
      `insert into public.platform_staff (user_id, role) values ($1, 'platform_admin')
       on conflict (user_id) do nothing`,
      [outsider],
    )

    await asUser(db, ownerA, async (s) => {
      const staff = await s.query('select user_id from public.platform_staff')
      expect(staff.rowCount).toBe(0)
    })

    // Visible to staff themselves, so the zero above is the policy and not an
    // empty table.
    await asUser(db, outsider, async (s) => {
      const staff = await s.query('select user_id from public.platform_staff')
      expect(staff.rowCount).toBe(1)
    })

    await db.query('delete from public.platform_staff where user_id = $1', [outsider])
  })

  // ── 6 ──────────────────────────────────────────────────────────────────────

  it('refuses every client-side write to platform_staff', async () => {
    // The table has no INSERT, UPDATE or DELETE policy at all, for anyone. This
    // is the privilege-escalation path that matters most, so it is checked from
    // a tenant owner, from an anonymous visitor, and for a self-grant.
    await asUser(db, ownerA, async (s) => {
      const failure = await s.refused(
        `insert into public.platform_staff (user_id, role) values ($1, 'platform_owner')`,
        [ownerA],
      )
      expect(failure.code).toBe(PG_INSUFFICIENT_PRIVILEGE)
    })

    await asAnon(db, async (s) => {
      const failure = await s.refused(
        `insert into public.platform_staff (user_id, role) values ($1, 'platform_owner')`,
        [ownerA],
      )
      expect(failure.code).toBe(PG_INSUFFICIENT_PRIVILEGE)
    })
  })

  // ── 7 ──────────────────────────────────────────────────────────────────────

  it('keeps audit_logs append-only', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.audit_logs (organization_id, actor_user_id, action)
       values ($1, $2, 'test.event') returning id`,
      [orgA, ownerA],
    )
    const entryId = rows[0]!.id

    await asUser(db, ownerA, async (s) => {
      // Readable by an admin of the workspace…
      const visible = await s.query('select id from public.audit_logs where id = $1', [entryId])
      expect(visible.rowCount).toBe(1)

      // …and immutable to everyone. No UPDATE or DELETE policy exists, so both
      // match zero rows rather than raising.
      const updated = await s.query(
        `update public.audit_logs set action = 'tampered' where id = $1`,
        [entryId],
      )
      expect(updated.rowCount).toBe(0)

      const deleted = await s.query('delete from public.audit_logs where id = $1', [entryId])
      expect(deleted.rowCount).toBe(0)
    })

    const after = await db.query<{ action: string }>(
      'select action from public.audit_logs where id = $1',
      [entryId],
    )
    expect(after.rows[0]!.action).toBe('test.event')
  })

  it('refuses an audit entry attributed to someone else', async () => {
    await asUser(db, ownerA, async (s) => {
      const failure = await s.refused(
        `insert into public.audit_logs (organization_id, actor_user_id, action)
         values ($1, $2, 'impersonated.event')`,
        [orgA, ownerB],
      )
      expect(failure.code).toBe(PG_INSUFFICIENT_PRIVILEGE)
    })
  })

  // ── 8 and 9 ────────────────────────────────────────────────────────────────

  describe('claim_platform_ownership', () => {
    it('refuses an email that is not on the allowlist', async () => {
      await expect(
        db.query('select public.claim_platform_ownership($1)', [ownerA]),
      ).rejects.toMatchObject({ code: PG_INSUFFICIENT_PRIVILEGE })
    })

    it('grants ownership once, then refuses a second claimant', async () => {
      await db.query('insert into public.platform_owner_allowlist (email) values ($1), ($2)', [
        'owner-a@example.com',
        'owner-b@example.com',
      ])

      const first = await db.query<{ claim_platform_ownership: string }>(
        'select public.claim_platform_ownership($1)',
        [ownerA],
      )
      expect(first.rows[0]!.claim_platform_ownership).toBe('platform_owner')

      // Re-running the bootstrap for the same person is harmless by design;
      // the script is expected to be idempotent.
      const repeat = await db.query<{ claim_platform_ownership: string }>(
        'select public.claim_platform_ownership($1)',
        [ownerA],
      )
      expect(repeat.rows[0]!.claim_platform_ownership).toBe('platform_owner')

      // A *different* allowlisted person cannot claim it afterwards. This is
      // the case that matters: the allowlist is not a standing grant.
      await expect(
        db.query('select public.claim_platform_ownership($1)', [ownerB]),
      ).rejects.toMatchObject({ code: PG_UNIQUE_VIOLATION })

      const { rows } = await db.query<{ count: string }>(
        `select count(*) from public.platform_staff where role = 'platform_owner'`,
      )
      expect(rows[0]!.count).toBe('1')

      await db.query('delete from public.platform_staff')
      await db.query('delete from public.platform_owner_allowlist')
    })

    it('is not callable by an end user', async () => {
      // Revoked from anon and authenticated in 0003: a tenant reaching this
      // function directly would be a complete platform takeover.
      await asUser(db, ownerA, async (s) => {
        const failure = await s.refused('select public.claim_platform_ownership($1)', [ownerA])
        expect(failure.code).toBe(PG_INSUFFICIENT_PRIVILEGE)
      })
    })
  })

  // ── 10 ─────────────────────────────────────────────────────────────────────

  it('makes the creator of a workspace its owner in the same transaction', async () => {
    await asUser(db, outsider, async (s) => {
      const { rows } = await s.query<{ id: string }>(
        `insert into public.organizations (name, slug, created_by)
         values ('Fresh Co', 'fresh-co', $1) returning id`,
        [outsider],
      )
      const orgId = rows[0]!.id

      const membership = await s.query<{ role: string; status: string }>(
        'select role, status from public.organization_members where organization_id = $1',
        [orgId],
      )
      expect(membership.rows).toEqual([{ role: 'tenant_owner', status: 'active' }])

      // Visible to them immediately — a workspace nobody can administer would
      // be the failure mode if this were two statements in application code.
      const readable = await s.query('select id from public.organizations where id = $1', [orgId])
      expect(readable.rowCount).toBe(1)
    })
  })

  it('refuses a workspace created in someone else’s name', async () => {
    await asUser(db, ownerA, async (s) => {
      const failure = await s.refused(
        `insert into public.organizations (name, slug, created_by)
         values ('Not Mine', 'not-mine', $1)`,
        [ownerB],
      )
      expect(failure.code).toBe(PG_INSUFFICIENT_PRIVILEGE)
    })
  })

  it('refuses an anonymous visitor creating a workspace', async () => {
    await asAnon(db, async (s) => {
      const failure = await s.refused(
        `insert into public.organizations (name, slug) values ('Anon Co', 'anon-co')`,
      )
      expect(failure.code).toBe(PG_INSUFFICIENT_PRIVILEGE)
    })
  })
})

/**
 * The tables added after Checkpoint 1. The ten assertions above were written
 * when the schema was five tables; isolation is only as good as its least
 * protected table, so the ones holding money and secrets are checked too.
 */
describe.skipIf(!hasTestDatabase)('RLS: data added after Checkpoint 1', () => {
  let db: Client
  let ownerA: string
  let ownerB: string
  let orgA: string
  let orgB: string

  beforeAll(async () => {
    db = await migrate()
    ownerA = await createUser(db, 'a@example.com')
    ownerB = await createUser(db, 'b@example.com')

    const mkOrg = async (slug: string, creator: string) => {
      const { rows } = await db.query<{ id: string }>(
        'insert into public.organizations (name, slug, created_by) values ($1, $2, $3) returning id',
        [slug, slug, creator],
      )
      return rows[0]!.id
    }
    orgA = await mkOrg('org-a', ownerA)
    orgB = await mkOrg('org-b', ownerB)

    for (const [org, ref] of [
      [orgA, 'A-1'],
      [orgB, 'B-1'],
    ] as const) {
      await db.query(
        `insert into public.orders (organization_id, currency, placed_at, order_number)
         values ($1, 'USD', now(), $2)`,
        [org, ref],
      )
    }
  }, 60_000)

  afterAll(async () => {
    await db?.end()
  })

  it("does not show one tenant another tenant's orders", async () => {
    await asUser(db, ownerA, async (s) => {
      const all = await s.query<{ order_number: string }>(
        'select order_number from public.orders',
      )
      expect(all.rows.map((r) => r.order_number)).toEqual(['A-1'])
    })
  })

  it('refuses an order written into another tenant', async () => {
    await asUser(db, ownerA, async (s) => {
      const failure = await s.refused(
        `insert into public.orders (organization_id, currency, placed_at, order_number)
         values ($1, 'USD', now(), 'SMUGGLED')`,
        [orgB],
      )
      expect(failure.code).toBe(PG_INSUFFICIENT_PRIVILEGE)
    })
  })

  it('hides integration_credentials from the workspace owner themselves', async () => {
    // The strongest statement RLS can make: forced, with no policy at all, so
    // only the service role can read it. Even the person whose key it is cannot
    // select the ciphertext — the application hands back a masked hint instead.
    const { rows } = await db.query<{ id: string }>(
      `insert into public.integration_connections
         (organization_id, provider, display_name, status, connected_by)
       values ($1, 'stripe', 'Stripe', 'connected', $2) returning id`,
      [orgA, ownerA],
    )
    const connectionId = rows[0]!.id

    await db.query(
      `insert into public.integration_credentials
         (organization_id, connection_id, field, sealed, key_id, masked_hint)
       values ($1, $2, 'api_key', '{"ct":"x"}'::jsonb, 'k1', 'sk_live_••••4242')`,
      [orgA, connectionId],
    )

    await asUser(db, ownerA, async (s) => {
      const secrets = await s.query('select id from public.integration_credentials')
      expect(secrets.rowCount).toBe(0)

      const failure = await s.refused(
        `insert into public.integration_credentials
           (organization_id, connection_id, field, sealed, key_id, masked_hint)
         values ($1, $2, 'access_token', '{"ct":"y"}'::jsonb, 'k1', 'x')`,
        [orgA, connectionId],
      )
      expect(failure.code).toBe(PG_INSUFFICIENT_PRIVILEGE)
    })

    // The connection itself is visible — it is the secret that is not.
    await asUser(db, ownerA, async (s) => {
      const conns = await s.query('select id from public.integration_connections')
      expect(conns.rowCount).toBe(1)
    })
  })

  it('does not let a tenant edit their own subscription', async () => {
    // Entitlements are read from this table. A tenant that could write it could
    // grant themselves the top plan for nothing.
    await asUser(db, ownerA, async (s) => {
      const updated = await s.query(
        `update public.subscriptions set plan_key = 'scale' where organization_id = $1`,
        [orgA],
      )
      expect(updated.rowCount).toBe(0)
    })
  })
})

/**
 * A guard on the harness itself. If these two ever fail, every assertion above
 * has stopped meaning anything, and it would otherwise fail silently — as a
 * suite that passes.
 */
describe.skipIf(!hasTestDatabase)('the harness is testing what it claims to', () => {
  let db: Client
  let ownerA: string
  let orgB: string

  beforeAll(async () => {
    db = await migrate()
    ownerA = await createUser(db, 'guard-a@example.com')
    const ownerB = await createUser(db, 'guard-b@example.com')
    const { rows } = await db.query<{ id: string }>(
      `insert into public.organizations (name, slug, created_by)
       values ('Guard B', 'guard-b', $1) returning id`,
      [ownerB],
    )
    orgB = rows[0]!.id
  }, 60_000)

  afterAll(async () => {
    await db?.end()
  })

  it('runs assertions as a role that RLS actually applies to', async () => {
    await asUser(db, ownerA, async (s) => {
      const { rows } = await s.query<{ user: string; bypass: boolean }>(
        `select current_user as user,
                (select rolbypassrls from pg_roles where rolname = current_user) as bypass`,
      )
      expect(rows[0]!.user).toBe('authenticated')
      expect(rows[0]!.bypass).toBe(false)
    })
  })

  it('shows the service role bypassing the policies, which is why it never reaches a browser', async () => {
    await asServiceRole(db, async (s) => {
      const all = await s.query('select id from public.organizations where id = $1', [orgB])
      expect(all.rowCount).toBe(1)
    })
  })

  it('leaves RLS enabled and forced on every tenant table', async () => {
    const { rows } = await db.query<{ relname: string; enabled: boolean; forced: boolean }>(
      `select c.relname, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
         from pg_class c
        where c.relnamespace = 'public'::regnamespace
          and c.relkind = 'r'
        order by c.relname`,
    )

    const withoutRls = rows.filter((r) => !r.enabled).map((r) => r.relname)
    expect(withoutRls).toEqual([])

    // Named explicitly rather than checked as a count: adding a tenant table
    // without RLS should break this test, and a count would not notice.
    for (const table of [
      'organizations',
      'organization_members',
      'audit_logs',
      'orders',
      'integration_credentials',
      'subscriptions',
    ]) {
      const row = rows.find((r) => r.relname === table)
      expect(row, `${table} is missing`).toBeDefined()
      expect(row!.forced, `${table} does not force RLS`).toBe(true)
    }
  })
})
