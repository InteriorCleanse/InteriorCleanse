/**
 * The database: Postgres everywhere.
 *
 * - DATABASE_URL set: a real Postgres server (Supabase, Neon, Vercel
 *   Postgres, RDS...) through the `postgres` driver.
 * - Not set: PGlite, the same Postgres compiled to WebAssembly, in-process.
 *   Data persists in AVANT_PGLITE_DIR (default .data/pglite) in development,
 *   and lives in memory for tests (AVANT_DB=memory) and on serverless hosts
 *   without a database, where `databaseMode()` reports it so the UI can say
 *   bookings will not persist.
 *
 * Callers use `query()` and `tx()` with $1-style parameters and never see
 * which engine is underneath.
 */

import { MIGRATIONS } from './schema.ts'

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface Database extends Db {
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>
}

export type DatabaseMode = 'postgres' | 'embedded' | 'memory'

export function databaseMode(): DatabaseMode {
  if (process.env.DATABASE_URL) return 'postgres'
  if (process.env.AVANT_DB === 'memory' || process.env.VERCEL) return 'memory'
  return 'embedded'
}

let instance: Promise<Database> | null = null

export function db(): Promise<Database> {
  if (!instance) {
    instance = connect().catch((err) => {
      instance = null
      throw err
    })
  }
  return instance
}

/** Tests only: drop the connection so the next call starts fresh. */
export async function resetDb(): Promise<void> {
  const current = instance
  instance = null
  if (current) await (await current as Database & { close?: () => Promise<void> }).close?.()
}

async function connect(): Promise<Database> {
  const mode = databaseMode()
  const database = mode === 'postgres' ? await connectPostgres(process.env.DATABASE_URL as string) : await connectPglite(mode)
  await migrate(database)
  return database
}

async function connectPostgres(url: string): Promise<Database> {
  const { default: postgres } = await import('postgres')
  // prepare:false keeps transaction-mode poolers (Supabase, PgBouncer) happy.
  const sql = postgres(url, { max: 5, prepare: false, idle_timeout: 20, onnotice: () => {} })
  type Unsafe = { unsafe: (text: string, params?: never[]) => PromiseLike<unknown> }
  const wrap = (s: Unsafe): Db => ({
    query: async <T,>(text: string, params: unknown[] = []) => (await s.unsafe(text, params as never[])) as T[],
  })
  return {
    ...wrap(sql as unknown as Unsafe),
    tx: async <T,>(fn: (d: Db) => Promise<T>) => (await sql.begin((t) => fn(wrap(t as unknown as Unsafe)))) as T,
    close: () => sql.end(),
  } as Database
}

async function connectPglite(mode: DatabaseMode): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite')
  const dir = mode === 'memory' ? undefined : process.env.AVANT_PGLITE_DIR || '.data/pglite'
  if (dir) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(dir, { recursive: true })
  }
  const pg = new PGlite(dir)
  type Q = { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }
  const wrap = (s: Q): Db => ({ query: async <T,>(text: string, params: unknown[] = []) => (await s.query(text, params)).rows as T[] })
  return {
    ...wrap(pg),
    tx: <T,>(fn: (d: Db) => Promise<T>) => pg.transaction((t) => fn(wrap(t))),
    close: () => pg.close(),
  } as Database
}

async function migrate(database: Database): Promise<void> {
  await database.query(`create table if not exists schema_migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())`)
  await database.tx(async (t) => {
    // One migrator at a time across serverless instances.
    await t.query(`select pg_advisory_xact_lock(724113)`)
    const done = new Set((await t.query<{ id: number }>(`select id from schema_migrations`)).map((r) => r.id))
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue
      for (const statement of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await t.query(statement)
      await t.query(`insert into schema_migrations (id, name) values ($1, $2)`, [m.id, m.name])
    }
  })
}
