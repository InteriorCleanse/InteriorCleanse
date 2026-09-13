/**
 * The app.
 *
 * A tiny web server that runs on your own computer and serves a
 * dashboard to your browser. It only listens on 127.0.0.1 — "this
 * machine only" — so nothing is exposed, not even to your own wifi.
 * Built on Node's built-in modules, so there is nothing to install.
 */

import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { config } from '../config.ts'
import { analyzeNow, runScan } from './bot.ts'
import type { Snapshot } from './bot.ts'
import { runReplay, scoreSkippedTrades } from './replay.ts'
import { lessonLines, memoryIsEmpty, readLedger, resetMemory } from './memory.ts'
import { MarketDataError, explainMarketDataError } from './market.ts'
import { getNews, summarizeNews, upcomingEvents } from './news.ts'
import { buildBrief } from './brief.ts'
import { readPlan, writePlan, clearPlan } from './plan.ts'
import type { DayPlan } from './plan.ts'
import { aiStatus, askAI, explainAiError } from './ai.ts'
import { toET } from './sessions.ts'
import { ifvgRole } from './fvg.ts'
import * as ui from './ui.ts'
import type Anthropic from '@anthropic-ai/sdk'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(HERE, '..', 'web')

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/** Runs a job and turns a data outage into a readable message. */
async function safely<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string; kind: string }> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof MarketDataError) return { ok: false, kind: 'no-data', error: explainMarketDataError(err) }
    return { ok: false, kind: 'unknown', error: err instanceof Error ? err.message : String(err) }
  }
}

// The dashboard asks for the analysis on every tab; one download a minute is plenty.
let snapCache: { at: number; snap: Snapshot } | null = null
async function snapshot(force = false): Promise<Snapshot> {
  if (!force && snapCache && Date.now() - snapCache.at < 60_000) return snapCache.snap
  const snap = await analyzeNow()
  snapCache = { at: Date.now(), snap }
  return snap
}

/** Everything the Chart and Today tabs need, in one payload. */
function analysisPayload(snap: Snapshot, candleCount: number) {
  const a = snap.analysis
  const candles = snap.candles.slice(-candleCount).map((c) => ({ ...c, et: toET(c.openTime).clock, day: toET(c.openTime).dateKey }))
  const firstTime = candles[0]?.openTime ?? 0
  const engine = snap.engine
  const sessions = engine ? [...engine.sessions.days.values()].flatMap((d) => Object.values(d.sessions)).filter((s) => s.endTime >= firstTime) : []
  const sweeps = engine ? [...engine.sessions.days.keys()].flatMap((k) => engine.sweepsFor(k)).filter((s) => s.time >= firstTime) : []
  const fvgs = engine ? engine.fvgs.fvgs.filter((f) => f.createdTime >= firstTime && (f.state !== 'expired' || f.retestIndex !== undefined)).map((f) => ({ ...f, role: ifvgRole(f) })) : []
  const shifts = engine ? engine.structure.shifts.filter((s) => s.time >= firstTime) : []
  const plan = readPlan()
  const brief = a ? buildBrief(a, snap.news, plan) : null
  return {
    strategy: config.strategy,
    candles,
    analysis: a ? { ...a, sessions: undefined } : null,
    signal: snap.signal,
    sessions,
    sweeps,
    fvgs,
    shifts,
    plan,
    brief: brief ? { lines: brief.lines, proposal: brief.proposal, levels: brief.levels } : null,
    news: snap.news ? { ...snap.news, upcoming: upcomingEvents(snap.news), summary: summarizeNews(snap.news) } : null,
    generatedAt: Date.now(),
  }
}

