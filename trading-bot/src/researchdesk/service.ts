/**
 * THE RESEARCH DESK, RUNNING — the six roles on the guide's schedule, one shared
 * log, and at most three decision cards a day.
 *
 *   Scout    weekdays 09:45, 12:30, 15:30 New York; coins also 00:00, 08:00, 16:00 every day
 *   Whale    weekdays 07:00
 *   Chief    weekdays 16:30: today's cards, or "Nothing needs you today"
 *   Chief    Sundays 18:00: the weekly noise review (suggests, never edits)
 *
 * Reporter, Hunter and Skeptic run only when Scout flags something, as in the
 * guide. Everything is logged in order, like the group chat. The owner's
 * settings are stored as the owner wrote them; no role writes to them.
 *
 * RESEARCH ONLY: nothing here trades, sizes, or reaches the engine.
 */
import { store } from '../store.ts'
import type { CalendarEvent, Candle, Headline } from '../types.ts'
import type { InsiderTrade } from '../bigmoney/parse.ts'
import { DEFAULT_CONFIG, chief, closeAfter, dryRun, hunter, reporter, sanitizeConfig, scout, skeptic, tally, whale } from './roles.ts'
import type { Card, DeskConfig, Flag, Idea, MarketInput, ScoreRow } from './roles.ts'

export type Who = 'Scout' | 'Hunter' | 'Reporter' | 'Whale' | 'Skeptic' | 'Chief' | 'You'
export type Post = { at: number; who: Who; text: string; key?: string; tag?: string[] }
export type SentCard = Card & { after5: number | null; after20: number | null }

type State = {
  config: DeskConfig
  ideas: Idea[]
  held: Array<{ id: string; at: number; label: string; why: string }>
  cards: SentCard[]
  log: Post[]
  runs: Record<string, number>
  review: { at: number; lines: string[] } | null
}

export type DeskDeps = {
  markets: () => MarketInput[]
  news: () => Promise<{ headlines: Headline[]; calendar: CalendarEvent[] } | null>
  insiders: () => InsiderTrade[] | null
  candles: (key: string) => Candle[]
  alert?: (title: string, body: string) => void
  now?: () => number
}

const KEY = 'rdesk:state'
export const SCHEDULE = [
  { id: 'whale', who: 'Whale', days: 'weekdays', at: '07:00', what: 'new insider filings on the watchlist' },
  { id: 'scan-am', who: 'Scout', days: 'weekdays', at: '09:45', what: 'scan the watchlist' },
  { id: 'scan-mid', who: 'Scout', days: 'weekdays', at: '12:30', what: 'scan the watchlist' },
  { id: 'scan-pm', who: 'Scout', days: 'weekdays', at: '15:30', what: 'scan the watchlist' },
  { id: 'chief', who: 'Chief', days: 'weekdays', at: '16:30', what: 'decision cards, or "Nothing needs you today"' },
  { id: 'coins-0', who: 'Scout', days: 'every day', at: '00:00', what: 'coins only' },
  { id: 'coins-8', who: 'Scout', days: 'every day', at: '08:00', what: 'coins only' },
  { id: 'coins-16', who: 'Scout', days: 'every day', at: '16:00', what: 'coins only' },
  { id: 'review', who: 'Chief', days: 'Sundays', at: '18:00', what: 'weekly noise review; suggests, never edits' },
] as const

/** New York date, weekday (0 = Sunday) and minutes past midnight. */
export function nyClock(ms: number): { date: string; weekday: number; minutes: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: wd, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) }
}

/** The slots due now: inside their first 30 minutes and not yet run today. */
export function dueSlots(ms: number, runs: Record<string, number>): string[] {
  const c = nyClock(ms)
  return SCHEDULE.filter((s) => {
    const [h, m] = s.at.split(':').map(Number)
    const start = h * 60 + m
    const dayOk = s.days === 'every day' || (s.days === 'weekdays' ? c.weekday >= 1 && c.weekday <= 5 : c.weekday === 0)
    return dayOk && c.minutes >= start && c.minutes < start + 30 && !runs[`${c.date}:${s.id}`]
  }).map((s) => s.id)
}

