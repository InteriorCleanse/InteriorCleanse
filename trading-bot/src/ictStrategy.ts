/**
 * The ICT session model — the bot's main brain.
 *
 * The story it looks for, every day:
 *
 *   1. Asia sets a range overnight. Its high and low collect stop orders.
 *   2. London (or New York) opens and RAIDS one side of that range — a
 *      liquidity sweep. The stops get hit; that was the point.
 *   3. Price then reverses with force — a DISPLACEMENT candle that leaves
 *      a fair value gap behind it.
 *   4. A gap from the move INTO the sweep gets closed through by that
 *      reversal — it INVERTS, and now acts as support (or resistance).
 *   5. Price comes back to retest the inverted gap. That retest is the entry.
 *   6. Stop goes just past the sweep wick. Target is the liquidity on the
 *      OTHER side of the range — the next pool of orders.
 *
 * Every step is checked in order and written down as evidence, so the
 * bot can always answer "why?" and — just as important — "why not?".
 */

import { config } from '../config.ts'
import { SessionTracker, isKillzone, isWeekend, nextKillzone, sessionAt, toET, sessionLabel } from './sessions.ts'
import { SwingTracker, StructureTracker, atrAt } from './structure.ts'
import { FvgTracker, ifvgRole } from './fvg.ts'
import { detectSweeps, describeSweep, equalLevels, isHighLevel } from './liquidity.ts'
import { isBlackout } from './news.ts'
import type { Candle, EvidenceStep, FVG, IctAnalysis, Level, Signal, Sweep, TradePlan, Bias, SessionName } from './types.ts'
import type { NewsReport } from './types.ts'
import type { DayPlan } from './plan.ts'

const ict = config.ict

type DayStats = { trades: number; lossesR: number }

export class IctEngine {
  readonly candles: Candle[]
  readonly sessions = new SessionTracker()
  readonly swings = new SwingTracker()
  readonly structure = new StructureTracker()
  readonly fvgs = new FvgTracker()
  private readonly levelsByDay = new Map<string, Level[]>()
  private readonly sweepsByDay = new Map<string, Sweep[]>()
  private readonly dayStats = new Map<string, DayStats>()
  private readonly consumedSweeps = new Set<number>()
  private lastSession: { dayKey: string; session: SessionName | null } | null = null

  /** Optional context the engine checks against. */
  news: NewsReport | null = null
  plan: DayPlan | null = null

  constructor(candles: Candle[]) {
    this.candles = candles
  }

  /** Replay and live scans tell the engine what happened to its trades. */
  recordTrade(dayKey: string, rMultiple: number | null): void {
    const s = this.dayStats.get(dayKey) ?? { trades: 0, lossesR: 0 }
    s.trades++
    if (rMultiple !== null && rMultiple < 0) s.lossesR += -rMultiple
    this.dayStats.set(dayKey, s)
  }

  setDayStats(dayKey: string, stats: DayStats): void {
    this.dayStats.set(dayKey, stats)
  }

  sweepsFor(dayKey: string): Sweep[] {
    return this.sweepsByDay.get(dayKey) ?? []
  }

  /** Keeps the same Level objects alive across candles so their swept/broken marks persist. */
  private mergeLevels(dayKey: string, atr: number): Level[] {
    const day = this.sessions.day(dayKey)
    const fresh = this.sessions.levelsFor(dayKey)
    const stored = this.levelsByDay.get(dayKey) ?? []

    for (const f of fresh) {
      const existing = stored.find((l) => l.kind === f.kind)
      const sessionOf = (k: string) =>
        k.startsWith('asia') ? day?.sessions.asia : k.startsWith('london') ? day?.sessions.london : k.startsWith('ny') ? day?.sessions.newYork : null
      const provisional = sessionOf(f.kind)?.complete === false
      if (!existing) {
        stored.push(f)
      } else if (provisional && existing.price !== f.price) {
        // The session is still forming and its extreme just moved: the old level is gone.
        existing.price = f.price
        existing.time = f.time
        delete existing.sweptAt
        delete existing.brokenAt
      }
    }

    // Equal highs/lows are recomputed from swings; keep marks on ones that survive.
    const eq = equalLevels(this.swings.recent(12), atr)
    const keep = stored.filter((l) => l.kind !== 'eqh' && l.kind !== 'eql')
    for (const e of eq) {
      const prev = stored.find((l) => l.kind === e.kind && Math.abs(l.price - e.price) <= atr * 0.1)
      keep.push(prev ?? e)
    }
    this.levelsByDay.set(dayKey, keep)
    return keep
  }

