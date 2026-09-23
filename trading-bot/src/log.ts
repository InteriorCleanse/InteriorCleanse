/**
 * Structured logging for the 24/7 process (Phase 21). One JSON object per line
 * — machine-readable, greppable, and safe to ship to a log collector — with
 * levels and size-based rotation so a long-running bot never fills the disk.
 * Console stays human-readable; the file is the durable record.
 *
 * Deliberately tiny and dependency-free. Every write is wrapped so a logging
 * failure can never take the trading loop down.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export type LoggerOptions = {
  dir: string
  file?: string
  level?: Level
  /** Rotate when the file passes this many bytes. */
  maxBytes?: number
  /** How many rotated files to keep (file.1 … file.N). */
  maxFiles?: number
  now?: () => number
  /** Also mirror to console (default true). */
  console?: boolean
}

export type Logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => void
  info: (msg: string, fields?: Record<string, unknown>) => void
  warn: (msg: string, fields?: Record<string, unknown>) => void
  error: (msg: string, fields?: Record<string, unknown>) => void
  path: string
}

export function createLogger(opts: LoggerOptions): Logger {
  const level = opts.level ?? 'info'
  const maxBytes = opts.maxBytes ?? 5_000_000
  const maxFiles = opts.maxFiles ?? 5
  const now = opts.now ?? Date.now
  const toConsole = opts.console ?? true
  const path = join(opts.dir, opts.file ?? 'mrcash.log')

  function ensureDir(): void { const d = dirname(path); if (!existsSync(d)) mkdirSync(d, { recursive: true }) }

  function rotateIfNeeded(): void {
    try {
      if (!existsSync(path)) return
      if (statSync(path).size < maxBytes) return
      // file.(N-1) → file.N, …, file → file.1
      for (let i = maxFiles - 1; i >= 1; i--) {
        const from = i === 1 ? path : `${path}.${i - 1}`
        const to = `${path}.${i}`
        if (existsSync(from)) { try { renameSync(from, to) } catch { /* keep going */ } }
      }
    } catch { /* rotation is best-effort */ }
  }

  function write(l: Level, msg: string, fields?: Record<string, unknown>): void {
    if (ORDER[l] < ORDER[level]) return
    const rec = { t: new Date(now()).toISOString(), level: l, msg, ...(fields ?? {}) }
    const line = JSON.stringify(rec)
    if (toConsole) (l === 'error' || l === 'warn' ? console.error : console.log)(line)
    try {
      ensureDir()
      rotateIfNeeded()
      appendFileSync(path, line + '\n')
    } catch { /* never let logging break the loop */ }
  }

  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    path,
  }
}