export class ResearchDesk {
  private state: State
  private timer: NodeJS.Timeout | null = null
  private running = false
  private readonly deps: DeskDeps
  constructor(deps: DeskDeps) { this.deps = deps; this.state = this.load() }

  private now() { return (this.deps.now ?? Date.now)() }
  private load(): State {
    const s = store().getJson<Partial<State>>(KEY) ?? {}
    return { config: sanitizeConfig(s.config ?? DEFAULT_CONFIG), ideas: s.ideas ?? [], held: s.held ?? [], cards: s.cards ?? [], log: s.log ?? [], runs: s.runs ?? {}, review: s.review ?? null }
  }
  private save(): void {
    const s = this.state
    const cutoff = this.now() - 14 * 86_400_000
    s.ideas = s.ideas.filter((i) => i.at >= cutoff).slice(-200)
    s.held = s.held.slice(-200); s.cards = s.cards.slice(-300); s.log = s.log.slice(-400)
    s.runs = Object.fromEntries(Object.entries(s.runs).filter(([, t]) => t >= cutoff))
    try { store().setJson(KEY, s) } catch { /* the desk keeps its state in memory until the store answers */ }
  }
  private post(who: Who, text: string, extra: Partial<Post> = {}): void { this.state.log.push({ at: this.now(), who, text, ...extra }) }

