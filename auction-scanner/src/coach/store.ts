/**
 * The coach's memory for one member, in coach.json: steps they ticked, what
 * they finished each day (for the streak), and their conversations.
 *
 * A conversation keeps two lists. `api` is exactly what went to and came back
 * from Claude, appended and never edited (the model's thinking is tied to the
 * conversation, so an edited history would be rejected). `display` is what the
 * member reads. A thread is closed after MAX_TURNS and a new one starts with a
 * short note of what came before; the last few threads are kept.
 */
import { randomUUID } from 'node:crypto'
import { readJson, userFile, writeJson } from '../store.ts'

export type Activity = { kind: 'search' | 'read' | 'tool'; label: string }
export type Citation = { url: string; title: string }
export type DisplayMsg = { role: 'user' | 'coach'; text: string; at: number; source?: 'ai' | 'rules'; activity?: Activity[]; citations?: Citation[] }
export type Thread = { id: string; startedAt: number; turns: number; api: unknown[]; display: DisplayMsg[] }
export type CoachState = { ticked: string[]; days: Record<string, string[]>; threads: Thread[] }

const FILE = 'coach.json'
export const MAX_TURNS = 30
const KEEP_THREADS = 5
const KEEP_DAYS = 120

export function readCoach(): CoachState {
  const v = readJson<Partial<CoachState> | null>(userFile(FILE), null)
  return { ticked: Array.isArray(v?.ticked) ? v!.ticked : [], days: v?.days && typeof v.days === 'object' ? v.days : {}, threads: Array.isArray(v?.threads) ? v!.threads : [] }
}

export function writeCoach(s: CoachState): void {
  const days = Object.keys(s.days).sort().slice(-KEEP_DAYS)
  writeJson(userFile(FILE), { ...s, days: Object.fromEntries(days.map((d) => [d, s.days[d]])), threads: s.threads.slice(-KEEP_THREADS) })
}

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Days in a row, ending today or yesterday, with at least one task done. */
export function streak(days: Record<string, string[]>, now: number): number {
  let n = 0
  let d = new Date(now)
  if (!(days[dayKey(d.getTime())]?.length)) d = new Date(d.getTime() - 86_400_000)
  while (days[dayKey(d.getTime())]?.length) { n++; d = new Date(d.getTime() - 86_400_000) }
  return n
}

export function currentThread(s: CoachState, now: number): Thread {
  let t = s.threads[s.threads.length - 1]
  if (!t || t.turns >= MAX_TURNS) {
    t = { id: randomUUID(), startedAt: now, turns: 0, api: [], display: [] }
    s.threads.push(t)
  }
  return t
}

export function newThread(s: CoachState, now: number): Thread {
  const t: Thread = { id: randomUUID(), startedAt: now, turns: 0, api: [], display: [] }
  s.threads.push(t)
  return t
}

/** A plain-text note of the previous thread's last exchanges, to carry into a fresh one. */
export function carryOver(s: CoachState, current: Thread): string {
  const prev = s.threads[s.threads.indexOf(current) - 1]
  if (!prev || current.turns > 0) return ''
  const last = prev.display.slice(-6).map((m) => `${m.role === 'user' ? 'Member' : 'Coach'}: ${m.text.slice(0, 600)}`).join('\n')
  return last ? `Earlier conversation (for context only):\n${last}` : ''
}
