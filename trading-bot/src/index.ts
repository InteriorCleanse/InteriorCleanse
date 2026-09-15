/**
 * The command line. Every `npm run ...` command lands here.
 * Its whole job is to run the right thing and then explain what
 * happened in language a person can actually read.
 */

import { config } from '../config.ts'
import { MarketDataError, explainMarketDataError } from './market.ts'
import { analyzeNow, runScan } from './bot.ts'
import { runReplay, runStrategyReplay, compareStrategies, scoreSkippedTrades } from './replay.ts'
import { STRATEGIES, enabledStrategyIds } from './strategies/registry.ts'
import { runBacktest } from './backtest/runner.ts'
import { reportLines } from './backtest/report.ts'
import type { ReplayResult } from './replay.ts'
import { LEDGER_PATH, LEARNINGS_PATH, lessonLines, memoryIsEmpty, readLedger, resetMemory } from './memory.ts'
import { buildBrief } from './brief.ts'
import { getNews, summarizeNews, upcomingEvents } from './news.ts'
import { getFlow } from './orderflow.ts'
import { paperStats } from './paperTrader.ts'
import { clearPlan, readPlan } from './plan.ts'
import { describeKey } from './adaptiveFilter.ts'
import { stop, resume, stopState, STOP_PATH } from './killswitch.ts'
import { describeMode } from './mode.ts'
import { systemState } from './systemState.ts'
import { store } from './store.ts'
import * as ui from './ui.ts'

/** Older versions of Node can't run TypeScript directly. Say so kindly. */
function checkNodeVersion(): void {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major > 22 || (major === 22 && minor >= 18)) return
  console.log('')
  console.log(ui.bad('  This bot needs a newer version of Node.'))
  console.log('')
  console.log(`  You have:  Node ${process.versions.node}`)
  console.log('  You need:  Node 22.18 or newer (Node 24 is great too)')
  console.log('')
  console.log('  Download the "LTS" version — it is free — from https://nodejs.org')
  console.log('  Install it, close this window, open a new one, and try again.')
  console.log('')
  process.exit(1)
}

function showSettings(): void {
  console.log('')
  const rows: string[][] = [
    ['Market', config.symbol, 'the coin pair being watched'],
    ['Candle size', config.interval, 'how much time each bar covers'],
    ['Brain', config.strategy === 'ict' ? 'ICT session model' : `${config.crossover.fastMA}/${config.crossover.slowMA} crossover`, config.strategy === 'ict' ? 'sweeps, displacement, inversion gaps' : 'fast average vs slow average'],
    ['Account', ui.money(config.accountSizeUsd), 'your pretend balance'],
  ]
  if (config.strategy === 'ict') {
    rows.push(
      ['Risk per trade', `${config.riskPerTradePercent}% (${ui.money(config.accountSizeUsd * config.riskPerTradePercent / 100)})`, 'what one stop-out costs'],
      ['Entry windows', config.ict.killzones.map((k) => config.ict.sessions[k].label).join(', '), 'the only times it trades'],
      ['Minimum RR', `${config.ict.minRR}:1`, 'reward it insists on per unit of risk'],
      ['Needs inversion', config.ict.requireInversion ? 'yes' : 'no', 'waits for a gap to flip before entering'],
    )
  }
  rows.push(['Fills', `next open +${config.execution.spreadBps / 2 + config.execution.slippageBps} bp, ${config.execution.takerFeePercent}% fees`, 'orders fill the way a real exchange fills them'])
  ui.table(['Setting', 'Value', 'What it means'], rows)
}

// ---------------------------------------------------------------
// scan
// ---------------------------------------------------------------

