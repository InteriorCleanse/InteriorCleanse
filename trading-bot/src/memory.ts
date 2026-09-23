/**
 * The bot's memory — the decision ledger and the lessons.
 *
 * Source of truth: the store (data/mrcash.db). Two plain files are kept
 * as EXPORTS so you can still read them yourself:
 *
 *   data/ledger.csv     every decision it ever made, one per line
 *   data/learnings.md   lessons in plain English
 *
 * The one rule that matters: memory is only ever written from REAL
 * outcomes measured on REAL price history. Nothing is pre-seeded.
 */

import { existsSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, ensureDataDir, store } from './store.ts'
import { LEDGER_HEADER, ledgerRowToCsv } from './csv.ts'
import type { LedgerRow } from './types.ts'

export { DATA_DIR, ensureDataDir }
export { LEDGER_HEADER }
export const LEDGER_PATH = join(DATA_DIR, 'ledger.csv')
export const LEARNINGS_PATH = join(DATA_DIR, 'learnings.md')

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

/** Makes sure the export files exist, so a curious owner always finds them. */
function ensureFiles(): void {
  ensureDataDir()
  if (!existsSync(LEDGER_PATH)) writeFileSync(LEDGER_PATH, LEDGER_HEADER + '\n')
  if (!existsSync(LEARNINGS_PATH)) writeFileSync(LEARNINGS_PATH, LEARNINGS_INTRO)
}

export function appendLedgerRow(row: LedgerRow): void {
  store().appendLedger(row)
  ensureFiles()
  appendFileSync(LEDGER_PATH, ledgerRowToCsv(row) + '\n')
}

export function readLedger(): LedgerRow[] {
  ensureFiles()
  return store().readLedger()
}

/** The lessons file as text, rebuilt from the store. */
export function readLearnings(): string {
  return LEARNINGS_INTRO + store().lessons().map((l) => `\n- ${l.text} <!-- key:${l.key} -->\n`).join('')
}

/** Adds a lesson — but only once. Re-running a replay must not repeat itself. */
export function addLesson(key: string, lesson: string): boolean {
  const added = store().addLesson(key, lesson)
  if (added) {
    ensureFiles()
    appendFileSync(LEARNINGS_PATH, ['', `- ${lesson} <!-- key:${key} -->`, ''].join('\n'))
  }
  return added
}

/** The lesson lines, without the hidden keys, for display. */
export function lessonLines(): string[] {
  return store().lessons().map((l) => l.text.replace(/<!--.*?-->/g, '').trim())
}

/** Wipes memory back to empty. Used by `npm run memory:reset`. */
export function resetMemory(): void {
  const s = store()
  s.resetLedger()
  s.resetLessons()
  ensureDataDir()
  writeFileSync(LEDGER_PATH, LEDGER_HEADER + '\n')
  writeFileSync(LEARNINGS_PATH, LEARNINGS_INTRO)
}

export function memoryIsEmpty(): boolean {
  const c = store().counts()
  return c.ledger === 0 && c.lessons === 0
}
