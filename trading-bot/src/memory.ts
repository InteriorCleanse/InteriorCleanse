/**
 * The bot's memory — two plain files you can open and read yourself.
 *
 *   data/ledger.csv     every decision it ever made, one per line
 *   data/learnings.md   lessons in plain English
 *
 * Both are deliberately boring formats: the CSV opens in Excel or
 * Google Sheets, the lessons file in any text editor. Nothing is hidden
 * in a database you can't inspect.
 *
 * The one rule that matters: memory is only ever written from REAL
 * outcomes measured on REAL price history. Nothing is pre-seeded.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LedgerRow } from './types.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = join(HERE, '..', 'data')
export const LEDGER_PATH = join(DATA_DIR, 'ledger.csv')
export const LEARNINGS_PATH = join(DATA_DIR, 'learnings.md')

export const LEDGER_HEADER = 'timestamp,symbol,action,price,quantity,reason,mode,outcome,pnl'

const LEARNINGS_INTRO = [
  '# What the bot has learned',
  '',
  'Every line below came from a real signal measured against real price',
  'history. Nothing here was written in advance, and nothing was invented',
  'to make the bot look clever.',
  '',
  'If this file is empty, the bot has not seen enough real losses to have',
  'an opinion yet. That is normal, and it is honest.',
  '',
].join('\n')

export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function ensureFiles(): void {
  ensureDataDir()
  if (!existsSync(LEDGER_PATH)) writeFileSync(LEDGER_PATH, LEDGER_HEADER + '\n')
  if (!existsSync(LEARNINGS_PATH)) writeFileSync(LEARNINGS_PATH, LEARNINGS_INTRO)
}

/** CSV needs quoting because our reasons contain commas. */
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function csvSplit(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function appendLedgerRow(row: LedgerRow): void {
  ensureFiles()
  const line = [
    row.timestamp,
    row.symbol,
    row.action,
    String(row.price),
    String(row.quantity),
    csvEscape(row.reason),
    row.mode,
    row.outcome,
    String(row.pnl),
  ].join(',')
  appendFileSync(LEDGER_PATH, line + '\n')
}

export function readLedger(): LedgerRow[] {
  ensureFiles()
  const text = readFileSync(LEDGER_PATH, 'utf8')
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length <= 1) return []
  return lines.slice(1).map((line) => {
    const f = csvSplit(line)
    return {
      timestamp: f[0] ?? '',
      symbol: f[1] ?? '',
      action: f[2] ?? '',
      price: Number(f[3] ?? 0),
      quantity: Number(f[4] ?? 0),
      reason: f[5] ?? '',
      mode: f[6] ?? '',
      outcome: f[7] ?? '',
      pnl: Number(f[8] ?? 0),
    }
  })
}

export function readLearnings(): string {
  ensureFiles()
  return readFileSync(LEARNINGS_PATH, 'utf8')
}

/** Adds a lesson — but only once. Re-running a replay must not repeat itself. */
export function addLesson(key: string, lesson: string): boolean {
  ensureFiles()
  const current = readLearnings()
  const marker = `<!-- key:${key} -->`
  if (current.includes(marker)) return false
  appendFileSync(LEARNINGS_PATH, ['', `- ${lesson} ${marker}`, ''].join('\n'))
  return true
}

/** The lesson lines, without the hidden keys, for display. */
export function lessonLines(): string[] {
  return readLearnings()
    .split('\n')
    .filter((l) => l.trim().startsWith('- '))
    .map((l) => l.replace(/<!--.*?-->/g, '').trim())
}

/** Wipes memory back to empty. Used by `npm run memory:reset`. */
export function resetMemory(): void {
  ensureDataDir()
  writeFileSync(LEDGER_PATH, LEDGER_HEADER + '\n')
  writeFileSync(LEARNINGS_PATH, LEARNINGS_INTRO)
}

export function memoryIsEmpty(): boolean {
  return readLedger().length === 0 && lessonLines().length === 0
}
