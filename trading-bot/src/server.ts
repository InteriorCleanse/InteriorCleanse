/**
 * The app.
 *
 * A small web server, built on Node's own modules, that serves the
 * dashboard, keeps the watch loop running, and answers the app's API.
 *
 * Who can reach it:
 *   - By default it listens on 127.0.0.1 — this computer only.
 *   - With app.allowPhone on, it listens on your home network too and
 *     asks any other device for a PIN once. Nothing is exposed to the
 *     internet either way.
 *
 * Market data is never cached by the app shell; every reading is fresh.
 */

import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, existsSync, appendFileSync, writeFileSync, accessSync, constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { config } from '../config.ts'
import { analyzeNow, runScan } from './bot.ts'
import type { Snapshot } from './bot.ts'
import { runReplay, scoreSkippedTrades } from './replay.ts'
import { DATA_DIR, ensureDataDir, lessonLines, memoryIsEmpty, readLedger, resetMemory } from './memory.ts'
import { MarketDataError, explainMarketDataError } from './market.ts'
import { getNews, summarizeNews, upcomingEvents } from './news.ts'
import { buildBrief } from './brief.ts'
import { readPlan, writePlan, clearPlan } from './plan.ts'
import type { DayPlan } from './plan.ts'
import { aiStatus, askAI, explainAiError, PICTURE_QUESTION } from './ai.ts'
import type { AiImage } from './ai.ts'
import { toET } from './sessions.ts'
import { ifvgRole } from './fvg.ts'
import { getFlow, readFlowLog } from './orderflow.ts'
import { startWatch, eventLog } from './watch.ts'
import { runDoctor, lanUrls } from './doctor.ts'
import { readJournal, upsertEntry, deleteEntry, readGoals, saveGoals, computeStats, buildReview, entryFromSnapshot, journalSummaryForAI, EMOTIONS, TAGS } from './journal.ts'
import { paperStats, closeManually } from './paperTrader.ts'
import { SKILLS, skillById } from './skills.ts'
import { checkStateChange, PinThrottle } from './guard.ts'
import { describeMode, runtimeMode } from './mode.ts'
import { stopState, stop as engageStop, resume as releaseStop } from './killswitch.ts'
import { systemState } from './systemState.ts'
import { getSettings, setSetting, resetSetting } from './settings.ts'
import type { Settings } from './settings.ts'
import { store } from './store.ts'
import { VERSION } from './version.ts'
import type { Goal, JournalEntry } from './journal.ts'
import * as ui from './ui.ts'
import type Anthropic from '@anthropic-ai/sdk'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(HERE, '..', 'web')
const TV_LOG = join(DATA_DIR, 'tv-alerts.csv')
const PORT = Number(process.env.MRCASH_PORT) || config.webPort
const STARTED_AT = Date.now()

// Secrets for this run. Printed once at startup, never written to disk.
const PIN = process.env.MRCASH_PIN || config.app.pin || String(100000 + Math.floor(Math.random() * 900000))
const WEBHOOK_SECRET = config.tradingview.webhookSecret || randomBytes(12).toString('hex')
const SESSION_TOKEN = randomBytes(24).toString('hex')
/** Handed to the app's own page via /api/config; every state-changing request must carry it back. */
const CSRF_TOKEN = randomBytes(24).toString('hex')
const pinThrottle = new PinThrottle(10, 15 * 60_000)

