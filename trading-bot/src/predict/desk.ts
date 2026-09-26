/**
 * THE PREDICTION DESK — the "$50 → $5,273" experiment, run the honest way.
 *
 * A creator reported giving a Grok bot $50 and one instruction, and reaching
 * $5,273 in 48 hours on prediction markets. No trade logs, statements or
 * audit were shown. The claim is his; this desk tests the general idea on
 * paper, with a $100 paper bankroll and the parameters he reported (a scan
 * every 10 minutes, an 8-point mispricing line, 6% of bankroll per position),
 * and keeps the score he did not publish.
 *
 * Each pass:
 *   1. scan the open markets on Polymarket and Kalshi (public, no keys);
 *   2. read every market with the ten minds and take the council's view;
 *   3. where the council differs from the price by the line, open a PAPER
 *      position at the price a fill would cost, sized by a capped quarter-Kelly;
 *   4. log the decision, with the evidence for and against;
 *   5. when the venue resolves a market, settle the position and score
 *      every mind that spoke on it.
 *
 * A win or a loss is counted only after the venue resolves the market.
 * Unresolved is open, not a result. The record is saved to predictions.json.
 * Nothing here sends an order anywhere: there is no wallet, no key and no
 * execution path, and the engine never sees this desk.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from '../store.ts'
import type { CalendarEvent, Headline } from '../types.ts'
import { fetchKalshi, fetchOne, fetchPolymarket } from './sources.ts'
import type { PmMarket, SourceResult } from './sources.ts'
import { PARAMS, MIND_META, council, paperSize, readMinds } from './minds.ts'
import type { Council, MindId, MindRead, OracleRead } from './minds.ts'

export type PaperPosition = {
  id: string
  key: string
  venue: PmMarket['venue']
  question: string
  url: string
  side: 'YES' | 'NO'
  openedAt: number
  /** Paid per contract; each pays $1 if the side wins. */
  price: number
  contracts: number
  stake: number
  /** The council's probability for the side at entry. */
  pSide: number
  /** The market's YES mid at entry. */
  marketYes: number
  edge: number
  confidence: number
  /** Every mind's YES probability at entry, so each can be scored on resolution. */
  minds: Array<{ id: MindId; p: number | null }>
  for: string[]
  against: string[]
  endsAt: number | null
  status: 'OPEN' | 'WON' | 'LOST'
  /** The venue closed it but has not resolved it yet. */
  awaitingResolution: boolean
  /** The latest YES mid seen, for marking an open position. */
  lastYes: number
  lastSeenAt: number
  resolvedAt: number | null
  outcome: 'YES' | 'NO' | null
  payout: number | null
  pnl: number | null
}

export type Decision = { at: number; key: string; question: string; action: 'OPENED' | 'SKIPPED' | 'SETTLED'; why: string }

type MindScore = { n: number; brierSum: number }

type Saved = {
  version: 1
  startedAt: number | null
  cash: number
  open: PaperPosition[]
  resolved: PaperPosition[]
  mindScore: Partial<Record<MindId, MindScore>>
  decisions: Decision[]
  scans: number
  oracle: Record<string, OracleRead>
}

export type Sheet = {
  label: 'PAPER'
  day: number
  status: 'NOT STARTED' | 'DAY 1 OF 7' | 'IN PROGRESS' | 'TEST COMPLETE'
  startedAt: number | null
  startingBalance: number
  trades: number
  open: number
  wins: number
  losses: number
  largestWin: number | null
  largestLoss: number | null
  /** Cash plus open positions marked at the latest mid. */
  endingBalance: number
  cash: number
  returnPct: number
  right: Array<{ question: string; said: string; pnl: number }>
  wrong: Array<{ question: string; said: string; pnl: number }>
}

export type MindTally = { id: MindId; name: string; role: string; n: number; brier: number | null; skill: number | null; status: 'OK' | 'NOT ENOUGH DATA' }

