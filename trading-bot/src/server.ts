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
import { readFileSync, existsSync, appendFileSync, writeFileSync, accessSync, constants, statSync, createReadStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomBytes, randomInt } from 'node:crypto'
import { config } from '../config.ts'
import { analyzeNow, runScan } from './bot.ts'
import type { Snapshot } from './bot.ts'
import { runReplay, runStrategyReplay, scoreSkippedTrades, replaySteps } from './replay.ts'
import { runBacktest } from './backtest/runner.ts'
import { runCampaign, listCampaigns, getCampaign } from './factory/campaign.ts'
import type { CampaignRecord } from './factory/campaign.ts'
import { listPassports, getPassport, mint, champion, assessPromotion } from './vault/store.ts'
import { fusedToSignal } from './fusion.ts'
import { buildNarrationContext } from './ai/context.ts'
import { narrate } from './ai/narrator.ts'
import { cioDecision, decisionLabel } from './ai/cio.ts'
import { proposeCampaigns } from './ai/researcher.ts'
import { STRATEGIES, enabledStrategyIds, metaById, strategyIds } from './strategies/registry.ts'
import { DATA_DIR, ensureDataDir, lessonLines, memoryIsEmpty, readLedger, resetMemory } from './memory.ts'
import { MarketDataError, explainMarketDataError, INTERVAL_MS, getCandles } from './market.ts'
import { getNews, summarizeNews, upcomingEvents } from './news.ts'
import { buildBrief } from './brief.ts'
import { readPlan, writePlan, clearPlan } from './plan.ts'
import type { DayPlan } from './plan.ts'
import { aiStatus, askAI, askAIJson, explainAiError, PICTURE_QUESTION } from './ai.ts'
import { scanPatterns, UNTESTED } from './scanner/patterns.ts'
import { biasScore, confluence, patternEvidence } from './scanner/priceAction.ts'
import { PICTURE_INSTRUCTIONS, PICTURE_SCHEMA, cleanPictureRead } from './scanner/picture.ts'
import type { AiImage } from './ai.ts'
import { toET, tradingDayKey } from './sessions.ts'
import { ifvgRole } from './fvg.ts'
import { describeShift, describeSwing } from './structure.ts'
import { breakerRole, describeOrderBlock } from './orderblocks.ts'
import { describeDealingRange } from './features/dealingRange.ts'
import { getFlow, readFlowLog } from './orderflow.ts'
import { tradeTape } from './features/trades.ts'
import { tapeSpeed } from './features/tape.ts'
import { largeTrades } from './features/largeTrades.ts'
import { startWatch, eventLog } from './watch.ts'
import { startResearchOps, RETRY_HANDLERS } from './learning/ops.ts'
import { holdLock } from './ops/lock.ts'
import { startOpsMonitor } from './ops/monitor.ts'
import * as opsApi from './ops/api.ts'
import { runDoctor, lanUrls } from './doctor.ts'
import { readJournal, upsertEntry, deleteEntry, readGoals, saveGoals, computeStats, buildReview, entryFromSnapshot, journalSummaryForAI, EMOTIONS, TAGS } from './journal.ts'
import { paperStats, closeManually, readPositions, equity, equityPeak, openNotionalUsd, todaysPaperStats } from './paperTrader.ts'
import { paperByStrategy, comparePaperToOos } from './paper/metrics.ts'
import { refreshOosReference, oosReferenceFor, usableOosAvgR } from './paper/oosReference.ts'
import { buildValidationReport, soakMetrics, aiEngineConsistency, renderDailyReport, evaluateGates, dataQuality, decayByStrategy } from './paper/validation.ts'
import { buildDesk, renderDesk } from './desk/agents.ts'
import { renderSessionScript } from './tv/sessionScript.ts'
import { lastStoredCandle, getCandles as storedCandles } from './data/candleStore.ts'
import { CallDesk } from './forecast/service.ts'
import { twoVenueCheck } from './school/predictionMarket.ts'
import { attributionReport, renderAttribution, fromPaper } from './analyst/attribution.ts'
import { overview as evidenceOverview, dimensionView, crossView, cohortView, tradesView, tradeDetail, cachedBacktest, refreshBacktestCache, tradingStrategyId } from './analyst/evidence.ts'
import type { EvidenceInputs } from './analyst/evidence.ts'
import type { CohortDimension, CohortDefinition } from './analyst/cohorts.ts'
import { newsRead, renderNewsRead } from './news/brain.ts'
import { pastInstances, historyDepth, allSeries } from './news/history.ts'
import { recoverOpenPositions, recordStart, bootLog } from './recovery.ts'
import * as learn from './learning/api.ts'
import { recordTrials } from './research/overfitting.ts'
import { safeEqual, securityHeaders, newNonce, withNonce } from './security/harden.ts'
import { intelAnnotations, intelTrade, intelTimeline, intelChanges, intelAlerts, intelPine, intelExplainContext, intelTradeStages } from './intel/service.ts'
import type { IntelSnapshot } from './intel/service.ts'
import { intelEnabled, intelFlags, disabledPayload } from './intel/flags.ts'
import { explain } from './intel/explain.ts'
import type { ExplainTopic } from './intel/explain.ts'
import { listShadowOrders } from './shadow/recorder.ts'
import { scoreShadowOrder, slippageComparison } from './shadow/scorer.ts'
import { gateInputFromEnv, liveArmed, liveGates } from './live/gates.ts'
import { assess, riskLimits } from './riskEngine.ts'
import type { RiskState, RiskVerdict } from './riskEngine.ts'
import { entriesAllowed } from './killswitch.ts'
import { SKILLS, skillById } from './skills.ts'
import { checkStateChange } from './guard.ts'
import { LoginGate } from './security/login.ts'
import { describeMode, runtimeMode, shadowEnabled } from './mode.ts'
import { stopState, stop as engageStop, resume as releaseStop } from './killswitch.ts'
import { systemState } from './systemState.ts'
import { getSettings, setSetting, resetSetting } from './settings.ts'
import type { Settings } from './settings.ts'
import { store } from './store.ts'
import { VERSION } from './version.ts'
import { marketFeed } from './data/feed.ts'
import { bus } from './data/bus.ts'
import type { Goal, JournalEntry } from './journal.ts'
import * as ui from './ui.ts'
import { fetchPortfolio } from './broker/alpaca.ts'
import { brokerStatus, fetchKrakenPortfolio } from './broker/kraken.ts'
import { MarketWatch } from './markets/service.ts'
import { BigMoney } from './bigmoney/service.ts'
import { VaultGate, vaultCookie, VAULT_COOKIE_PATH } from './security/vault.ts'
import type Anthropic from '@anthropic-ai/sdk'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(HERE, '..', 'web')
const TV_LOG = join(DATA_DIR, 'tv-alerts.csv')
const PORT = Number(process.env.MRCASH_PORT) || config.webPort
const STARTED_AT = Date.now()

// Load .env before reading any setting from it (MRCASH_PIN above all), so a
// fixed PIN in .env is honoured on every start. Values already set in the shell
// win; a missing or malformed file changes nothing.
try { process.loadEnvFile(join(HERE, '..', '.env')) } catch { /* no .env: fine */ }
// Secrets for this run. Printed once at startup, never written to disk.
// A made-up PIN comes from the OS's secure random source, so it cannot be predicted.
const PIN = process.env.MRCASH_PIN || config.app.pin || String(randomInt(100000, 1000000))
const WEBHOOK_SECRET = config.tradingview.webhookSecret || randomBytes(12).toString('hex')
const SESSION_TOKEN = randomBytes(24).toString('hex')
/** Handed to the app's own page via /api/config; every state-changing request must carry it back. */
const CSRF_TOKEN = randomBytes(24).toString('hex')
// The front door for other devices: the PIN, plus an authenticator code once one is set up.
const loginGate = new LoginGate({ pin: PIN })
// Behind a TLS reverse proxy, MRCASH_COOKIE_SECURE=1 marks the session cookie Secure.
const COOKIE_SECURE = process.env.MRCASH_COOKIE_SECURE === '1' ? '; Secure' : ''
// The vault: a second lock (passcode + authenticator code) on real balances. See src/security/vault.ts.
const vaultGate = new VaultGate()

const STATIC: Record<string, { file: string; type: string }> = {
  '/manifest.json': { file: 'manifest.json', type: 'application/manifest+json' },
  '/sw.js': { file: 'sw.js', type: 'application/javascript' },
  '/icon-192.png': { file: 'icon-192.png', type: 'image/png' },
  '/icon-512.png': { file: 'icon-512.png', type: 'image/png' },
  '/icon-180.png': { file: 'icon-180.png', type: 'image/png' },
  '/icon.svg': { file: 'icon.svg', type: 'image/svg+xml' },
  '/mr-cash.svg': { file: 'mr-cash.svg', type: 'image/svg+xml' },
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
  // Constant-time: an attacker can hammer this one freely.
  return cookie.split(';').some((c) => safeEqual(c.trim(), `mrcash=${SESSION_TOKEN}`))
}

function authed(req: IncomingMessage): boolean {
  return isLocal(req) || hasSession(req)
}

