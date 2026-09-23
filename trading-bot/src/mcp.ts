/**
 * Mr. Cash as an MCP server — so Claude Desktop or Claude Code can ask
 * "what's the plan today?" from any chat.
 *
 * MCP is JSON-RPC over stdin/stdout, one message per line. Nothing else
 * may be printed to stdout, so all logging goes to stderr. Implemented
 * by hand to keep Mr. Cash dependency-free.
 *
 *   Claude Code:     claude mcp add mr-cash -- node <this folder>/src/mcp.ts
 *   Claude Desktop:  run `npm run mcp:config` and paste the JSON it prints
 *
 * Every tool is read-only except `arm_plan`, which does what the app's
 * "Arm this plan" button does — narrows what the paper bot may do today.
 * Nothing here can place an order.
 */

import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.ts'
import { analyzeNow } from './bot.ts'
import { buildBrief } from './brief.ts'
import { summarizeNews } from './news.ts'
import { getFlow } from './orderflow.ts'
import { readPlan, writePlan } from './plan.ts'
import { tradingDayKey } from './sessions.ts'
import { readJournal, journalSummaryForAI } from './journal.ts'
import { runDoctor } from './doctor.ts'
import { paperStats } from './paperTrader.ts'
import { buildNarrationContext } from './ai/context.ts'
import { deterministicNarration } from './ai/narrator.ts'
import { cioDecision, decisionLabel } from './ai/cio.ts'
import { listPassports } from './vault/store.ts'
import { MarketDataError, explainMarketDataError } from './market.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
import { VERSION } from './version.ts'

type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; run: (args: Record<string, unknown>) => Promise<string> }

const noInput = { type: 'object', properties: {}, additionalProperties: false }

