/**
 * The watch loop — the part that taps you on the shoulder.
 *
 * Every few minutes it re-reads the market and compares it with the
 * last look. When something worth your attention happens, it raises an
 * event: an entry window about to open, a level swept, a full setup,
 * news about to land, the trend flipping, an unusually large trade.
 * The app shows these as alerts; `npm run watch` prints them.
 *
 * It never acts. It prompts. You decide.
 */

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { config } from '../config.ts'
import { analyzeNow } from './bot.ts'
import type { Snapshot } from './bot.ts'
import { DATA_DIR, ensureDataDir } from './memory.ts'
import { describeSweep } from './liquidity.ts'
import { MarketDataError } from './market.ts'
import { toET, sessionLabel } from './sessions.ts'
import { checkRisk } from './risk.ts'
import { consultMemory } from './adaptiveFilter.ts'
import { appendLedgerRow, memoryIsEmpty } from './memory.ts'
import { managePositions, openPosition, readPositions } from './paperTrader.ts'
import type { AppEvent } from './types.ts'
import * as ui from './ui.ts'

const EVENTS_PATH = join(DATA_DIR, 'events.jsonl')

export class EventLog {
  readonly events: AppEvent[] = []
  readonly listeners: Array<(e: AppEvent) => void> = []
  private nextId = 1

  push(kind: AppEvent['kind'], title: string, body: string, severity: AppEvent['severity'] = 'info'): AppEvent {
    const e: AppEvent = { id: this.nextId++, time: Date.now(), kind, title, body, severity }
    this.events.push(e)
    if (this.events.length > 300) this.events.shift()
    try {
      ensureDataDir()
      appendFileSync(EVENTS_PATH, JSON.stringify(e) + '\n')
    } catch {
      // Not being able to persist an alert is not worth crashing over.
    }
    for (const l of this.listeners) l(e)
    return e
  }

  since(id: number): AppEvent[] {
    return this.events.filter((e) => e.id > id)
  }

  latest(n: number): AppEvent[] {
    return this.events.slice(-n)
  }
}

export const eventLog = new EventLog()

export type WatchState = { snap: Snapshot; at: number }

const announced = new Set<string>()
/** True the first time a key is seen, so the same thing is never announced twice. */
function once(key: string): boolean {
  if (announced.has(key)) return false
  announced.add(key)
  if (announced.size > 5000) announced.clear()
  return true
}

const fmtUsd = (n: number) => '$' + (Math.abs(n) >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'M' : (n / 1000).toFixed(0) + 'k')