const LOGIN_PAGE = (msg = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mr. Cash</title>
<link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/icon-180.png"><meta name="theme-color" content="#0d1117">
<style>body{margin:0;background:#0d1117;color:#e6edf3;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
form{background:#161b22;border:1px solid #26303d;border-radius:14px;padding:28px;width:min(92vw,360px);text-align:center}h1{font-size:22px;margin:0 0 6px}p{color:#8b98a5;margin:0 0 18px;font-size:14px}
input{width:100%;box-sizing:border-box;font-size:28px;letter-spacing:.3em;text-align:center;padding:12px;border-radius:10px;border:1px solid #26303d;background:#0d1117;color:#e6edf3}
.code{margin-top:10px;font-size:22px}button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:10px;background:#58a6ff;color:#04111f;font-weight:700;font-size:16px}.err{color:#f85149;font-size:14px;margin-top:10px}</style></head>
<body><form method="post" action="/login"><h1>Mr. Cash</h1><p>${loginGate.needsCode() ? 'Enter the PIN shown in the terminal on your computer, then the 6-digit code from your authenticator app.' : 'Enter the PIN shown in the terminal on your computer.'}</p><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" aria-label="PIN" autofocus maxlength="32">${loginGate.needsCode() ? '<input name="code" inputmode="numeric" autocomplete="one-time-code" aria-label="Authenticator code" placeholder="code" maxlength="6" pattern="[0-9]{6}" class="code">' : ''}<button>Open</button>${msg ? `<div class="err">${msg}</div>` : ''}</form></body></html>`

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

/** A compact campaign row for the list view (without the full evaluation set). */
function campaignSummary(rec: CampaignRecord) {
  return {
    id: rec.id, strategyId: rec.strategyId, method: rec.method, seed: rec.seed,
    updatedAt: rec.updatedAt, done: rec.done,
    tried: rec.evaluated.length, trials: rec.selection?.trials ?? 0,
    survivors: rec.selection?.survivors.length ?? 0,
  }
}

function analysisPayload(snap: Snapshot, candleCount: number) {
  const a = snap.analysis
  const candles = snap.candles.slice(-candleCount).map((c) => ({ ...c, et: toET(c.openTime).clock, day: toET(c.openTime).dateKey }))
  const firstTime = candles[0]?.openTime ?? 0
  const engine = snap.engine
  const plan = readPlan()
  const brief = a ? buildBrief(a, snap.news, plan, Date.now(), snap.state, snap.flow, snap.decision) : null
  return {
    strategy: config.strategy,
    candles,
    analysis: a ? { ...a, sessions: undefined } : null,
    signal: snap.signal,
    sessions: engine ? [...engine.sessions.days.values()].flatMap((d) => Object.values(d.sessions)).filter((s) => s.endTime >= firstTime) : [],
    sweeps: engine ? [...engine.sessions.days.keys()].flatMap((k) => engine.sweepsFor(k)).filter((s) => s.time >= firstTime) : [],
    fvgs: engine ? engine.fvgs.fvgs.filter((f) => f.createdTime >= firstTime && (f.state !== 'expired' || f.retestIndex !== undefined)).map((f) => ({ ...f, role: ifvgRole(f) })) : [],
    shifts: engine ? engine.structure.shifts.filter((s) => s.time >= firstTime).map((s) => ({ ...s, description: describeShift(s) })) : [],
    swings: engine ? engine.swings.swings.filter((s) => s.time >= firstTime).map((s) => ({ ...s, description: describeSwing(s) })) : [],
    orderBlocks: engine ? engine.obs.blocks.filter((b) => b.time >= firstTime && b.state !== 'expired').map((b) => ({ ...b, role: breakerRole(b), description: describeOrderBlock(b) })) : [],
    swingSweeps: engine ? [...engine.sessions.days.keys()].flatMap((k) => engine.swingSweepsFor(k)).filter((s) => s.time >= firstTime) : [],
    dealingRange: a?.dealingRange ? { ...a.dealingRange, description: describeDealingRange(a.dealingRange) } : null,
    /** The shared readings: the latest snapshot in full, and the VWAP lines for the chart. */
    features: engine && a ? { latest: a.features, series: engine.features.series(firstTime) } : null,
    plan,
    brief: brief ? { lines: brief.lines, proposal: brief.proposal, levels: brief.levels } : null,
    news: snap.news ? { ...snap.news, upcoming: upcomingEvents(snap.news), summary: summarizeNews(snap.news) } : null,
    state: snap.state,
    flow: snap.flow,
    paper: paperStats(snap.signal.price),
    risk: (() => {
      const eq = equity(); const peak = Math.max(equityPeak(), eq)
      return { limits: riskLimits(), used: { openPositions: readPositions().open.length, openNotionalUsd: openNotionalUsd(), drawdownPercent: peak > 0 ? ((peak - eq) / peak) * 100 : 0, tradesToday: a ? todaysPaperStats(a.dayKey).trades : 0, lossesTodayR: a ? todaysPaperStats(a.dayKey).lossesR : 0 } }
    })(),
    decision: snap.decision,
    strategyVotes: snap.strategyVotes,
    generatedAt: Date.now(),
  }
}

function contextFor(snap: Snapshot, withJournal = false): string {
  const a = snap.analysis
  const parts: string[] = []
  if (!a) parts.push(`Strategy: crossover. Latest: ${snap.signal.reason}`)
  else {
    const brief = buildBrief(a, snap.news, readPlan(), Date.now(), snap.state, snap.flow, snap.decision)
    parts.push(brief.lines.join('\n'), '', 'CHECKLIST RIGHT NOW:', ...a.signal.evidence.map((e) => `  [${e.passed ? 'ok' : 'NO'}] ${e.step}: ${e.detail}`), `Decision: ${a.signal.action} — ${a.signal.reason}`, '',
      'GAPS: ' + a.fvgs.slice(-8).map((f) => `${f.direction} $${f.bottom.toFixed(0)}–$${f.top.toFixed(0)} ${f.state}${ifvgRole(f) ? ` now ${ifvgRole(f)}` : ''}`).join('; '),
      'SETTINGS: ' + JSON.stringify({ symbol: config.symbol, interval: config.interval, account: config.accountSizeUsd, riskPct: config.riskPerTradePercent, minRR: config.ict.minRR, killzones: config.ict.killzones, requireInversion: config.ict.requireInversion }),
      'NEWS: ' + (snap.news ? summarizeNews(snap.news) : 'not available'))
  }
  if (withJournal) parts.push('', journalSummaryForAI(readJournal()))
  return parts.join('\n').slice(0, 16_000)
}

/** Extra read-only context for the hats that need it: the Scanner's price-action read, or the Big money board. */
function skillContext(skillId?: string): string {
  try {
    if (skillId === 'priceaction') {
      const rows = marketWatch.snapshot().rows.map((r) => {
        const c = marketWatch.candles(`${r.kind}:${r.symbol}`)
        const b = biasScore(c), g = confluence(c)
        return `  ${r.label} [${r.provenance}] bias ${b.parts.length ? (b.score > 0 ? '+' : '') + b.score + ' (' + b.lean + ')' : 'NOT ENOUGH DATA'}; setup grade ${g.grade}: ${g.text}`
      })
      return '\n\nPRICE ACTION (Scanner, hourly candles, rule-based, untested as a trading rule):\n' + (rows.length ? rows.join('\n') : '  NOT ENOUGH DATA: the market watch has no rows yet.')
    }
    if (skillId === 'caller') {
      const d = callDesk.snapshot()
      const c = d.current ?? d.lastRead
      const line = (r: { windowEnd: number; outcome: string; call: string; result: string; pUp: number }) => `  ${new Date(r.windowEnd).toISOString().slice(11, 16)}Z ${r.outcome} · said ${r.call} · ${r.result} · p(up) ${r.pUp}`
      return `\n\nCALL DESK (PAPER FORECAST, ${d.symbol} ${d.windowMinutes}-minute windows, status ${d.status}, line ${d.line}):\n` +
        (c ? `  ${d.current ? 'LIVE CALL' : 'STALE LAST READ (not scored)'}: p(up) ${c.pUp}, call ${c.call}, difficulty ${c.difficulty}/4, tags ${c.tags.join(', ') || 'none'}\n${c.readings.map((r) => `    ${r.label}: ${r.text} (push ${r.push})`).join('\n')}\n` : '  No call this window.\n') +
        `  LIVE RECORD: ${JSON.stringify(d.tally)}\n${d.log.slice(0, 8).map(line).join('\n')}\n` +
        (d.backtest ? `  BACKTEST (${d.backtest.windows} past windows, not the live record): ${JSON.stringify(d.backtest.tally)}` : '  BACKTEST: not available.')
    }
    if (skillId === 'bigmoney') {
      const bm = bigMoney.snapshot()
      const board = bm.board.slice(0, 8).map((t) => `  ${JSON.stringify(t)}`).join('\n')
      return `\n\nBIG MONEY (disclosed filings, READ-ONLY, as of ${bm.asOf ? new Date(bm.asOf).toISOString() : 'never'}; sources: ${Object.entries(bm.sources).map(([k, v]) => `${k} ${v.status}`).join(', ')}):\n  ${bm.digest.join(' ')}\n${board || '  NOT ENOUGH DATA: no filings on the board.'}`
    }
  } catch { /* the hat still answers from the main context */ }
  return ''
}

async function streamAnswer(res: ServerResponse, question: string, context: string, history: Anthropic.MessageParam[], image?: AiImage, skillId?: string): Promise<void> {
  const status = await aiStatus()
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  try {
    const answer = await askAI(question, context + skillContext(skillId), history, (t) => res.write(t), image, skillById(skillId))
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
  // Security headers go on EVERY response, including 404s, redirects and the
  // login page. setHeader before writeHead, so each route's own headers merge on
  // top rather than replacing these. The nonce is per request and never reused.
  const nonce = newNonce()
  for (const [k, v] of Object.entries(securityHeaders(nonce))) res.setHeader(k, v)
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

    // The command-center modules: /js/*.js and /css/*.css from web/. Safe,
    // read-only static files; the path is constrained so nothing escapes web/.
    if ((path.startsWith('/js/') || path.startsWith('/css/')) && /^\/(js|css)\/[a-zA-Z0-9._-]+\.(js|css)$/.test(path)) {
      const full = join(WEB_DIR, path.slice(1))
      if (!existsSync(full)) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': path.endsWith('.css') ? 'text/css' : 'application/javascript', 'cache-control': 'public, max-age=3600' })
      res.end(readFileSync(full))
      return
    }

    // The app's own typefaces: /fonts/*.woff2 from web/fonts, same constraint.
    if (path.startsWith('/fonts/') && /^\/fonts\/[a-z0-9-]+\.woff2$/.test(path)) {
      const full = join(WEB_DIR, path.slice(1))
      if (!existsSync(full)) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=86400' })
      res.end(readFileSync(full))
      return
    }

    // Decorative media (the ambient video and its poster): /media/*.{mp4,webm,jpg,png,webp} from web/media.
    // Same constraint as the fonts, plus byte ranges, which Safari needs to play a video.
    if (path.startsWith('/media/') && /^\/media\/[a-z0-9-]+\.(mp4|webm|jpg|png|webp)$/.test(path) && (req.method === 'GET' || req.method === 'HEAD')) {
      const full = join(WEB_DIR, path.slice(1))
      if (!existsSync(full)) { res.writeHead(404); res.end(); return }
      const size = statSync(full).size
      const type = ({ mp4: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[path.split('.').pop() as string]
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
      if (m && (m[1] || m[2])) {
        const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
        const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
        if (!(start <= end && end < size)) { res.writeHead(416, { 'content-range': `bytes */${size}` }); res.end(); return }
        res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' })
        if (req.method === 'HEAD') { res.end(); return }
        createReadStream(full, { start, end }).pipe(res)
        return
      }
      res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' })
      if (req.method === 'HEAD') { res.end(); return }
      createReadStream(full).pipe(res)
      return
    }

    // TradingView alerts carry their own secret
    if (path === '/api/tv-alert' && req.method === 'POST') {
      const raw = await readBody(req, 64 * 1024)
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(raw) } catch { body = { message: raw } }
      const secret = String(body.secret ?? req.headers['x-mrcash-secret'] ?? url.searchParams.get('secret') ?? '')
      if (!safeEqual(secret, WEBHOOK_SECRET)) { json(res, 403, { ok: false, error: 'bad secret' }); return }
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
        const r = loginGate.attempt(client, form.get('pin'), form.get('code'))
        if (r.ok) {
          res.writeHead(302, { 'set-cookie': `mrcash=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${COOKIE_SECURE}`, location: '/' })
          res.end()
        } else {
          res.writeHead(r.status, { 'content-type': 'text/html; charset=utf-8' })
          res.end(LOGIN_PAGE(r.reason))
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
      // The page's inline script runs because it carries this request's nonce.
      // Anything injected into the markup later cannot guess it, so it cannot run.
      res.end(withNonce(readFileSync(join(WEB_DIR, 'index.html'), 'utf8'), nonce))
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
      const storeIntegrity = store().integrity()
      const feed = marketFeed.health()
      const lastWatchAt = watcher.current()?.at ?? null
      const watchStaleSec = lastWatchAt ? Math.round((Date.now() - lastWatchAt) / 1000) : null
      // Deep checks: each subsystem reports ok; the process is healthy only if all the hard ones are.
      const checks = [
        { name: 'store', ok: storeIntegrity === 'ok', detail: storeIntegrity },
        { name: 'dataDir', ok: dataDirWritable, detail: dataDirWritable ? 'writable' : 'not writable' },
        { name: 'feed', ok: !!feed, detail: marketFeed.describe() },
        { name: 'killSwitch', ok: !stopState().stopped, detail: stopState().stopped ? 'engaged' : 'clear' },
      ]
      const healthy = checks.filter((c) => c.name === 'store' || c.name === 'dataDir').every((c) => c.ok)
      // Phase 25: the ops monitor's last verdict rides along (the full document is /api/ops/health).
      const oh = opsApi.opsHealthLast(feed, watcher.lastError())
      json(res, 200, { ok: true, data: { healthy, checks, version: VERSION, mode: runtimeMode(), modeLabel: describeMode(), stop: stopState(), dataDir: DATA_DIR, dataDirWritable, store: storeIntegrity, feed, uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000), watchEveryMinutes: config.app.watchEveryMinutes, lastWatchAt, watchStaleSec, ops: { overall: oh.overall, feed: oh.feed.verdict, dataSource: oh.dataSource.label, execution: oh.dataSource.execution, alerts: oh.alerts.length, securityOk: oh.security.ok, at: oh.at } } })
      return
    }
    // THE VAULT. Status is public to the app; unlock and lock are POSTs, so the
    // CSRF and same-origin guard above has already run. The balances behind it
    // are read-only.
    if (path === '/api/vault/status') {
      const v = vaultGate.check(vaultCookie(req.headers.cookie))
      json(res, 200, { ok: true, data: { configured: vaultGate.configured(), open: v.open, expiresAt: v.expiresAt, idleMinutes: vaultGate.idleMs / 60_000 } })
      return
    }
    if (path === '/api/vault/unlock' && req.method === 'POST') {
      let body: { passcode?: unknown; code?: unknown } = {}
      try { body = JSON.parse((await readBody(req, 2048)) || '{}') } catch { body = {} }
      const r = vaultGate.unlock(client, body.passcode, body.code)
      if (!r.ok) { json(res, r.status, { ok: false, error: r.reason }); return }
      res.setHeader('set-cookie', `mrcash_vault=${r.token}; Path=${VAULT_COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${vaultGate.maxMs / 1000}`)
      json(res, 200, { ok: true, data: { open: true, expiresAt: r.expiresAt } })
      return
    }
    if (path === '/api/vault/lock' && req.method === 'POST') {
      vaultGate.lock(vaultCookie(req.headers.cookie))
      res.setHeader('set-cookie', `mrcash_vault=; Path=${VAULT_COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=0`)
      json(res, 200, { ok: true, data: { open: false } })
      return
    }
    if (path === '/api/vault/portfolio') {
      const v = vaultGate.check(vaultCookie(req.headers.cookie))
      if (!v.open) { json(res, 403, { ok: false, locked: true, error: vaultGate.configured() ? 'The vault is locked.' : 'The vault is not set up yet.' }); return }
      const [alpaca, kraken] = await Promise.all([fetchPortfolio(), fetchKrakenPortfolio()])
      const p = paperStats()
      json(res, 200, { ok: true, data: { asOf: Date.now(), expiresAt: v.expiresAt, paper: { mode: 'PAPER', startUsd: p.startUsd, equityUsd: p.equityUsd, trades: p.trades, wins: p.wins, losses: p.losses, totalR: p.totalR, open: p.open.length }, alpaca, kraken } })
      return
    }
    // Once the vault is set up, real balances are only shown through it.
    if ((path === '/api/portfolio' || path === '/api/portfolio/kraken') && vaultGate.configured() && !vaultGate.check(vaultCookie(req.headers.cookie)).open) {
      json(res, 403, { ok: false, locked: true, error: 'Locked in the vault. Open the vault to see real balances.' })
      return
    }
    // Your real brokerage account, READ-ONLY. Keys come from the environment;
    // this route never returns them and the client cannot place an order.
    if (path === '/api/portfolio') {
      json(res, 200, { ok: true, data: await fetchPortfolio() })
      return
    }
    if (path === '/api/portfolio/kraken') {
      json(res, 200, { ok: true, data: await fetchKrakenPortfolio() })
      return
    }
    // Every watched market (crypto, stocks, forex, indexes), READ-ONLY: prices,
    // the move, and what changed. Observations only; nothing here can trade.
    if (path === '/api/markets') {
      const snap = marketWatch.snapshot()
      const wantFresh = url.searchParams.get('refresh') === '1' && Date.now() - snap.asOf > 30_000
      json(res, 200, { ok: true, data: wantFresh || !snap.asOf ? await marketWatch.refresh() : snap })
      return
    }
    // The pattern scanner: textbook shapes found by fixed rules in each watched market's candles. READ-ONLY, no AI.
    if (path === '/api/scanner') {
      const snap = marketWatch.snapshot()
      const markets = snap.rows.map((r) => {
        const key = `${r.kind}:${r.symbol}`
        const scan = scanPatterns(marketWatch.candles(key))
        const candles = marketWatch.candles(key)
        const bias = biasScore(candles), grade = confluence(candles)
        return { key, label: r.label, kind: r.kind, symbol: r.symbol, provenance: r.provenance, price: r.scan.price, trend: scan.trend, summary: scan.summary, names: scan.patterns.filter((p) => p.kind !== 'zone').map((p) => ({ name: p.name, bias: p.bias, status: p.status })), bias: { score: bias.score, lean: bias.lean, ready: bias.parts.length > 0 }, grade: grade.grade }
      })
      json(res, 200, { ok: true, data: { kind: 'PATTERN SCAN', execution: 'READ-ONLY', asOf: snap.asOf, markets, note: UNTESTED } })
      return
    }
    if (path === '/api/scanner/market') {
      const key = String(url.searchParams.get('key') ?? '')
      const row = marketWatch.snapshot().rows.find((r) => `${r.kind}:${r.symbol}` === key)
      if (!row) { json(res, 404, { ok: false, error: 'Not a watched market.' }); return }
      const candles = marketWatch.candles(key).slice(-150)
      json(res, 200, { ok: true, data: { key, label: row.label, provenance: row.provenance, feed: row.feed, interval: '1h', candles: candles.map((c) => ({ t: c.openTime, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume })), scan: scanPatterns(candles), priceAction: { confluence: confluence(candles), bias: biasScore(marketWatch.candles(key)) }, note: UNTESTED } })
      return
    }
    // What followed each candle pattern on this market's own history. BACKTEST, measured candle by candle with no look-ahead.
    if (path === '/api/scanner/evidence') {
      const key = String(url.searchParams.get('key') ?? '')
      const row = marketWatch.snapshot().rows.find((r) => `${r.kind}:${r.symbol}` === key)
      if (!row) { json(res, 404, { ok: false, error: 'Not a watched market.' }); return }
      const hit = evidenceCache.get(key)
      if (hit && Date.now() - hit.at < 600_000) { json(res, 200, { ok: true, data: hit.data }); return }
      let candles = marketWatch.candles(key), source = 'the watch\'s cached hourly candles'
      if (row.kind === 'crypto') {
        try { const deep = await getCandles(row.symbol, '1h', 1000); if (deep.length > candles.length) { candles = deep; source = 'stored hourly candles (up to 1,000)' } } catch { /* the cached candles will do */ }
      }
      const data = { ...patternEvidence(candles), key, market: row.label, provenance: row.provenance, source }
      evidenceCache.set(key, { at: Date.now(), data })
      json(res, 200, { ok: true, data })
      return
    }
    // The call desk: up or down over the next window, with the working, scored against the real close. PAPER FORECAST, no orders.
    if (path === '/api/forecast') {
      const fresh = url.searchParams.get('refresh') === '1'
      json(res, 200, { ok: true, data: fresh || callDesk.snapshot().status === 'STARTING' ? await callDesk.tick() : callDesk.snapshot() })
      return
    }
    // The two-venue edge check: typed-in Polymarket and Kalshi quotes, fees, and a capped Kelly stake. Arithmetic only, SIMULATED.
    if (path === '/api/forecast/edge') {
      const n = (k: string) => { const v = Number(url.searchParams.get(k)); return Number.isFinite(v) ? v : NaN }
      const cents = (k: string) => n(k) / 100
      try {
        const p = url.searchParams.get('p') ? n('p') : null
        const data = twoVenueCheck({ venue: 'Polymarket', yesAsk: cents('pmYes'), noAsk: cents('pmNo'), fee: Number.isFinite(n('pmFee')) ? n('pmFee') / 100 : 0 }, { venue: 'Kalshi', yesAsk: cents('kYes'), noAsk: cents('kNo'), fee: 'kalshi' }, { p, contracts: Number.isFinite(n('contracts')) && n('contracts') > 0 ? Math.min(100_000, n('contracts')) : 100 })
        json(res, 200, { ok: true, data })
      } catch (e) { json(res, 200, { ok: false, error: (e as Error).message }) }
      return
    }
    // Disclosed filings and volume leaders, READ-ONLY. Refresh on request at most every 10 minutes.
    if (path === '/api/bigmoney') {
      const snap = bigMoney.snapshot()
      const wantFresh = url.searchParams.get('refresh') === '1' && Date.now() - snap.asOf > 600_000
      json(res, 200, { ok: true, data: wantFresh ? await bigMoney.refresh() : snap })
      return
    }
    // Which brokers are wired up. No network call, no secrets: just configured yes/no.
    if (path === '/api/brokers') {
      json(res, 200, { ok: true, data: brokerStatus() })
      return
    }
    // "What is the current state of my system?" — one document, from disk and the last watch cycle.
    if (path === '/api/system') {
      json(res, 200, { ok: true, data: { ...systemState({ lastWatch: watcher.current(), lastError: watcher.lastError(), startedAt: STARTED_AT, feed: marketFeed.health() }), watch: watcher.stats() } })
      return
    }
    // Live updates for the page: price ticks, candle closes, bell events, feed health. Server-Sent Events, no polling.
    if (path === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
      const send = (event: string, data: unknown) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch { /* client gone */ } }
      send('health', marketFeed.health())
      let lastPriceSent = 0
      const unsub = [
        bus.on('bookTicker', (b) => { const now = Date.now(); if (now - lastPriceSent >= 500) { lastPriceSent = now; send('price', { price: (b.bid + b.ask) / 2, bid: b.bid, ask: b.ask, time: b.time }) } }),
        bus.on('trade', (t) => { const now = Date.now(); if (!marketFeed.latestTicker && now - lastPriceSent >= 500) { lastPriceSent = now; send('price', { price: t.price, time: t.time }) } }),
        bus.on('candle:update', (c) => send('candle', { openTime: c.openTime, close: c.close, high: c.high, low: c.low, complete: false })),
        bus.on('candle:closed', (c) => send('candle', { openTime: c.openTime, close: c.close, high: c.high, low: c.low, complete: true, source: c.source })),
        bus.on('stream:up', (h) => send('health', { ...marketFeed.health(), stream: h })),
        bus.on('stream:down', (h, reason) => send('health', { ...marketFeed.health(), stream: h, reason })),
        bus.on('stream:gap', (what, at) => send('gap', { what, at })),
      ]
      const onEvent = (e: { id: number }) => send('event', { id: e.id })
      eventLog.listeners.push(onEvent)
      const keepAlive = setInterval(() => { try { res.write(': ping\n\n') } catch { /* ignore */ } }, 25_000)
      req.on('close', () => { clearInterval(keepAlive); for (const u of unsub) u(); const i = eventLog.listeners.indexOf(onEvent); if (i >= 0) eventLog.listeners.splice(i, 1) })
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
    /**
     * COMPUTE THE OUT-OF-SAMPLE REFERENCE for the strategy that is trading.
     *
     * Explicit and slow on purpose: it runs a full backtest, which is seconds,
     * and the gate only ever READS the stored result. Never triggered by a GET —
     * the desk polls every fifteen seconds and must never pay for a backtest.
     */
    if (path === '/api/validation/oos-reference' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 4096)) || '{}') as { strategyId?: string }
      const id = body.strategyId || (config.fusion.driveTrading ? 'fused' : config.strategy === 'crossover' ? 'crossover' : 'session-ifvg')
      if (id !== 'fused' && !strategyIds().includes(id)) { json(res, 400, { ok: false, error: `Unknown strategy "${id}"` }); return }
      const r = await safely(() => refreshOosReference(id))
      if (r.ok) { try { recordTrials({ strategyId: id, source: 'oos-reference', count: 1, note: 'OOS reference backtest' }) } catch { /* the registry is best-effort */ } }
      if (r.ok) eventLog.push('info', `Out-of-sample reference computed for ${id}`, r.data.usable ? `${r.data.oosTrades} simulated OOS trades, expectancy ${r.data.oosAvgR === null ? '—' : r.data.oosAvgR.toFixed(3)}R. The stability gate now has a number to compare paper against.` : r.data.reason, 'info')
      json(res, 200, r.ok ? { ok: true, data: r.data } : r)
      return
    }
    if (path === '/api/validation/oos-reference') {
      const id = url.searchParams.get('id') || (config.fusion.driveTrading ? 'fused' : config.strategy === 'crossover' ? 'crossover' : 'session-ifvg')
      json(res, 200, { ok: true, data: oosReferenceFor(id) })
      return
    }
    if (path === '/api/resume' && req.method === 'POST') {
      const s = releaseStop()
      eventLog.push('info', 'Kill switch released', 'Entries are allowed again.', 'info')
      json(res, 200, { ok: true, data: s })
      return
    }

    if (path === '/api/risk') {
      const snap = await safely(() => snapshot())
      const sig = snap.ok ? snap.data.signal : null
      const positions = readPositions()
      const eq = equity(); const peak = Math.max(equityPeak(), eq)
      const last = snap.ok ? snap.data.candles[snap.data.candles.length - 1] : null
      const tk = marketFeed.latestTicker
      const gate = entriesAllowed()
      const state: RiskState = {
        now: Date.now(), killSwitch: { ok: gate.ok, reason: gate.ok ? '' : gate.reason },
        candleAgeSec: last ? (Date.now() - last.closeTime) / 1000 : null,
        spreadPct: tk && tk.bid > 0 && tk.ask > 0 ? ((tk.ask - tk.bid) / ((tk.ask + tk.bid) / 2)) * 100 : null,
        openPositions: positions.open.length, openNotionalUsd: openNotionalUsd(),
        today: todaysPaperStats(tradingDayKey(Date.now())), equityUsd: eq, peakEquityUsd: peak,
      }
      const verdict = sig && (sig.action === 'BUY' || sig.action === 'SELL') ? assess({ signal: sig }, state) : null
      json(res, 200, { ok: true, data: { limits: riskLimits(), state: { openPositions: state.openPositions, openNotionalUsd: state.openNotionalUsd, equityUsd: eq, peakEquityUsd: peak, drawdownPercent: peak > 0 ? ((peak - eq) / peak) * 100 : 0, candleAgeSec: state.candleAgeSec, spreadPct: state.spreadPct, killSwitch: gate.ok }, verdict } })
      return
    }
    if (path === '/api/decision') {
      const snap = await safely(() => snapshot())
      json(res, 200, snap.ok ? { ok: true, data: snap.data.decision } : snap)
      return
    }
    if (path === '/api/narrate') {
      const snap = await safely(() => snapshot())
      if (!snap.ok) { json(res, 200, snap); return }
      const s = snap.data
      const price = s.signal.price
      const features = s.analysis?.features ?? null
      const decision = s.decision
      // The risk verdict on the fused decision, so the narration's "current decision" is the fused decision AFTER risk.
      const positions = readPositions()
      const eq = equity(); const peak = Math.max(equityPeak(), eq)
      const last = s.candles[s.candles.length - 1]
      const tk = marketFeed.latestTicker
      const gate = entriesAllowed()
      const state: RiskState = {
        now: Date.now(), killSwitch: { ok: gate.ok, reason: gate.ok ? '' : gate.reason },
        candleAgeSec: last ? (Date.now() - last.closeTime) / 1000 : null,
        spreadPct: tk && tk.bid > 0 && tk.ask > 0 ? ((tk.ask - tk.bid) / ((tk.ask + tk.bid) / 2)) * 100 : null,
        openPositions: positions.open.length, openNotionalUsd: openNotionalUsd(),
        today: todaysPaperStats(tradingDayKey(Date.now())), equityUsd: eq, peakEquityUsd: peak,
      }
      const fusedSig = decision ? fusedToSignal(decision, price, Date.now()) : null
      const verdict = fusedSig && (fusedSig.action === 'BUY' || fusedSig.action === 'SELL') ? assess({ signal: fusedSig }, state) : null
      const ctx = buildNarrationContext({ price, features, decision, risk: verdict })
      const call = cioDecision(ctx.decision, ctx.risk)
      const status = await aiStatus()
      const aiFn = status.available
        ? async (prompt: string, system: string) => (await askAI(prompt, '', [], () => {}, undefined, { name: 'Narrator', system })).text
        : undefined
      const narration = await narrate(ctx, aiFn)
      const research = proposeCampaigns({ tunableStrategyIds: strategyIds().filter((id) => (metaById().get(id)?.parameters?.length ?? 0) > 0), passports: listPassports() })
      json(res, 200, { ok: true, data: { context: ctx, narration, cio: { ...call, label: decisionLabel(call) }, research, aiAvailable: status.available } })
      return
    }
    if (path === '/api/strategies' && req.method === 'GET') {
      const snap = await safely(() => snapshot())
      const votes = new Map((snap.ok ? snap.data.strategyVotes : []).map((v) => [v.id, v]))
      const on = new Set(enabledStrategyIds())
      json(res, 200, { ok: true, data: {
        strategies: STRATEGIES.map((s) => ({ ...s.meta, enabled: on.has(s.meta.id), vote: votes.get(s.meta.id) ?? null })),
        note: 'Each strategy votes on its own. Only the ICT session model opens paper trades; the rest are opinions for now.',
      } })
      return
    }
    if (path === '/api/strategies/enable' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 4096)) || '{}') as { id?: string; on?: boolean }
      const id = String(body.id ?? '')
      if (!strategyIds().includes(id)) { json(res, 400, { ok: false, error: `Unknown strategy "${id}"` }); return }
      const current = new Set(enabledStrategyIds())
      if (body.on) current.add(id); else current.delete(id)
      // Store the explicit list; if it ends up all of them, store all ids (not empty, which would mean "config default").
      setSetting('enabledStrategies', strategyIds().filter((x) => current.has(x)).join(','))
      snapCache = null
      json(res, 200, { ok: true, data: { enabled: enabledStrategyIds() } })
      return
    }
    if (path === '/api/replay/steps') {
      const limit = Number(url.searchParams.get('limit') ?? '200')
      const r = await safely(() => replaySteps({ limit }))
      json(res, 200, r.ok ? { ok: true, data: r.data } : r)
      return
    }
    if (path === '/api/replay/strategy') {
      const id = url.searchParams.get('id') ?? ''
      if (!strategyIds().includes(id)) { json(res, 400, { ok: false, error: `Unknown strategy "${id}"` }); return }
      const r = await safely(() => runStrategyReplay(id, { useMemory: false, writeMemory: false }))
      json(res, 200, r.ok ? { ...r } : r)
      return
    }
    if (path === '/api/backtest') {
      // config.strategy is the engine name ('ict'|'crossover'); map it to a registry strategy id.
      const id = url.searchParams.get('id') || (config.strategy === 'crossover' ? 'crossover' : 'session-ifvg')
      if (id !== 'fused' && !strategyIds().includes(id)) { json(res, 400, { ok: false, error: `Unknown strategy "${id}". Known: ${strategyIds().join(', ')}, fused` }); return }
      const r = await safely(() => runBacktest(id))
      json(res, 200, r.ok ? { ok: true, data: r.data } : r)
      return
    }
    if (path === '/api/factory/tunable') {
      // The strategies the factory can breed (those with tunable parameters).
      const metas = metaById()
      const tunable = strategyIds()
        .map((id) => metas.get(id))
        .filter((m): m is NonNullable<typeof m> => !!m && !!m.parameters && m.parameters.length > 0)
        .map((m) => ({ id: m.id, name: m.name, parameters: m.parameters }))
      json(res, 200, { ok: true, data: { strategies: tunable } })
      return
    }
    if (path === '/api/factory/campaigns') {
      json(res, 200, { ok: true, data: { campaigns: listCampaigns().map(campaignSummary) } })
      return
    }
    if (path === '/api/factory/campaign') {
      const id = url.searchParams.get('id') ?? ''
      const rec = getCampaign(id)
      if (!rec) { json(res, 404, { ok: false, error: `No campaign "${id}"` }); return }
      json(res, 200, { ok: true, data: rec })
      return
    }
    if (path === '/api/factory/run') {
      const id = url.searchParams.get('id') ?? ''
      const method = (url.searchParams.get('method') ?? 'grid') as 'grid' | 'random' | 'evolve'
      const seed = Number(url.searchParams.get('seed') ?? '12345')
      const maxRaw = url.searchParams.get('max')
      const maxGenomes = maxRaw ? Number(maxRaw) : undefined
      if (!strategyIds().includes(id)) { json(res, 400, { ok: false, error: `Unknown strategy "${id}"` }); return }
      const r = await safely(() => runCampaign({ strategyId: id, method, seed, maxGenomes }))
      json(res, 200, r.ok ? { ok: true, data: r.data } : r)
      return
    }
    if (path === '/api/vault/passports') {
      const passports = listPassports()
      const withPromo = passports.map((p) => ({ ...p, promotion: assessPromotion(p) }))
      json(res, 200, { ok: true, data: { passports: withPromo } })
      return
    }
    if (path === '/api/vault/passport') {
      const id = url.searchParams.get('id') ?? ''
      const p = getPassport(id)
      if (!p) { json(res, 404, { ok: false, error: `No passport "${id}"` }); return }
      json(res, 200, { ok: true, data: { passport: p, promotion: assessPromotion(p), champion: champion(p.strategyId)?.id ?? null } })
      return
    }
    if (path === '/api/vault/mint') {
      // Mint a passport from a factory survivor: campaign id + the survivor's genome id.
      const campaignId = url.searchParams.get('campaign') ?? ''
      const genomeId = url.searchParams.get('genome') ?? ''
      const rec = getCampaign(campaignId)
      if (!rec) { json(res, 404, { ok: false, error: `No campaign "${campaignId}"` }); return }
      const survivor = (rec.selection?.all ?? []).find((j) => j.id === genomeId)
      if (!survivor) { json(res, 404, { ok: false, error: `No genome "${genomeId}" in campaign "${campaignId}"` }); return }
      const family = metaById().get(rec.strategyId)?.family
      const p = mint(rec.strategyId, survivor.evaluation.genome, survivor.evaluation.report, { origin: campaignId, family, reason: `Minted from campaign ${campaignId}` })
      json(res, 200, { ok: true, data: { passport: p } })
      return
    }

    if (path === '/api/config') {
      const local = isLocal(req)
      const lan = lanUrls()
      json(res, 200, {
        csrf: CSRF_TOKEN, mode: runtimeMode(), stop: stopState(), version: VERSION,
        symbol: config.symbol, interval: config.interval, strategy: config.strategy, accountSizeUsd: config.accountSizeUsd,
        riskPerTradePercent: config.riskPerTradePercent, feePercent: config.feePercent, execution: config.execution, ict: config.ict, replay: config.replay, memory: config.memory,
        orderflow: config.orderflow, tradingview: { widgetSymbol: config.tradingview.widgetSymbol },
        memoryEmpty: memoryIsEmpty(), ledgerRows: readLedger().length, lessons: lessonLines(), plan: readPlan(), ai: await aiStatus(),
        app: {
          allowPhone: config.app.allowPhone, watchEveryMinutes: config.app.watchEveryMinutes, isLocal: local,
          lanUrls: local ? lan : [],
          webhook: local ? { url: `${lan[0] ?? `http://127.0.0.1:${PORT}`}/api/tv-alert`, secret: WEBHOOK_SECRET } : null,
        },
        journal: { emotions: EMOTIONS, tags: TAGS },
        skills: SKILLS.map(({ id, name, icon, tagline, prompts }) => ({ id, name, icon, tagline, prompts })),
        media: { film: existsSync(join(WEB_DIR, 'media', 'hero.mp4')), poster: existsSync(join(WEB_DIR, 'media', 'hero.jpg')) },
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
      // The old optimistic model, run on the same candles, so the cost of honesty is visible.
      const ideal = r.ok ? await safely(() => runReplay({ useMemory, writeMemory: false, fillModel: 'ideal' })) : null
      json(res, 200, r.ok ? { ...r, score: useMemory ? scoreSkippedTrades(r.data) : null, ideal: ideal && ideal.ok ? { summary: ideal.data.summary } : null } : r)
      return
    }
    if (path === '/api/news') {
      const news = await getNews(url.searchParams.get('force') === '1')
      json(res, 200, { ok: true, data: { ...news, upcoming: upcomingEvents(news) } })
      return
    }
    if (path === '/api/flow') {
      const snap = await snapshot(url.searchParams.get('fresh') === '1')
      const flow = url.searchParams.get('fresh') === '1' ? await getFlow() : snap.flow ?? (await getFlow())
      // The candle-anchored order-flow block (delta, CVD, footprint, absorption) comes from the snapshot.
      const live = snap.analysis?.features.flow ?? null
      // The rolling readings (tape speed, large prints) are measured as of NOW so the tab is not stale.
      const trusted = tradeTape.trustedSince() !== null
      const liveNow = trusted
        ? { trusted, tapeSpeed: tapeSpeed(tradeTape, Date.now(), config.features.tapeWindowSec), largeTrades: largeTrades(tradeTape, Date.now(), config.features.largeTradesWindowMin) }
        : { trusted, tapeSpeed: null, largeTrades: null }
      json(res, 200, { ok: true, data: { ...flow, live, liveNow, history: readFlowLog(288) } })
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
    if (path === '/api/live/status') {
      // Read-only: shows every gate and whether live is armed. It never places an order.
      const last = (await safely(() => snapshot())).ok ? (await snapshot()).candles.slice(-1)[0] : null
      const feedHealthy = last ? (Date.now() - last.closeTime) / 1000 <= config.risk.maxCandleAgeSec : false
      const input = gateInputFromEnv({ testnetTradesReconciled: 0, guardPresent: authed(req), killSwitchEngaged: !entriesAllowed().ok, feedHealthy })
      json(res, 200, { ok: true, data: { armed: liveArmed(input), gates: liveGates(input), venue: config.live.venue, caps: { maxNotionalUsd: config.live.maxNotionalUsd, maxTradesPerDay: config.live.maxTradesPerDay, maxOpenPositions: config.live.maxOpenPositions }, note: 'Live execution is gated and ships closed. This shows the gate chain; it cannot place an order.' } })
      return
    }
    if (path === '/api/shadow') {
      const orders = listShadowOrders()
      const scores = orders.map((o) => scoreShadowOrder(o, [])) // scored against recorded prints elsewhere; here the record + slippage view
      json(res, 200, { ok: true, data: { enabled: shadowEnabled(), orders: orders.slice(-200), slippage: slippageComparison(scores), note: 'Shadow trading builds the order it would send against the live venue and scores it later from real trades. Nothing is ever sent. Off unless a read-only exchange key is set and shadow.enabled is true.' } })
      return
    }
    if (path === '/api/paper') {
      let price: number | undefined
      try { price = (await snapshot()).signal.price } catch { /* stats without unrealized */ }
      const closed = readPositions().closed
      const byStrategy = paperByStrategy(closed)
      const comparison = comparePaperToOos(byStrategy, listPassports(), undefined, undefined, usableOosAvgR)
      json(res, 200, { ok: true, data: { ...paperStats(price), byStrategy, comparison } })
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
    // The extended-paper-validation report: gates, journals, breakdowns, decay, correlation, soak, shadow readiness.
    // Pure over the stored data; reports INSUFFICIENT SAMPLE until every gate is met. No tuning, ever.
    if (path === '/api/validation') {
      let price: number | undefined
      let aiConsistency = null
      try {
        const snap = await snapshot()
        price = snap.signal.price
        // AI-vs-engine consistency, computed live: the CIO decision is the fused decision after risk; the narration is validated against the same context.
        const features = snap.analysis?.features ?? null
        const positions = readPositions()
        const eq = equity(); const peak = Math.max(equityPeak(), eq)
        const last = snap.candles[snap.candles.length - 1]
        const tk = marketFeed.latestTicker
        const gate = entriesAllowed()
        const rstate: RiskState = {
          now: Date.now(), killSwitch: { ok: gate.ok, reason: gate.ok ? '' : gate.reason },
          candleAgeSec: last ? (Date.now() - last.closeTime) / 1000 : null,
          spreadPct: tk && tk.bid > 0 && tk.ask > 0 ? ((tk.ask - tk.bid) / ((tk.ask + tk.bid) / 2)) * 100 : null,
          openPositions: positions.open.length, openNotionalUsd: openNotionalUsd(),
          today: todaysPaperStats(tradingDayKey(Date.now())), equityUsd: eq, peakEquityUsd: peak,
        }
        const fusedSig = snap.decision ? fusedToSignal(snap.decision, price, Date.now()) : null
        const verdict = fusedSig && (fusedSig.action === 'BUY' || fusedSig.action === 'SELL') ? assess({ signal: fusedSig }, rstate) : null
        const ctx = buildNarrationContext({ price, features, decision: snap.decision, risk: verdict })
        const call = cioDecision(ctx.decision, ctx.risk)
        const narration = await narrate(ctx)
        aiConsistency = aiEngineConsistency(decisionLabel(call), decisionLabel(call), narration.valid)
      } catch { /* the report stands without the live snapshot */ }
      const stats = paperStats(price)
      const soak = soakMetrics({ uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000), feedOk: !!marketFeed.health(), storeOk: store().integrity() === 'ok', starts: bootLog()?.starts, recoveries: bootLog()?.recoveries })
      const hasReadOnlyKey = !!(process.env.EXCHANGE_API_KEY && process.env.EXCHANGE_API_SECRET)
      const report = buildValidationReport({
        closed: readPositions().closed,
        passports: listPassports(),
        curve: stats.curve,
        startUsd: stats.startUsd,
        soak,
        version: VERSION,
        hasReadOnlyKey,
        shadowScoredOrders: listShadowOrders().length,
        aiConsistency,
        oosReference: usableOosAvgR,
      })
      if (url.searchParams.get('format') === 'text') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(renderDailyReport(report))
        return
      }
      json(res, 200, { ok: true, data: report })
      return
    }

    /**
     * THE DESK — six agents on one surface. READ-ONLY.
     *
     * It projects state the engine has already produced: the feature snapshot,
     * the strategy votes, the fused decision, the risk verdict, the validation
     * gates. It decides nothing, sizes nothing and cannot place an order. The
     * expensive AI narration the validation route runs is deliberately NOT part
     * of this — the desk is meant to be cheap enough to poll.
     */
    /**
     * The TradingView session script, with its session times generated from
     * config so the chart and the bot can never disagree about when London is.
     * Plain text, GET only, read-only.
     */
    if (path === '/api/pine/sessions') {
      let script: string
      try {
        script = renderSessionScript(readFileSync(join(HERE, '..', 'pine', 'ict-sessions.pine'), 'utf8'))
      } catch (e) {
        json(res, 200, { ok: false, error: `The session script could not be built: ${(e as Error).message}` })
        return
      }
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': url.searchParams.get('download') === '1' ? 'attachment; filename="mr-cash-sessions.pine"' : 'inline',
      })
      res.end(script)
      return
    }

    /**
     * ATTRIBUTION — where the paper result came from, with the error bars that
     * description deserves. Read-only; it reads closed positions and returns
     * numbers, and nothing it produces reaches a trading decision.
     */
    /**
     * THE NEWS READ — the surprise, and whether this symbol actually moves then.
     * Read-only; it describes the blackout windows the risk chain enforces, and
     * has no way to change them.
     */
    if (path === '/api/news/read') {
      const snap = await safely(() => snapshot())
      if (!snap.ok) { json(res, 200, snap); return }
      const s2 = snap.data
      // The window study is only as good as its history: the engine's working
      // set is a few days, which makes every window TOO FEW. Pull a deeper
      // window on demand — this route is not polled, so the extra paging is
      // paid once per look rather than every candle.
      const days = Math.min(90, Math.max(5, Number(url.searchParams.get('days') ?? 30)))
      const perDay = Math.round(86_400_000 / (INTERVAL_MS[config.interval] ?? 300_000))
      const deep = await safely(() => getCandles(config.symbol, config.interval, days * perDay))
      const read = newsRead({
        events: s2.news?.calendar ?? [],
        candles: deep.ok && deep.data.length > s2.candles.length ? deep.data : s2.candles,
        symbol: config.symbol,
        now: Date.now(),
        headlineCount: s2.news?.headlines.length ?? 0,
        // What this symbol did on past instances of THIS release, rather than
        // only what it does at that time of day. Empty on a fresh install and
        // honest about it — the memory accumulates one calendar refresh at a
        // time, and every study says TOO FEW until it has five.
        pastInstances: (e) => pastInstances(e.country, e.title, e.time - 60_000).map((i) => i.time),
      })
      if (url.searchParams.get('format') === 'text') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(renderNewsRead(read))
        return
      }
      json(res, 200, { ok: true, data: read })
      return
    }

    /**
     * WHAT THE CALENDAR MEMORY ACTUALLY HOLDS.
     *
     * The event studies above are only as good as this, and on a fresh install
     * it is empty. Worth being able to look at rather than having to infer it
     * from a page of TOO FEW verdicts.
     */
    if (path === '/api/news/history') {
      const depth = historyDepth()
      json(res, 200, {
        ok: true,
        data: {
          ...depth,
          note: depth.instances === 0
            ? 'Nothing recorded yet. Every calendar refresh folds this week\'s releases in; until a release has five recorded instances, nothing is claimed about it.'
            : `${depth.instances} recorded instances across ${depth.series} releases, ${depth.withActual} of them with a printed figure.`,
          series: allSeries().slice(0, 60).map((s) => ({
            series: s.series, title: s.title, country: s.country,
            instances: s.instances.length,
            withActual: s.instances.filter((i) => i.actual).length,
            first: s.instances[0]?.time ?? null,
            last: s.instances[s.instances.length - 1]?.time ?? null,
          })),
        },
      })
      return
    }

    if (path === '/api/analyst') {
      // PAPER by default. `?source=backtest` runs the same analysis over the
      // last replay instead — populated immediately, worth strictly less, and
      // labelled as such on every rendering so the two can never be confused.
      const report = attributionReport(fromPaper(readPositions().closed), { now: Date.now(), source: 'PAPER' })
      if (url.searchParams.get('format') === 'text') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(renderAttribution(report))
        return
      }
      json(res, 200, { ok: true, data: report })
      return
    }

    /**
     * THE EVIDENCE TAB. Every route reads the store and returns provenance-
     * stamped views; the only writer is the explicit POST that refreshes the
     * cached backtest, which runs a replay and is therefore never on a GET.
     */
    if (path.startsWith('/api/evidence')) {
      const EVIDENCE_DIMS: CohortDimension[] = ['strategyId', 'family', 'session', 'regime', 'volatility', 'symbol', 'interval', 'direction', 'hourET', 'weekdayET', 'exitReason', 'newsBucket', 'qualityBucket']
      const dimOf = (v: string | null, fallback: CohortDimension): CohortDimension => (EVIDENCE_DIMS.includes(v as CohortDimension) ? (v as CohortDimension) : fallback)
      const sourceOf = (v: string | null): 'paper' | 'backtest' => (v === 'backtest' ? 'backtest' : 'paper')
      const strategy = url.searchParams.get('strategy') || tradingStrategyId()
      if (path === '/api/evidence/backtest' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req, 4096)) || '{}') as { strategyId?: string }
        const id = body.strategyId || tradingStrategyId()
        if (id !== 'fused' && !strategyIds().includes(id)) { json(res, 400, { ok: false, error: `Unknown strategy "${id}"` }); return }
        const r = await safely(() => refreshBacktestCache(id))
        if (r.ok) { try { recordTrials({ strategyId: id, source: 'evidence-backtest', count: 1, note: 'Evidence tab backtest refresh' }) } catch { /* the registry is best-effort */ } }
        if (r.ok) eventLog.push('info', `Backtest evidence refreshed for ${id}`, `${r.data.trades.length} SIMULATED trades cached for the Evidence tab.`, 'info')
        json(res, 200, r.ok ? { ok: true, data: { strategyId: r.data.strategyId, trades: r.data.trades.length, computedAt: r.data.computedAt, window: r.data.window } } : r)
        return
      }
      const last = lastStoredCandle(config.symbol, config.interval)
      const inputs: EvidenceInputs = {
        closed: readPositions().closed,
        backtest: cachedBacktest(strategy),
        candlesBetween: (sym, iv, from, to) => store().candlesBetween(sym, iv, from, to),
        stepMs: INTERVAL_MS[config.interval] ?? 300_000,
        feed: { ageSec: last ? Math.round((Date.now() - last.closeTime) / 1000) : null, maxAgeSec: config.risk.maxCandleAgeSec },
      }
      const source = sourceOf(url.searchParams.get('source'))
      if (path === '/api/evidence') { json(res, 200, { ok: true, data: evidenceOverview(inputs) }); return }
      if (path === '/api/evidence/dimension') { json(res, 200, { ok: true, data: dimensionView(inputs, source, dimOf(url.searchParams.get('dim'), 'session'), url.searchParams.get('all') === '1') }); return }
      if (path === '/api/evidence/cross') { json(res, 200, { ok: true, data: crossView(inputs, source, dimOf(url.searchParams.get('rows'), 'session'), dimOf(url.searchParams.get('cols'), 'strategyId')) }); return }
      if (path === '/api/evidence/cohort') {
        let def: CohortDefinition = { name: 'custom', filters: [] }
        try {
          const raw = JSON.parse(url.searchParams.get('filters') || '[]') as Array<{ dimension: string; values: unknown[] }>
          if (!Array.isArray(raw) || raw.length > 8) throw new Error('bad filters')
          def = {
            name: raw.map((f) => `${f.dimension}=${(f.values ?? []).map(String).join('|')}`).join(' + ') || 'all trades',
            filters: raw.map((f) => ({ dimension: dimOf(String(f.dimension), 'session'), values: (Array.isArray(f.values) ? f.values : []).slice(0, 12).map((v) => String(v).slice(0, 40)) })),
          }
        } catch { json(res, 400, { ok: false, error: 'filters must be a JSON array of { dimension, values }' }); return }
        json(res, 200, { ok: true, data: cohortView(inputs, source, def) })
        return
      }
      if (path === '/api/evidence/trades') { json(res, 200, { ok: true, data: tradesView(inputs, source) }); return }
      if (path === '/api/evidence/trade') {
        const d = tradeDetail(inputs, url.searchParams.get('id') || '')
        json(res, d ? 200 : 404, d ? { ok: true, data: d } : { ok: false, error: 'no such paper trade' })
        return
      }
      json(res, 404, { ok: false, error: 'unknown evidence view' })
      return
    }

    /**
     * THE SCHOOL / RESEARCH / KNOWLEDGE TABS (Phase 23). Every handler lives in
     * src/learning/api.ts; this is dispatch only. GETs read; the POSTs are the
     * learner's own actions, hypothesis/proposal/knowledge decisions and the
     * reassessment sweep — all guarded by the same state-change check as every
     * other POST. None of them reaches the engine.
     */
    if (path.startsWith('/api/school') || path.startsWith('/api/research') || path.startsWith('/api/knowledge') || path.startsWith('/api/observer') || path.startsWith('/api/ops')) {
      const q = (k: string) => url.searchParams.get(k)
      const body = async () => JSON.parse((await readBody(req, 64 * 1024)) || '{}') as Record<string, unknown>
      const snapOrNull = async () => { const s = await safely(() => snapshot()); return s.ok ? s.data : null }
      const teacherAi = async (): Promise<learn.Ai> => { const s = await aiStatus(); return s.available ? async (prompt: string, system: string) => (await askAI(prompt, '', [], () => {}, undefined, { name: 'Teacher', system })).text : undefined }
      const routes: Record<string, () => unknown> = {
        'GET /api/school': () => learn.schoolIndex(),
        'GET /api/school/lesson': () => learn.schoolLesson(q('id') || ''),
        'POST /api/school/quiz': async () => learn.schoolQuiz(await body()),
        'POST /api/school/engage': async () => learn.schoolEngage(await body()),
        'GET /api/school/cases': () => learn.schoolCases({ kind: q('kind'), concept: q('concept'), limit: q('limit') }),
        'GET /api/school/case': () => learn.schoolCase(q('id') || ''),
        'GET /api/school/counterexamples': () => learn.schoolCounterexamples(q('kind')),
        'GET /api/school/replay': () => learn.schoolReplay(),
        'GET /api/school/replay/stop': () => learn.schoolReplayStop(Number(q('k'))),
        'POST /api/school/replay/answer': async () => learn.schoolReplayAnswer(await body()),
        'GET /api/school/debate': async () => { const s = await snapOrNull(); if (!s) throw new learn.ApiError(503, 'no market snapshot yet'); return learn.schoolDebate(s) },
        'POST /api/school/teach': async () => learn.schoolTeach(await body(), await snapOrNull(), await teacherAi()),
        'GET /api/school/why': () => learn.schoolWhy({ type: q('type'), strategy: q('strategy') }),
        'GET /api/school/progress': () => learn.schoolIndex().progress,
        'GET /api/school/prediction-market': () => learn.schoolPredictionMarket({ yes: q('yes'), no: q('no'), fee: q('fee'), slip: q('slip'), p: q('p') }),
        'GET /api/research': () => learn.researchIndex(q('strategy')),
        'GET /api/research/questions': () => learn.researchIndex(q('strategy')).questions,
        'POST /api/research/hypothesis': async () => learn.researchCreateHypothesis(await body()),
        'GET /api/research/hypotheses': () => learn.researchHypotheses({ status: q('status'), strategy: q('strategy') }),
        'GET /api/research/hypothesis': () => learn.researchHypothesis(q('id') || ''),
        'POST /api/research/hypothesis/test': async () => learn.researchTestHypothesis(await body()),
        'POST /api/research/hypothesis/review': async () => learn.researchReviewHypothesis(await body()),
        'GET /api/research/overfitting': () => learn.researchOverfitting(q('strategy')),
        'GET /api/research/atlas': () => learn.researchAtlas({ source: q('source'), dim: q('dim'), strategy: q('strategy') }),
        'GET /api/research/diffusion': () => learn.researchDiffusion(),
        'GET /api/research/proposals': () => learn.researchProposals({ status: q('status'), strategy: q('strategy') }),
        'POST /api/research/proposal': async () => learn.researchCreateProposal(await body()),
        'POST /api/research/proposal/decide': async () => learn.researchDecideProposal(await body()),
        'POST /api/research/trial': async () => learn.researchRecordTrial(await body()),
        'GET /api/knowledge': () => learn.knowledgeIndex({ kind: q('kind'), status: q('status'), tag: q('tag'), limit: q('limit') }),
        'GET /api/knowledge/item': () => learn.knowledgeItem(q('id') || ''),
        'POST /api/knowledge/review': async () => learn.knowledgeReview(await body()),
        'POST /api/knowledge/note': async () => learn.knowledgeNote(await body()),
        'GET /api/knowledge/passport': () => learn.knowledgePassport(q('strategy')),
        'GET /api/knowledge/brief': () => learn.knowledgeBrief(),
        'GET /api/knowledge/eod': () => learn.knowledgeEndOfDay(),
        'GET /api/knowledge/weekly': () => learn.knowledgeWeekly(),
        'POST /api/knowledge/reassess': () => learn.knowledgeReassess(),
        'POST /api/knowledge/backfill': () => learn.knowledgeBackfill(),
        'GET /api/knowledge/graph': () => learn.knowledgeGraph(),
        // Phase 24 — the live observer, research ops and the panels that read them. Every POST is a research-store write; none reaches the engine.
        'GET /api/observer': () => learn.observerIndex(),
        'GET /api/observer/replay': () => learn.observerReplay(q('id') || ''),
        'GET /api/observer/observations': () => learn.observerObservations({ type: q('type'), status: q('status'), min: q('min'), limit: q('limit'), from: q('from') }),
        'POST /api/observer/resolve': () => learn.observerResolve(),
        'GET /api/ops': () => learn.opsStatus(marketFeed.health()),
        'GET /api/ops/state': () => learn.opsState(),
        'POST /api/ops/run': () => learn.opsRun(),
        // Phase 25 — operations: the health document, heartbeat, feed health, soak, performance, integrity, reconciliation, checkpoints, the ops log, retries.
        'GET /api/ops/health': () => opsApi.opsHealthView(marketFeed.health(), watcher.lastError()),
        'GET /api/ops/heartbeat': () => opsApi.opsHeartbeat(marketFeed.health()),
        'GET /api/ops/feed': () => opsApi.opsFeed(marketFeed.health()),
        'GET /api/ops/soak': () => opsApi.opsSoak(),
        'GET /api/ops/performance': () => opsApi.opsPerformance(),
        'GET /api/ops/integrity': () => opsApi.opsIntegrity({ run: q('run'), history: q('history') }),
        'GET /api/ops/reconciliation': () => opsApi.opsReconciliation({ run: q('run'), limit: q('limit') }),
        'GET /api/ops/checkpoints': () => opsApi.opsCheckpoints(),
        'POST /api/ops/checkpoints/reviewed': async () => opsApi.opsCheckpointReviewed(await body()),
        'GET /api/ops/log': () => opsApi.opsLogView({ severity: q('severity'), component: q('component'), n: q('n') }),
        'GET /api/ops/first-fill': () => opsApi.opsFirstFill(),
        'GET /api/ops/day': () => opsApi.opsDay({ day: q('day'), store: q('store') }, marketFeed.health(), watcher.lastError()),
        'GET /api/ops/days': () => opsApi.opsDays(),
        'GET /api/ops/retries': () => opsApi.opsRetries(),
        'POST /api/ops/retries/run': () => opsApi.opsRetriesRun(RETRY_HANDLERS),
        'GET /api/research/queue': () => learn.researchQueue({ status: q('status'), origin: q('origin'), maturity: q('maturity'), limit: q('limit') }),
        'POST /api/research/queue/generate': () => learn.researchQueueGenerate(),
        'POST /api/research/queue/status': async () => learn.researchQueueStatus(await body()),
        'GET /api/research/experiments': () => learn.researchExperiments({ strategy: q('strategy'), status: q('status'), result: q('result'), hypothesis: q('hypothesis'), limit: q('limit') }),
        'GET /api/research/experiment': () => learn.researchExperiment(q('id') || ''),
        'POST /api/research/sandbox': async () => learn.researchSandbox(await body()),
        'GET /api/research/champion': () => learn.researchChampion(q('strategy')),
        'GET /api/research/recommend': () => learn.researchRecommend(),
        'GET /api/research/drift': () => learn.researchDrift(q('strategy')),
        'GET /api/research/review': () => learn.researchReviewQueue(),
        'GET /api/research/review/card': () => learn.researchReviewCard(q('id') || ''),
        'POST /api/research/review/decide': async () => learn.researchReviewDecide(await body()),
        'GET /api/knowledge/memory': () => learn.knowledgeMemory({ class: q('class'), tag: q('tag'), limit: q('limit') }),
        'GET /api/knowledge/recall': () => learn.knowledgeRecall({ q: q('q'), limit: q('limit') }),
        'GET /api/knowledge/failures': () => learn.knowledgeFailures({ kind: q('kind'), strategy: q('strategy'), limit: q('limit') }),
        'GET /api/knowledge/decay': () => learn.knowledgeDecay(),
        'POST /api/knowledge/decay/run': () => learn.knowledgeDecayRun(),
        'GET /api/knowledge/digests': () => learn.knowledgeDigests(),
        'GET /api/knowledge/digest': () => learn.knowledgeDigest(q('id') || ''),
        'GET /api/knowledge/digest/today': () => learn.knowledgeDigestToday(),
        'GET /api/knowledge/research-week': () => learn.knowledgeResearchWeek(),
        'GET /api/knowledge/audit': () => learn.knowledgeAudit(),
        'GET /api/school/exercises': () => learn.schoolExercises({ concept: q('concept'), limit: q('limit') }),
        'POST /api/school/exercise': async () => learn.schoolExerciseAnswer(await body()),
        'GET /api/school/lesson/versions': () => learn.schoolLessonVersions(q('id')),
        'GET /api/school/changes': () => learn.schoolCurriculumChanges({ since: q('since') }),
      }
      const has = (k: string) => Object.prototype.hasOwnProperty.call(routes, k)
      if (!has(`${req.method} ${path}`)) {
        const otherMethod = req.method === 'POST' ? 'GET' : 'POST'
        const other = has(`${otherMethod} ${path}`)
        json(res, other ? 405 : 404, { ok: false, error: other ? `${path} is ${otherMethod}-only` : 'unknown learning view' })
        return
      }
      const handler = routes[`${req.method} ${path}`]
      try { json(res, 200, { ok: true, data: await handler() }) } catch (err) {
        const e = err as Error
        json(res, e instanceof learn.ApiError || e instanceof opsApi.OpsApiError ? e.status : 500, { ok: false, error: e.message })
      }
      return
    }

    if (path === '/api/desk') {
      const snap = await safely(() => snapshot())
      if (!snap.ok) { json(res, 200, snap); return }
      const s = snap.data
      const positions = readPositions()
      const eq = equity(); const peak = Math.max(equityPeak(), eq)
      const last = s.candles[s.candles.length - 1]
      const tk = marketFeed.latestTicker
      const gate = entriesAllowed()
      const rstate: RiskState = {
        now: Date.now(), killSwitch: { ok: gate.ok, reason: gate.ok ? '' : gate.reason },
        candleAgeSec: last ? (Date.now() - last.closeTime) / 1000 : null,
        spreadPct: tk && tk.bid > 0 && tk.ask > 0 ? ((tk.ask - tk.bid) / ((tk.ask + tk.bid) / 2)) * 100 : null,
        openPositions: positions.open.length, openNotionalUsd: openNotionalUsd(),
        today: todaysPaperStats(tradingDayKey(Date.now())), equityUsd: eq, peakEquityUsd: peak,
      }
      const fusedSig = s.decision ? fusedToSignal(s.decision, s.signal.price, Date.now()) : null
      const verdict = fusedSig && (fusedSig.action === 'BUY' || fusedSig.action === 'SELL') ? assess({ signal: fusedSig }, rstate) : null

      const stats = paperStats(s.signal.price)
      const passports = listPassports()
      const gates = evaluateGates({
        closed: positions.closed, passports, curve: stats.curve, startUsd: stats.startUsd,
        soak: soakMetrics({ uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000), feedOk: !!marketFeed.health(), storeOk: store().integrity() === 'ok', starts: bootLog()?.starts, recoveries: bootLog()?.recoveries }),
        quality: dataQuality(positions.closed),
        oosReference: usableOosAvgR,
      })
      const decay = decayByStrategy(positions.closed, passports)
      const a = s.analysis

      const desk = buildDesk({
        now: Date.now(),
        symbol: config.symbol,
        interval: config.interval,
        features: a?.features ?? null,
        votes: s.strategyVotes,
        decision: s.decision,
        risk: verdict,
        structure: a
          ? { swings: a.swings?.length ?? 0, orderBlocks: a.orderBlocks?.length ?? 0, fvgs: a.fvgs?.length ?? 0, sweeps: (a.sweepsToday?.length ?? 0) + (a.swingSweepsToday?.length ?? 0), bias: a.bias?.direction ?? null }
          : null,
        validation: {
          verdict: gates.verdict, metCount: gates.metCount, total: gates.total,
          trades: positions.closed.filter((p) => p.exitReason !== 'missed').length,
          decaying: decay.filter((d) => d.status === 'DECAYING').length,
          retired: decay.filter((d) => d.status === 'RETIRED').length,
        },
        // For the signal core's small charts and stat strip: stored candles and the paper record, read, not estimated.
        candles: store().candlesBetween(config.symbol, config.interval, Date.now() - 7 * 86_400_000, Date.now()),
        paper: (() => {
          const all = [...positions.open, ...positions.closed]
          const closed = positions.closed.filter((p) => p.exitReason !== 'missed')
          return {
            signals: all.length,
            fills: all.filter((p) => p.filledAt !== undefined && p.exitReason !== 'missed').length,
            closed: closed.length,
            wins: closed.filter((p) => p.outcome === 'WIN').length,
            losses: closed.filter((p) => p.outcome === 'LOSS').length,
            sumR: closed.reduce((s, p) => s + (p.rMultiple ?? 0), 0),
          }
        })(),
      })
      if (url.searchParams.get('format') === 'text') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(renderDesk(desk))
        return
      }
      // Self-learning at a glance: the research scheduler's own saved state, read only.
      const ops = learn.opsState()
      const lastSteps = ops.lastReport?.steps ?? []
      const learning = { runs: ops.runs, candlesObserved: ops.cycles, lastRun: ops.lastRun, nextRun: ops.nextRun, running: ops.running, stepsOk: lastSteps.filter((x) => x.ok).length, steps: lastSteps.length, lastError: ops.lastError ? ops.lastError.message : null }
      json(res, 200, { ok: true, data: { ...desk, learning } })
      return
    }

    // ---------------------------------------------------------------
    // Mr. Cash intelligence layer (Phase 22). READ-ONLY, every route GET.
    // It projects engine state onto annotations and explanations; it cannot
    // produce a signal, size a position, veto a trade or place an order.
    // ---------------------------------------------------------------
    if (path === '/api/intel/flags') {
      json(res, 200, { ok: true, data: { flags: intelFlags(), note: 'Read-only visualization flags. None of these is a trading-execution flag; execution gates are unchanged.' } })
      return
    }
    if (path.startsWith('/api/intel/')) {
      if (!intelEnabled('enabled')) { json(res, 200, disabledPayload('enabled')); return }
      const snap = await safely(() => snapshot())
      if (!snap.ok) { json(res, 200, snap); return }
      const s = snap.data
      const a = s.analysis

      // The risk verdict on the engine's own candidate — read, never re-decided.
      let verdict: RiskVerdict | null = null
      try {
        const positions = readPositions()
        const eq = equity(); const peak = Math.max(equityPeak(), eq)
        const last = s.candles[s.candles.length - 1]
        const tk = marketFeed.latestTicker
        const gate = entriesAllowed()
        const rstate: RiskState = {
          now: Date.now(), killSwitch: { ok: gate.ok, reason: gate.ok ? '' : gate.reason },
          candleAgeSec: last ? (Date.now() - last.closeTime) / 1000 : null,
          spreadPct: tk && tk.bid > 0 && tk.ask > 0 ? ((tk.ask - tk.bid) / ((tk.ask + tk.bid) / 2)) * 100 : null,
          openPositions: positions.open.length, openNotionalUsd: openNotionalUsd(),
          today: todaysPaperStats(tradingDayKey(Date.now())), equityUsd: eq, peakEquityUsd: peak,
        }
        const cand = a && (a.signal.action === 'BUY' || a.signal.action === 'SELL') ? a.signal : null
        if (cand) verdict = assess({ signal: cand }, rstate)
      } catch { /* the intel view stands without a live risk verdict */ }

      const pos = readPositions()
      const intel: IntelSnapshot = {
        symbol: config.symbol,
        timeframe: config.interval,
        engineVersion: VERSION,
        candles: s.candles,
        analysis: a,
        votes: s.strategyVotes,
        decision: s.decision,
        news: s.news,
        risk: verdict,
        metaById: metaById(),
        trades: [...pos.open, ...pos.closed].map((p) => ({
          id: p.id, openedAt: p.openedAt, filledAt: p.filledAt, closedAt: p.closedAt, setupKey: p.setupKey,
          direction: p.direction, intendedEntry: p.intendedEntry, entry: p.entry, stop: p.stop, target: p.target,
          quantity: p.quantity, riskUsd: p.riskUsd, status: p.status, exitReason: p.exitReason, exit: p.exit,
          rMultiple: p.rMultiple, candlesHeld: p.candlesHeld, note: p.note,
        })),
      }

      if (path === '/api/intel/annotations') {
        if (!intelEnabled('chartMarkup')) { json(res, 200, disabledPayload('chartMarkup')); return }
        json(res, 200, { ok: true, data: intelAnnotations(intel) })
        return
      }
      if (path === '/api/intel/trade') {
        json(res, 200, { ok: true, data: intelTrade(intel) })
        return
      }
      if (path === '/api/intel/trade/stages') {
        const id = url.searchParams.get('id') ?? ''
        const stages = intelTradeStages(intel, id)
        json(res, stages ? 200 : 404, stages ? { ok: true, data: stages } : { ok: false, error: `No paper trade with id "${id}".` })
        return
      }
      if (path === '/api/intel/timeline') {
        json(res, 200, { ok: true, data: intelTimeline(intel) })
        return
      }
      if (path === '/api/intel/changes') {
        json(res, 200, { ok: true, data: intelChanges(intel) })
        return
      }
      if (path === '/api/intel/alerts') {
        if (!intelEnabled('alertCenter')) { json(res, 200, disabledPayload('alertCenter')); return }
        json(res, 200, { ok: true, data: intelAlerts(intel) })
        return
      }
      if (path === '/api/intel/export/pine') {
        if (!intelEnabled('tradingViewExport')) { json(res, 200, disabledPayload('tradingViewExport')); return }
        const out = intelPine(intel)
        if (url.searchParams.get('format') === 'text') {
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${out.filename}"` })
          res.end(out.source)
          return
        }
        json(res, 200, { ok: true, data: out })
        return
      }
      if (path === '/api/intel/explain') {
        if (!intelEnabled('aiExplanation')) { json(res, 200, disabledPayload('aiExplanation')); return }
        const topic = (url.searchParams.get('topic') ?? 'why-this-trade') as ExplainTopic
        const annotationId = url.searchParams.get('id') ?? undefined
        const ctx = intelExplainContext(intel, topic, annotationId)
        const status = await aiStatus()
        const aiFn = status.available
          ? async (prompt: string, system: string) => (await askAI(prompt, '', [], () => {}, undefined, { name: 'Explainer', system })).text
          : undefined
        const answer = await explain(ctx, aiFn)
        json(res, 200, { ok: true, data: { ...answer, topic, engineDecision: ctx.engineDecision, aiAvailable: status.available, cited: ctx.annotations.length } })
        return
      }
      json(res, 404, { ok: false, error: `Unknown intelligence route "${path}".` })
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
    // A chart screenshot, read by the AI into a fixed shape the page draws on the picture.
    if (path === '/api/scanner/picture' && req.method === 'POST') {
      const status = await aiStatus()
      if (!status.available) { json(res, 200, { ok: false, error: status.reason }); return }
      const body = JSON.parse((await readBody(req)) || '{}') as { image?: string; note?: string }
      const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(String(body.image ?? ''))
      if (!m) { json(res, 200, { ok: false, error: 'Attach a PNG, JPEG, GIF or WebP picture.' }); return }
      let context = 'Live market data was not available. Work from the picture only.'
      try { context = contextFor(await snapshot()) } catch { /* picture-only is fine */ }
      const note = String(body.note ?? '').trim().slice(0, 300)
      try {
        const out = await askAIJson(PICTURE_INSTRUCTIONS + (note ? `\n\nThe user adds: ${note}` : ''), context, { mediaType: m[1] as AiImage['mediaType'], data: m[2] }, PICTURE_SCHEMA)
        if (!out.json) { json(res, 200, { ok: false, error: out.reason ?? 'No answer.', costUsd: out.costUsd }); return }
        json(res, 200, { ok: true, data: { ...cleanPictureRead(out.json), model: out.model, costUsd: Math.round(out.costUsd * 10000) / 10000, note: 'A read of a picture by the AI. Prices are as it read them from the image, not checked against market data. Not advice, and Mr. Cash does not trade on it.' } })
      } catch (err) { json(res, 200, { ok: false, error: await explainAiError(err) }) }
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
  // Windows: `start` is a cmd.exe builtin, so it runs through `cmd /c` with verbatim arguments
  // rather than `shell: true` (Node 24 deprecates passing args to a shell; the URL is built by us,
  // never from input). The empty "" is the window title `start` expects before a quoted target.
  const win = process.platform === 'win32'
  const cmd = process.platform === 'darwin' ? 'open' : win ? 'cmd' : 'xdg-open'
  const args = win ? ['/c', 'start', '""', target] : [target]
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: win, windowsHide: true })
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