function contextFor(snap: Snapshot): string {
  const a = snap.analysis
  if (!a) return `Strategy: crossover. Latest: ${snap.signal.reason}`
  const brief = buildBrief(a, snap.news, readPlan())
  return [
    brief.lines.join('\n'),
    '',
    'CHECKLIST RIGHT NOW:',
    ...a.signal.evidence.map((e) => `  [${e.passed ? 'ok' : 'NO'}] ${e.step}: ${e.detail}`),
    `Decision: ${a.signal.action} — ${a.signal.reason}`,
    '',
    'GAPS: ' + a.fvgs.slice(-8).map((f) => `${f.direction} $${f.bottom.toFixed(0)}–$${f.top.toFixed(0)} ${f.state}${ifvgRole(f) ? ` now ${ifvgRole(f)}` : ''}`).join('; '),
    'SETTINGS: ' + JSON.stringify({ symbol: config.symbol, interval: config.interval, account: config.accountSizeUsd, riskPct: config.riskPerTradePercent, minRR: config.ict.minRR, killzones: config.ict.killzones, requireInversion: config.ict.requireInversion }),
    'NEWS: ' + (snap.news ? summarizeNews(snap.news) : 'not available'),
  ].join('\n').slice(0, 12_000)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${config.webPort}`)
  const path = url.pathname
  try {
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(readFileSync(join(WEB_DIR, 'index.html'), 'utf8'))
      return
    }

    if (path === '/favicon.ico') {
      res.writeHead(204)
      res.end()
      return
    }

    if (path === '/api/config') {
      json(res, 200, {
        symbol: config.symbol, interval: config.interval, strategy: config.strategy, accountSizeUsd: config.accountSizeUsd,
        riskPerTradePercent: config.riskPerTradePercent, feePercent: config.feePercent, ict: config.ict, replay: config.replay, memory: config.memory,
        memoryEmpty: memoryIsEmpty(), ledgerRows: readLedger().length, lessons: lessonLines(), plan: readPlan(), ai: await aiStatus(),
      })
      return
    }

    if (path === '/api/analysis') {
      const count = Math.min(2000, Math.max(50, Number(url.searchParams.get('candles') ?? 400)))
      const force = url.searchParams.get('refresh') === '1'
      const r = await safely(async () => analysisPayload(await snapshot(force), count))
      json(res, 200, r)
      return
    }

    if (path === '/api/scan') {
      const r = await safely(() => runScan(url.searchParams.get('memory') === '1'))
      snapCache = null
      json(res, 200, r.ok ? { ok: true, data: { ...r.data, candles: undefined, engine: undefined } } : r)
      return
    }

    if (path === '/api/replay/raw' || path === '/api/replay/memory') {
      const useMemory = path.endsWith('memory')
      const r = await safely(() => runReplay({ useMemory, writeMemory: !useMemory }))
      json(res, 200, r.ok ? { ...r, score: useMemory ? scoreSkippedTrades(r.data) : null } : r)
      return
    }

    if (path === '/api/news') {
      const news = await getNews(url.searchParams.get('force') === '1')
      json(res, 200, { ok: true, data: { ...news, upcoming: upcomingEvents(news) } })
      return
    }

    if (path === '/api/memory') {
      json(res, 200, { ok: true, data: { rows: readLedger().slice(-150), lessons: lessonLines() } })
      return
    }
    if (path === '/api/memory/reset' && req.method === 'POST') {
      resetMemory()
      json(res, 200, { ok: true })
      return
    }

    if (path === '/api/plan' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}') as Partial<DayPlan>
      const snap = await snapshot()
      const dayKey = snap.analysis?.dayKey ?? toET(Date.now()).dateKey
      const proposal = snap.analysis ? buildBrief(snap.analysis, snap.news, null).proposal : null
      const allow = (['long', 'short', 'both', 'none'] as const).includes(body.allow as never) ? (body.allow as DayPlan['allow']) : proposal?.allow ?? 'both'
      const plan: DayPlan = {
        dayKey,
        armedAt: Date.now(),
        allow,
        riskPerTradePercent: Number(body.riskPerTradePercent) > 0 ? Number(body.riskPerTradePercent) : config.riskPerTradePercent,
        maxTrades: Number.isFinite(Number(body.maxTrades)) ? Number(body.maxTrades) : config.ict.maxTradesPerDay,
        notes: String(body.notes ?? '').slice(0, 500),
        proposal: proposal?.proposal ?? '',
      }
      writePlan(plan)
      snapCache = null
      json(res, 200, { ok: true, data: plan })
      return
    }
    if (path === '/api/plan/clear' && req.method === 'POST') {
      clearPlan()
      snapCache = null
      json(res, 200, { ok: true })
      return
    }

    if (path === '/api/chat' && req.method === 'POST') {
      const status = await aiStatus()
      if (!status.available) { json(res, 200, { ok: false, error: status.reason }); return }
      const body = JSON.parse(await readBody(req) || '{}') as { question?: string; history?: Anthropic.MessageParam[] }
      const question = String(body.question ?? '').trim().slice(0, 4000)
      if (!question) { json(res, 200, { ok: false, error: 'Ask something first.' }); return }
      const snap = await snapshot()
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      try {
        const answer = await askAI(question, contextFor(snap), Array.isArray(body.history) ? body.history.slice(-20) : [], (t) => res.write(t))
        res.end(`\n[[META:${JSON.stringify({ costUsd: answer.costUsd, refused: answer.refused, usage: answer.usage, model: status.model })}]]`)
      } catch (err) {
        res.end(`\n[[ERROR:${await explainAiError(err)}]]`)
      }
      return
    }

    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('Not found')
  } catch (err) {
    json(res, 500, { ok: false, kind: 'crash', error: err instanceof Error ? err.message : String(err) })
  }
})

function openBrowser(target: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    const child = spawn(cmd, [target], { shell: process.platform === 'win32', stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
  } catch {
    // Not being able to open a browser is not a failure worth crashing over.
  }
}

const address = `http://127.0.0.1:${config.webPort}`

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.log('')
    console.log(ui.bad(`  Port ${config.webPort} is already being used by something else.`))
    console.log(`  Close whatever is using it, or change "webPort" in config.ts to ${config.webPort + 1}.`)
    console.log('')
    process.exit(1)
  }
  throw err
})

server.listen(config.webPort, '127.0.0.1', () => {
  ui.heading('MR. CASH IS RUNNING')
  console.log('')
  console.log(ui.good('  ● PAPER MODE — no real money, no exchange account, no orders.'))
  console.log('')
  console.log(`  Open this in your browser:  ${ui.bold(address)}`)
  console.log('')
  console.log(ui.dim('  I tried to open it for you automatically. This page is on your'))
  console.log(ui.dim('  computer only — nothing is uploaded, and nobody else can reach it.'))
  console.log(ui.dim('  To stop the app: press Ctrl+C in this window.'))
  console.log('')
  if (process.env.NO_BROWSER !== '1') openBrowser(address)
})
