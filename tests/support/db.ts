import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'pg'

/**
 * Harness for the RLS integration tests.
 *
 * These are the only tests that can prove tenant isolation. Everything else in
 * the suite tests our code; this tests the database's own refusal to hand one
 * tenant another tenant's rows, which is where the guarantee actually lives.
 *
 * Three rules separate a real test here from a comforting one:
 *
 *   1. **Never assert as a superuser or the service role.** Both bypass RLS
 *      entirely, so every assertion would pass whether the policies existed or
 *      not. `asUser` switches to the `authenticated` role for the duration of a
 *      transaction and sets the same JWT-claim setting PostgREST sets, so the
 *      query reaches the planner exactly as a browser request would.
 *   2. **Distinguish "denied" from "no error".** A rejected INSERT raises
 *      42501, but a rejected UPDATE or DELETE simply matches no rows and
 *      reports success with a count of zero. A test that only looked for a
 *      thrown error would pass against a table with no protection at all.
 *   3. **Rebuild the schema from the migrations.** The migrations are the
 *      artefact under test. A hand-maintained test schema would prove something
 *      about a database no deployment will ever run.
 */

export const DATABASE_URL =
  process.env.RLS_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? ''

/** The suite skips rather than fails when no database is configured. */
export const hasTestDatabase = DATABASE_URL.length > 0

// Resolved from the vitest root rather than `__dirname`, which is not defined
// in an ES module.
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations')
const SHIM = path.resolve(process.cwd(), 'tests/sql/supabase-shim.sql')

/** Listed rather than globbed: order is load-bearing and should be visible. */
const MIGRATIONS = [
  '0001_identity_and_tenancy.sql',
  '0002_rls_and_policies.sql',
  '0003_owner_bootstrap.sql',
  '0004_commerce_and_costs.sql',
  '0005_assistant.sql',
  '0006_integrations_notifications_calendar.sql',
  '0007_billing_and_platform.sql',
  '0008_workspace_creation_visibility.sql',
]

export async function migrate(): Promise<Client> {
  const admin = new Client({ connectionString: DATABASE_URL })
  await admin.connect()

  await admin.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    create schema public;
  `)
  await admin.query('create extension if not exists "pgcrypto"')
  await admin.query(await readFile(SHIM, 'utf8'))

  for (const file of MIGRATIONS) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await admin.query(sql)
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`)
    }
  }

  return admin
}

/** Creates an auth user; the 0001 trigger provisions the matching profile. */
export async function createUser(admin: Client, email: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  )
  return rows[0]!.id
}

export type PgFailure = { code: string; message: string }

export type Session = {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number }>

  /**
   * Runs a statement expected to be refused and returns the Postgres error.
   *
   * Wrapped in a savepoint: an error aborts the enclosing transaction, so
   * without one the *next* assertion in the same test would fail for an
   * unrelated reason and the test would look like it caught something it did
   * not. Throws if the statement succeeds.
   */
  refused(sql: string, params?: unknown[]): Promise<PgFailure>
}

/** Runs `fn` as an authenticated end user, then rolls back. */
export async function asUser<T>(
  admin: Client,
  userId: string,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  return withRole(admin, 'authenticated', userId, fn)
}

/** Runs `fn` as an unauthenticated visitor: the `anon` role, no subject claim. */
export async function asAnon<T>(admin: Client, fn: (session: Session) => Promise<T>): Promise<T> {
  return withRole(admin, 'anon', null, fn)
}

/**
 * Runs `fn` as the service role, which has BYPASSRLS.
 *
 * Present so a test can *demonstrate* the bypass, and so fixtures can be built.
 * Never for an isolation assertion: this role is exempt from the thing under
 * test, which is exactly why it never reaches a browser.
 */
export async function asServiceRole<T>(
  admin: Client,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  return withRole(admin, 'service_role', null, fn)
}

let savepointCounter = 0

async function withRole<T>(
  admin: Client,
  role: 'authenticated' | 'anon' | 'service_role',
  userId: string | null,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  await admin.query('begin')
  try {
    const claims = JSON.stringify(userId ? { sub: userId, role } : { role })
    // Claims first, then the role switch — the order PostgREST uses.
    await admin.query('select set_config($1, $2, true)', ['request.jwt.claims', claims])
    await admin.query(`set local role ${role}`)

    const session: Session = {
      async query<R extends Record<string, unknown>>(sql: string, params?: unknown[]) {
        const res = await admin.query<R>(sql, params as unknown[] | undefined)
        return { rows: res.rows, rowCount: res.rowCount ?? 0 }
      },
      async refused(sql: string, params?: unknown[]) {
        savepointCounter += 1
        const name = `sp_${savepointCounter}`
        await admin.query(`savepoint ${name}`)
        try {
          await admin.query(sql, params as unknown[] | undefined)
        } catch (error) {
          await admin.query(`rollback to savepoint ${name}`)
          const e = error as { code?: string; message: string }
          return { code: e.code ?? '', message: e.message }
        }
        await admin.query(`release savepoint ${name}`)
        throw new Error(`Expected this to be refused, but it succeeded:\n${sql}`)
      },
    }

    return await fn(session)
  } finally {
    // Rollback also discards SET LOCAL role and claims, so no session state
    // can leak into a later test and make it pass for the wrong reason.
    await admin.query('rollback')
  }
}
