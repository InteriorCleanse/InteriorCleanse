/**
 * `npm run talk` — sit down with the bot.
 *
 * It reads the market, tells you what it thinks today looks like,
 * proposes a plan, and then waits. You can agree, tighten the plan,
 * tell it to sit out, ask why, ask what-if, or just talk. Typed
 * commands always work. Free-form questions go to the AI assistant
 * when a key is configured, and get a polite pointer when it isn't.
 */

import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { config } from '../config.ts'
import { analyzeNow, runScan } from './bot.ts'
import type { Snapshot } from './bot.ts'
import { buildBrief } from './brief.ts'
import { MarketDataError, explainMarketDataError } from './market.ts'
import { summarizeNews } from './news.ts'
import { readPlan, writePlan, clearPlan } from './plan.ts'
import type { DayPlan } from './plan.ts'
import { aiStatus, askAI, explainAiError } from './ai.ts'
import { describeSweep } from './liquidity.ts'
import { ifvgRole } from './fvg.ts'
import { toET } from './sessions.ts'
import * as ui from './ui.ts'
import type Anthropic from '@anthropic-ai/sdk'

const HELP: Array<[string, string]> = [
  ['brief', "today's brief again"],
  ['plan', 'show the current plan (armed or proposed)'],
  ['arm', 'arm the proposed plan as-is'],
  ['arm long | short | both | none', 'arm it, allowing only that direction'],
  ['risk 0.5', 'set risk per trade to 0.5% for today'],
  ['max 1', 'cap today at 1 trade'],
  ['note ...', 'add a note to the plan'],
  ['sitout', 'no trades today'],
  ['checklist', 'what the bot is waiting for, step by step'],
  ['levels', 'every level and where price is relative to it'],
  ['sweeps', 'what has been raided today'],
  ['gaps', 'the fair value gaps on the board'],
  ['news', 'the calendar and headlines'],
  ['state', 'uptrend / downtrend / range and what to watch for'],
  ['flow', 'where the big orders are and what is trading'],
  ['whatif 105000', 'what would it mean if price went to 105,000'],
  ['scan', 'take a real decision now and log it'],
  ['refresh', 're-download prices and news'],
  ['quit', 'leave'],
]

/** Everything the assistant is allowed to know, as text. */
function contextFor(snap: Snapshot, plan: DayPlan | null): string {
  const a = snap.analysis
  if (!a) return `Strategy: crossover. Latest signal: ${snap.signal.reason}`
  const brief = buildBrief(a, snap.news, plan, Date.now(), snap.state, snap.flow)
  const parts = [
    brief.lines.join('\n'),
    '',
    'CHECKLIST RIGHT NOW:',
    ...a.signal.evidence.map((e) => `  [${e.passed ? 'ok' : 'NO'}] ${e.step}: ${e.detail}`),
    `Decision: ${a.signal.action} — ${a.signal.reason}`,
    '',
    'GAPS ON THE BOARD:',
    ...a.fvgs.slice(-8).map((f) => `  ${f.direction} gap $${f.bottom.toFixed(0)}–$${f.top.toFixed(0)} formed ${toET(f.createdTime).clock} ET, state ${f.state}${ifvgRole(f) ? ` (now ${ifvgRole(f)})` : ''}`),
    '',
    'SETTINGS: ' + JSON.stringify({ symbol: config.symbol, interval: config.interval, account: config.accountSizeUsd, riskPct: config.riskPerTradePercent, minRR: config.ict.minRR, killzones: config.ict.killzones, requireInversion: config.ict.requireInversion, maxTradesPerDay: config.ict.maxTradesPerDay }),
    '',
    'NEWS: ' + (snap.news ? summarizeNews(snap.news) : 'not available'),
  ]
  return parts.join('\n').slice(0, 12_000)
}

function printPlan(p: DayPlan | null, proposal: Omit<DayPlan, 'armedAt'>): void {
  if (p) {
    console.log(`  ${ui.good('ARMED')} for ${p.dayKey}: ${ui.bold(p.allow.toUpperCase())}, ${p.riskPerTradePercent}% risk, max ${p.maxTrades} trade(s).${p.notes ? ` Notes: ${p.notes}` : ''}`)
  } else {
    console.log(`  ${ui.warn('PROPOSED')} (not armed): ${ui.bold(proposal.allow.toUpperCase())}, ${proposal.riskPerTradePercent}% risk, max ${proposal.maxTrades} trade(s).`)
    console.log(ui.dim('  ' + ui.wrap(proposal.proposal, 70).replace(/\n/g, '\n  ')))
    console.log(ui.dim('  Type "arm" to agree, "arm long" to narrow it, or "sitout".'))
  }
}