export type DeskSnapshot = {
  kind: 'PAPER PREDICTION'
  execution: 'NONE'
  asOf: number
  status: 'LIVE' | 'NOT CONNECTED' | 'STARTING' | 'OFF'
  sources: Array<{ venue: PmMarket['venue']; ok: boolean; count: number; reason: string | null }>
  scanned: number
  scans: number
  /** The widest gaps between the council and the price, flagged or not. */
  candidates: Council[]
  open: PaperPosition[]
  resolved: PaperPosition[]
  decisions: Decision[]
  sheet: Sheet
  brain: { minds: MindTally[]; resolved: number; note: string }
  params: typeof PARAMS
  claim: string
  note: string
  oracle: 'off' | 'on'
}

export type Opts = {
  dir?: string
  now?: () => number
  polymarket?: () => Promise<SourceResult>
  kalshi?: () => Promise<SourceResult>
  one?: (key: string) => Promise<PmMarket | null>
  news?: () => Promise<{ headlines: Headline[]; calendar: CalendarEvent[] } | null>
  /** Ask a language model about one flagged market. Absent means the oracle mind is off. */
  oracle?: (c: Council, m: PmMarket, headlines: Headline[]) => Promise<OracleRead | null>
  log?: (title: string, body: string) => void
}

export const CLAIM = 'CREATOR-REPORTED RESULT, NOT INDEPENDENTLY VERIFIED: a creator claimed a Grok bot turned $50 into $5,273 in 48 hours on prediction markets. No trade logs, account statements or third-party audit have been shown. This desk tests the general idea on paper with his reported parameters and keeps the score.'

const empty = (): Saved => ({ version: 1, startedAt: null, cash: PARAMS.startingBankrollUsd, open: [], resolved: [], mindScore: {}, decisions: [], scans: 0, oracle: {} })
const round2 = (v: number) => Math.round(v * 100) / 100

export class PredictionDesk {
  private readonly file: string
  private saved: Saved
  private timer: NodeJS.Timeout | null = null
  private running = false
  private last: DeskSnapshot
  private candidates: Council[] = []
  private sources: DeskSnapshot['sources'] = []
  private scanned = 0
  private readonly opts: Opts

  constructor(opts: Opts = {}) {
    this.opts = opts
    this.file = join(opts.dir ?? DATA_DIR, 'predictions.json')
    this.saved = this.load()
    this.last = this.build('STARTING')
  }

  private now() { return (this.opts.now ?? Date.now)() }

  private load(): Saved {
    try {
      if (!existsSync(this.file)) return empty()
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Saved>
      const base = empty()
      return { ...base, ...s, open: Array.isArray(s.open) ? s.open : [], resolved: Array.isArray(s.resolved) ? s.resolved : [], mindScore: s.mindScore ?? {}, decisions: Array.isArray(s.decisions) ? s.decisions : [], oracle: s.oracle ?? {}, cash: Number.isFinite(s.cash) ? Number(s.cash) : base.cash }
    } catch { return empty() }
  }

