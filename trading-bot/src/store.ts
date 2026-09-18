/**
 * The store — one file, one source of truth, safe for two processes.
 *
 * Everything the bot remembers lives in data/mrcash.db (SQLite, built
 * into Node — no package to install). The human-readable files you may
 * already know (ledger.csv, learnings.md, journal.jsonl, positions.json,
 * equity.csv, events.jsonl, orderflow.csv, goals.json, plan.json) are
 * still written, but as EXPORTS: the bot reads from the database and
 * mirrors to them, so you can still open them in Excel or a text editor.
 *
 * Why a database: two copies of the bot (the app and `npm run replay`)
 * used to append to the same CSV at once, and nothing survived a crash
 * in a known state. SQLite in WAL mode with a busy timeout gives every
 * write a lock and every restart a consistent file.
 *
 * On first use the store imports whatever flat files exist, once, and
 * records that it did. The originals are never deleted.
 */

import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLedgerCsv } from './csv.ts'
import type { AppEvent, LedgerRow } from './types.ts'

// Node still labels its SQLite module "experimental" and prints a warning
// on first use. That warning would appear at the top of every command a
// beginner runs. Swallow that one warning only; every other warning still
// prints exactly as before.
{
  const original = process.listeners('warning')
  process.removeAllListeners('warning')
  process.on('warning', (w: Error) => {
    if (w.name === 'ExperimentalWarning' && /sqlite/i.test(w.message)) return
    for (const l of original) (l as (w: Error) => void).call(process, w)
  })
}

const HERE = dirname(fileURLToPath(import.meta.url))
/** Where every data file lives. Tests point this somewhere temporary with MRCASH_DATA_DIR. */
export const DATA_DIR = process.env.MRCASH_DATA_DIR ? resolve(process.env.MRCASH_DATA_DIR) : join(HERE, '..', 'data')
export const DB_PATH = join(DATA_DIR, 'mrcash.db')

/** The only fields anything may change on a closed paper position. */
export const RECONCILIATION_FIELDS: ReadonlySet<string> = new Set(['mae', 'mfe', 'reconciledAt', 'reconciliationNote'])