async function main(): Promise<void> {
  ui.heading('TALK TO MR. CASH')
  ui.safetyBanner()
  if (config.strategy !== 'ict') {
    console.log(ui.warn('  Talk mode is built around the ICT model. Set strategy: "ict" in config.ts.'))
    return
  }

  const ai = await aiStatus()
  ui.blank()
  console.log(ai.available ? ui.dim(`  Assistant: ${ai.model} is ready. Free-form questions cost a fraction of a cent each; I'll show the cost.`) : ui.dim(`  Assistant: off. ${ai.reason} Typed commands still work.`))

  ui.step('Reading the market and the news...')
  let snap: Snapshot
  try {
    snap = await analyzeNow()
  } catch (err) {
    if (err instanceof MarketDataError) {
      ui.blank()
      for (const l of explainMarketDataError(err).split('\n')) console.log(`  ${l}`)
      process.exit(2)
    }
    throw err
  }

  let plan = readPlan()
  let brief = buildBrief(snap.analysis!, snap.news, plan, Date.now(), snap.state, snap.flow)
  ui.blank()
  for (const l of brief.lines) console.log(l ? `  ${l}` : '')
  ui.blank()
  printPlan(plan, brief.proposal)
  ui.blank()
  console.log(ui.dim('  Type "help" for commands, or just ask a question.'))

  // The interface is iterated rather than asked one question at a time, so
  // lines typed while the bot is busy (or piped in) are queued, not lost.
  const rl = createInterface({ input: stdin, output: stdout, terminal: stdout.isTTY })
  const history: Anthropic.MessageParam[] = []
  let spentUsd = 0
  const goodbye = () => {
    if (spentUsd > 0) console.log(ui.dim(`  Assistant spend this session: $${spentUsd.toFixed(4)}`))
  }

  const arm = (patch: Partial<DayPlan>) => {
    const base: DayPlan = plan ?? { ...brief.proposal, armedAt: Date.now() }
    plan = { ...base, ...patch, armedAt: Date.now(), dayKey: snap.analysis!.dayKey }
    writePlan(plan)
    console.log(ui.good('  Plan armed. ') + ui.dim('Every scan will check itself against it. `npm run plan:clear` forgets it.'))
    printPlan(plan, brief.proposal)
  }

  rl.setPrompt(ui.accent('you › '))
  ui.blank()
  rl.prompt()
  for await (const raw of rl) {
    const line = raw.trim()
    if (!line) {
      rl.prompt()
      continue
    }
    const [cmd, ...rest] = line.split(/\s+/)
    const arg = rest.join(' ')
    const a = snap.analysis!
    const p = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

    switch (cmd.toLowerCase()) {
      case 'quit': case 'exit': case 'q':
        goodbye()
        rl.close()
        return
      case 'help':
        ui.table(['Command', 'Does'], HELP)
        break
      case 'brief':
        for (const l of brief.lines) console.log(l ? `  ${l}` : '')
        break
      case 'plan':
        printPlan(plan, brief.proposal)
        break
      case 'arm': {
        const allow = arg.toLowerCase()
        if (allow && !['long', 'short', 'both', 'none'].includes(allow)) { console.log(ui.warn('  Use: arm, arm long, arm short, arm both, or arm none.')); break }
        arm(allow ? { allow: allow as DayPlan['allow'] } : {})
        break
      }
      case 'sitout':
        arm({ allow: 'none' })
        break
      case 'risk': {
        const v = Number(arg)
        if (!(v > 0 && v <= 5)) { console.log(ui.warn('  Give a percent between 0.1 and 5, e.g. "risk 0.5".')); break }
        arm({ riskPerTradePercent: v })
        break
      }
      case 'max': {
        const v = Number(arg)
        if (!(v >= 0 && v <= 10)) { console.log(ui.warn('  Give a number of trades, e.g. "max 1".')); break }
        arm({ maxTrades: v })
        break
      }
      case 'note':
        arm({ notes: arg })
        break
      case 'clear':
        clearPlan(); plan = null
        console.log('  Plan cleared. Defaults from config.ts apply.')
        break
      case 'checklist':
        ui.evidence(a.signal.evidence)
        console.log(`\n  Decision: ${ui.actionLabel(a.signal.action)} ${ui.dim(a.signal.reason)}`)
        break
      case 'levels':
        for (const l of brief.levels) console.log(`  ${l.label.padEnd(18)} ${p(l.price).padStart(10)}   ${l.status}`)
        break
      case 'sweeps':
        if (!a.sweepsToday.length) console.log('  Nothing has been swept today.')
        for (const s of a.sweepsToday) console.log(`  ${toET(s.time).clock} ET — ${describeSweep(s)}`)
        break
      case 'gaps': case 'fvg':
        if (!a.fvgs.length) console.log('  No gaps on the board.')
        for (const f of a.fvgs.slice(-10)) console.log(`  ${f.direction.padEnd(7)} ${p(f.bottom)}–${p(f.top)}  formed ${toET(f.createdTime).clock} ET  ${f.state}${ifvgRole(f) ? ` → now ${ifvgRole(f)}` : ''}${f.fromDisplacement ? '  (displacement)' : ''}`)
        break
      case 'news':
        console.log('  ' + (snap.news ? summarizeNews(snap.news) : 'News not available.').replace(/\n/g, '\n  '))
        break
      case 'state':
        if (!snap.state) { console.log('  No market state available.'); break }
        console.log(`  ${snap.state.trend.toUpperCase()} — strength ${snap.state.strength}/100 — ${snap.state.continuation.label}`)
        for (const e of snap.state.evidence) console.log(`  • ${e}`)
        for (const w of snap.state.watchOuts) console.log(`  ! ${w}`)
        break
      case 'flow':
        if (!snap.flow) { console.log('  Order flow not available.'); break }
        for (const l of snap.flow.lines) console.log(`  ${l}`)
        for (const e of snap.flow.errors) console.log(`  ! ${e}`)
        break
      case 'whatif': {
        const price = Number(arg.replace(/[$,]/g, ''))
        if (!(price > 0)) { console.log(ui.warn('  Give a price, e.g. "whatif 105000".')); break }
        const above = a.levels.filter((l) => l.price > a.price && l.price <= price && !l.sweptAt && !l.brokenAt)
        const below = a.levels.filter((l) => l.price < a.price && l.price >= price && !l.sweptAt && !l.brokenAt)
        const crossed = price > a.price ? above : below
        console.log(`  From ${p(a.price)} to ${p(price)} is ${ui.pct(((price - a.price) / a.price) * 100)}, about ${(Math.abs(price - a.price) / a.atr).toFixed(1)} ATR.`)
        if (!crossed.length) console.log('  That path crosses no intact level. Nothing structural changes; it\'s just price moving.')
        for (const l of crossed) {
          const kindHigh = l.kind.endsWith('high') || l.kind === 'pdh' || l.kind === 'eqh'
          console.log(`  It would take out the ${l.label} (${p(l.price)}). If price then closes back ${kindHigh ? 'below' : 'above'} it, that is a sweep — and I would start looking for a ${kindHigh ? 'short' : 'long'}. If it closes through and holds, it's a breakout and I'd wait.`)
        }
        const gaps = a.fvgs.filter((f) => f.state !== 'expired' && ((price >= f.bottom && price <= f.top) || (a.price < f.bottom && price > f.top) || (a.price > f.top && price < f.bottom)))
        for (const f of gaps) console.log(`  It passes through the ${f.direction} gap ${p(f.bottom)}–${p(f.top)} (${f.state}${ifvgRole(f) ? `, now ${ifvgRole(f)}` : ''}).`)
        break
      }
      case 'scan': {
        const r = await runScan(true)
        ui.evidence(r.signal.evidence)
        console.log(`\n  FINAL DECISION: ${ui.actionLabel(r.finalAction)}`)
        console.log(ui.dim('  ' + ui.wrap(r.finalReason, 70).replace(/\n/g, '\n  ')))
        break
      }
      case 'refresh':
        ui.step('Re-downloading...')
        snap = await analyzeNow()
        plan = readPlan()
        brief = buildBrief(snap.analysis!, snap.news, plan, Date.now(), snap.state, snap.flow)
        console.log(`  ${config.symbol} ${p(snap.analysis!.price)} · ${snap.analysis!.etClock} ET · bias ${snap.analysis!.bias.direction}. Type "brief" for the full picture.`)
        break
      default: {
        if (!ai.available) {
          console.log(ui.dim(`  I don't have a command for that. ${ai.reason}`))
          console.log(ui.dim('  Type "help" to see what I can do without it.'))
          break
        }
        process.stdout.write(ui.accent('Mr. Cash › '))
        try {
          const answer = await askAI(line, contextFor(snap, plan), history, (t) => process.stdout.write(t))
          process.stdout.write('\n')
          if (answer.refused) console.log(ui.warn('  (The assistant declined to answer that one.)'))
          history.push({ role: 'user', content: line }, { role: 'assistant', content: answer.text })
          if (history.length > 20) history.splice(0, 2)
          spentUsd += answer.costUsd
          console.log(ui.dim(`  — cost $${answer.costUsd.toFixed(4)} (${answer.usage.input + answer.usage.cacheRead} in / ${answer.usage.output} out), $${spentUsd.toFixed(4)} this session`))
        } catch (err) {
          process.stdout.write('\n')
          console.log(ui.bad('  ' + (await explainAiError(err))))
        }
      }
    }
    ui.blank()
    rl.prompt()
  }
  // Input ended (Ctrl+D, or the end of a piped script).
  goodbye()
}

main()