const STATIC: Record<string, { file: string; type: string }> = {
  '/manifest.json': { file: 'manifest.json', type: 'application/manifest+json' },
  '/sw.js': { file: 'sw.js', type: 'application/javascript' },
  '/icon-192.png': { file: 'icon-192.png', type: 'image/png' },
  '/icon-512.png': { file: 'icon-512.png', type: 'image/png' },
  '/icon-180.png': { file: 'icon-180.png', type: 'image/png' },
  '/favicon.ico': { file: 'icon-192.png', type: 'image/png' },
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage, maxBytes = 12 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > maxBytes) throw new Error('request too large')
    chunks.push(c as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function safely<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string; kind: string }> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof MarketDataError) return { ok: false, kind: 'no-data', error: explainMarketDataError(err) }
    return { ok: false, kind: 'unknown', error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------
// Who is asking
// ---------------------------------------------------------------

function isLocal(req: IncomingMessage): boolean {
  const ip = req.socket.remoteAddress ?? ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function hasSession(req: IncomingMessage): boolean {
  const cookie = req.headers.cookie ?? ''
  return cookie.split(';').some((c) => c.trim() === `mrcash=${SESSION_TOKEN}`)
}

function authed(req: IncomingMessage): boolean {
  return isLocal(req) || hasSession(req)
}

const LOGIN_PAGE = (msg = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mr. Cash</title>
<link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/icon-180.png"><meta name="theme-color" content="#0d1117">
<style>body{margin:0;background:#0d1117;color:#e6edf3;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
form{background:#161b22;border:1px solid #26303d;border-radius:14px;padding:28px;width:min(92vw,360px);text-align:center}h1{font-size:22px;margin:0 0 6px}p{color:#8b98a5;margin:0 0 18px;font-size:14px}
input{width:100%;box-sizing:border-box;font-size:28px;letter-spacing:.3em;text-align:center;padding:12px;border-radius:10px;border:1px solid #26303d;background:#0d1117;color:#e6edf3}
button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:10px;background:#58a6ff;color:#04111f;font-weight:700;font-size:16px}.err{color:#f85149;font-size:14px;margin-top:10px}</style></head>
<body><form method="post" action="/login"><h1>Mr. Cash</h1><p>Enter the PIN shown in the terminal on your computer.</p><input name="pin" inputmode="numeric" autocomplete="one-time-code" autofocus maxlength="12"><button>Open</button>${msg ? `<div class="err">${msg}</div>` : ''}</form></body></html>`

// ---------------------------------------------------------------
// The market snapshot the app reads from
// ---------------------------------------------------------------

let snapCache: { at: number; snap: Snapshot } | null = null
async function snapshot(force = false): Promise<Snapshot> {
  const fromWatch = watcher.current()
  if (!force && fromWatch && Date.now() - fromWatch.at < 90_000) return fromWatch.snap
  if (!force && snapCache && Date.now() - snapCache.at < 60_000) return snapCache.snap
  const snap = await analyzeNow()
  snapCache = { at: Date.now(), snap }
  return snap
}

function analysisPayload(snap: Snapshot, candleCount: number) {
  const a = snap.analysis
  const candles = snap.candles.slice(-candleCount).map((c) => ({ ...c, et: toET(c.openTime).clock, day: toET(c.openTime).dateKey }))
  const firstTime = candles[0]?.openTime ?? 0
  const engine = snap.engine
  const plan = readPlan()
  const brief = a ? buildBrief(a, snap.news, plan, Date.now(), snap.state, snap.flow) : null
  return {
    strategy: config.strategy,
    candles,
    analysis: a ? { ...a, sessions: undefined } : null,
    signal: snap.signal,
    sessions: engine ? [...engine.sessions.days.values()].flatMap((d) => Object.values(d.sessions)).filter((s) => s.endTime >= firstTime) : [],
    sweeps: engine ? [...engine.sessions.days.keys()].flatMap((k) => engine.sweepsFor(k)).filter((s) => s.time >= firstTime) : [],
    fvgs: engine ? engine.fvgs.fvgs.filter((f) => f.createdTime >= firstTime && (f.state !== 'expired' || f.retestIndex !== undefined)).map((f) => ({ ...f, role: ifvgRole(f) })) : [],
    shifts: engine ? engine.structure.shifts.filter((s) => s.time >= firstTime) : [],
    plan,
    brief: brief ? { lines: brief.lines, proposal: brief.proposal, levels: brief.levels } : null,
    news: snap.news ? { ...snap.news, upcoming: upcomingEvents(snap.news), summary: summarizeNews(snap.news) } : null,
    state: snap.state,
    flow: snap.flow,
    paper: paperStats(snap.signal.price),
    generatedAt: Date.now(),
  }
}

function contextFor(snap: Snapshot, withJournal = false): string {
  const a = snap.analysis
  const parts: string[] = []
  if (!a) parts.push(`Strategy: crossover. Latest: ${snap.signal.reason}`)
  else {
    const brief = buildBrief(a, snap.news, readPlan(), Date.now(), snap.state, snap.flow)
    parts.push(brief.lines.join('\n'), '', 'CHECKLIST RIGHT NOW:', ...a.signal.evidence.map((e) => `  [${e.passed ? 'ok' : 'NO'}] ${e.step}: ${e.detail}`), `Decision: ${a.signal.action} — ${a.signal.reason}`, '',
      'GAPS: ' + a.fvgs.slice(-8).map((f) => `${f.direction} $${f.bottom.toFixed(0)}–$${f.top.toFixed(0)} ${f.state}${ifvgRole(f) ? ` now ${ifvgRole(f)}` : ''}`).join('; '),
      'SETTINGS: ' + JSON.stringify({ symbol: config.symbol, interval: config.interval, account: config.accountSizeUsd, riskPct: config.riskPerTradePercent, minRR: config.ict.minRR, killzones: config.ict.killzones, requireInversion: config.ict.requireInversion }),
      'NEWS: ' + (snap.news ? summarizeNews(snap.news) : 'not available'))
  }
  if (withJournal) parts.push('', journalSummaryForAI(readJournal()))
  return parts.join('\n').slice(0, 16_000)
}

async function streamAnswer(res: ServerResponse, question: string, context: string, history: Anthropic.MessageParam[], image?: AiImage, skillId?: string): Promise<void> {
  const status = await aiStatus()
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  try {
    const answer = await askAI(question, context, history, (t) => res.write(t), image, skillById(skillId))
    res.end(`\n[[META:${JSON.stringify({ costUsd: answer.costUsd, refused: answer.refused, usage: answer.usage, model: status.model })}]]`)
  } catch (err) {
    res.end(`\n[[ERROR:${await explainAiError(err)}]]`)
  }
}

// ---------------------------------------------------------------
// Routes
// ---------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const path = url.pathname
  const client = req.socket.remoteAddress ?? 'unknown'
  try {
    // Files every device may fetch before logging in
    const st = STATIC[path]
    if (st) {
      const full = join(WEB_DIR, st.file)
      if (!existsSync(full)) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': st.type, 'cache-control': 'public, max-age=3600' })
      res.end(readFileSync(full))
      return
    }

    // TradingView alerts carry their own secret
    if (path === '/api/tv-alert' && req.method === 'POST') {
      const raw = await readBody(req, 64 * 1024)
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(raw) } catch { body = { message: raw } }
      const secret = String(body.secret ?? req.headers['x-mrcash-secret'] ?? url.searchParams.get('secret') ?? '')
      if (secret !== WEBHOOK_SECRET) { json(res, 403, { ok: false, error: 'bad secret' }); return }
      const event = String(body.event ?? body.message ?? 'alert').slice(0, 120)
      const symbol = String(body.symbol ?? '').slice(0, 30)
      const price = Number(body.price)
      ensureDataDir()
      if (!existsSync(TV_LOG)) writeFileSync(TV_LOG, 'timestamp,event,symbol,price\n')
      appendFileSync(TV_LOG, `${new Date().toISOString()},${JSON.stringify(event)},${symbol},${Number.isFinite(price) ? price : ''}\n`)
      eventLog.push('tradingview', `TradingView: ${event}${symbol ? ` on ${symbol}` : ''}`, Number.isFinite(price) ? `Price $${price.toFixed(2)}. Check the chart tab — Mr. Cash will confirm or disagree on the next candle.` : 'Check the chart tab.', 'warn')
      json(res, 200, { ok: true })
      return
    }

    // The PIN gate for other devices
    if (path === '/login') {
      if (req.method === 'POST') {
        const form = new URLSearchParams(await readBody(req, 4096))
        const allowed = pinThrottle.allowed(client)
        if (!allowed.ok) { res.writeHead(429, { 'content-type': 'text/html; charset=utf-8' }); res.end(LOGIN_PAGE(`Too many tries from this device. Wait ${Math.ceil(allowed.retryInMs / 60_000)} minute(s).`)); return }
        if ((form.get('pin') ?? '').trim() === PIN) {
          pinThrottle.succeeded(client)
          res.writeHead(302, { 'set-cookie': `mrcash=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`, location: '/' })
          res.end()
        } else {
          pinThrottle.failed(client)
          res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' })
          res.end(LOGIN_PAGE('Wrong PIN.'))
        }
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(LOGIN_PAGE())
      return
    }
    if (!authed(req)) {
      if (path.startsWith('/api/')) { json(res, 401, { ok: false, error: 'PIN required' }); return }
      res.writeHead(302, { location: '/login' })
      res.end()
      return
    }

    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(readFileSync(join(WEB_DIR, 'index.html'), 'utf8'))
      return
    }

    // Every state-changing request must prove it came from the app's own page.
    if (req.method === 'POST' && path.startsWith('/api/')) {
      const verdict = checkStateChange(req.headers, CSRF_TOKEN, req.headers.host)
      if (!verdict.ok) { json(res, verdict.status, { ok: false, error: verdict.reason }); return }
    }

    if (path === '/api/health') {
      let dataDirWritable = true
      try { ensureDataDir(); accessSync(DATA_DIR, constants.W_OK) } catch { dataDirWritable = false }
      json(res, 200, { ok: true, data: { version: VERSION, mode: runtimeMode(), modeLabel: describeMode(), stop: stopState(), dataDir: DATA_DIR, dataDirWritable, store: store().integrity(), uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000), watchEveryMinutes: config.app.watchEveryMinutes, lastWatchAt: watcher.current()?.at ?? null } })
      return
    }
    // "What is the current state of my system?" — one document, from disk and the last watch cycle.
    if (path === '/api/system') {
      json(res, 200, { ok: true, data: systemState({ lastWatch: watcher.current(), lastError: watcher.lastError(), startedAt: STARTED_AT }) })
      return
    }
    if (path === '/api/settings' && req.method === 'GET') {
      json(res, 200, { ok: true, data: getSettings() })
      return
    }
    if (path === '/api/settings' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 4096)) || '{}') as { key?: keyof Settings; value?: unknown; reset?: boolean }
      try {
        const key = String(body.key ?? '') as keyof Settings
        const data = body.reset ? resetSetting(key) : setSetting(key, body.value as never)
        json(res, 200, { ok: true, data })
      } catch (err) {
        json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) })
      }
      return
    }
    if (path === '/api/stop' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 4096)) || '{}') as { reason?: string }
      const s = engageStop(String(body.reason ?? 'stopped from the app'))
      eventLog.push('info', 'KILL SWITCH ON — no new positions', `Since ${s.stopped ? s.since : ''}. Open paper positions are still managed to their stop or target. Press Resume to allow entries again.`, 'warn')
      json(res, 200, { ok: true, data: s })
      return
    }
    if (path === '/api/resume' && req.method === 'POST') {
      const s = releaseStop()
      eventLog.push('info', 'Kill switch released', 'Entries are allowed again.', 'info')
      json(res, 200, { ok: true, data: s })
      return
    }

    if (path === '/api/config') {
      const local = isLocal(req)
      const lan = lanUrls()
      json(res, 200, {
        csrf: CSRF_TOKEN, mode: runtimeMode(), stop: stopState(), version: VERSION,
        symbol: config.symbol, interval: config.interval, strategy: config.strategy, accountSizeUsd: config.accountSizeUsd,
        riskPerTradePercent: config.riskPerTradePercent, feePercent: config.feePercent, ict: config.ict, replay: config.replay, memory: config.memory,
        orderflow: config.orderflow, tradingview: { widgetSymbol: config.tradingview.widgetSymbol },
        memoryEmpty: memoryIsEmpty(), ledgerRows: readLedger().length, lessons: lessonLines(), plan: readPlan(), ai: await aiStatus(),
        app: {
          allowPhone: config.app.allowPhone, watchEveryMinutes: config.app.watchEveryMinutes, isLocal: local,
          lanUrls: local ? lan : [],
          webhook: local ? { url: `${lan[0] ?? `http://127.0.0.1:${PORT}`}/api/tv-alert`, secret: WEBHOOK_SECRET } : null,
        },
        journal: { emotions: EMOTIONS, tags: TAGS },
        skills: SKILLS.map(({ id, name, icon, tagline, prompts }) => ({ id, name, icon, tagline, prompts })),
      })
      return
    }

    if (path === '/api/analysis') {
      const count = Math.min(2000, Math.max(50, Number(url.searchParams.get('candles') ?? 400)))
      json(res, 200, await safely(async () => analysisPayload(await snapshot(url.searchParams.get('refresh') === '1'), count)))
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
    if (path === '/api/flow') {
      const flow = url.searchParams.get('fresh') === '1' ? await getFlow() : (await snapshot()).flow ?? (await getFlow())
      json(res, 200, { ok: true, data: { ...flow, history: readFlowLog(288) } })
      return
    }
    if (path === '/api/state') {
      json(res, 200, await safely(async () => (await snapshot()).state))
      return
    }
    if (path === '/api/events') {
      const since = Number(url.searchParams.get('since') ?? 0)
      json(res, 200, { ok: true, data: { events: since > 0 ? eventLog.since(since) : eventLog.latest(40), latestId: eventLog.events[eventLog.events.length - 1]?.id ?? 0 } })
      return
    }
    if (path === '/api/doctor') {
      json(res, 200, { ok: true, data: await runDoctor() })
      return
    }

    // ---- the paper account ----
    if (path === '/api/paper') {
      let price: number | undefined
      try { price = (await snapshot()).signal.price } catch { /* stats without unrealized */ }
      json(res, 200, { ok: true, data: paperStats(price) })
      return
    }
    if (path === '/api/paper/close' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 4096)) || '{}') as { id?: string }
      const price = (await snapshot()).signal.price
      const closed = closeManually(String(body.id ?? ''), price)
      if (closed) eventLog.push('setup', `Paper ${closed.direction} closed by you at ${(closed.rMultiple ?? 0).toFixed(2)}R`, `Flattened at $${price.toFixed(2)}. Recorded in memory and the journal.`, 'info')
      json(res, 200, { ok: !!closed, data: closed })
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
      const body = JSON.parse((await readBody(req, 64 * 1024)) || '{}') as Partial<DayPlan>
      const snap = await snapshot()
      const dayKey = snap.analysis?.dayKey ?? toET(Date.now()).dateKey
      const proposal = snap.analysis ? buildBrief(snap.analysis, snap.news, null, Date.now(), snap.state, snap.flow).proposal : null
      const allow = (['long', 'short', 'both', 'none'] as const).includes(body.allow as never) ? (body.allow as DayPlan['allow']) : proposal?.allow ?? 'both'
      const plan: DayPlan = {
        dayKey, armedAt: Date.now(), allow,
        riskPerTradePercent: Number(body.riskPerTradePercent) > 0 ? Number(body.riskPerTradePercent) : config.riskPerTradePercent,
        maxTrades: Number.isFinite(Number(body.maxTrades)) ? Number(body.maxTrades) : config.ict.maxTradesPerDay,
        notes: String(body.notes ?? '').slice(0, 500), proposal: proposal?.proposal ?? '',
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

    // ---- journal ----
    if (path === '/api/journal' && req.method === 'GET') {
      const entries = readJournal()
      const goals = readGoals()
      json(res, 200, { ok: true, data: { entries: entries.slice(-200).reverse(), stats: computeStats(entries), review: buildReview(entries, goals), goals } })
      return
    }
    if (path === '/api/journal' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 256 * 1024)) || '{}') as Partial<JournalEntry>
      json(res, 200, { ok: true, data: upsertEntry(body) })
      return
    }
    if (path === '/api/journal/delete' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 4096)) || '{}') as { id?: string }
      json(res, 200, { ok: deleteEntry(String(body.id ?? '')) })
      return
    }
    if (path === '/api/journal/prefill') {
      json(res, 200, await safely(async () => entryFromSnapshot(await snapshot())))
      return
    }
    if (path === '/api/journal/goals' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 64 * 1024)) || '{}') as { goals?: Goal[] }
      if (Array.isArray(body.goals)) saveGoals(body.goals.map((g) => ({ id: String(g.id || `g${Date.now().toString(36)}`), title: String(g.title ?? '').slice(0, 200), kind: g.kind === 'auto' ? 'auto' : 'manual', metric: g.metric, target: g.target, done: !!g.done })))
      json(res, 200, { ok: true, data: readGoals() })
      return
    }

    // ---- the assistant ----
    if (path === '/api/chat' && req.method === 'POST') {
      const status = await aiStatus()
      if (!status.available) { json(res, 200, { ok: false, error: status.reason }); return }
      const body = JSON.parse((await readBody(req, 256 * 1024)) || '{}') as { question?: string; history?: Anthropic.MessageParam[]; journal?: boolean; skill?: string }
      const question = String(body.question ?? '').trim().slice(0, 4000)
      if (!question) { json(res, 200, { ok: false, error: 'Ask something first.' }); return }
      const withJournal = !!body.journal || body.skill === 'coach'
      await streamAnswer(res, question, contextFor(await snapshot(), withJournal), Array.isArray(body.history) ? body.history.slice(-20) : [], undefined, body.skill)
      return
    }
    if (path === '/api/picture' && req.method === 'POST') {
      const status = await aiStatus()
      if (!status.available) { json(res, 200, { ok: false, error: status.reason }); return }
      const body = JSON.parse((await readBody(req)) || '{}') as { image?: string; question?: string }
      const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(String(body.image ?? ''))
      if (!m) { json(res, 200, { ok: false, error: 'Attach a PNG, JPEG, GIF or WebP picture.' }); return }
      let context = 'Live market data was not available when this picture was analyzed. Work from the picture only.'
      try { context = contextFor(await snapshot()) } catch { /* picture-only is fine */ }
      await streamAnswer(res, String(body.question ?? '').trim() || PICTURE_QUESTION, context, [], { mediaType: m[1] as AiImage['mediaType'], data: m[2] })
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
    // Not being able to open a browser is not worth crashing over.
  }
}

const address = `http://127.0.0.1:${PORT}`
const host = config.app.allowPhone ? '0.0.0.0' : '127.0.0.1'

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.log('')
    console.log(ui.bad(`  Port ${PORT} is already being used by something else.`))
    console.log(`  Close whatever is using it, or change "webPort" in config.ts to ${PORT + 1}.`)
    console.log('')
    process.exit(1)
  }
  throw err
})

// The watch loop keeps the snapshot fresh and raises alerts. Declared
// before listen() so the routes can read it.
const watcher = startWatch(config.app.watchEveryMinutes, (e) => {
  const mark = e.severity === 'action' ? ui.good('●') : e.severity === 'warn' ? ui.warn('●') : ui.dim('●')
  console.log(`${ui.dim(new Date(e.time).toLocaleTimeString())}  ${mark} ${ui.bold(e.title)} ${ui.dim('— ' + e.body.slice(0, 110))}`)
})

server.listen(PORT, host, () => {
  ui.heading('MR. CASH IS RUNNING')
  console.log('')
  console.log(ui.good(`  ● ${describeMode()}`))
  const st = stopState()
  if (st.stopped) console.log(ui.warn(`  ● KILL SWITCH ON since ${st.since} (${st.reason}) — no new positions. npm run resume to release.`))
  console.log('')
  console.log(`  On this computer:  ${ui.bold(address)}`)
  if (config.app.allowPhone) {
    const lan = lanUrls()
    console.log(`  On your phone:     ${ui.bold(lan.join('  or  ') || '(no network address found)')}`)
    console.log(`  Phone PIN:         ${ui.bold(PIN)}`)
    console.log(ui.dim('  Same wifi only. Open the address, enter the PIN once, then Share → Add to Home Screen.'))
  } else {
    console.log(ui.dim('  Phone access is off. Set app.allowPhone: true in config.ts to turn it on.'))
  }
  console.log(`  TradingView webhook secret: ${ui.dim(WEBHOOK_SECRET)}  ${ui.dim('(the TradingView tab explains where it goes)')}`)
  console.log('')
  console.log(ui.dim(`  Watching the market every ${config.app.watchEveryMinutes} minutes; alerts show here and in the app's bell.`))
  console.log(ui.dim('  To stop: press Ctrl+C in this window.'))
  console.log('')
  if (process.env.NO_BROWSER !== '1') openBrowser(address)
})