async function commandScan(useMemory: boolean): Promise<void> {
  ui.heading(useMemory ? 'CHECKING THE MARKET (with memory)' : 'CHECKING THE MARKET')
  ui.safetyBanner()
  showSettings()
  ui.blank()
  ui.step(`Downloading real ${config.symbol} prices${config.strategy === 'ict' ? ' and news' : ''}...`)

  const r = await runScan(useMemory)
  const a = r.analysis

  ui.step(`Got ${r.candles.length} real candles. Latest price: ${ui.bold(ui.price(r.signal.price))}`)
  if (a) {
    ui.step(`${a.weekday} ${a.etClock} ET — ${a.session ? `${config.ict.sessions[a.session].label} session` : 'between sessions'}${a.inKillzone ? ui.good(' (killzone open)') : ''}`)
    ui.step(`Bias: ${ui.bold(a.bias.direction.toUpperCase())}`)
    ui.note(ui.wrap(a.bias.reason, 70).replace(/\n/g, '\n         '))
    if (r.news?.errors.length) ui.note(ui.warn('News: ') + r.news.errors[0])
    ui.blank()
    console.log(ui.bold('  THE CHECKLIST'))
    ui.blank()
    ui.evidence(r.signal.evidence)
  } else {
    ui.step(`Fast average: ${r.signal.fastMA?.toFixed(2)}  Slow average: ${r.signal.slowMA?.toFixed(2)}`)
    ui.step(`Strategy says: ${ui.actionLabel(r.signal.action)}`)
    ui.note(r.signal.reason)
  }

  if (r.signal.action !== 'HOLD') {
    ui.blank()
    ui.step(`Risk check: ${r.risk.approved ? ui.good('PASSED') : ui.warn('BLOCKED')}`)
    ui.note(ui.wrap(r.risk.reason, 70).replace(/\n/g, '\n         '))
  }
  if (r.memory) {
    ui.step(`Memory check: ${r.memory.block ? ui.warn('REFUSED') : ui.good('no objection')}`)
    ui.note(ui.wrap(r.memory.reason, 70).replace(/\n/g, '\n         '))
  }

  ui.blank()
  console.log(`  FINAL DECISION: ${ui.actionLabel(r.finalAction)}`)
  ui.note(ui.wrap(r.finalReason, 70).replace(/\n/g, '\n         '))
  if (r.signal.plan && r.finalAction !== 'HOLD') {
    const p = r.signal.plan
    ui.blank()
    ui.table(['', '', ''], [
      ['Entry', ui.price(p.entry), p.entryLabel],
      ['Stop', ui.price(p.stop), p.stopLabel],
      ['Target', ui.price(p.takeProfit), p.targetLabel],
      ['Reward:risk', `${p.rr.toFixed(1)}:1`, `quality ${r.signal.quality}/100`],
    ])
  }

  const explain: Record<string, string[]> = {
    BUY: ['The bot would have bought here — on paper only.', 'Nothing was sent to any exchange. No money moved.', 'The decision is in data/ledger.csv for later review.'],
    SELL: ['The bot would have sold here — on paper only.', 'Nothing was sent to any exchange. No money moved.', 'The decision is in data/ledger.csv for later review.'],
    HOLD: ['Nothing happened, and that is normal — the first ✗ above says why.', 'This model waits for a specific story to play out: a sweep, then', 'displacement, then a gap that flips, then a retest, inside a killzone.', 'Most candles fail that test. Patience is the edge, not a bug.'],
    SKIP: ['The bot saw a full setup and refused it.', 'That came from your safety limits, your plan, or memory of a setup', 'that lost before. Being refused is the system working.'],
  }
  ui.plainEnglish(explain[r.finalAction] ?? ['Decision recorded.'])
  ui.blank()
}

// ---------------------------------------------------------------
// brief / news
// ---------------------------------------------------------------

async function commandBrief(): Promise<void> {
  ui.heading("TODAY'S BRIEF")
  ui.safetyBanner()
  if (config.strategy !== 'ict') {
    console.log(ui.warn('  The brief is part of the ICT model. Set strategy: "ict" in config.ts.'))
    return
  }
  ui.step('Downloading prices and news...')
  const snap = await analyzeNow()
  const brief = buildBrief(snap.analysis!, snap.news, readPlan(), Date.now(), snap.state, snap.flow, snap.decision)
  ui.blank()
  for (const l of brief.lines) console.log(l ? `  ${l}` : '')
  ui.plainEnglish([
    'To agree to this plan, tighten it, or tell me to sit out, run:',
    '  npm run talk',
    'Once a plan is armed, every scan checks itself against it first.',
  ])
  ui.blank()
}

