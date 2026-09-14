/**
 * The trading journal — the part that makes you better, not the bot.
 *
 * A journal is only useful if it is honest and if it gets reviewed.
 * So every entry separates two things most people blur together:
 *   OUTCOME   — did the trade make money (mostly luck, short term)
 *   EXECUTION — did you do what you said you'd do (entirely you)
 * ...and the review scores you on the second one. Over a hundred trades
 * the first follows the second. That's the growth part.
 *
 * Stored as one JSON line per entry in data/journal.jsonl, readable in
 * any text editor. Goals live in data/goals.json.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.ts'
import { DATA_DIR, ensureDataDir } from './memory.ts'
import { store } from './store.ts'
import { toET, tradingDayKey } from './sessions.ts'
import type { Snapshot } from './bot.ts'

export const JOURNAL_PATH = join(DATA_DIR, 'journal.jsonl')
export const GOALS_PATH = join(DATA_DIR, 'goals.json')

export const EMOTIONS = ['calm', 'confident', 'hesitant', 'fomo', 'revenge', 'bored', 'tired', 'rushed', 'anxious', 'greedy'] as const
export const TAGS = ['followed plan', 'chased', 'early entry', 'late entry', 'moved stop', 'took profit early', 'sized right', 'sized too big', 'outside killzone', 'news', 'A+ setup', 'B setup', 'skipped a good one'] as const

export type Outcome = 'open' | 'win' | 'loss' | 'flat' | 'skipped' | 'missed'

export type JournalEntry = {
  id: string
  createdAt: number
  updatedAt: number
  tradeTime: number
  symbol: string
  direction: 'long' | 'short' | 'none'
  session: string
  setupKey: string
  entry: number | null
  stop: number | null
  target: number | null
  exit: number | null
  rMultiple: number | null
  outcome: Outcome
  /** 1–5: how well you executed YOUR process, regardless of result. */
  execution: number
  followedPlan: boolean | null
  emotions: string[]
  tags: string[]
  wentWell: string
  improve: string
  lesson: string
  notes: string
  /** What the bot thought at the time, so you can compare later. */
  botSnapshot?: { decision: string; firstFail: string | null; bias: string; state: string; quality?: number }
}

export type Goal = {
  id: string
  title: string
  kind: 'auto' | 'manual'
  metric?: 'journaledDays7' | 'processScore' | 'revengeCount7' | 'avgExecution'
  target?: number
  done?: boolean
}

const DEFAULT_GOALS: Goal[] = [
  { id: 'journal-daily', title: 'Journal every trading day this week', kind: 'auto', metric: 'journaledDays7', target: 5 },
  { id: 'follow-plan', title: 'Follow the plan on 90% of trades', kind: 'auto', metric: 'processScore', target: 90 },
  { id: 'no-revenge', title: 'Zero revenge trades this week', kind: 'auto', metric: 'revengeCount7', target: 0 },
  { id: 'execution', title: 'Average execution score of 4 or better', kind: 'auto', metric: 'avgExecution', target: 4 },
]

const PROMPTS = [
  'What would the best version of you have done at the London open today?',
  'Which trade this week did you take because you were bored, not because the checklist passed?',
  'If you could only take one setup for the rest of the month, which one — and why?',
  'What did the bot see that you ignored? What did you see that the bot missed?',
  'When did you last move a stop? What were you telling yourself at the time?',
  "Describe yesterday's session in one sentence a stranger would understand.",
  'What is the one rule you break most? What would make it impossible to break?',
  'Which loss this week was a good trade? Which win was a bad one?',
  'How did you feel five minutes before your last entry — and was that feeling in the plan?',
  'What are you avoiding writing down?',
]

// ---------------------------------------------------------------
// Storage
// ---------------------------------------------------------------

export function readJournal(): JournalEntry[] {
  return store().journalAll<JournalEntry>().sort((a, b) => a.tradeTime - b.tradeTime)
}

/** Writes the store, then mirrors to data/journal.jsonl so the file stays readable. */
function writeJournal(entries: JournalEntry[]): void {
  store().journalReplaceAll(entries)
  ensureDataDir()
  writeFileSync(JOURNAL_PATH, entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''))
}