/**
 * Startup recovery, and the record that it happened.
 *
 * The server never ran `recoverOpenPositions()` — only the `npm run watch` CLI
 * did — so a restart re-adopted positions silently (the store is durable and
 * `managePositions` reads from it, so nothing was ever orphaned, but nothing was
 * reported either). More to the point, nothing counted restarts at all, which is
 * why the soak gate's `recoveries` had been a permanent zero.
 */
// Phase 25: one process per data directory. A second `npm start` on the same
// data folder would run a second watch loop and a second research scheduler
// against one store — two engines, duplicate decisions. It is refused here
// with the owner named; a lock whose owner is dead or silent is taken over.
const lock = holdLock({ role: 'app', force: process.env.MRCASH_FORCE_LOCK === '1', log: (line) => console.log(ui.warn(`  ${line}`)) })
if (!lock.ok) {
  console.log('')
  console.log(ui.bad(`  ${lock.reason}`))
  console.log(ui.dim('  Set MRCASH_FORCE_LOCK=1 only if you have already stopped that process yourself.'))
  console.log('')
  process.exit(1)
}
const startupRecovery = recoverOpenPositions()
const boots = recordStart(startupRecovery.positions.length > 0)

// The market feed (live stream + REST heartbeat) starts first so the watch
// loop has candle closes to react to. Then the loop, declared before
// listen() so the routes can read it.
marketFeed.start()
const watcher = startWatch(config.app.watchEveryMinutes, (e) => {
  const mark = e.severity === 'action' ? ui.good('●') : e.severity === 'warn' ? ui.warn('●') : ui.dim('●')
  console.log(`${ui.dim(new Date(e.time).toLocaleTimeString())}  ${mark} ${ui.bold(e.title)} ${ui.dim('— ' + e.body.slice(0, 110))}`)
})
// Phase 24: research ops — observes each cycle off the bus and runs one bounded
// research tick on its own timer. It reads the watcher's snapshot for the
// current regime and nothing else; the watcher never reads it back.
startResearchOps({
  deps: { currentRegime: () => watcher.current()?.snap.analysis?.features.regime.value?.state ?? null },
  log: (line) => console.log(ui.dim(`${new Date().toLocaleTimeString()}  ○ ${line}`)),
})
// Phase 25: the ops monitor — heartbeat, feed health, soak counters, daily
// integrity and alerts through the bell. It reads; the bell is passed in.
startOpsMonitor({
  feed: () => marketFeed.health(),
  alert: (title, body, severity) => { eventLog.push('info', title, body, severity) },
  engineError: () => watcher.lastError(),
  events: eventLog,
  log: (line) => console.log(ui.warn(`${new Date().toLocaleTimeString()}  ● ${line}`)),
})