  /** Levels that are allowed to be swept right now: finished sessions, yesterday, equal highs/lows. */
  private sweepable(dayKey: string, levels: Level[]): Level[] {
    const day = this.sessions.day(dayKey)
    return levels.filter((l) => {
      if (l.kind === 'pdh' || l.kind === 'pdl' || l.kind === 'eqh' || l.kind === 'eql') return true
      const s = l.kind.startsWith('asia') ? day?.sessions.asia : l.kind.startsWith('london') ? day?.sessions.london : day?.sessions.newYork
      return s?.complete === true
    })
  }

  private bias(dayKey: string, sweeps: Sweep[], i: number): Bias {
    const day = this.sessions.day(dayKey)
    if (!day?.sessions.asia?.complete) {
      return { direction: 'neutral', reason: 'The Asia range is still forming, so there is nothing to sweep yet. No bias until London has shown its hand.' }
    }
    const last = sweeps[sweeps.length - 1]
    if (!last) {
      return { direction: 'neutral', reason: 'No liquidity has been taken today. Until one side of the range gets raided, I have no opinion — and pretending to have one is how accounts die.' }
    }
    const dir = last.side === 'below' ? 'bullish' : 'bearish'
    const mss = this.structure.latest(dir, last.index)
    const opposite = sweeps.filter((s) => s.side !== last.side).length
    let reason =
      dir === 'bullish'
        ? `Sell-side liquidity was taken — ${describeSweep(last)} Stops below got hit, which usually means the real move is UP toward the buy-side liquidity above.`
        : `Buy-side liquidity was taken — ${describeSweep(last)} Stops above got hit, which usually means the real move is DOWN toward the sell-side liquidity below.`
    if (mss) reason += ` Structure agrees: a ${dir} shift at ${toET(mss.time).clock} ET confirmed it.`
    if (opposite > 0) reason += ` Careful: the other side was raided earlier today too, so this is a choppy day — the most recent sweep wins, but with less confidence.`
    void i
    return { direction: dir, reason }
  }

  /** Nearest opposing liquidity above (for longs) or below (for shorts) that is still intact. */
  private target(direction: 'long' | 'short', entry: number, stopDistance: number, levels: Level[]): { price: number; label: string; rr: number } {
    const candidates = levels
      .filter((l) => l.sweptAt === undefined && l.brokenAt === undefined)
      .filter((l) => (direction === 'long' ? isHighLevel(l) && l.price > entry : !isHighLevel(l) && l.price < entry))
      .map((l) => ({ price: l.price, label: l.label, rr: Math.abs(l.price - entry) / stopDistance }))
      .sort((a, b) => a.rr - b.rr)

    if (ict.takeProfit === 'liquidity') {
      const good = candidates.find((c) => c.rr >= ict.minRR)
      if (good) return good
    }
    const fixed = direction === 'long' ? entry + stopDistance * ict.fixedRR : entry - stopDistance * ict.fixedRR
    const nearest = candidates[0]
    return {
      price: fixed,
      label: nearest
        ? `${ict.fixedRR}R (the nearest liquidity, ${nearest.label}, is only ${nearest.rr.toFixed(1)}R away)`
        : `${ict.fixedRR}R (no intact liquidity level in that direction)`,
      rr: ict.fixedRR,
    }
  }

  /** Process candle `i` and return everything the bot knows at that moment. */
  step(i: number): IctAnalysis {
    const c = this.candles[i]
    const { dayKey, session } = this.sessions.add(c)
    const atr = atrAt(this.candles, i)
    this.swings.add(this.candles, i)
    this.structure.check(this.candles, i, this.swings)
    this.fvgs.update(this.candles, i, atr)

    const levels = this.mergeLevels(dayKey, atr)
    const newSweeps = detectSweeps(c, i, this.sweepable(dayKey, levels), atr)
    const sweeps = this.sweepsByDay.get(dayKey) ?? []
    sweeps.push(...newSweeps)
    this.sweepsByDay.set(dayKey, sweeps)
    this.lastSession = { dayKey, session }

    const et = toET(c.openTime)
    const stats = this.dayStats.get(dayKey) ?? { trades: 0, lossesR: 0 }
    const day = this.sessions.day(dayKey)!
    const bias = this.bias(dayKey, sweeps, i)
    const signal = this.decide(i, dayKey, session, atr, levels, sweeps, bias, stats)

    return {
      index: i,
      time: c.closeTime,
      price: c.close,
      dayKey,
      weekday: et.weekdayName,
      etClock: et.clock,
      session,
      inKillzone: isKillzone(c.openTime),
      nextKillzone: isKillzone(c.openTime) ? null : nextKillzone(c.openTime),
      atr,
      sessions: day.sessions,
      previousDay: (() => {
        const p = this.sessions.previousDay(dayKey)
        return p ? { high: p.high, low: p.low } : null
      })(),
      levels,
      sweepsToday: sweeps,
      fvgs: this.fvgs.active(),
      structureShifts: this.structure.shifts.filter((s) => s.index >= i - 288),
      bias,
      signal,
      tradesToday: stats.trades,
      lossesTodayR: stats.lossesR,
    }
  }