async function commandNews(): Promise<void> {
  ui.heading("WHAT'S MOVING THE MARKET")
  ui.step('Downloading the economic calendar and headlines...')
  const news = await getNews(true)
  ui.blank()
  if (news.errors.length) {
    for (const e of news.errors) console.log(ui.warn('  ! ') + e)
    ui.blank()
  }
  const soon = upcomingEvents(news)
  ui.sub('SCHEDULED — the ones with a known time')
  if (!soon.length) console.log(ui.dim('  Nothing in the next 36 hours.'))
  else ui.table(['When (ET)', 'Impact', 'Event', 'Forecast', 'Previous'], soon.slice(0, 15).map((e) => [
    new Date(e.time).toLocaleString('en-US', { timeZone: config.ict.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
    e.impact === 'High' ? ui.bad('HIGH') : e.impact === 'Medium' ? ui.warn('medium') : ui.dim(e.impact.toLowerCase()),
    `${e.country} ${e.title}`, e.forecast || '—', e.previous || '—',
  ]))
  ui.sub('HEADLINES — ranked by what they touch')
  if (!news.headlines.length) console.log(ui.dim('  No headlines available.'))
  for (const h of news.headlines.slice(0, 12)) {
    console.log(`  ${h.score >= 3 ? ui.accent('●') : ui.dim('○')} ${h.title}`)
    console.log(ui.dim(`    ${h.source} · ${ui.formatTime(h.time)} · ${h.tags.join(', ') || 'general'}`))
    if (h.score >= 3) console.log(ui.dim(`    ${h.whyItMatters}`))
  }
  if (news.blackouts.length) {
    ui.sub('STAND ASIDE WINDOWS')
    for (const b of news.blackouts.filter((x) => x.end > Date.now()).slice(0, 8)) console.log(`  ${ui.formatET(b.start, true)} → ${ui.formatET(b.end)}  ${b.title}`)
  }
  ui.plainEnglish([
    'This ranks attention, not direction. A high-impact event means',
    '"the tape gets random for a while" — the bot refuses to enter',
    `within ${config.ict.newsBlackoutMinutes} minutes of one. Headlines tell you what the crowd is`,
    'watching so a sudden move makes sense instead of feeling like chaos.',
  ])
  ui.blank()
}

async function commandFlow(): Promise<void> {
  ui.heading('ORDER FLOW — where the orders are')
  ui.step('Reading the order book and the tape...')
  const flow = await getFlow()
  ui.blank()
  for (const l of flow.lines) console.log(`  ${ui.wrap(l, 74).replace(/\n/g, '\n  ')}`)
  for (const e of flow.errors) console.log(ui.warn('  ! ') + e)
  if (flow.book?.walls.length) {
    ui.sub('WALLS')
    ui.table(['Side', 'Price', 'Size', 'Dollars', 'vs typical', 'Distance'], flow.book.walls.map((w) => [
      w.side === 'bid' ? ui.good('BID') : ui.bad('ASK'), ui.price(w.price), w.qty.toFixed(3), ui.money(w.usd, 0), `${w.multiple.toFixed(0)}×`, `${Math.abs(w.distancePct).toFixed(2)}% ${w.distancePct < 0 ? 'below' : 'above'}`,
    ]))
  }
  if (flow.tape?.bigTrades.length) {
    ui.sub('BIG PRINTS')
    ui.table(['When', 'Side', 'Size', 'Price', 'Dollars'], flow.tape.bigTrades.slice(0, 10).map((t) => [
      ui.formatTime(t.time), t.side === 'buy' ? ui.good('BUY') : ui.bad('SELL'), t.qty.toFixed(3), ui.price(t.price), ui.money(t.usd, 0),
    ]))
  }
  ui.plainEnglish(['The book shows intent — orders that can be pulled. The tape shows', 'what actually traded. Every reading is logged to data/orderflow.csv', 'so you can watch the pressure change through the day.'])
  ui.blank()
}

async function commandState(): Promise<void> {
  ui.heading('MARKET STATE')
  ui.step('Reading prices, news and order flow...')
  const snap = await analyzeNow()
  const s = snap.state
  if (!s) { console.log(ui.warn('  No state available.')); return }
  ui.blank()
  const trend = s.trend === 'uptrend' ? ui.good('UPTREND') : s.trend === 'downtrend' ? ui.bad('DOWNTREND') : ui.warn('RANGE')
  console.log(`  ${trend}  strength ${ui.bold(String(s.strength))}/100  ·  ${ui.bold(s.continuation.label)} (${s.continuation.score}/100)  ·  volatility ${s.volatility}`)
  ui.sub('WHY')
  for (const e of s.evidence) console.log(`  • ${ui.wrap(e, 72).replace(/\n/g, '\n    ')}`)
  if (s.continuation.reasons.length) { ui.blank(); for (const r of s.continuation.reasons) console.log(ui.dim(`  ${r}`)) }
  if (s.watchOuts.length) {
    ui.sub('WATCH OUT FOR')
    for (const w of s.watchOuts) console.log(`  ${ui.warn('!')} ${ui.wrap(w, 72).replace(/\n/g, '\n    ')}`)
  }
  ui.plainEnglish(['This is a description of now, not a forecast. Each reading gets a', 'vote; the state is what most of them agree on, and the dissenters are', 'listed so you can see the argument.'])
  ui.blank()
}

async function commandPaper(): Promise<void> {
  ui.heading('THE PAPER ACCOUNT')
  ui.safetyBanner()
  let price: number | undefined
  try { price = (await analyzeNow({ withNews: false, withFlow: false })).signal.price } catch { /* stats without unrealized */ }
  const p = paperStats(price)
  ui.blank()
  ui.table(['', '', ''], [
    ['Started with', ui.money(p.startUsd), 'pretend money'],
    ['Equity now', p.equityUsd >= p.startUsd ? ui.good(ui.money(p.equityUsd)) : ui.bad(ui.money(p.equityUsd)), 'closed trades only'],
    ...(price !== undefined && p.open.length ? [['With open trades', ui.money(p.equityWithOpenUsd), `at $${price.toFixed(2)}`]] : []),
    ['Closed trades', String(p.trades), `${p.wins} wins / ${p.losses} losses`],
    ['Total', ui.r(p.totalR), p.expectancyR !== null ? `expectancy ${ui.r(p.expectancyR)}` : ''],
  ])
  if (p.open.length) {
    ui.sub('OPEN')
    ui.table(['Queued', 'Side', 'Status', 'Entry', 'Stop', 'Target', 'Now'], p.open.map((o) => [ui.formatTime(o.openedAt), o.direction, o.status === 'pending' ? ui.warn('fills next candle') : 'filled', ui.price(o.entry), ui.price(o.stop), ui.price(o.target), o.status === 'open' && o.unrealized ? ui.r(o.unrealized.rMultiple) : '—']))
  }
  if (p.missed) console.log(ui.dim(`  ${p.missed} order(s) were missed — price ran away before the next candle opened. Costs so far: ${ui.money(p.costsUsd, 3)}.`))
  if (p.closed.length) {
    ui.sub('RECENT CLOSED')
    ui.table(['Closed', 'Side', 'Exit', 'Result', 'Setup'], p.closed.slice(0, 12).map((c) => [ui.formatTime(c.closedAt ?? 0), c.direction, c.exitReason ?? '', (c.rMultiple ?? 0) >= 0 ? ui.good(ui.r(c.rMultiple ?? 0)) : ui.bad(ui.r(c.rMultiple ?? 0)), c.setupKey.split('|').slice(3).join(' ')]))
  }
  ui.plainEnglish([
    'Every trade here was opened and closed by Mr. Cash on paper while',
    '`npm start` (or start-24-7) was running. Each close is written to',
    'memory, can become a lesson, and creates a journal entry for you.',
    'This is the track record. Let it get long before you trust it.',
  ])
  ui.blank()
}

// ---------------------------------------------------------------
// replay
// ---------------------------------------------------------------

function printTrades(result: ReplayResult): void {
  const rows = result.trades.slice(-25).map((t) => {
    const outcome = t.blockedByMemory ? ui.warn('SKIPPED') : t.outcome === 'WIN' ? ui.good('WIN') : t.outcome === 'LOSS' ? ui.bad('LOSS') : ui.dim('FLAT')
    return [
      ui.formatTime(t.time),
      t.action,
      ui.price(t.entryPrice),
      ui.price(t.exitPrice),
      t.blockedByMemory ? ui.dim('—') : t.rMultiple !== null ? ui.r(t.rMultiple) : ui.pct(t.pnlPercent),
      t.exitReason,
      outcome,
    ]
  })
  if (!rows.length) {
    ui.blank()
    console.log(ui.warn('  No completed trades in this window. Nothing to show.'))
    return
  }
  ui.blank()
  if (result.trades.length > 25) console.log(ui.dim(`  (showing the most recent 25 of ${result.trades.length})`))
  ui.table(['When', 'Side', 'In at', 'Out at', 'Result', 'Exit', ''], rows)
}

function printSummary(result: ReplayResult): void {
  const s = result.summary
  ui.sub('THE SCOREBOARD')
  const rows: string[][] = [
    ['Setups found', String(s.totalSetups), 'times the full checklist passed'],
    ['Trades measured', String(s.taken), 'with a known outcome'],
  ]
  if (s.skipped > 0) rows.push(['Refused by memory', String(s.skipped), 'setups it had lost on before'])
  rows.push(['Wins', ui.good(String(s.wins)), 'hit the target (or exited up)'], ['Losses', ui.bad(String(s.losses)), 'hit the stop (or exited down)'])
  if (s.flat > 0) rows.push(['Flat', String(s.flat), 'went nowhere'])
  rows.push(['Win rate', s.winRate === null ? '—' : `${(s.winRate * 100).toFixed(1)}%`, 'how often it was right'])
  if (s.expectancyR !== null) {
    rows.push(['Expectancy', ui.r(s.expectancyR), 'average result per trade, in units of risk'])
    rows.push(['Total', ui.r(s.totalR), `= ${ui.money(s.totalPnlUsd, 3)} at your size`])
    if (s.maxDrawdownR !== null) rows.push(['Worst run', ui.r(-s.maxDrawdownR), 'biggest drop from a high point'])
  } else {
    rows.push(['Average result', s.avgPnlPercent === null ? '—' : ui.pct(s.avgPnlPercent), 'per trade, fees included'])
    rows.push(['Total', ui.money(s.totalPnlUsd), ''])
    if (s.maxDrawdownPercent !== null) rows.push(['Worst run', ui.pct(-s.maxDrawdownPercent), 'biggest drop from a high point'])
  }
  if (s.profitFactor !== null) rows.push(['Profit factor', s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2), 'wins ÷ losses in dollars; above 1 is positive'])
  rows.push(['Longest losing streak', String(s.longestLosingStreak), 'in a row — expect this to happen again'])
  if (s.bestTrade) rows.push(['Best trade', ui.good(s.bestTrade.rMultiple !== null ? ui.r(s.bestTrade.rMultiple) : ui.pct(s.bestTrade.pnlPercent)), ui.formatTime(s.bestTrade.time)])
  if (s.worstTrade) rows.push(['Worst trade', ui.bad(s.worstTrade.rMultiple !== null ? ui.r(s.worstTrade.rMultiple) : ui.pct(s.worstTrade.pnlPercent)), ui.formatTime(s.worstTrade.time)])
  ui.table(['', '', ''], rows)

  for (const b of result.breakdowns) {
    if (b.rows.length < 2) continue
    ui.sub(b.title.toUpperCase())
    ui.table(['', 'Trades', 'Wins', 'Win rate', 'Total R', 'Avg R'], b.rows.map((row) => [
      row.label, String(row.trades), String(row.wins), row.winRate === null ? '—' : `${(row.winRate * 100).toFixed(0)}%`,
      row.totalR >= 0 ? ui.good(ui.r(row.totalR)) : ui.bad(ui.r(row.totalR)), row.avgR === null ? '—' : ui.r(row.avgR),
    ]))
  }
  for (const n of result.notes) {
    ui.blank()
    console.log(ui.warn('  ! ') + ui.dim(ui.wrap(n, 70).replace(/\n/g, '\n    ')))
  }
}

/** `--strategy <id>` from the command line, if present. */
function strategyArg(): string | null {
  const argv = process.argv.slice(3)
  const i = argv.indexOf('--strategy')
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null
}

async function commandReplayRaw(): Promise<void> {
  const id = strategyArg()
  ui.heading(id ? `LOOK-BACK TEST — strategy "${id}" on its own` : 'LOOK-BACK TEST — the strategy on its own')
  ui.safetyBanner()
  showSettings()
  ui.blank()
  ui.step(`Downloading ${config.replay.lookbackDays} days of real ${config.symbol} candles...`)
  const result = id ? await runStrategyReplay(id, { useMemory: false, writeMemory: false }) : await runReplay({ useMemory: false, writeMemory: true })
  ui.step(`Studied ${result.candlesUsed} candles (${result.days} days), ${ui.formatTime(result.from)} → ${ui.formatTime(result.to)}.`)
  printTrades(result)
  printSummary(result)
  ui.plainEnglish([
    'This is the strategy with NO memory — the honest baseline.',
    'Whatever it shows is what really happened on real prices, with',
    'fees taken out and the pessimistic reading whenever a candle hit',
    'both the stop and the target.',
    '',
    'If the numbers are unimpressive, that is information, not failure.',
    'The real outcomes are now in memory. Next: npm run replay:memory',
  ])
  ui.blank()
}

async function commandReplayMemory(): Promise<void> {
  ui.heading('LOOK-BACK TEST — with memory switched on')
  ui.safetyBanner()
  if (memoryIsEmpty()) {
    ui.blank()
    console.log(ui.warn('  Memory is completely empty, so there is nothing to compare.'))
    ui.plainEnglish(['This is not an error. The bot has never seen a result yet.', '', 'Run this first:  npm run replay:raw', 'Then come back and run this command again.'])
    ui.blank()
    return
  }
  ui.step('Downloading real candles...')
  const result = await runReplay({ useMemory: true, writeMemory: false })
  ui.step(`Read ${readLedger().length} past decision(s) and ${lessonLines().length} lesson(s) from memory.`)
  for (const l of lessonLines().slice(0, 3)) ui.note(`• ${l}`)
  printTrades(result)
  printSummary(result)
  const score = scoreSkippedTrades(result)
  if (score.count > 0) {
    ui.sub('WAS SKIPPING WORTH IT?')
    ui.table(['', '', ''], [
      ['Trades refused', String(score.count), 'memory said no'],
      ['Losses dodged', ui.good(ui.money(score.avoidedLoss, 3)), 'money it saved you'],
      ['Profits missed', ui.bad(ui.money(score.missedProfit, 3)), 'money it cost you'],
      ['Net effect', score.netUsd >= 0 ? ui.good(ui.money(score.netUsd, 3)) : ui.bad(ui.money(score.netUsd, 3)), score.netUsd >= 0 ? 'memory helped' : 'memory hurt'],
    ])
    ui.plainEnglish(['Memory is not automatically an improvement, and this table keeps it', 'honest. If "Net effect" is negative, the rules are too strict — raise', 'skipAfterLosses in config.ts.'])
  }
  ui.blank()
  console.log(ui.dim(`  Every decision is logged in: ${LEDGER_PATH}`))
  console.log(ui.dim(`  Lessons are written in:      ${LEARNINGS_PATH}`))
  ui.blank()
}

async function commandCompare(): Promise<void> {
  ui.heading('SIDE BY SIDE — with and without memory')
  ui.safetyBanner()
  ui.step('Run 1 of 2: the raw strategy, no memory...')
  const raw = await runReplay({ useMemory: false, writeMemory: true })
  ui.step('Run 2 of 2: the same history, memory switched on...')
  const mem = await runReplay({ useMemory: true, writeMemory: false })
  const fmt = (v: number | null, f: (n: number) => string) => (v === null ? '—' : f(v))
  ui.blank()
  ui.table(['', 'Without memory', 'With memory'], [
    ['Setups', String(raw.summary.totalSetups), String(mem.summary.totalSetups)],
    ['Trades taken', String(raw.summary.taken), String(mem.summary.taken)],
    ['Refused', String(raw.summary.skipped), String(mem.summary.skipped)],
    ['Wins', String(raw.summary.wins), String(mem.summary.wins)],
    ['Losses', String(raw.summary.losses), String(mem.summary.losses)],
    ['Win rate', fmt(raw.summary.winRate, (n) => `${(n * 100).toFixed(1)}%`), fmt(mem.summary.winRate, (n) => `${(n * 100).toFixed(1)}%`)],
    ['Expectancy', fmt(raw.summary.expectancyR, ui.r), fmt(mem.summary.expectancyR, ui.r)],
    ['Total', raw.summary.expectancyR !== null ? ui.r(raw.summary.totalR) : ui.money(raw.summary.totalPnlUsd), mem.summary.expectancyR !== null ? ui.r(mem.summary.totalR) : ui.money(mem.summary.totalPnlUsd)],
  ])
  const diff = mem.summary.totalPnlUsd - raw.summary.totalPnlUsd
  ui.blank()
  if (mem.summary.skipped === 0) console.log(ui.dim('  Memory refused nothing, so the two runs are identical. That happens when no setup has lost often enough yet.'))
  else if (diff > 0) console.log(ui.good(`  Memory improved the result by ${ui.money(diff, 3)}.`))
  else if (diff < 0) console.log(ui.bad(`  Memory made the result worse by ${ui.money(Math.abs(diff), 3)}. Worth knowing — loosen the rules in config.ts.`))
  else console.log(ui.dim('  No measurable difference between the two runs.'))
  ui.blank()
}

// ---------------------------------------------------------------
// memory / plan / help
// ---------------------------------------------------------------

function commandMemoryReset(): void {
  ui.heading('CLEARING MEMORY')
  const before = readLedger().length
  resetMemory()
  ui.blank()
  console.log(`  Deleted ${before} recorded decision(s) and every written lesson.`)
  ui.plainEnglish(['The bot knows nothing again — a clean slate. Do this whenever you', 'change the strategy or the market; lessons about one setup do not', 'apply to another. Your settings in config.ts are untouched.'])
  ui.blank()
}

function commandMemoryShow(): void {
  ui.heading('WHAT THE BOT REMEMBERS')
  const rows = readLedger()
  const lessons = lessonLines()
  ui.blank()
  console.log(`  Decisions recorded: ${ui.bold(String(rows.length))}`)
  console.log(`  Lessons written:    ${ui.bold(String(lessons.length))}`)
  if (rows.length) {
    ui.sub('The last 10 decisions')
    ui.table(['When', 'Action', 'Price', 'Setup', 'Result', 'P/L'], rows.slice(-10).map((r) => [
      r.timestamp.slice(0, 16).replace('T', ' '), r.action, ui.price(r.price), describeKey(r.reason.split(' — ')[0]).slice(0, 48), r.outcome, r.pnl ? ui.pct(r.pnl) : '—',
    ]))
  }
  if (lessons.length) {
    ui.sub('Lessons')
    for (const l of lessons) console.log(`  • ${ui.wrap(l, 70).replace(/\n/g, '\n    ')}`)
  } else {
    ui.blank()
    console.log(ui.dim('  No lessons yet. The bot has not seen a setup lose repeatedly, and nothing was invented to fill the gap.'))
  }
  ui.blank()
}

function commandPlanClear(): void {
  const p = readPlan()
  clearPlan()
  ui.heading('PLAN CLEARED')
  console.log(p ? `  Removed the plan for ${p.dayKey} (${p.allow}).` : '  There was no plan armed.')
  console.log(ui.dim('  Scans now use the defaults in config.ts.'))
  ui.blank()
}

function commandStop(): void {
  const reason = process.argv.slice(3).join(' ') || 'stopped from the terminal'
  const s = stop(reason)
  ui.heading('KILL SWITCH — ON')
  console.log(`  No new positions will be opened (paper included) since ${s.stopped ? s.since : ''}.`)
  console.log('  Open paper positions are still managed to their stop or target.')
  console.log(ui.dim(`  The switch is the file ${STOP_PATH}. Release it with: npm run resume`))
  ui.blank()
}

function commandResume(): void {
  const before = stopState()
  resume()
  ui.heading('KILL SWITCH — RELEASED')
  console.log(before.stopped ? `  It had been on since ${before.since} (${before.reason}). Entries are allowed again.` : '  It was not on. Nothing changed.')
  ui.blank()
}

function commandStatus(): void {
  ui.heading('SYSTEM STATUS')
  const st = systemState({ lastWatch: null, lastError: null, startedAt: Date.now() })
  const s = st.killSwitch
  ui.table(['', ''], [
    ['Version', st.version],
    ['Mode', describeMode()],
    ['Kill switch', s.stopped ? ui.warn(`ON since ${s.since} — ${s.reason}`) : ui.good('off — entries allowed')],
    ['Store', `${st.data.dbPath} — ${st.data.integrity === 'ok' ? ui.good('ok') : ui.bad(st.data.integrity)}, ${(st.data.dbSizeBytes / 1024).toFixed(0)} KB${st.data.migratedAt ? `, flat files imported ${st.data.migratedAt.slice(0, 10)}` : ''}`],
    ['Records', `${st.data.counts.ledger} decisions, ${st.data.counts.lessons} lessons, ${st.data.counts.positionsClosed} closed paper trades, ${st.data.counts.journal} journal entries, ${st.data.counts.events} events`],
    ['Today', `${st.trading.tradesToday} of ${st.trading.maxTradesPerDay} trades, ${st.trading.lossesTodayR.toFixed(1)}R of ${st.trading.dailyLossLimitR}R losses, ${st.trading.openPaperPositions} open paper position(s)`],
    ['Plan armed', st.trading.plan ? `${st.trading.plan.allow}, ${st.trading.plan.riskPerTradePercent}% risk` : 'none'],
    ['Settings', Object.keys(st.settingsOverrides).length ? `overrides: ${JSON.stringify(st.settingsOverrides)}` : 'all from config.ts'],
  ])
  ui.plainEnglish(['Feed freshness is only known while the app is running — the same', 'document with live feed ages is at http://127.0.0.1:4173/api/system.'])
  ui.blank()
}

function commandMigrate(): void {
  ui.heading('IMPORTING THE OLD FILES INTO THE STORE')
  const s = store()
  const m = s.migration()
  if (!m) { console.log('  Nothing to report — the store was created without any flat files to import.'); ui.blank(); return }
  console.log(`  Imported on ${m.at}:`)
  for (const [file, n] of Object.entries(m.imported)) console.log(`    ${file.padEnd(18)} ${n} record(s)`)
  if (m.skipped.length) console.log(ui.dim(`  Not present or empty: ${m.skipped.join(', ')}`))
  ui.plainEnglish(['The import runs once, the first time the store is created. Your original', 'files were left exactly as they were; the bot now reads from data/mrcash.db', 'and keeps writing the readable copies next to it.'])
  ui.blank()
}

async function commandStrategies(): Promise<void> {
  ui.heading('THE PLAYBOOK — every strategy, judged alone')
  ui.safetyBanner()
  ui.blank()
  const on = new Set(enabledStrategyIds())
  ui.table(['Strategy', 'Family', 'On?', 'What it looks for'], STRATEGIES.map((s) => [s.meta.name, s.meta.family, on.has(s.meta.id) ? ui.good('yes') : ui.dim('no'), s.meta.summary]))
  ui.blank()
  ui.step(`Replaying each enabled strategy over the last ${config.replay.lookbackDays} days on the same candles...`)
  const rows = await compareStrategies({ useMemory: false, writeMemory: false })
  ui.table(['Strategy', 'Trades', 'Win %', 'Total R', 'Avg R'], rows.map((r) => [
    r.name,
    String(r.summary.taken),
    r.summary.winRate !== null ? `${Math.round(r.summary.winRate * 100)}%` : '—',
    r.summary.totalR.toFixed(2),
    r.summary.avgR !== null ? r.summary.avgR.toFixed(2) : '—',
  ]))
  ui.plainEnglish([
    'Each strategy is tested completely on its own here — nothing is combined',
    'yet, and only the ICT session model opens real paper trades. Test one in',
    'full with:  npm run replay:raw -- --strategy <id>',
    'Small samples mean little; treat these as a demonstration, not a verdict.',
  ])
  ui.blank()
}

async function commandBacktest(): Promise<void> {
  const id = strategyArg() ?? (config.strategy === 'crossover' ? 'crossover' : 'session-ifvg')
  ui.heading(`BACKTEST — "${id}", in-sample vs out-of-sample`)
  ui.safetyBanner()
  ui.blank()
  ui.step(`Downloading ${config.replay.lookbackDays} days of real ${config.symbol} candles and replaying...`)
  const report = await runBacktest(id)
  ui.blank()
  for (const l of reportLines(report)) console.log(l ? `  ${l}` : '')
  ui.plainEnglish([
    'In-sample is the part the strategy effectively "fits" on; out-of-sample is',
    'the part it never saw. A good in-sample number that falls apart out-of-sample',
    'is curve-fitting, not edge. Backtest another with:',
    '  npm run backtest -- --strategy <id>   (or --strategy fused)',
    'Small samples mean little; this window is short by design in the sandbox.',
  ])
  ui.blank()
}

function commandHelp(): void {
  ui.heading('MR. CASH — WHAT CAN I DO?')
  ui.safetyBanner()
  ui.blank()
  ui.table(['Type this', 'And it will'], [
    ['npm start', 'open the dashboard in your browser (easiest)'],
    ['npm run stop', 'KILL SWITCH: open no new positions until you resume'],
    ['npm run resume', 'release the kill switch'],
    ['npm run status', 'mode, kill switch, store, today\'s limits — at a glance'],
    ['npm run migrate', 'show what the store imported from the old flat files'],
    ['npm run talk', 'chat with the bot: brief, plan, questions, what-ifs'],
    ['npm run brief', "print today's brief — ranges, levels, bias, news, plan"],
    ['npm run news', 'show what is on the calendar and what stands out'],
    ['npm run state', 'uptrend / downtrend / range, and what to watch out for'],
    ['npm run flow', 'where the big orders are and what is trading'],
    ['npm run watch', 'stay on, raise alerts, and paper-trade every candle'],
    ['npm run paper', 'the paper account: equity, open and closed trades'],
    ['npm run mcp:config', 'connect Mr. Cash to Claude Desktop / Claude Code'],
    ['npm run doctor', 'check every connection'],
    ['npm run picture -- chart.png', 'analyze a chart screenshot (needs the AI key)'],
    ['npm run scan', 'check the market right now and explain its decision'],
    ['npm run replay:raw', 'test the strategy on real past prices'],
    ['npm run replay:memory', 'do the same, but let it use what it learned'],
    ['npm run compare', 'run both and show them side by side'],
    ['npm run memory:show', 'print what it currently remembers'],
    ['npm run memory:reset', 'wipe its memory clean'],
    ['npm run plan:clear', "forget today's armed plan"],
    ['npm run selftest', 'check the logic is working (no internet needed)'],
    ['npm run tradingview', 'print the TradingView chart setup steps'],
  ])
  ui.plainEnglish([
    'New here? Do this, in order:',
    '  1. npm run selftest       (proves the install works)',
    '  2. npm run brief          (see what the bot thinks about today)',
    '  3. npm run replay:raw     (see how the model did over the last month)',
    '  4. npm run talk           (agree a plan, ask questions)',
    '',
    'Nothing you type can lose money. There is no live trading in here.',
  ])
  ui.blank()
}

async function main(): Promise<void> {
  checkNodeVersion()
  const command = process.argv[2] ?? 'help'
  try {
    switch (command) {
      case 'scan': await commandScan(false); break
      case 'scan:memory': await commandScan(true); break
      case 'brief': await commandBrief(); break
      case 'news': await commandNews(); break
      case 'flow': await commandFlow(); break
      case 'state': await commandState(); break
      case 'paper': await commandPaper(); break
      case 'replay:raw': await commandReplayRaw(); break
      case 'replay:memory': await commandReplayMemory(); break
      case 'compare': await commandCompare(); break
      case 'memory:reset': commandMemoryReset(); break
      case 'memory:show': commandMemoryShow(); break
      case 'plan:clear': commandPlanClear(); break
      case 'stop': commandStop(); break
      case 'resume': commandResume(); break
      case 'status': commandStatus(); break
      case 'migrate': commandMigrate(); break
      case 'strategies': await commandStrategies(); break
      case 'backtest': await commandBacktest(); break
      default: commandHelp()
    }
  } catch (err) {
    if (err instanceof MarketDataError) {
      ui.blank()
      console.log(ui.bad('  ─────────────────────────────────────────────'))
      console.log(ui.bad('   STOPPED — no real prices available'))
      console.log(ui.bad('  ─────────────────────────────────────────────'))
      ui.blank()
      for (const line of explainMarketDataError(err).split('\n')) console.log(`  ${line}`)
      ui.blank()
      process.exit(2)
    }
    throw err
  }
}

main()