const TOOLS: Tool[] = [
  {
    name: 'brief',
    description: "Mr. Cash's daily brief: session ranges, levels, what has been swept, market state, order flow, bias with reasons, timing, news, and the proposed plan. Paper trading only.",
    inputSchema: noInput,
    run: async () => {
      const s = await analyzeNow()
      if (!s.analysis) return `Strategy is set to crossover. Latest: ${s.signal.reason}`
      return buildBrief(s.analysis, s.news, readPlan(), Date.now(), s.state, s.flow, s.decision).lines.join('\n')
    },
  },
  {
    name: 'checklist',
    description: 'The entry checklist right now, step by step with pass/fail and the reason, plus the current decision (BUY / SELL / HOLD / SKIP) and trade plan if one exists.',
    inputSchema: noInput,
    run: async () => {
      const s = await analyzeNow()
      const lines = s.signal.evidence.map((e) => `${e.passed ? '[ok]' : '[NO]'} ${e.step}: ${e.detail}`)
      lines.push('', `Decision: ${s.signal.action} — ${s.signal.reason}`)
      if (s.signal.plan) lines.push(`Plan: entry ${s.signal.plan.entry.toFixed(2)}, stop ${s.signal.plan.stop.toFixed(2)}, target ${s.signal.plan.takeProfit.toFixed(2)}, ${s.signal.plan.rr.toFixed(1)}:1, quality ${s.signal.quality}/100`)
      return lines.join('\n')
    },
  },
  {
    name: 'market_state',
    description: 'Uptrend / downtrend / range with strength, a continuation score, the evidence that voted, and things to watch out for.',
    inputSchema: noInput,
    run: async () => {
      const s = await analyzeNow()
      if (!s.state) return 'No market state available.'
      const st = s.state
      return [`${st.trend.toUpperCase()} — strength ${st.strength}/100 — ${st.continuation.label} (${st.continuation.score}/100). Volatility ${st.volatility}.`, ...st.evidence.map((e) => `• ${e}`), ...st.continuation.reasons.map((r) => `  ${r}`), ...(st.watchOuts.length ? ['Watch out for:', ...st.watchOuts.map((w) => `! ${w}`)] : [])].join('\n')
    },
  },
  {
    name: 'market_read',
    description: 'The market read in the fixed five-section format (market read → what confirms → what invalidates → current decision → why not yet), built only from the engine\'s features and fused decision. Read-only; it decides and places nothing.',
    inputSchema: noInput,
    run: async () => {
      const s = await analyzeNow()
      const ctx = buildNarrationContext({ price: s.signal.price, features: s.analysis?.features ?? null, decision: s.decision, risk: null })
      return `${deterministicNarration(ctx)}\n\n(Risk is applied in the app; this read shows the fused decision before the risk veto.)`
    },
  },
  {
    name: 'decision',
    description: 'The fused decision from the strategy panel: the action, the agreement score, what confirms it and what argues against. Read-only.',
    inputSchema: noInput,
    run: async () => {
      const s = await analyzeNow()
      const d = s.decision
      if (!d) return 'No fused decision available.'
      const call = cioDecision(d, null)
      return [
        `Decision: ${decisionLabel(call)} — ${d.reason}`,
        `Score ${d.score} vs enter threshold ${d.enterScore}.`,
        ...(d.confirms.length ? ['Confirms:', ...d.confirms.map((c) => `• ${c}`)] : []),
        ...(d.invalidates.length ? ['Invalidates / missing:', ...d.invalidates.map((c) => `• ${c}`)] : []),
        '(Fused decision before the risk veto; the app applies risk.)',
      ].join('\n')
    },
  },
  {
    name: 'vault',
    description: 'The strategy vault: every passport with its stage (candidate/paper/shadow/live/watch), out-of-sample edge and decay status. Read-only; nothing here trades.',
    inputSchema: noInput,
    run: async () => {
      const ps = listPassports()
      if (!ps.length) return 'The vault is empty — no passports minted yet.'
      return ps.map((p) => `${p.strategyId} [${p.status}] OOS ${p.oos.trades} trades @ ${p.oos.avgR === null ? '—' : p.oos.avgR.toFixed(3)}R, floor ${p.oosLowerAvgR.toFixed(3)}R, decay ${p.decay.decaying ? 'DECAYING' : 'ok'}`).join('\n')
    },
  },
  {
    name: 'order_flow',
    description: 'Where the big orders are: order-book depth within 1%, walls, and the tape (trades per minute, buyer vs seller share, net pressure, big prints).',
    inputSchema: noInput,
    run: async () => {
      const f = await getFlow()
      return [...f.lines, ...f.errors.map((e) => `(${e})`)].join('\n') || 'Order flow not available.'
    },
  },
  {
    name: 'news',
    description: 'The economic calendar for the next 36 hours with impact ratings, and the headlines that stand out with why they matter.',
    inputSchema: noInput,
    run: async () => {
      const s = await analyzeNow({ withFlow: false })
      return s.news ? summarizeNews(s.news) : 'News not available.'
    },
  },
  {
    name: 'paper_account',
    description: 'The paper account: equity, open positions with unrealized R, closed trades, win rate, expectancy.',
    inputSchema: noInput,
    run: async () => {
      let price: number | undefined
      try { price = (await analyzeNow({ withNews: false, withFlow: false })).signal.price } catch { /* stats without unrealized */ }
      const p = paperStats(price)
      return [
        `Equity $${p.equityUsd.toFixed(2)} (started $${p.startUsd.toFixed(2)})${price !== undefined ? `, with open positions $${p.equityWithOpenUsd.toFixed(2)}` : ''}.`,
        `${p.trades} closed paper trades, ${p.wins} wins / ${p.losses} losses${p.winRate !== null ? ` (${Math.round(p.winRate * 100)}%)` : ''}, total ${p.totalR.toFixed(2)}R${p.expectancyR !== null ? `, expectancy ${p.expectancyR.toFixed(2)}R` : ''}.`,
        ...p.open.map((o) => `OPEN ${o.direction} from ${o.entry.toFixed(2)}, stop ${o.stop.toFixed(2)}, target ${o.target.toFixed(2)}${o.unrealized ? `, now ${o.unrealized.rMultiple.toFixed(2)}R` : ''} — ${o.setupKey}`),
        ...p.closed.slice(0, 10).map((c) => `${new Date(c.closedAt ?? 0).toISOString().slice(0, 16)} ${c.direction} ${c.exitReason} ${(c.rMultiple ?? 0).toFixed(2)}R — ${c.setupKey}`),
      ].join('\n')
    },
  },
  {
    name: 'journal_review',
    description: "The owner's trading journal review: process score, leaks by emotion/session/habit, the one thing to fix, goals, streak, recent entries.",
    inputSchema: noInput,
    run: async () => journalSummaryForAI(readJournal()),
  },
  {
    name: 'arm_plan',
    description: "Arm today's plan for the paper bot: which direction is allowed, risk per trade in percent, max trades, and a note. This only narrows what the PAPER bot may do; it cannot place orders.",
    inputSchema: {
      type: 'object',
      properties: {
        allow: { type: 'string', enum: ['long', 'short', 'both', 'none'] },
        riskPerTradePercent: { type: 'number', minimum: 0.1, maximum: 5 },
        maxTrades: { type: 'integer', minimum: 0, maximum: 10 },
        notes: { type: 'string' },
      },
      required: ['allow'],
      additionalProperties: false,
    },
    run: async (args) => {
      const s = await analyzeNow({ withNews: false, withFlow: false })
      // `planFor` matches this by exact string equality against the trading day
      // key, so the fallback has to use the SAME calendar. A UTC date agrees 22
      // hours a day and silently disagrees for the other two (18:00-19:59 ET),
      // which would arm a plan that never applies.
      const dayKey = s.analysis?.dayKey ?? tradingDayKey(Date.now())
      const plan = {
        dayKey, armedAt: Date.now(),
        allow: (['long', 'short', 'both', 'none'] as const).includes(args.allow as never) ? (args.allow as 'long' | 'short' | 'both' | 'none') : 'both',
        riskPerTradePercent: Number(args.riskPerTradePercent) > 0 ? Number(args.riskPerTradePercent) : config.riskPerTradePercent,
        maxTrades: Number.isFinite(Number(args.maxTrades)) ? Number(args.maxTrades) : config.ict.maxTradesPerDay,
        notes: String(args.notes ?? '').slice(0, 500),
        proposal: 'armed via MCP',
      }
      writePlan(plan)
      return `Armed for ${dayKey}: ${plan.allow}, ${plan.riskPerTradePercent}% risk, max ${plan.maxTrades} trade(s).${plan.notes ? ` Notes: ${plan.notes}` : ''}`
    },
  },
  {
    name: 'doctor',
    description: 'Checks every connection Mr. Cash depends on (prices, order book, news feeds, AI key, TradingView, phone access) and says what to fix.',
    inputSchema: noInput,
    run: async () => (await runDoctor()).map((c) => `${c.ok === true ? '[ok]' : c.ok === false ? '[FAIL]' : '[--]'} ${c.name}: ${c.detail}${c.ok !== true && c.fix ? ` → ${c.fix}` : ''}`).join('\n'),
  },
]