  config(): DeskConfig { return this.state.config }
  setConfig(raw: unknown): DeskConfig {
    this.state.config = sanitizeConfig(raw, this.state.config)
    this.post('You', 'Updated the watchlist, rules, checklist or limits.')
    this.save()
    return this.state.config
  }
  choose(cardId: string, choice: Card['choice']): SentCard | null {
    const c = this.state.cards.find((x) => x.id === cardId)
    if (!c || !['research', 'watch', 'ignore'].includes(String(choice))) return null
    c.choice = choice
    this.post('You', `${c.label}: ${choice === 'research' ? 'research more' : choice === 'watch' ? 'add to watch' : 'ignore'}.`, { key: c.key })
    this.save()
    return c
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.tick().catch(() => {}) }, 60_000)
    this.timer.unref?.()
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  /** Run whatever is due on the New York clock. */
  async tick(): Promise<string[]> {
    if (this.running) return []
    const due = dueSlots(this.now(), this.state.runs)
    if (!due.length) return []
    this.running = true
    try {
      const date = nyClock(this.now()).date
      for (const id of due) {
        this.state.runs[`${date}:${id}`] = this.now()
        if (id === 'whale') this.whaleRun()
        else if (id.startsWith('scan')) await this.scan('all')
        else if (id.startsWith('coins')) await this.scan('crypto')
        else if (id === 'chief') this.chiefRun()
        else if (id === 'review') this.weeklyReview()
      }
      this.save()
      return due
    } finally { this.running = false }
  }

  private ideasThisWeek(): number { const t = this.now() - 7 * 86_400_000; return this.state.cards.filter((c) => c.at >= t).length }

  /** Scout, then for each flagged market Reporter, Hunter, Whale and Skeptic, in that order. One idea per market per New York day. */
  async scan(scope: 'all' | 'crypto'): Promise<Idea[]> {
    const now = this.now(), cfg = this.state.config
    const markets = this.deps.markets().filter((m) => scope === 'all' || m.kind === 'crypto')
    const { flags, skipped } = scout(markets, cfg, now)
    if (!flags.length) { this.post('Scout', `No flags (${markets.length} markets checked${skipped.length ? `; ${skipped.length} not scanned: ${skipped.slice(0, 3).join('; ')}` : ''}).`); this.save(); return [] }
    const byKey = new Map<string, Flag[]>()
    for (const f of flags) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f])
    for (const fs of byKey.values()) this.post('Scout', `${fs[0].label} | ${fs.map((f) => f.text).join('; ')} | ${fs[0].provenance}`, { key: fs[0].key, tag: ['Hunter', 'Reporter', 'Chief'] })
    let news: Awaited<ReturnType<DeskDeps['news']>> = null
    try { news = await this.deps.news() } catch { news = null }
    const today = nyClock(now).date
    const out: Idea[] = []
    for (const [key, fs] of byKey) {
      if (this.state.ideas.some((i) => i.flag.key === key && nyClock(i.at).date === today)) continue
      const m = markets.find((x) => x.key === key)!
      const lead = fs.find((f) => f.rule === 'move') ?? fs[0]
      const n = reporter(lead, news?.headlines ?? null, now)
      this.post('Reporter', `${lead.label}: CAUSE ${n.cause} · CONFIRMED BY ${n.confirmedBy} · SENTIMENT ${n.sentiment} · ${n.verdict === 'CONFIRMED' ? 'real news' : n.verdict === 'RUMOUR' ? 'RUMOUR' : 'no clear cause found'}`, { key, tag: ['Hunter', 'Chief'] })
      const h = hunter(lead, m, n, news?.calendar ?? null, cfg, now)
      this.post('Hunter', `${lead.label}: ${h.score}/6. ${h.lines.map((l) => `${l.n} ${l.result}`).join(' · ')}`, { key, tag: h.score >= cfg.minPass ? ['Chief', 'Skeptic'] : [] })
      const w = whale(lead, this.deps.insiders(), now)
      if (w.status === 'UNUSUAL') this.post('Whale', `${lead.label}: ${w.lines.join(' ')}`, { key, tag: ['Chief', 'Skeptic'] })
      const s = skeptic(lead, m, n, h, w, cfg, this.ideasThisWeek(), now)
      this.post('Skeptic', `${s.limits === 'BREAKS LIMITS' ? `BREAKS LIMITS (${s.broken}). ` : ''}${lead.label}: ${s.reasons.map((r, i) => `${i + 1}. ${r}`).join(' ')} Proves it wrong: ${s.provesWrong}${s.limits === 'PASSES LIMITS' ? ' PASSES LIMITS.' : ''}${s.flags.length ? ` Flags: ${s.flags.join(', ')}.` : ''}`, { key, tag: ['Chief'] })
      const idea: Idea = { id: `i${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: now, flag: lead, flags: fs, news: n, hunt: h, whale: w, skeptic: s }
      this.state.ideas.push(idea); out.push(idea)
    }
    this.save()
    return out
  }

  whaleRun(): void {
    const cfg = this.state.config, now = this.now()
    const stocks = this.deps.markets().filter((m) => m.kind === 'stock' && (!cfg.watchlist.length || cfg.watchlist.includes(m.key)))
    const notes = stocks.map((m) => ({ m, w: whale(m, this.deps.insiders(), now) })).filter((x) => x.w.status === 'UNUSUAL')
    this.post('Whale', notes.length ? notes.map((x) => `${x.m.label}: ${x.w.lines[0]}`).join(' ') : `Nothing unusual (${stocks.length} stocks checked for insider filings in the last 30 days).`, { tag: notes.length ? ['Chief', 'Skeptic'] : [] })
    this.save()
  }

  /** Chief: today's ideas that have not been decided yet → cards, within the day's cap. */
  chiefRun(): { cards: SentCard[] } {
    const now = this.now(), today = nyClock(now).date, cfg = this.state.config
    const decided = new Set([...this.state.cards.map((c) => c.id), ...this.state.held.map((h) => h.id)])
    const fresh = this.state.ideas.filter((i) => nyClock(i.at).date === today && !decided.has(i.id))
    const sentToday = this.state.cards.filter((c) => nyClock(c.at).date === today).length
    const { cards, held } = chief(fresh, cfg, sentToday)
    for (const h of held) this.state.held.push({ id: h.idea.id, at: now, label: h.idea.flag.label, why: h.why })
    const sent = cards.map((c): SentCard => ({ ...c, after5: null, after20: null }))
    this.state.cards.push(...sent)
    if (sent.length) {
      for (const c of sent) { this.post('Chief', `DECISION CARD: ${c.label} · ${c.fit} · ${c.against}`, { key: c.key }); this.deps.alert?.(`Research desk: ${c.label}`, `${c.whatHappened}. Why: ${c.why}. ${c.fit}. Against it: ${c.against}. Research only: your call.`) }
    } else this.post('Chief', `Nothing needs you today.${held.length ? ` ${held.length} idea${held.length === 1 ? '' : 's'} logged, not sent: ${held.slice(0, 3).map((h) => `${h.idea.flag.label} (${h.why})`).join('; ')}.` : ''}`)
    this.updateScorecard()
    this.save()
    return { cards: sent }
  }

  /** Fill in each card's close 5 and 20 market days later, from the stored candles, once those days have happened. */
  updateScorecard(): void {
    for (const c of this.state.cards) {
      const k = this.deps.candles(c.key)
      if (c.after5 === null) c.after5 = closeAfter(k, c.kind, c.at, 5)
      if (c.after20 === null) c.after20 = closeAfter(k, c.kind, c.at, 20)
    }
  }

  weeklyReview(): void {
    const now = this.now(), since = now - 7 * 86_400_000
    const ideas = this.state.ideas.filter((i) => i.at >= since)
    const lines: string[] = []
    const byRule = new Map<string, { flags: number; cards: number }>()
    for (const i of ideas) for (const f of i.flags) { const r = byRule.get(f.rule) ?? { flags: 0, cards: 0 }; r.flags++; if (this.state.cards.some((c) => c.id === i.id)) r.cards++; byRule.set(f.rule, r) }
    if (!ideas.length) lines.push('A quiet week: no flags. If this keeps up, the rules may be too tight.')
    for (const [rule, r] of [...byRule.entries()].sort((a, b) => b[1].flags - a[1].flags)) lines.push(`Rule "${rule}": ${r.flags} flag${r.flags === 1 ? '' : 's'}, ${r.cards} reached a card${r.flags >= 5 && r.cards === 0 ? '. All noise this week: consider tightening it.' : '.'}`)
    const perDay = ideas.length / 7
    if (perDay > 3) lines.push(`About ${perDay.toFixed(1)} flagged markets a day: more than the guide's 3. Tightening the move rule (for example 7% instead of 5%) is the usual first step.`)
    lines.push('Suggestions only. No file was changed; the settings are yours.')
    this.state.review = { at: now, lines }
    this.post('Chief', `Weekly review: ${lines.join(' ')}`)
    this.save()
  }

  /** The guide's fire drill: scan now, let every role do its part, and say how long each step took. */
  async fireDrill(): Promise<{ steps: Array<{ step: string; ms: number }>; cards: SentCard[] }> {
    const steps: Array<{ step: string; ms: number }> = []
    let t = Date.now()
    this.post('You', 'Fire drill: scan now and send whatever qualifies.')
    await this.scan('all'); steps.push({ step: 'Scout, Reporter, Hunter, Whale, Skeptic', ms: Date.now() - t }); t = Date.now()
    const { cards } = this.chiefRun(); steps.push({ step: 'Chief', ms: Date.now() - t })
    return { steps, cards }
  }

  snapshot() {
    const now = this.now(), today = nyClock(now).date, cfg = this.state.config
    const markets = this.deps.markets()
    this.updateScorecard()
    const scores: ScoreRow[] = tally(this.state.cards)
    return {
      kind: 'RESEARCH DESK' as const, execution: 'NONE' as const, asOf: now, today,
      config: cfg,
      markets: markets.map((m) => ({ key: m.key, label: m.label, kind: m.kind, status: m.status, provenance: m.provenance, watched: !cfg.watchlist.length || cfg.watchlist.includes(m.key), understood: cfg.understood.includes(m.key) })),
      cardsToday: this.state.cards.filter((c) => nyClock(c.at).date === today).reverse(),
      cards: this.state.cards.slice(-30).reverse(),
      heldToday: this.state.held.filter((h) => nyClock(h.at).date === today).reverse(),
      ideasToday: this.state.ideas.filter((i) => nyClock(i.at).date === today).reverse(),
      log: this.state.log.slice(-120).reverse(),
      scorecard: scores,
      review: this.state.review,
      schedule: SCHEDULE.map((s) => ({ ...s, lastRun: Object.entries(this.state.runs).filter(([k]) => k.endsWith(`:${s.id}`)).map(([, v]) => v).sort((a, b) => b - a)[0] ?? null })),
      note: 'RESEARCH ONLY. Six roles read the market watch, the news feed, the calendar and public insider filings, and send at most three decision cards a day. Nothing here trades, sizes an order or reaches the engine; every decision is yours. History is the stored window (days, not months), and that is printed wherever it matters.',
    }
  }

  dry() { return dryRun(this.deps.markets(), this.state.config) }
}