  private decide(
    i: number,
    dayKey: string,
    session: SessionName | null,
    atr: number,
    levels: Level[],
    sweeps: Sweep[],
    bias: Bias,
    stats: DayStats,
  ): Signal {
    const c = this.candles[i]
    const ev: EvidenceStep[] = []
    const hold = (reason: string, quality = 0): Signal => ({
      action: 'HOLD',
      reason,
      price: c.close,
      time: c.closeTime,
      setupKey: `${config.symbol}|${config.interval}|ICT|HOLD`,
      evidence: ev,
      quality,
    })
    const fail = (step: string, detail: string, reason: string): Signal => {
      ev.push({ step, passed: false, detail })
      return hold(reason)
    }

    // 1. Is this a day worth trading?
    if (ict.skipWeekends && isWeekend(c.openTime)) {
      return fail('Trading day', `It's ${toET(c.openTime).weekdayName} in New York. Weekends are thin and the institutions are away.`, 'Weekend — sitting out. The session model needs London and New York desks to be at work.')
    }
    ev.push({ step: 'Trading day', passed: true, detail: `${toET(c.openTime).weekdayName}, ${toET(c.openTime).clock} ET. Desks are open.` })

    // 2. Killzone?
    if (!session || !ict.killzones.includes(session)) {
      const next = nextKillzone(c.openTime)
      const where = session ? `inside the ${sessionLabel(session)} window, which is watch-only` : 'between sessions'
      return fail(
        'Killzone',
        `Price is ${where}. The next entry window (${next?.label}) opens in ${next ? Math.round(next.startsIn / 60000) : '?'} minutes.`,
        `Watching, not trading. I only enter during ${ict.killzones.map(sessionLabel).join(' or ')}.`,
      )
    }
    ev.push({ step: 'Killzone', passed: true, detail: `Inside the ${sessionLabel(session)} killzone — the window where entries are allowed.` })

    // 3. Asia range worth anything?
    const asia = this.sessions.day(dayKey)?.sessions.asia
    if (!asia || !asia.complete) {
      return fail('Asia range', 'The Asia session has not finished, so its high and low are not set yet.', 'Waiting for the Asia range to finish forming.')
    }
    const asiaSize = asia.high - asia.low
    if (asiaSize < atr * ict.minAsiaRangeAtr) {
      return fail(
        'Asia range',
        `Asia only moved $${asiaSize.toFixed(2)} (${(asiaSize / atr).toFixed(2)} ATR). That's under your ${ict.minAsiaRangeAtr} ATR minimum — too small to hold meaningful stops.`,
        'Asia range is too tight to trade against today.',
      )
    }
    ev.push({ step: 'Asia range', passed: true, detail: `Asia high $${asia.high.toFixed(2)}, low $${asia.low.toFixed(2)} — a $${asiaSize.toFixed(2)} range (${(asiaSize / atr).toFixed(1)} ATR). Plenty of stops on both sides.` })

    // 4. A recent liquidity sweep
    const recent = sweeps.filter((s) => i - s.index <= ict.setupWindowCandles && !this.consumedSweeps.has(s.index))
    const sweep = recent[recent.length - 1]
    if (!sweep) {
      const anyToday = sweeps.length > 0
      return fail(
        'Liquidity sweep',
        anyToday
          ? `The last sweep was ${i - sweeps[sweeps.length - 1].index} candles ago — outside the ${ict.setupWindowCandles}-candle window, or already used.`
          : `Nothing has been swept yet. Watching: ${levels.filter((l) => l.sweptAt === undefined && l.brokenAt === undefined).map((l) => `${l.label} $${l.price.toFixed(0)}`).join(', ') || 'no levels yet'}.`,
        'No liquidity sweep to trade from. The setup starts with a raid on a session high or low, and there hasn\'t been one.',
      )
    }
    const direction: 'long' | 'short' = sweep.side === 'below' ? 'long' : 'short'
    ev.push({ step: 'Liquidity sweep', passed: true, detail: `${describeSweep(sweep)} That points ${direction === 'long' ? 'UP' : 'DOWN'}.` })

    // 5. Displacement + FVG in the trade direction, after the sweep
    const wantDir = direction === 'long' ? 'bullish' : 'bearish'
    const dispFvg = this.fvgs.fvgs.find(
      (f) => f.direction === wantDir && f.fromDisplacement && f.createdIndex > sweep.index && f.createdIndex <= i && f.state !== 'expired',
    )
    const mss = this.structure.latest(wantDir, sweep.index)
    if (!dispFvg) {
      return fail(
        'Displacement',
        `Since the sweep (${i - sweep.index} candles ago) there has been no ${wantDir} candle with a body of at least ${ict.displacementBodyAtr} ATR that left a gap behind it.${mss ? ' Structure did shift, but without displacement that is not enough.' : ''}`,
        `Sweep seen, but no forceful ${direction === 'long' ? 'buying' : 'selling'} yet. A sweep without displacement is often just a breakout — I need proof the raid reversed.`,
      )
    }
    ev.push({
      step: 'Displacement',
      passed: true,
      detail: `A ${wantDir} displacement candle at ${toET(dispFvg.createdTime).clock} ET left a ${dispFvg.sizeAtr.toFixed(2)}-ATR gap ($${dispFvg.bottom.toFixed(2)}–$${dispFvg.top.toFixed(2)}).${mss ? ` Structure shifted ${wantDir} at ${toET(mss.time).clock} ET as well.` : ' No structure shift yet — acceptable, but weaker.'}`,
    })

    // 6. The inversion
    const roleWanted = direction === 'long' ? 'support' : 'resistance'
    const ifvg = this.fvgs.fvgs.find(
      (f) => ifvgRole(f) === roleWanted && (f.invertedIndex ?? -1) > sweep.index && (f.invertedIndex ?? -1) <= i,
    )
    let zone: FVG
    let entryType: 'IFVG' | 'FVG'
    if (ict.requireInversion) {
      if (!ifvg) {
        return fail(
          'Inversion FVG',
          `No ${wantDir === 'bullish' ? 'bearish' : 'bullish'} gap has been closed through since the sweep. The move into the sweep needs to have left a gap that the reversal then breaks — that broken gap is the entry zone.`,
          'Displacement happened, but no gap has inverted yet. Waiting for price to break through an old gap so it can flip into my entry zone.',
        )
      }
      zone = ifvg
      entryType = 'IFVG'
      ev.push({ step: 'Inversion FVG', passed: true, detail: `The ${zone.direction} gap from ${toET(zone.createdTime).clock} ET ($${zone.bottom.toFixed(2)}–$${zone.top.toFixed(2)}) was closed through at ${toET(zone.invertedTime!).clock} ET. It has flipped and now acts as ${roleWanted}.` })
    } else {
      zone = ifvg ?? dispFvg
      entryType = ifvg ? 'IFVG' : 'FVG'
      ev.push({ step: 'Entry zone', passed: true, detail: ifvg ? `Using the inverted gap at $${zone.bottom.toFixed(2)}–$${zone.top.toFixed(2)} as ${roleWanted}.` : `Inversion not required in your settings, so the displacement gap itself ($${zone.bottom.toFixed(2)}–$${zone.top.toFixed(2)}) is the entry zone.` })
    }

    // 7. The retest — this candle must come back into the zone and hold
    const retestNow =
      entryType === 'IFVG'
        ? zone.retestIndex === i
        : FvgTracker.touches(zone, c) && (direction === 'long' ? c.close >= zone.bottom : c.close <= zone.top) && i > zone.createdIndex
    if (!retestNow) {
      const dist = direction === 'long' ? c.close - zone.top : zone.bottom - c.close
      return fail(
        'Retest',
        dist > 0
          ? `Price is $${dist.toFixed(2)} ${direction === 'long' ? 'above' : 'below'} the zone and hasn't come back to it. No chasing — the entry is the retest, not the breakout.`
          : `Price is inside or through the zone but hasn't closed back on the right side of it yet.`,
        `Everything is lined up for a ${direction} except the entry: waiting for price to come back and retest $${zone.bottom.toFixed(2)}–$${zone.top.toFixed(2)}.`,
      )
    }
    ev.push({ step: 'Retest', passed: true, detail: `This candle dipped into the zone and closed ${direction === 'long' ? 'above its floor' : 'below its ceiling'} — the zone held. Entry at the close, $${c.close.toFixed(2)}.` })

    // 8. Stop and target
    const entry = c.close
    const buffer = atr * ict.stopBufferAtr
    const stop = direction === 'long' ? sweep.wick - buffer : sweep.wick + buffer
    const stopDistance = Math.abs(entry - stop)
    const tgt = this.target(direction, entry, stopDistance, levels)
    const plan: TradePlan = {
      direction,
      entry,
      stop,
      takeProfit: tgt.price,
      rr: tgt.rr,
      entryLabel: `${entryType} retest`,
      stopLabel: `${ict.stopBufferAtr} ATR beyond the sweep wick ($${sweep.wick.toFixed(2)})`,
      targetLabel: tgt.label,
    }
    ev.push({ step: 'Stop & target', passed: tgt.rr >= ict.minRR, detail: `Stop $${stop.toFixed(2)} (${plan.stopLabel}). Target $${tgt.price.toFixed(2)} — ${tgt.label}. That's ${tgt.rr.toFixed(1)}:1 reward to risk${tgt.rr >= ict.minRR ? '.' : `, below your ${ict.minRR}:1 minimum.`}` })
    if (tgt.rr < ict.minRR) return hold(`Setup complete but the target is only ${tgt.rr.toFixed(1)}R away. Not worth the risk at your ${ict.minRR}:1 minimum.`)

    // 9. News
    const blackout = this.news ? isBlackout(c.closeTime, this.news) : null
    if (blackout) {
      return fail('News', `"${blackout.title}" is within ${ict.newsBlackoutMinutes} minutes. High-impact news turns the tape into a coin flip.`, `Standing aside for news: ${blackout.title}.`)
    }
    ev.push({ step: 'News', passed: true, detail: this.news ? 'No high-impact event within the blackout window.' : 'News feed not available for this candle, so no blackout was applied. Check the calendar yourself before trusting a live entry.' })

    // 10. Daily brakes
    if (stats.trades >= ict.maxTradesPerDay) {
      return fail('Daily limits', `Already ${stats.trades} trade(s) today; your maximum is ${ict.maxTradesPerDay}.`, 'Done for the day — trade limit reached. More trades on a day that already gave a setup is usually revenge, not edge.')
    }
    if (stats.lossesR >= ict.dailyLossLimitR) {
      return fail('Daily limits', `Down ${stats.lossesR.toFixed(1)}R today; your daily loss limit is ${ict.dailyLossLimitR}R.`, 'Done for the day — loss limit hit. Tomorrow is a new day.')
    }
    ev.push({ step: 'Daily limits', passed: true, detail: `${stats.trades} of ${ict.maxTradesPerDay} trades used, ${stats.lossesR.toFixed(1)}R of ${ict.dailyLossLimitR}R loss budget used.` })

    // 11. The plan you agreed to
    if (this.plan && this.plan.dayKey === dayKey) {
      const allowed = this.plan.allow === 'both' || this.plan.allow === direction
      if (!allowed) {
        return fail('Your plan', `Today's plan allows "${this.plan.allow}" only, and this is a ${direction}.`, `Skipping: you told me ${this.plan.allow === 'none' ? 'not to trade today' : `only to take ${this.plan.allow}s today`}.`)
      }
      if (this.plan.maxTrades <= stats.trades) {
        return fail('Your plan', `Your plan caps today at ${this.plan.maxTrades} trade(s).`, 'Skipping: the plan\'s trade limit is reached.')
      }
      ev.push({ step: 'Your plan', passed: true, detail: `Matches the plan you armed (${this.plan.allow}, up to ${this.plan.maxTrades} trades).` })
    } else {
      ev.push({ step: 'Your plan', passed: true, detail: 'No plan armed for today, so config.ts defaults apply. Arm one with `npm run talk` to keep me on a leash.' })
    }

    // Quality score — how many optional boxes got ticked
    let quality = 50
    if (mss) quality += 15
    if (sweep.depthAtr >= 0.2) quality += 10
    if (bias.direction === wantDir) quality += 10
    if (entryType === 'IFVG') quality += 10
    if (dispFvg.sizeAtr >= 0.5) quality += 5
    quality = Math.min(100, quality)

    this.consumedSweeps.add(sweep.index)
    const action = direction === 'long' ? 'BUY' : 'SELL'
    return {
      action,
      reason:
        `${action} at $${entry.toFixed(2)}. ${sweep.level.label} was swept, price displaced ${wantDir === 'bullish' ? 'up' : 'down'}, ` +
        `and an ${entryType === 'IFVG' ? 'inverted gap' : 'open gap'} just held on the retest. Stop $${stop.toFixed(2)}, target $${tgt.price.toFixed(2)} (${tgt.rr.toFixed(1)}R). Setup quality ${quality}/100.`,
      price: entry,
      time: c.closeTime,
      setupKey: `${config.symbol}|${config.interval}|ICT|${session}|${direction}|${sweep.level.kind}|${entryType}`,
      evidence: ev,
      plan,
      quality,
    }
  }
}
