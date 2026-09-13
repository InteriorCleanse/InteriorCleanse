/**
 * The morning brief — what the bot thinks today looks like, and the
 * plan it proposes. This is the "think for itself" half; you saying
 * yes, no, or "longs only" is the "collaborate" half.
 */

import { config } from '../config.ts'
import { toET, describeWindow, nextKillzone } from './sessions.ts'
import { upcomingEvents } from './news.ts'
import { describeSweep } from './liquidity.ts'
import type { IctAnalysis, NewsReport } from './types.ts'
import type { DayPlan } from './plan.ts'

export type Brief = {
  lines: string[]
  proposal: Omit<DayPlan, 'armedAt'>
  levels: Array<{ label: string; price: number; status: string }>
}

function fmtET(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { timeZone: config.ict.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ET'
}

function fmtLocal(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

export function buildBrief(a: IctAnalysis, news: NewsReport | null, plan: DayPlan | null, now = Date.now()): Brief {
  const L: string[] = []
  const et = toET(now)
  const p = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  L.push(`${et.weekdayName}, ${et.clock} ET (your time: ${new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}). ${config.symbol} is at ${p(a.price)}. One candle moves about ${p(a.atr)} (ATR).`)
  L.push('')

  // The ranges
  L.push('THE RANGES')
  const s = a.sessions
  const rangeLine = (label: string, r: { high: number; low: number; complete: boolean } | undefined) => {
    if (!r) return `  ${label.padEnd(12)} not started yet`
    const size = r.high - r.low
    return `  ${label.padEnd(12)} high ${p(r.high)}  low ${p(r.low)}  (${p(size)}, ${(size / a.atr).toFixed(1)} ATR)${r.complete ? '' : '  still forming'}`
  }
  L.push(rangeLine('Asia', s.asia))
  L.push(rangeLine('London', s.london))
  L.push(rangeLine('New York', s.newYork))
  if (a.previousDay) L.push(`  ${'Yesterday'.padEnd(12)} high ${p(a.previousDay.high)}  low ${p(a.previousDay.low)}`)
  L.push('')

  // Levels with status
  const levels = a.levels
    .map((l) => ({
      label: l.label,
      price: l.price,
      status: l.sweptAt ? `SWEPT at ${toET(l.sweptAt).clock} ET` : l.brokenAt ? `broken at ${toET(l.brokenAt).clock} ET` : l.price > a.price ? `${p(l.price - a.price)} above` : `${p(a.price - l.price)} below`,
    }))
    .sort((x, y) => y.price - x.price)
  L.push('LEVELS TO WATCH (top to bottom)')
  for (const l of levels) L.push(`  ${l.label.padEnd(18)} ${p(l.price).padStart(9)}   ${l.status}`)
  L.push('')

  // What happened so far
  L.push('WHAT HAS HAPPENED')
  if (a.sweepsToday.length === 0) L.push('  No liquidity has been taken yet today.')
  for (const sw of a.sweepsToday) L.push(`  ${toET(sw.time).clock} ET — ${describeSweep(sw)}`)
  const ifvgs = a.fvgs.filter((f) => f.state === 'inverted')
  if (ifvgs.length) L.push(`  ${ifvgs.length} inverted gap(s) on the board: ` + ifvgs.slice(-3).map((f) => `${p(f.bottom)}–${p(f.top)} (${f.direction === 'bearish' ? 'support' : 'resistance'})`).join(', '))
  L.push('')

  // Bias
  L.push(`BIAS: ${a.bias.direction.toUpperCase()}`)
  L.push('  ' + a.bias.reason)
  L.push('')

  // Timing
  L.push('TIMING')
  if (a.inKillzone) L.push(`  Inside the ${a.session ? config.ict.sessions[a.session].label : ''} killzone right now — entries allowed.`)
  else if (a.nextKillzone) L.push(`  Next entry window: ${a.nextKillzone.label} in ${Math.round(a.nextKillzone.startsIn / 60000)} minutes (${describeWindow(a.nextKillzone.name)}).`)
  const nk = nextKillzone(now)
  if (nk && !a.inKillzone) L.push(`  In your local time that's ${fmtLocal(now + nk.startsIn)}.`)
  L.push('')

  // News
  L.push('NEWS')
  if (!news) {
    L.push('  News not loaded.')
  } else {
    const soon = upcomingEvents(news, now)
    const high = soon.filter((e) => e.impact === 'High')
    if (high.length) {
      L.push('  Stand aside around these (high impact):')
      for (const e of high) L.push(`    ${fmtET(e.time)} — ${e.country} ${e.title}${e.forecast ? ` (forecast ${e.forecast}, prev ${e.previous})` : ''}`)
    } else {
      L.push('  No high-impact scheduled events in the next 36 hours.')
    }
    const med = soon.filter((e) => e.impact === 'Medium').slice(0, 4)
    if (med.length) L.push('  Also on the calendar: ' + med.map((e) => `${fmtET(e.time)} ${e.title}`).join('; '))
    if (news.standouts.length) {
      L.push('  Headlines that stand out:')
      for (const h of news.standouts) {
        L.push(`    • ${h.title}`)
        L.push(`      ${h.tags.join(', ') || 'general'} — ${h.whyItMatters}`)
      }
    } else if (news.headlines.length) {
      L.push('  Nothing in the headlines scores as important. A quiet tape is a fine tape.')
    }
    if (news.errors.length) L.push('  ' + (news.fromCache ? 'Using cached news. ' : '') + 'Feed problems: ' + news.errors.join(' | '))
  }
  L.push('')

  // The plan
  const weekend = et.weekday === 0 || et.weekday === 6
  const fridayPM = et.weekday === 5 && et.hour >= 12
  let allow: DayPlan['allow'] = 'both'
  let why = ''
  if (weekend && config.ict.skipWeekends) {
    allow = 'none'
    why = 'It is the weekend. No London, no New York, no story. I propose we do nothing.'
  } else if (fridayPM) {
    allow = 'none'
    why = 'Friday afternoon: desks are squaring up, moves are unreliable. I propose we call it a week.'
  } else if (a.bias.direction === 'bullish') {
    allow = 'long'
    why = `Sell-side liquidity has already been taken, so I propose LONGS ONLY today, targeting the buy-side above. If the high gets swept instead, I will sit on my hands rather than flip.`
  } else if (a.bias.direction === 'bearish') {
    allow = 'short'
    why = `Buy-side liquidity has already been taken, so I propose SHORTS ONLY today, targeting the sell-side below.`
  } else {
    allow = 'both'
    why =
      `No side of the range has been raided yet, so I propose staying open to BOTH directions and letting the first sweep decide. ` +
      (s.asia ? `If ${config.ict.sessions.london.label} sweeps the Asia low (${p(s.asia.low)}) and displaces up, I look for a long back to the Asia high (${p(s.asia.high)}). If it sweeps the high and displaces down, the mirror.` : '')
  }
  const riskUsd = config.accountSizeUsd * config.riskPerTradePercent / 100
  const proposalText =
    `${why} Risk ${config.riskPerTradePercent}% per trade ($${riskUsd.toFixed(2)}), at most ${config.ict.maxTradesPerDay} trades, ` +
    `stop after ${config.ict.dailyLossLimitR}R of losses, minimum ${config.ict.minRR}:1, and only inside the ${config.ict.killzones.map((k) => config.ict.sessions[k].label).join(' / ')} windows.`

  L.push('MY PROPOSED PLAN')
  L.push('  ' + proposalText)
  if (plan) {
    L.push('')
    L.push(`  You have already armed a plan for today: ${plan.allow.toUpperCase()}, ${plan.riskPerTradePercent}% risk, max ${plan.maxTrades} trades.${plan.notes ? ` Notes: ${plan.notes}` : ''}`)
  }

  return {
    lines: L,
    proposal: {
      dayKey: a.dayKey,
      allow,
      riskPerTradePercent: config.riskPerTradePercent,
      maxTrades: config.ict.maxTradesPerDay,
      notes: '',
      proposal: proposalText,
    },
    levels,
  }
}