// The market watch: every market on the list, rescanned in the background.
// MRCASH_MARKETS=0 turns the background loop off (the page still loads on demand).
const marketWatch = new MarketWatch({ alert: (title, body) => { eventLog.push('info', title, body, 'info') } })
// Big money: disclosed congress and insider trades, off-exchange volume, most-traded stocks.
// Read-only, a few times a day, and never seen by the engine. Follows the same switch.
const evidenceCache = new Map<string, { at: number; data: unknown }>()
const bigMoney = new BigMoney({ alert: (title, body) => { eventLog.push('info', title, body, 'info') } })
// The call desk: an up-or-down forecast every 15 minutes on the bot's own symbol, scored on paper. MRCASH_CALLS=0 turns it off.
const callDesk = new CallDesk({ symbol: config.symbol, windowMinutes: Number(process.env.MRCASH_CALL_MINUTES) || 15, candles: (limit) => storedCandles(config.symbol, '5m', limit) })

server.listen(PORT, host, () => {
  if (process.env.MRCASH_MARKETS !== '0') { marketWatch.start(); bigMoney.start() }
  if (process.env.MRCASH_CALLS !== '0') callDesk.start()
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
    console.log(loginGate.needsCode()
      ? ui.dim('  Same wifi only. Other devices need the PIN AND the 6-digit code from your authenticator app.')
      : ui.warn('  Same wifi only. Other devices need only the PIN — run npm run vault:setup to add an authenticator code.'))
    console.log(ui.dim('  Then Share → Add to Home Screen.'))
  } else {
    console.log(ui.dim('  Phone access is off. Set app.allowPhone: true in config.ts to turn it on.'))
  }
  console.log(`  TradingView webhook secret: ${ui.dim(WEBHOOK_SECRET)}  ${ui.dim('(the TradingView tab explains where it goes)')}`)
  console.log('')
  console.log(ui.dim(`  Prices: ${marketFeed.describe()}. Reacting to every candle close, with a safety poll every ${config.app.watchEveryMinutes} minutes; alerts show here and in the app's bell.`))
  if (startupRecovery.positions.length) console.log(ui.dim(`  ${startupRecovery.summary}`))
  if (boots.starts > 1) console.log(ui.dim(`  Start #${boots.starts}${boots.recoveries ? `, ${boots.recoveries} of them recovering a live position` : ''} — the ${config.paperValidation.gates.minSoakHours}h soak clock restarts from zero now.`))
  bus.on('stream:up', (h) => console.log(ui.dim(`${new Date().toLocaleTimeString()}  ● live stream connected (${h.host})`)))
  bus.on('stream:down', (_h, reason) => console.log(ui.warn(`${new Date().toLocaleTimeString()}  ● live stream down — ${reason}. Polling over REST until it is back.`)))
  console.log(ui.dim('  To stop: press Ctrl+C in this window.'))
  console.log('')
  if (process.env.NO_BROWSER !== '1') openBrowser(address)
})