  private save(): void {
    try {
      mkdirSync(join(this.file, '..'), { recursive: true })
      const tmp = this.file + '.tmp'
      const s: Saved = { ...this.saved, resolved: this.saved.resolved.slice(-2000), decisions: this.saved.decisions.slice(-300) }
      writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 })
      renameSync(tmp, this.file)
    } catch { /* a failed save must not stop the desk */ }
  }

  snapshot(): DeskSnapshot { return this.last }

  start(): void {
    if (this.timer) return
    const first = setTimeout(() => { void this.tick().catch(() => {}) }, 45_000)
    first.unref?.()
    this.timer = setInterval(() => { void this.tick().catch(() => {}) }, PARAMS.everyMinutes * 60_000)
    this.timer.unref?.()
  }

  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  private decide(d: Omit<Decision, 'at'>): void {
    this.saved.decisions.push({ at: this.now(), ...d })
    if (this.saved.decisions.length > 300) this.saved.decisions.splice(0, this.saved.decisions.length - 300)
  }

  /** One pass: scan, read, open what is flagged, settle what resolved. */
  async tick(): Promise<DeskSnapshot> {
    if (this.running) return this.last
    this.running = true
    try {
      const now = this.now()
      const [pm, ka] = await Promise.all([(this.opts.polymarket ?? (() => fetchPolymarket()))(), (this.opts.kalshi ?? (() => fetchKalshi()))()])
      this.sources = [
        { venue: 'polymarket', ok: pm.ok, count: pm.ok ? pm.markets.length : 0, reason: pm.ok ? null : pm.reason },
        { venue: 'kalshi', ok: ka.ok, count: ka.ok ? ka.markets.length : 0, reason: ka.ok ? null : ka.reason },
      ]
      const markets = [...(pm.ok ? pm.markets : []), ...(ka.ok ? ka.markets : [])]
      if (!markets.length) { this.last = this.build('NOT CONNECTED'); return this.last }
      if (this.saved.startedAt === null) this.saved.startedAt = now
      this.saved.scans++
      this.scanned = markets.length

      let news: { headlines: Headline[]; calendar: CalendarEvent[] } | null = null
      try { news = this.opts.news ? await this.opts.news() : null } catch { news = null }
      const byKey = new Map(markets.map((m) => [m.key, m]))
      const family = new Map<string, PmMarket[]>()
      for (const m of markets) if (m.eventId) { const k = `${m.venue}:${m.eventId}`; family.set(k, [...(family.get(k) ?? []), m]) }
      const siblings = (m: PmMarket) => (m.eventId ? (family.get(`${m.venue}:${m.eventId}`) ?? []).filter((s) => s.key !== m.key) : [])
      const oracleOn = !!this.opts.oracle
      const read = (m: PmMarket): Council => {
        const o = this.saved.oracle[m.key]
        const minds = readMinds({ market: m, siblings: siblings(m), headlines: news?.headlines ?? null, calendar: news?.calendar ?? null, oracle: oracleOn ? (o && now - o.at < 3_600_000 ? o : null) : 'off', now })
        return council(m, minds, now)
      }

      // 1. Read every open market. Keep the widest gaps for the page.
      const councils: Council[] = []
      for (const m of markets) if (!m.closed && m.outcome === null) councils.push(read(m))
      councils.sort((a, b) => Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0))

      // 2. The oracle is asked only about markets the other nine already flag, a few per pass, once an hour each.
      if (oracleOn) {
        let asked = 0
        for (const c of councils) {
          if (asked >= 3) break
          if (!c.flagged || this.saved.open.some((p) => p.key === c.key)) continue
          const o = this.saved.oracle[c.key]
          if (o && now - o.at < 3_600_000) continue
          try {
            const r = await this.opts.oracle!(c, byKey.get(c.key)!, news?.headlines ?? [])
            if (r) { this.saved.oracle[c.key] = r; asked++ }
          } catch { /* the oracle failing is not a reason to stop reading */ }
        }
        for (let i = 0; i < councils.length; i++) if (this.saved.oracle[councils[i].key]) councils[i] = read(byKey.get(councils[i].key)!)
        councils.sort((a, b) => Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0))
        for (const k of Object.keys(this.saved.oracle)) if (now - this.saved.oracle[k].at > 86_400_000) delete this.saved.oracle[k]
      }
      this.candidates = councils.slice(0, 12)

      // 3. Open a paper position where the council disagrees with the price by the line.
      const bankroll = this.saved.cash + this.saved.open.reduce((a, p) => a + p.stake, 0)
      for (const c of councils) {
        if (!c.flagged) continue
        if (this.saved.open.some((p) => p.key === c.key) || this.saved.resolved.some((p) => p.key === c.key)) continue
        if (this.saved.open.length >= PARAMS.maxOpen) { this.decide({ key: c.key, question: c.question, action: 'SKIPPED', why: `${PARAMS.maxOpen} positions already open.` }); continue }
        const m = byKey.get(c.key)!
        const size = paperSize(c, m, bankroll)
        if (!size) { this.decide({ key: c.key, question: c.question, action: 'SKIPPED', why: 'Kelly at the fill price found no stake worth taking.' }); continue }
        if (size.stake > this.saved.cash) { this.decide({ key: c.key, question: c.question, action: 'SKIPPED', why: `Needs $${size.stake.toFixed(2)}; only $${this.saved.cash.toFixed(2)} of paper cash is free.` }); continue }
        const pos: PaperPosition = {
          id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, key: c.key, venue: c.venue, question: c.question, url: c.url, side: size.side,
          openedAt: now, price: size.price, contracts: size.contracts, stake: size.stake, pSide: size.pSide, marketYes: c.market, edge: c.edge!, confidence: c.confidence,
          minds: c.minds.map((x) => ({ id: x.id, p: x.status === 'SPOKE' ? x.p : null })),
          for: c.minds.flatMap((x) => x.for).slice(0, 8), against: c.minds.flatMap((x) => x.against).slice(0, 8),
          endsAt: c.endsAt, status: 'OPEN', awaitingResolution: false, lastYes: c.market, lastSeenAt: now, resolvedAt: null, outcome: null, payout: null, pnl: null,
        }
        this.saved.cash = round2(this.saved.cash - pos.stake)
        this.saved.open.push(pos)
        this.decide({ key: c.key, question: c.question, action: 'OPENED', why: `${size.side} × ${size.contracts} at ${Math.round(size.price * 100)}¢ ($${size.stake.toFixed(2)}, ${size.capped ? 'at the 6% cap' : 'quarter-Kelly'}). ${c.reasons[0]}` })
        this.opts.log?.('Prediction desk: paper position', `${size.side} on "${c.question.slice(0, 80)}" at ${Math.round(size.price * 100)}¢. Council ${Math.round(c.p! * 100)}% vs market ${Math.round(c.market * 100)}%. PAPER, nothing sent.`)
      }

      // 4. Settle what the venue has resolved. A market gone from the open list is fetched on its own, a few per pass.
      let fetched = 0
      const still: PaperPosition[] = []
      for (const p of this.saved.open) {
        let m = byKey.get(p.key) ?? null
        if (!m && fetched < 5) { fetched++; m = await (this.opts.one ?? fetchOne)(p.key) }
        if (m) { p.lastYes = m.yes; p.lastSeenAt = now; p.awaitingResolution = m.closed && m.outcome === null }
        if (m && m.outcome) { this.settle(p, m.outcome, now); continue }
        still.push(p)
      }
      this.saved.open = still
      this.save()
      this.last = this.build('LIVE')
      return this.last
    } finally { this.running = false }
  }

  private settle(p: PaperPosition, outcome: 'YES' | 'NO', now: number): void {
    const won = p.side === outcome
    p.status = won ? 'WON' : 'LOST'
    p.outcome = outcome
    p.resolvedAt = now
    const payout = won ? round2(p.contracts) : 0
    const pnl = round2(payout - p.stake)
    p.payout = payout
    p.pnl = pnl
    p.awaitingResolution = false
    this.saved.cash = round2(this.saved.cash + p.payout)
    this.saved.resolved.push(p)
    const y = outcome === 'YES' ? 1 : 0
    for (const m of p.minds) {
      if (m.p === null) continue
      const s = this.saved.mindScore[m.id] ?? { n: 0, brierSum: 0 }
      s.n++; s.brierSum += (m.p - y) ** 2
      this.saved.mindScore[m.id] = s
    }
    this.decide({ key: p.key, question: p.question, action: 'SETTLED', why: `Resolved ${outcome}: ${p.side} ${won ? 'WON' : 'LOST'} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}.` })
    this.opts.log?.(`Prediction desk: paper ${won ? 'win' : 'loss'}`, `"${p.question.slice(0, 80)}" resolved ${outcome}; ${p.side} ${won ? 'won' : 'lost'} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}. PAPER.`)
  }

  /** The seven-day sheet from the guide, filled in from the record. Wins and losses count only after the venue resolves. */
  sheet(now = this.now()): Sheet {
    const s = this.saved
    const marked = s.open.reduce((a, p) => a + p.contracts * (p.side === 'YES' ? p.lastYes : 1 - p.lastYes), 0)
    const ending = round2(s.cash + marked)
    const wins = s.resolved.filter((p) => p.status === 'WON'), losses = s.resolved.filter((p) => p.status === 'LOST')
    const day = s.startedAt === null ? 0 : Math.floor((now - s.startedAt) / 86_400_000) + 1
    const line = (p: PaperPosition) => ({ question: p.question, said: `${p.side} at ${Math.round(p.price * 100)}¢, council ${Math.round(p.pSide * 100)}% vs market ${Math.round((p.side === 'YES' ? p.marketYes : 1 - p.marketYes) * 100)}%`, pnl: p.pnl ?? 0 })
    return {
      label: 'PAPER', day: Math.min(day, 7), status: day === 0 ? 'NOT STARTED' : day === 1 ? 'DAY 1 OF 7' : day <= 7 ? 'IN PROGRESS' : 'TEST COMPLETE', startedAt: s.startedAt,
      startingBalance: PARAMS.startingBankrollUsd, trades: s.open.length + s.resolved.length, open: s.open.length, wins: wins.length, losses: losses.length,
      largestWin: wins.length ? Math.max(...wins.map((p) => p.pnl ?? 0)) : null, largestLoss: losses.length ? Math.min(...losses.map((p) => p.pnl ?? 0)) : null,
      endingBalance: ending, cash: s.cash, returnPct: round2(((ending - PARAMS.startingBankrollUsd) / PARAMS.startingBankrollUsd) * 100),
      right: wins.sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0)).slice(0, 3).map(line), wrong: losses.sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0)).slice(0, 3).map(line),
    }
  }

  /** The brain: each mind's Brier score over the markets it spoke on, so the record says which angles know something. */
  brain(): DeskSnapshot['brain'] {
    const minds = (Object.keys(MIND_META) as MindId[]).map((id): MindTally => {
      const s = this.saved.mindScore[id]
      const n = s?.n ?? 0
      const brier = n ? s!.brierSum / n : null
      const ok = n >= PARAMS.minResolved
      return { id, name: MIND_META[id].name, role: MIND_META[id].role, n, brier: brier === null ? null : Math.round(brier * 1000) / 1000, skill: brier === null ? null : Math.round((1 - brier / 0.25) * 1000) / 1000, status: ok ? 'OK' : 'NOT ENOUGH DATA' }
    })
    const resolved = this.saved.resolved.length
    const trusted = minds.filter((m) => m.status === 'OK' && (m.skill ?? 0) > 0).map((m) => m.name)
    return { minds, resolved, note: resolved < PARAMS.minResolved ? `NOT ENOUGH DATA: ${resolved} of ${PARAMS.minResolved} resolved positions. Until then no mind has earned a weight, and the council stays an equal hearing weighted only by each mind's own stated confidence.` : trusted.length ? `${trusted.join(', ')} beat a coin flip over ${resolved} resolved positions. The council's weights are still the fixed ones: a change to them is a strategy change, and goes through research and review first.` : `No mind beats a coin flip yet over ${resolved} resolved positions.` }
  }

  private build(status: DeskSnapshot['status']): DeskSnapshot {
    return {
      kind: 'PAPER PREDICTION', execution: 'NONE', asOf: this.now(), status, sources: this.sources, scanned: this.scanned, scans: this.saved.scans,
      candidates: this.candidates, open: [...this.saved.open].sort((a, b) => b.openedAt - a.openedAt), resolved: this.saved.resolved.slice(-40).reverse(), decisions: this.saved.decisions.slice(-30).reverse(),
      sheet: this.sheet(), brain: this.brain(), params: PARAMS, claim: CLAIM, oracle: this.opts.oracle ? 'on' : 'off',
      note: `PAPER PREDICTION: public prices from Polymarket and Kalshi, read by ten hand-set minds, with paper positions sized by a capped quarter-Kelly. No wallet, no key, no order, and the trading engine never sees it. Every mind is untested as a trading rule; the scoreboard exists to find out.`,
    }
  }

  /** For tests and the API: the minds' reads on one market, without opening anything. */
  static readOne(m: PmMarket, ctx: { siblings?: PmMarket[]; headlines?: Headline[] | null; calendar?: CalendarEvent[] | null; oracle?: OracleRead | null | 'off'; now?: number } = {}): { council: Council; minds: MindRead[] } {
    const now = ctx.now ?? Date.now()
    const minds = readMinds({ market: m, siblings: ctx.siblings ?? [], headlines: ctx.headlines ?? null, calendar: ctx.calendar ?? null, oracle: ctx.oracle ?? 'off', now })
    return { council: council(m, minds, now), minds }
  }
}