/** One look at the market, compared with the previous look. */
export async function watchOnce(prev: WatchState | null): Promise<WatchState> {
  const snap = await analyzeNow({ withFlow: true })
  const a = snap.analysis
  const now = Date.now()

  // Babysit open paper positions first — a close today counts toward today's limits.
  for (const p of managePositions(snap.candles)) {
    const r = p.rMultiple ?? 0
    eventLog.push('setup', `Paper ${p.direction} closed at ${r >= 0 ? '+' : ''}${r.toFixed(2)}R (${p.exitReason})`,
      `Entered ${p.entry.toFixed(2)}, out ${p.exit?.toFixed(2)} after ${p.candlesHeld} candle(s). ${r >= 0 ? 'Made' : 'Lost'} $${Math.abs(p.pnlUsd ?? 0).toFixed(3)}. Memory has recorded it; a journal entry is waiting for how you felt.`, r >= 0 ? 'action' : 'warn')
  }

  if (a) {
    const watching = a.levels.filter((l) => l.sweptAt === undefined && l.brokenAt === undefined).map((l) => `${l.label} $${l.price.toFixed(0)}`).join(', ')

    if (a.nextKillzone && a.nextKillzone.startsIn <= config.app.killzoneHeadsUpMinutes * 60_000 && once(`kz-soon-${a.dayKey}-${a.nextKillzone.name}`)) {
      eventLog.push('killzone', `${a.nextKillzone.label} opens in ${Math.round(a.nextKillzone.startsIn / 60_000)} min`,
        `Get the chart up. Bias is ${a.bias.direction}. Levels in play: ${watching || 'none yet'}.`, 'warn')
    }
    if (a.inKillzone && a.session && once(`kz-open-${a.dayKey}-${a.session}`)) {
      eventLog.push('killzone', `${sessionLabel(a.session)} killzone is open`,
        `Entries are allowed in this window. Bias ${a.bias.direction}. Watching: ${watching || 'no intact levels'}.`, 'warn')
    }
    for (const s of a.sweepsToday) {
      // Equal highs/lows are recomputed as swings form, so they can be "swept" several
      // times at slightly different prices — announce those at most once an hour.
      const key = s.level.kind === 'eqh' || s.level.kind === 'eql' ? `sweep-${s.level.kind}-${Math.floor(s.time / 3_600_000)}` : `sweep-${s.time}-${s.level.kind}`
      if (once(key)) {
        eventLog.push('sweep', `${s.level.label} swept`, `${describeSweep(s)} Now watching for displacement ${s.side === 'below' ? 'up' : 'down'} and a gap to invert.`, 'warn')
      }
    }
    if ((a.signal.action === 'BUY' || a.signal.action === 'SELL') && a.signal.plan && once(`setup-${a.time}`)) {
      const p = a.signal.plan
      eventLog.push('setup', `${a.signal.action} setup — ${p.rr.toFixed(1)}:1, quality ${a.signal.quality}/100`,
        `Entry $${p.entry.toFixed(0)}, stop $${p.stop.toFixed(0)}, target $${p.takeProfit.toFixed(0)}. ${a.signal.reason}`, 'action')

      // The 24/7 paper trader: take it on paper if risk and memory agree and nothing is open.
      if (config.app.autoPaperTrade && readPositions().open.length === 0) {
        const risk = checkRisk(a.signal)
        const verdict = risk.approved && !memoryIsEmpty() ? consultMemory(a.signal) : null
        if (!risk.approved) {
          eventLog.push('info', 'Paper trade not taken — risk said no', risk.reason, 'info')
        } else if (verdict?.block) {
          appendLedgerRow({ timestamp: new Date(a.time).toISOString(), symbol: config.symbol, action: 'SKIP', price: a.signal.price, quantity: 0, reason: `${a.signal.setupKey} — ${verdict.reason}`, mode: 'live-paper', outcome: 'SKIPPED', pnl: 0 })
          eventLog.push('info', 'Paper trade refused by memory', verdict.reason, 'warn')
        } else {
          const pos = openPosition(a.signal, risk, a.session ? sessionLabel(a.session) : '')
          eventLog.push('setup', `Paper ${pos.direction} OPENED at $${pos.entry.toFixed(0)}`,
            `Stop $${pos.stop.toFixed(0)}, target $${pos.target.toFixed(0)}, size ${pos.quantity.toFixed(6)} (risk $${pos.riskUsd.toFixed(3)}). Mr. Cash will manage it candle by candle and tell you how it ends.`, 'action')
        }
      }
    }
    if (snap.news) {
      for (const b of snap.news.blackouts) {
        const lead = b.start - now
        if (lead > 0 && lead <= 15 * 60_000 && once(`news-${b.start}`)) {
          eventLog.push('news', `Stand aside: ${b.title}`, `High-impact news at ${toET((b.start + b.end) / 2).clock} ET. No entries from ${toET(b.start).clock} to ${toET(b.end).clock} ET.`, 'warn')
        }
      }
    }
    if (snap.state && prev?.snap.state && prev.snap.state.trend !== snap.state.trend) {
      eventLog.push('trend', `Market state: ${prev.snap.state.trend} → ${snap.state.trend}`, snap.state.summary, 'info')
    }
    if (snap.state && prev?.snap.state && prev.snap.state.continuation.label !== snap.state.continuation.label && snap.state.trend !== 'range') {
      eventLog.push('trend', `${snap.state.trend}: now ${snap.state.continuation.label}`, snap.state.continuation.reasons.join(' '), 'info')
    }
    if (snap.flow?.tape && snap.flow.tape.bigTrades.length) {
      const t = snap.flow.tape
      const top = t.bigTrades[0]
      if (top.usd >= config.orderflow.bigTradeUsd * 5 && once(`big-${top.time}-${top.usd.toFixed(0)}`)) {
        eventLog.push('flow', `Big ${top.side}: ${fmtUsd(top.usd)}`, `A single ${top.side} of ${top.qty.toFixed(3)} at $${top.price.toFixed(0)}. In the same window: ${t.bigBuys} big buys vs ${t.bigSells} big sells, net ${t.deltaUsd >= 0 ? '+' : '-'}${fmtUsd(t.deltaUsd)}.`, 'info')
      }
    }
  }
  return { snap, at: now }
}

export type Watcher = { stop(): void; current(): WatchState | null }

export function startWatch(minutes = config.app.watchEveryMinutes, onEvent?: (e: AppEvent) => void): Watcher {
  let state: WatchState | null = null
  let running = false
  if (onEvent) eventLog.listeners.push(onEvent)

  const tick = async () => {
    if (running) return
    running = true
    try {
      state = await watchOnce(state)
    } catch (err) {
      const msg = err instanceof MarketDataError ? 'Could not download prices this cycle — will try again next candle.' : err instanceof Error ? err.message : String(err)
      if (once(`err-${msg}`)) eventLog.push('info', 'Watch skipped a cycle', msg, 'info')
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), Math.max(1, minutes) * 60_000)
  return { stop: () => clearInterval(timer), current: () => state }
}

// `npm run watch` — the loop in a terminal, no browser needed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ui.heading('MR. CASH IS WATCHING')
  ui.safetyBanner()
  console.log('')
  console.log(ui.dim(`  Re-reading the market every ${config.app.watchEveryMinutes} minutes. Ctrl+C to stop.`))
  console.log('')
  startWatch(undefined, (e) => {
    const mark = e.severity === 'action' ? ui.good('●') : e.severity === 'warn' ? ui.warn('●') : ui.dim('●')
    console.log(`${ui.dim(new Date(e.time).toLocaleTimeString())}  ${mark} ${ui.bold(e.title)}`)
    console.log(ui.dim('    ' + ui.wrap(e.body, 72).replace(/\n/g, '\n    ')))
  })
}
