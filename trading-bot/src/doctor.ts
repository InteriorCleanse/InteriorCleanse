/**
 * `npm run doctor` — is everything connected?
 *
 * Checks each feed and each optional piece, says what works, what
 * doesn't, and exactly what to do about it. Nothing here is faked: a
 * check that can't be performed says so instead of guessing.
 */

import { existsSync, readFileSync, accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { networkInterfaces } from 'node:os'
import { pathToFileURL } from 'node:url'
import { config, newsSources } from '../config.ts'
import { getCandles } from './market.ts'
import { getFlow } from './orderflow.ts'
import { probeNews } from './news.ts'
import { aiStatus, pingAI } from './ai.ts'
import { DATA_DIR, ensureDataDir, readLedger, lessonLines } from './memory.ts'
import { readPlan } from './plan.ts'
import { store, DB_PATH } from './store.ts'
import * as ui from './ui.ts'

export type Check = { name: string; ok: boolean | null; detail: string; fix?: string }

export function lanUrls(port = config.webPort): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === 'IPv4' && !ni.internal) out.push(`http://${ni.address}:${port}`)
  }
  return out
}

export async function runDoctor(): Promise<Check[]> {
  const checks: Check[] = []
  const [major, minor] = process.versions.node.split('.').map(Number)
  checks.push({ name: 'Node', ok: major > 22 || (major === 22 && minor >= 18), detail: `v${process.versions.node}`, fix: 'Install the LTS from nodejs.org.' })

  try {
    ensureDataDir()
    accessSync(DATA_DIR, constants.W_OK)
    checks.push({ name: 'Data folder', ok: true, detail: DATA_DIR })
  } catch {
    checks.push({ name: 'Data folder', ok: false, detail: DATA_DIR, fix: 'The folder is not writable. Move the bot somewhere you own, like your home folder.' })
  }
  try {
    const s = store()
    const integrity = s.integrity()
    const c = s.counts()
    checks.push({ name: 'Store', ok: integrity === 'ok', detail: `${DB_PATH} — ${integrity}; ${c.ledger} decisions, ${c.positionsOpen + c.positionsClosed} paper positions, ${c.events} events, ${c.journal} journal entries${s.migration() ? `; flat files imported ${s.migration()!.at.slice(0, 10)}` : ''}`, fix: 'The database failed its own consistency check. Stop the bot, copy data/mrcash.db somewhere safe, and run npm run doctor again.' })
  } catch (err) {
    checks.push({ name: 'Store', ok: false, detail: err instanceof Error ? err.message : String(err), fix: 'The database could not be opened. Check the data folder is writable and not on a network drive.' })
  }

  try {
    const c = await getCandles(config.symbol, config.interval, 3)
    checks.push({ name: 'Prices', ok: true, detail: `${config.symbol} ${config.interval} — last close $${c[c.length - 1].close.toFixed(2)}` })
  } catch (err) {
    checks.push({ name: 'Prices', ok: false, detail: err instanceof Error ? err.message : String(err), fix: 'No internet, or your network blocks the exchange. Try a phone hotspot or a VPN.' })
  }

  const flow = await getFlow()
  checks.push({ name: 'Order book', ok: !!flow.book, detail: flow.book ? `${flow.book.levelsRead} levels read, ${flow.book.walls.length} wall(s)` : flow.errors.find((e) => e.startsWith('Order book')) ?? 'off', fix: 'Same fix as prices.' })
  checks.push({ name: 'Trade tape', ok: !!flow.tape, detail: flow.tape ? `${flow.tape.trades} recent trades, ${Math.round(flow.tape.buyShare * 100)}% buys` : flow.errors.find((e) => e.startsWith('Recent')) ?? 'off', fix: 'Same fix as prices.' })

  for (const p of await probeNews()) checks.push({ name: `News: ${p.name}`, ok: p.ok, detail: p.detail, fix: 'The bot carries on without it. If all feeds fail, check your connection.' })

  const ai = await aiStatus()
  if (!ai.available) {
    checks.push({ name: 'AI assistant', ok: null, detail: ai.reason, fix: 'Optional. Copy .env.example to .env, add ANTHROPIC_API_KEY, run npm install once.' })
  } else {
    const ping = await pingAI()
    checks.push({ name: 'AI assistant', ok: ping.ok, detail: ping.ok ? `${ai.model} — key accepted` : ping.detail, fix: 'Check the key in .env; make a new one at console.anthropic.com if needed.' })
  }

  const tvLog = join(DATA_DIR, 'tv-alerts.csv')
  const tvCount = existsSync(tvLog) ? Math.max(0, readFileSync(tvLog, 'utf8').split('\n').filter((l) => l.trim()).length - 1) : 0
  checks.push({
    name: 'TradingView alerts',
    ok: tvCount > 0 ? true : null,
    detail: tvCount > 0 ? `${tvCount} alert(s) received` : 'none received yet',
    fix: 'Optional. Open the TradingView tab in the app for the webhook URL and secret, then create an alert on the Mr. Cash indicator with that webhook.',
  })

  const lan = lanUrls()
  checks.push({
    name: 'Phone access',
    ok: config.app.allowPhone ? true : null,
    detail: config.app.allowPhone ? `on — ${lan.join(', ') || 'no network address found'}` : 'off (this computer only)',
    fix: 'Optional. Set app.allowPhone: true in config.ts, start the app, and open the printed address on your phone with the PIN.',
  })

  const plan = readPlan()
  checks.push({ name: "Today's plan", ok: plan ? true : null, detail: plan ? `${plan.allow}, ${plan.riskPerTradePercent}% risk, max ${plan.maxTrades}` : 'none armed', fix: 'npm run talk → arm' })
  checks.push({ name: 'Memory', ok: true, detail: `${readLedger().length} decisions, ${lessonLines().length} lessons` })
  checks.push({ name: 'Other repos', ok: null, detail: 'AutoHedge, Vibe-Trading and FinceptTerminal are NOT part of Mr. Cash', fix: 'By design. See docs/OTHER_TOOLS.md for what each is and how Vibe-Trading connects to Claude as an MCP server.' })
  return checks
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ui.heading('MR. CASH — DOCTOR')
  ui.safetyBanner()
  ui.step('Checking every connection...')
  const checks = await runDoctor()
  console.log('')
  for (const c of checks) {
    const mark = c.ok === true ? ui.good('✓') : c.ok === false ? ui.bad('✗') : ui.dim('–')
    console.log(`  ${mark} ${ui.bold(c.name.padEnd(22))} ${c.detail}`)
    if (c.ok !== true && c.fix) console.log(ui.dim(`      → ${c.fix}`))
  }
  const bad = checks.filter((c) => c.ok === false).length
  ui.plainEnglish(bad === 0 ? ['Everything required is connected. Optional pieces marked "–" are off,', 'which is fine — each line says how to turn it on.'] : [`${bad} required connection(s) failed. The → lines say what to do.`, 'Mr. Cash refuses to guess when a feed is down, so fix those first.'])
  console.log('')
}