// ---------------------------------------------------------------
// `npm run mcp:config` — prints the config for Claude Desktop / Claude Code
// ---------------------------------------------------------------

if (process.argv.includes('--config')) {
  const entry = resolve(join(HERE, 'mcp.ts'))
  const cfg = { mcpServers: { 'mr-cash': { command: 'node', args: [entry] } } }
  console.log('')
  console.log('Claude Code — run this once:')
  console.log(`  claude mcp add mr-cash -- node "${entry}"`)
  console.log('')
  console.log('Claude Desktop — Settings → Developer → Edit Config, add:')
  console.log(JSON.stringify(cfg, null, 2))
  console.log('')
  console.log('Then ask Claude: "What is Mr. Cash\'s plan today?" or "Show me the checklist."')
  console.log('')
  process.exit(0)
}

// ---------------------------------------------------------------
// The JSON-RPC loop
// ---------------------------------------------------------------

type Req = { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: Record<string, unknown> }

function send(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function handle(req: Req): Promise<void> {
  const reply = (result: unknown) => { if (req.id !== undefined && req.id !== null) send({ jsonrpc: '2.0', id: req.id, result }) }
  const fail = (code: number, message: string) => { if (req.id !== undefined && req.id !== null) send({ jsonrpc: '2.0', id: req.id, error: { code, message } }) }

  switch (req.method) {
    case 'initialize':
      reply({ protocolVersion: String(req.params?.protocolVersion ?? '2025-03-26'), capabilities: { tools: {} }, serverInfo: { name: 'mr-cash', version: VERSION } })
      return
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return
    case 'ping':
      reply({})
      return
    case 'tools/list':
      reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) })
      return
    case 'tools/call': {
      const name = String(req.params?.name ?? '')
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) { fail(-32602, `Unknown tool: ${name}`); return }
      try {
        const text = await tool.run((req.params?.arguments as Record<string, unknown>) ?? {})
        reply({ content: [{ type: 'text', text: text || '(empty)' }] })
      } catch (err) {
        const text = err instanceof MarketDataError ? explainMarketDataError(err) : err instanceof Error ? err.message : String(err)
        reply({ content: [{ type: 'text', text }], isError: true })
      }
      return
    }
    default:
      fail(-32601, `Method not found: ${req.method}`)
  }
}

// Finish every in-flight request before exiting, even if stdin closes first.
let pending = 0
let closing = false
const maybeExit = () => { if (closing && pending === 0) process.exit(0) }

const rl = createInterface({ input: process.stdin, terminal: false })
process.stderr.write(`mr-cash MCP server ${VERSION} ready (${TOOLS.length} tools)\n`)
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let req: Req
  try { req = JSON.parse(trimmed) as Req } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return }
  pending++
  handle(req).catch((err) => process.stderr.write(`mr-cash: ${err instanceof Error ? err.message : String(err)}\n`)).finally(() => { pending--; maybeExit() })
})
rl.on('close', () => { closing = true; maybeExit() })