export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, symbol TEXT NOT NULL, action TEXT NOT NULL, price REAL NOT NULL, quantity REAL NOT NULL, reason TEXT NOT NULL, mode TEXT NOT NULL, outcome TEXT NOT NULL, pnl REAL NOT NULL);
CREATE TABLE IF NOT EXISTS lessons (key TEXT PRIMARY KEY, text TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS positions (id TEXT PRIMARY KEY, status TEXT NOT NULL, opened_at INTEGER NOT NULL, closed_at INTEGER, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS equity (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, equity REAL NOT NULL, r REAL NOT NULL, setup_key TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, severity TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS announced (key TEXT PRIMARY KEY, time INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS journal (id TEXT PRIMARY KEY, trade_time INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS flow_log (id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER NOT NULL, price REAL, bid_usd REAL, ask_usd REAL, imbalance REAL, walls TEXT, trades INTEGER, tpm REAL, buy_share REAL, delta_usd REAL, big_buys INTEGER, big_sells INTEGER);
CREATE TABLE IF NOT EXISTS candles (symbol TEXT NOT NULL, interval TEXT NOT NULL, open_time INTEGER NOT NULL, close_time INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, source TEXT NOT NULL, PRIMARY KEY (symbol, interval, open_time));
CREATE INDEX IF NOT EXISTS ledger_mode ON ledger(mode);
CREATE INDEX IF NOT EXISTS positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS journal_time ON journal(trade_time);
CREATE INDEX IF NOT EXISTS flow_time ON flow_log(time);
`

export type MigrationReport = { at: string; imported: Record<string, number>; skipped: string[] }

export type StoreCounts = { ledger: number; lessons: number; positionsOpen: number; positionsClosed: number; events: number; journal: number; flowLog: number }

export class Store {
  readonly db: DatabaseSync
  readonly path: string

  constructor(path: string) {
    this.path = path
    if (path !== ':memory:') ensureDataDir()
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec(SCHEMA)
    this.db.exec(`DELETE FROM announced WHERE time < ${Date.now() - 3 * 86_400_000}`)
    if (path !== ':memory:' && !this.getMeta('migrated')) this.migrateFlatFiles()
  }

  // ---- meta -------------------------------------------------------
  getMeta(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
    return r?.value ?? null
  }
  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  // ---- ledger -----------------------------------------------------
  appendLedger(row: LedgerRow): void {
    this.db.prepare('INSERT INTO ledger(timestamp, symbol, action, price, quantity, reason, mode, outcome, pnl) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(row.timestamp, row.symbol, row.action, row.price, row.quantity, row.reason, row.mode, row.outcome, row.pnl)
  }
  readLedger(): LedgerRow[] {
    return this.db.prepare('SELECT timestamp, symbol, action, price, quantity, reason, mode, outcome, pnl FROM ledger ORDER BY id').all() as unknown as LedgerRow[]
  }
  resetLedger(): void {
    this.db.exec('DELETE FROM ledger')
  }

  // ---- lessons ----------------------------------------------------
  addLesson(key: string, text: string): boolean {
    const r = this.db.prepare('INSERT OR IGNORE INTO lessons(key, text, created_at) VALUES (?,?,?)').run(key, text, new Date().toISOString())
    return Number(r.changes) > 0
  }
  lessons(): Array<{ key: string; text: string }> {
    return this.db.prepare('SELECT key, text FROM lessons ORDER BY rowid').all() as unknown as Array<{ key: string; text: string }>
  }
  resetLessons(): void {
    this.db.exec('DELETE FROM lessons')
  }

  // ---- paper positions ---------------------------------------------
  /**
   * A CLOSED POSITION IS IMMUTABLE, except in the fields designated for
   * reconciliation.
   *
   * The paper record is the evidence the whole validation stage rests on. A
   * blind upsert meant any later code path could rewrite a closed trade's R,
   * exit or outcome and nothing would notice. It now refuses: once a record is
   * closed, the only fields anything may change are the ones walked from stored
   * candles after the fact (`mae`, `mfe`) and the reconciliation stamp. An
   * identical rewrite is allowed (idempotent); a different one throws and names
   * the fields.
   */
  savePosition(pos: { id: string; status: string; openedAt: number; closedAt?: number }): void {
    const prior = this.db.prepare('SELECT status, json FROM positions WHERE id = ?').get(pos.id) as { status: string; json: string } | undefined
    if (prior && prior.status === 'closed') {
      const before = JSON.parse(prior.json) as Record<string, unknown>
      const after = pos as unknown as Record<string, unknown>
      const keys = new Set([...Object.keys(before), ...Object.keys(after)])
      const illegal = [...keys].filter((k) => !RECONCILIATION_FIELDS.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      if (illegal.length) throw new Error(`position ${pos.id} is closed and immutable — refusing to rewrite ${illegal.sort().join(', ')}`)
    }
    this.db.prepare('INSERT INTO positions(id, status, opened_at, closed_at, json) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, closed_at = excluded.closed_at, json = excluded.json')
      .run(pos.id, pos.status, pos.openedAt, pos.closedAt ?? null, JSON.stringify(pos))
  }
  positions<T>(status: 'pending' | 'open' | 'closed'): T[] {
    const rows = this.db.prepare(`SELECT json FROM positions WHERE status = ? ORDER BY ${status === 'closed' ? 'closed_at' : 'opened_at'}`).all(status) as Array<{ json: string }>
    return rows.map((r) => JSON.parse(r.json) as T)
  }

  // ---- equity -----------------------------------------------------
  appendEquity(row: { timestamp: string; equity: number; r: number; setupKey: string }): void {
    this.db.prepare('INSERT INTO equity(timestamp, equity, r, setup_key) VALUES (?,?,?,?)').run(row.timestamp, row.equity, row.r, row.setupKey)
  }
  equityCurve(): Array<{ timestamp: string; equity: number; r: number; setupKey: string }> {
    return this.db.prepare('SELECT timestamp, equity, r, setup_key AS setupKey FROM equity ORDER BY id').all() as unknown as Array<{ timestamp: string; equity: number; r: number; setupKey: string }>
  }

  // ---- events (the bell) -------------------------------------------
  appendEvent(e: Omit<AppEvent, 'id'>): number {
    const r = this.db.prepare('INSERT INTO events(time, kind, title, body, severity) VALUES (?,?,?,?,?)').run(e.time, e.kind, e.title, e.body, e.severity)
    return Number(r.lastInsertRowid)
  }
  recentEvents(limit: number): AppEvent[] {
    const rows = this.db.prepare('SELECT id, time, kind, title, body, severity FROM events ORDER BY id DESC LIMIT ?').all(limit) as unknown as AppEvent[]
    return rows.reverse()
  }
  /** True the first time a key is seen — across restarts. */
  announceOnce(key: string, time = Date.now()): boolean {
    const r = this.db.prepare('INSERT OR IGNORE INTO announced(key, time) VALUES (?,?)').run(key, time)
    return Number(r.changes) > 0
  }

  // ---- journal ----------------------------------------------------
  journalAll<T extends { tradeTime: number }>(): T[] {
    const rows = this.db.prepare('SELECT json FROM journal ORDER BY trade_time').all() as Array<{ json: string }>
    return rows.map((r) => JSON.parse(r.json) as T)
  }
  journalReplaceAll(entries: Array<{ id: string; tradeTime: number }>): void {
    const ins = this.db.prepare('INSERT INTO journal(id, trade_time, json) VALUES (?,?,?)')
    const write = () => {
      this.db.exec('DELETE FROM journal')
      for (const e of entries) ins.run(e.id, e.tradeTime, JSON.stringify(e))
    }
    // Inside the migration a transaction is already open; otherwise open our own.
    if (this.inTransaction) { write(); return }
    this.db.exec('BEGIN')
    try {
      write()
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }
  private inTransaction = false

  // ---- key/value: plan, goals, settings, caches ---------------------
  getJson<T>(key: string): T | null {
    const r = this.db.prepare('SELECT json FROM kv WHERE key = ?').get(key) as { json: string } | undefined
    if (!r) return null
    try { return JSON.parse(r.json) as T } catch { return null }
  }
  setJson(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO kv(key, json, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at').run(key, JSON.stringify(value), Date.now())
  }
  deleteJson(key: string): void {
    this.db.prepare('DELETE FROM kv WHERE key = ?').run(key)
  }
  keysWithPrefix(prefix: string): string[] {
    return (this.db.prepare('SELECT key FROM kv WHERE key LIKE ? ORDER BY key').all(prefix + '%') as Array<{ key: string }>).map((r) => r.key)
  }

  // ---- order-flow log ------------------------------------------------
  appendFlow(row: { time: number; price: number | null; bidUsd: number | null; askUsd: number | null; imbalance: number | null; walls: string; trades: number | null; tpm: number | null; buyShare: number | null; deltaUsd: number | null; bigBuys: number | null; bigSells: number | null }): void {
    this.db.prepare('INSERT INTO flow_log(time, price, bid_usd, ask_usd, imbalance, walls, trades, tpm, buy_share, delta_usd, big_buys, big_sells) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(row.time, row.price, row.bidUsd, row.askUsd, row.imbalance, row.walls, row.trades, row.tpm, row.buyShare, row.deltaUsd, row.bigBuys, row.bigSells)
  }
  flowLog(limit: number): Array<{ time: number; price: number; imbalance: number; deltaUsd: number; tradesPerMinute: number; bigBuys: number; bigSells: number }> {
    const rows = this.db.prepare('SELECT time, price, imbalance, delta_usd AS deltaUsd, tpm AS tradesPerMinute, big_buys AS bigBuys, big_sells AS bigSells FROM flow_log ORDER BY id DESC LIMIT ?').all(limit) as unknown as Array<{ time: number; price: number; imbalance: number; deltaUsd: number; tradesPerMinute: number; bigBuys: number; bigSells: number }>
    return rows.reverse().map((r) => ({ ...r, price: Number(r.price ?? 0), imbalance: Number(r.imbalance ?? 0), deltaUsd: Number(r.deltaUsd ?? 0), tradesPerMinute: Number(r.tradesPerMinute ?? 0), bigBuys: Number(r.bigBuys ?? 0), bigSells: Number(r.bigSells ?? 0) }))
  }

  // ---- candles (the local history) ---------------------------------------
  upsertCandles(symbol: string, interval: string, rows: Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number }>, source: string): number {
    if (!rows.length) return 0
    const ins = this.db.prepare('INSERT INTO candles(symbol, interval, open_time, close_time, open, high, low, close, volume, source) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol, interval, open_time) DO UPDATE SET close_time = excluded.close_time, open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close, volume = excluded.volume, source = excluded.source')
    const own = !this.inTransaction
    if (own) this.db.exec('BEGIN')
    try {
      for (const c of rows) ins.run(symbol, interval, c.openTime, c.closeTime, c.open, c.high, c.low, c.close, c.volume, source)
      if (own) this.db.exec('COMMIT')
    } catch (err) {
      if (own) this.db.exec('ROLLBACK')
      throw err
    }
    return rows.length
  }
  candlesBetween(symbol: string, interval: string, fromOpenTime: number, toOpenTime: number): Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number; source: string }> {
    return this.db.prepare('SELECT open_time AS openTime, close_time AS closeTime, open, high, low, close, volume, source FROM candles WHERE symbol = ? AND interval = ? AND open_time >= ? AND open_time <= ? ORDER BY open_time').all(symbol, interval, fromOpenTime, toOpenTime) as unknown as Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number; source: string }>
  }
  lastCandles(symbol: string, interval: string, limit: number): Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number; source: string }> {
    const rows = this.db.prepare('SELECT open_time AS openTime, close_time AS closeTime, open, high, low, close, volume, source FROM candles WHERE symbol = ? AND interval = ? ORDER BY open_time DESC LIMIT ?').all(symbol, interval, limit) as unknown as Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number; source: string }>
    return rows.reverse()
  }
  candleCount(symbol: string, interval: string): number {
    return Number((this.db.prepare('SELECT COUNT(*) n FROM candles WHERE symbol = ? AND interval = ?').get(symbol, interval) as { n: number }).n)
  }
  pruneCandles(symbol: string, interval: string, olderThanOpenTime: number): number {
    return Number(this.db.prepare('DELETE FROM candles WHERE symbol = ? AND interval = ? AND open_time < ?').run(symbol, interval, olderThanOpenTime).changes)
  }

  // ---- health -------------------------------------------------------
  counts(): StoreCounts {
    const n = (sql: string) => Number((this.db.prepare(sql).get() as { n: number }).n)
    return {
      ledger: n('SELECT COUNT(*) n FROM ledger'), lessons: n('SELECT COUNT(*) n FROM lessons'),
      positionsOpen: n("SELECT COUNT(*) n FROM positions WHERE status = 'open'"), positionsClosed: n("SELECT COUNT(*) n FROM positions WHERE status = 'closed'"),
      events: n('SELECT COUNT(*) n FROM events'), journal: n('SELECT COUNT(*) n FROM journal'), flowLog: n('SELECT COUNT(*) n FROM flow_log'),
    }
  }
  /** SQLite's own consistency check. 'ok' or the first problem it found. */
  integrity(): string {
    const r = this.db.prepare('PRAGMA quick_check').get() as { quick_check: string }
    return r.quick_check
  }
  sizeBytes(): number {
    try { return this.path === ':memory:' ? 0 : statSync(this.path).size } catch { return 0 }
  }
  migration(): MigrationReport | null {
    const raw = this.getMeta('migrated')
    if (!raw) return null
    try { return JSON.parse(raw) as MigrationReport } catch { return null }
  }

  // ---- the one-shot import of the old flat files ----------------------
  private migrateFlatFiles(): void {
    const dir = dirname(this.path)
    const report: MigrationReport = { at: new Date().toISOString(), imported: {}, skipped: [] }
    const read = (name: string): string | null => { const p = join(dir, name); return existsSync(p) ? readFileSync(p, 'utf8') : null }
    const count = (name: string, n: number) => { if (n > 0) report.imported[name] = n; else report.skipped.push(name) }

    this.db.exec('BEGIN')
    this.inTransaction = true
    try {
      const ledger = read('ledger.csv')
      if (ledger) { const rows = parseLedgerCsv(ledger); for (const r of rows) this.appendLedger(r); count('ledger.csv', rows.length) } else report.skipped.push('ledger.csv')

      const learnings = read('learnings.md')
      if (learnings) {
        let n = 0
        for (const line of learnings.split('\n')) {
          const m = /^- (.*?)\s*<!-- key:(.*?) -->\s*$/.exec(line.trim())
          if (m && this.addLesson(m[2], m[1])) n++
        }
        count('learnings.md', n)
      } else report.skipped.push('learnings.md')

      const positions = read('positions.json')
      if (positions) {
        try {
          const s = JSON.parse(positions) as { open?: Array<{ id: string; status: string; openedAt: number; closedAt?: number }>; closed?: Array<{ id: string; status: string; openedAt: number; closedAt?: number }> }
          const all = [...(s.open ?? []), ...(s.closed ?? [])]
          for (const p of all) this.savePosition(p)
          count('positions.json', all.length)
        } catch { report.skipped.push('positions.json (unreadable)') }
      } else report.skipped.push('positions.json')

      const equity = read('equity.csv')
      if (equity) {
        const lines = equity.split('\n').filter((l) => l.trim() && !l.startsWith('timestamp'))
        for (const l of lines) { const f = l.split(','); this.appendEquity({ timestamp: f[0], equity: Number(f[1]), r: Number(f[2]), setupKey: f.slice(3).join(',') }) }
        count('equity.csv', lines.length)
      } else report.skipped.push('equity.csv')

      const events = read('events.jsonl')
      if (events) {
        let n = 0
        for (const l of events.split('\n')) { if (!l.trim()) continue; try { const e = JSON.parse(l) as AppEvent; this.appendEvent(e); n++ } catch { /* skip a bad line */ } }
        count('events.jsonl', n)
      } else report.skipped.push('events.jsonl')

      const journal = read('journal.jsonl')
      if (journal) {
        const entries: Array<{ id: string; tradeTime: number }> = []
        for (const l of journal.split('\n')) { if (!l.trim()) continue; try { entries.push(JSON.parse(l) as { id: string; tradeTime: number }) } catch { /* skip */ } }
        this.journalReplaceAll(entries)
        count('journal.jsonl', entries.length)
      } else report.skipped.push('journal.jsonl')

      for (const [file, key] of [['goals.json', 'goals'], ['plan.json', 'plan'], ['news-cache.json', 'news-cache']] as const) {
        const text = read(file)
        if (text) { try { this.setJson(key, JSON.parse(text)); count(file, 1) } catch { report.skipped.push(`${file} (unreadable)`) } } else report.skipped.push(file)
      }

      const flow = read('orderflow.csv')
      if (flow) {
        const lines = flow.split('\n').filter((l) => l.trim() && !l.startsWith('timestamp'))
        for (const l of lines) {
          const f = l.split(',')
          const num = (s: string | undefined) => (s === undefined || s === '' ? null : Number(s))
          const t = new Date(f[0]).getTime()
          if (!Number.isFinite(t)) continue
          this.appendFlow({ time: t, price: num(f[1]), bidUsd: num(f[2]), askUsd: num(f[3]), imbalance: num(f[4]), walls: f[5] ?? '', trades: num(f[6]), tpm: num(f[7]), buyShare: num(f[8]), deltaUsd: num(f[9]), bigBuys: num(f[10]), bigSells: num(f[11]) })
        }
        count('orderflow.csv', lines.length)
      } else report.skipped.push('orderflow.csv')

      this.setMeta('migrated', JSON.stringify(report))
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    } finally {
      this.inTransaction = false
    }
  }

  close(): void {
    this.db.close()
  }
}

let singleton: Store | null = null

/** The process-wide store for DATA_DIR. Opened on first use. */
export function store(): Store {
  if (!singleton) singleton = new Store(DB_PATH)
  return singleton
}