export function computeR(direction: JournalEntry['direction'], entry: number | null, stop: number | null, exit: number | null): number | null {
  if (direction === 'none' || entry === null || stop === null || exit === null) return null
  const dist = Math.abs(entry - stop)
  if (!(dist > 0)) return null
  const dir = direction === 'long' ? 1 : -1
  return ((exit - entry) * dir) / dist - (config.feePercent * 2) / 100 * (entry / dist)
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** Creates or updates an entry. Unknown fields are ignored; R is recomputed. */
export function upsertEntry(input: Partial<JournalEntry> & { id?: string }): JournalEntry {
  const entries = readJournal()
  const now = Date.now()
  const existing = input.id ? entries.find((e) => e.id === input.id) : undefined
  const base: JournalEntry = existing ?? {
    id: input.id || `j${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now, updatedAt: now, tradeTime: now, symbol: config.symbol, direction: 'none', session: '', setupKey: '',
    entry: null, stop: null, target: null, exit: null, rMultiple: null, outcome: 'open', execution: 3, followedPlan: null,
    emotions: [], tags: [], wentWell: '', improve: '', lesson: '', notes: '',
  }
  const e: JournalEntry = {
    ...base,
    updatedAt: now,
    tradeTime: num(input.tradeTime) ?? base.tradeTime,
    symbol: String(input.symbol ?? base.symbol).slice(0, 20),
    direction: (['long', 'short', 'none'] as const).includes(input.direction as never) ? (input.direction as JournalEntry['direction']) : base.direction,
    session: String(input.session ?? base.session).slice(0, 40),
    setupKey: String(input.setupKey ?? base.setupKey).slice(0, 120),
    entry: input.entry !== undefined ? num(input.entry) : base.entry,
    stop: input.stop !== undefined ? num(input.stop) : base.stop,
    target: input.target !== undefined ? num(input.target) : base.target,
    exit: input.exit !== undefined ? num(input.exit) : base.exit,
    outcome: (['open', 'win', 'loss', 'flat', 'skipped', 'missed'] as const).includes(input.outcome as never) ? (input.outcome as Outcome) : base.outcome,
    execution: Math.min(5, Math.max(1, Math.round(num(input.execution) ?? base.execution))),
    followedPlan: input.followedPlan === undefined ? base.followedPlan : input.followedPlan === null ? null : Boolean(input.followedPlan),
    emotions: Array.isArray(input.emotions) ? input.emotions.map(String).slice(0, 10) : base.emotions,
    tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 15) : base.tags,
    wentWell: String(input.wentWell ?? base.wentWell).slice(0, 2000),
    improve: String(input.improve ?? base.improve).slice(0, 2000),
    lesson: String(input.lesson ?? base.lesson).slice(0, 1000),
    notes: String(input.notes ?? base.notes).slice(0, 4000),
    botSnapshot: input.botSnapshot ?? base.botSnapshot,
  }
  e.rMultiple = computeR(e.direction, e.entry, e.stop, e.exit)
  if (e.rMultiple !== null && e.outcome === 'open') e.outcome = e.rMultiple > 0.05 ? 'win' : e.rMultiple < -0.05 ? 'loss' : 'flat'
  const next = existing ? entries.map((x) => (x.id === e.id ? e : x)) : [...entries, e]
  writeJournal(next)
  return e
}

export function deleteEntry(id: string): boolean {
  const entries = readJournal()
  const next = entries.filter((e) => e.id !== id)
  if (next.length === entries.length) return false
  writeJournal(next)
  return true
}

export function readGoals(): Goal[] {
  const g = store().getJson<Goal[]>('goals')
  return Array.isArray(g) && g.length ? g : DEFAULT_GOALS
}

export function saveGoals(goals: Goal[]): void {
  const list = goals.slice(0, 20)
  store().setJson('goals', list)
  ensureDataDir()
  writeFileSync(GOALS_PATH, JSON.stringify(list, null, 2) + '\n')
}

// ---------------------------------------------------------------
// Stats and the review — pure functions, so the self-test can check them
// ---------------------------------------------------------------

export type Bucket = { label: string; n: number; avgR: number | null; winRate: number | null; totalR: number }

export type JournalStats = {
  total: number
  closed: number
  wins: number
  losses: number
  winRate: number | null
  avgR: number | null
  totalR: number
  avgExecution: number | null
  processScore: number | null
  journaledDays7: number
  revengeCount7: number
  streakDays: number
  byEmotion: Bucket[]
  bySession: Bucket[]
  byTag: Bucket[]
  byPlan: { followed: Bucket; broke: Bucket }
  byExecution: Bucket[]
}

function bucket(label: string, list: JournalEntry[]): Bucket {
  const withR = list.filter((e) => e.rMultiple !== null)
  const totalR = withR.reduce((s, e) => s + (e.rMultiple ?? 0), 0)
  const wins = list.filter((e) => e.outcome === 'win').length
  const decided = list.filter((e) => e.outcome === 'win' || e.outcome === 'loss').length
  return { label, n: list.length, avgR: withR.length ? totalR / withR.length : null, winRate: decided ? wins / decided : null, totalR }
}

function groupBy(list: JournalEntry[], keys: (e: JournalEntry) => string[]): Bucket[] {
  const m = new Map<string, JournalEntry[]>()
  for (const e of list) for (const k of keys(e)) m.set(k, [...(m.get(k) ?? []), e])
  return [...m.entries()].map(([k, v]) => bucket(k, v)).sort((a, b) => b.n - a.n)
}

export function computeStats(entries: JournalEntry[], now = Date.now()): JournalStats {
  const closed = entries.filter((e) => e.outcome === 'win' || e.outcome === 'loss' || e.outcome === 'flat')
  const wins = closed.filter((e) => e.outcome === 'win').length
  const losses = closed.filter((e) => e.outcome === 'loss').length
  const withR = closed.filter((e) => e.rMultiple !== null)
  const totalR = withR.reduce((s, e) => s + (e.rMultiple ?? 0), 0)
  const planKnown = entries.filter((e) => e.followedPlan !== null && e.outcome !== 'skipped' && e.outcome !== 'missed')
  const week = entries.filter((e) => now - e.tradeTime <= 7 * 86_400_000)
  const days7 = new Set(week.map((e) => tradingDayKey(e.tradeTime))).size

  // Streak: consecutive weekdays (ET) with an entry, ending today or yesterday.
  const daysWithEntry = new Set(entries.map((e) => tradingDayKey(e.tradeTime)))
  let streak = 0
  let cursor = now
  let allowedGap = 1
  // A day with an entry always counts — weekends included. A weekend
  // WITHOUT an entry is simply skipped; a weekday without one costs the
  // one free gap, then ends the streak.
  for (let i = 0; i < 60; i++) {
    const key = tradingDayKey(cursor)
    const wd = toET(cursor).weekday
    if (daysWithEntry.has(key)) streak++
    else if (wd !== 0 && wd !== 6 && allowedGap-- <= 0) break
    cursor -= 86_400_000
  }

  return {
    total: entries.length,
    closed: closed.length,
    wins,
    losses,
    winRate: wins + losses ? wins / (wins + losses) : null,
    avgR: withR.length ? totalR / withR.length : null,
    totalR,
    avgExecution: entries.length ? entries.reduce((s, e) => s + e.execution, 0) / entries.length : null,
    processScore: planKnown.length ? Math.round((planKnown.filter((e) => e.followedPlan).length / planKnown.length) * 100) : null,
    journaledDays7: days7,
    revengeCount7: week.filter((e) => e.emotions.includes('revenge')).length,
    streakDays: streak,
    byEmotion: groupBy(closed, (e) => (e.emotions.length ? e.emotions : ['(none logged)'])),
    bySession: groupBy(closed, (e) => [e.session || '(no session)']),
    byTag: groupBy(closed, (e) => (e.tags.length ? e.tags : ['(no tags)'])),
    byPlan: { followed: bucket('followed the plan', closed.filter((e) => e.followedPlan === true)), broke: bucket('broke the plan', closed.filter((e) => e.followedPlan === false)) },
    byExecution: groupBy(closed, (e) => [`${e.execution}/5`]),
  }
}

export type Review = {
  headline: string
  insights: string[]
  oneThing: string
  goals: Array<Goal & { progress: number | null; status: 'done' | 'on track' | 'behind' | 'manual' }>
  streakDays: number
  prompt: string
}

const fmtR = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}R`

export function buildReview(entries: JournalEntry[], goals: Goal[], now = Date.now()): Review {
  const s = computeStats(entries, now)
  const insights: string[] = []
  const leaks: Array<{ text: string; cost: number }> = []

  if (s.total === 0) {
    return {
      headline: 'Nothing journaled yet. The first entry is the hardest — write one about the last trade you remember, even a paper one.',
      insights: ['The review gets sharper with every entry. Ten trades is where patterns start to show.'],
      oneThing: 'Write one entry today. Use the "from current setup" button — it fills in what the bot saw so you only add how you felt and what you did.',
      goals: goals.map((g) => ({ ...g, progress: null, status: g.kind === 'manual' ? 'manual' : 'behind' })),
      streakDays: 0,
      prompt: PROMPTS[Math.floor(now / 86_400_000) % PROMPTS.length],
    }
  }

  // Plan discipline: the single most important number
  if (s.byPlan.followed.n >= 2 && s.byPlan.broke.n >= 2 && s.byPlan.followed.avgR !== null && s.byPlan.broke.avgR !== null) {
    const diff = s.byPlan.followed.avgR - s.byPlan.broke.avgR
    insights.push(`Following the plan averaged ${fmtR(s.byPlan.followed.avgR)} per trade; breaking it averaged ${fmtR(s.byPlan.broke.avgR)}. That gap (${fmtR(diff)}) is the price of improvising.`)
    if (diff > 0) leaks.push({ text: `Broken-plan trades cost you about ${fmtR(diff * s.byPlan.broke.n)} in total. The fix isn't a better plan — it's obeying the one you have.`, cost: diff * s.byPlan.broke.n })
  } else if (s.processScore !== null) {
    insights.push(`You followed your plan on ${s.processScore}% of trades. Aim for 90%+ before judging the strategy at all.`)
  }

  // Emotional leaks
  for (const b of s.byEmotion) {
    if (b.label.startsWith('(') || b.n < 3 || b.avgR === null) continue
    if (b.avgR < -0.2) leaks.push({ text: `Trades logged as "${b.label}" (${b.n} of them) average ${fmtR(b.avgR)}. That feeling is a signal to step away, not to click.`, cost: -b.avgR * b.n })
    if (b.avgR > 0.3 && b.label === 'calm') insights.push(`Your calm trades average ${fmtR(b.avgR)}. Whatever gets you calm before the killzone is worth protecting.`)
  }
  // Session leaks
  for (const b of s.bySession) {
    if (b.label.startsWith('(') || b.n < 3 || b.avgR === null) continue
    if (b.avgR < -0.2) leaks.push({ text: `${b.label} is your weak session: ${b.n} trades averaging ${fmtR(b.avgR)}. Consider watching it for a week without trading it.`, cost: -b.avgR * b.n })
    if (b.avgR > 0.3) insights.push(`${b.label} is your strong session: ${b.n} trades averaging ${fmtR(b.avgR)}.`)
  }
  // Tag leaks
  for (const b of s.byTag) {
    if (b.label.startsWith('(') || b.n < 3 || b.avgR === null) continue
    if (b.avgR < -0.2 && ['chased', 'late entry', 'moved stop', 'sized too big', 'outside killzone', 'early entry'].includes(b.label)) {
      leaks.push({ text: `"${b.label}" shows up on ${b.n} trades averaging ${fmtR(b.avgR)}. That's a habit, and habits are fixable.`, cost: -b.avgR * b.n })
    }
  }
  // Execution vs outcome
  const good = s.byExecution.filter((b) => ['4/5', '5/5'].includes(b.label)).reduce((acc, b) => ({ n: acc.n + b.n, r: acc.r + b.totalR }), { n: 0, r: 0 })
  const poor = s.byExecution.filter((b) => ['1/5', '2/5'].includes(b.label)).reduce((acc, b) => ({ n: acc.n + b.n, r: acc.r + b.totalR }), { n: 0, r: 0 })
  if (good.n >= 3 && poor.n >= 3) insights.push(`Well-executed trades (4–5/5) total ${fmtR(good.r)} across ${good.n}; poorly executed ones (1–2/5) total ${fmtR(poor.r)} across ${poor.n}. Execution is the lever.`)
  if (s.avgR !== null && s.closed >= 5) insights.push(`Across ${s.closed} closed trades: ${s.winRate !== null ? Math.round(s.winRate * 100) : 0}% win rate, ${fmtR(s.avgR)} average, ${fmtR(s.totalR)} total.`)
  if (s.closed < 10) insights.push(`${s.closed} closed trade(s) is too few to trust any pattern. Keep logging — the review is honest about small samples.`)

  leaks.sort((a, b) => b.cost - a.cost)
  const oneThing = leaks[0]?.text ?? (s.journaledDays7 < 3 ? 'Consistency first: journal every trading day this week, even the days you did nothing. "I did nothing, correctly" is a valid entry.' : 'No clear leak in the data yet. Keep the process score high and let the sample grow.')

  const headline =
    s.processScore !== null && s.processScore >= 90 ? `Discipline is there (${s.processScore}% plan-following). Now it's about sample size.` :
    leaks.length ? 'There is one clear leak below. Fixing it is worth more than any new indicator.' :
    `${s.total} entries, ${s.streakDays}-day streak. Keep going.`

  const progressOf = (g: Goal): { progress: number | null; status: Review['goals'][number]['status'] } => {
    if (g.kind === 'manual') return { progress: null, status: g.done ? 'done' : 'manual' }
    const v = g.metric === 'journaledDays7' ? s.journaledDays7 : g.metric === 'processScore' ? s.processScore : g.metric === 'revengeCount7' ? s.revengeCount7 : s.avgExecution
    if (v === null || v === undefined || g.target === undefined) return { progress: null, status: 'behind' }
    if (g.metric === 'revengeCount7') return { progress: v, status: v <= g.target ? 'done' : 'behind' }
    return { progress: v, status: v >= g.target ? 'done' : v >= g.target * 0.6 ? 'on track' : 'behind' }
  }

  return {
    headline,
    insights,
    oneThing,
    goals: goals.map((g) => ({ ...g, ...progressOf(g) })),
    streakDays: s.streakDays,
    prompt: PROMPTS[Math.floor(now / 86_400_000) % PROMPTS.length],
  }
}

/** A journal entry pre-filled from what the bot sees right now. */
export function entryFromSnapshot(snap: Snapshot): Partial<JournalEntry> {
  const a = snap.analysis
  const sig = snap.signal
  const firstFail = sig.evidence.find((e) => !e.passed)?.step ?? null
  return {
    tradeTime: sig.time,
    symbol: config.symbol,
    direction: sig.plan?.direction ?? 'none',
    session: a?.session ? config.ict.sessions[a.session].label : '',
    setupKey: sig.setupKey,
    entry: sig.plan?.entry ?? null,
    stop: sig.plan?.stop ?? null,
    target: sig.plan?.takeProfit ?? null,
    outcome: sig.plan ? 'open' : 'skipped',
    botSnapshot: { decision: sig.action, firstFail, bias: a?.bias.direction ?? 'n/a', state: snap.state?.summary ?? '', quality: sig.quality },
  }
}

/** Compact text for the assistant. */
export function journalSummaryForAI(entries: JournalEntry[], now = Date.now()): string {
  const s = computeStats(entries, now)
  const r = buildReview(entries, readGoals(), now)
  const recent = entries.slice(-8).map((e) => `  - ${new Date(e.tradeTime).toISOString().slice(0, 16)} ${e.direction} ${e.session} ${e.outcome}${e.rMultiple !== null ? ` ${fmtR(e.rMultiple)}` : ''} exec ${e.execution}/5 plan:${e.followedPlan === null ? '?' : e.followedPlan ? 'yes' : 'NO'} emotions:[${e.emotions.join(',')}] tags:[${e.tags.join(',')}]${e.lesson ? ` lesson:"${e.lesson}"` : ''}`)
  return [
    `JOURNAL: ${s.total} entries, ${s.closed} closed, win rate ${s.winRate !== null ? Math.round(s.winRate * 100) + '%' : 'n/a'}, avg ${s.avgR !== null ? fmtR(s.avgR) : 'n/a'}, process score ${s.processScore ?? 'n/a'}%, avg execution ${s.avgExecution?.toFixed(1) ?? 'n/a'}/5, streak ${s.streakDays} days.`,
    `Review headline: ${r.headline}`,
    `One thing to fix: ${r.oneThing}`,
    ...r.insights.map((i) => `  • ${i}`),
    'Recent entries:',
    ...recent,
  ].join('\n')
}
