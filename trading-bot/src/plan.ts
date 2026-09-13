/**
 * The day's plan — the thing you and the bot agree on together.
 *
 * The bot proposes a plan every morning (bias, levels, what it will and
 * won't do). You confirm it, tighten it, or tell it to sit out. Once
 * "armed", every scan checks itself against the plan before acting.
 * That is the collaboration: it thinks, you decide, it obeys.
 *
 * Stored as plain JSON in data/plan.json so you can read or delete it.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, ensureDataDir } from './memory.ts'

export const PLAN_PATH = join(DATA_DIR, 'plan.json')

export type DayPlan = {
  dayKey: string
  armedAt: number
  /** 'long' | 'short' | 'both' | 'none' — what you've allowed today. */
  allow: 'long' | 'short' | 'both' | 'none'
  riskPerTradePercent: number
  maxTrades: number
  notes: string
  /** The bot's own summary of why it proposed this. */
  proposal: string
}

export function readPlan(): DayPlan | null {
  if (!existsSync(PLAN_PATH)) return null
  try {
    return JSON.parse(readFileSync(PLAN_PATH, 'utf8')) as DayPlan
  } catch {
    return null
  }
}

export function writePlan(plan: DayPlan): void {
  ensureDataDir()
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2) + '\n')
}

export function clearPlan(): void {
  if (existsSync(PLAN_PATH)) unlinkSync(PLAN_PATH)
}

/** A plan only counts for the trading day it was made on. */
export function planFor(dayKey: string): DayPlan | null {
  const p = readPlan()
  return p && p.dayKey === dayKey ? p : null
}
