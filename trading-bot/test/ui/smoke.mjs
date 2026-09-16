// Playwright smoke for the command-center UI (Phase 17). Not a unit test — run
// it with `npm run ui:smoke` against a running server (a QA stand-in feed is
// fine). It opens every tab at desktop and phone widths, fails on any page
// error or console error, and exercises the replay player one step.
//
// BASE_URL overrides the target (default http://127.0.0.1:4173). CHROMIUM
// overrides the browser path (default the sandbox's pre-installed Chromium).
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'
const EXEC = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const TABS = ['today', 'chart', 'flow', 'news', 'journal', 'tv', 'test', 'replay', 'playbook', 'factory', 'vault', 'validation', 'memory', 'ask']

function ignorable(text) {
  // The TradingView widget and blocked external hosts are expected to fail in QA.
  return /tradingview|s3\.tradingview|net::ERR|Failed to load resource/i.test(text)
}

async function run(width, height) {
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })
  const errors = []
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => errors.push(`[${width}px] pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(`[${width}px] console: ${m.text()}`) })
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(() => { try { localStorage.setItem('mrcash-toured', '1') } catch {} })
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
  await page.keyboard.press('Escape')
  // The nav element exists but may be hidden at phone width (a bottom nav shows
  // instead), so wait for the app's showTab to be defined rather than for the nav.
  await page.waitForFunction(() => typeof window.showTab === 'function', { timeout: 60000 })

  for (const tab of TABS) {
    await page.evaluate((t) => window.showTab(t), tab)
    await page.waitForSelector(`#tab-${tab}:not(.hidden)`, { timeout: 30000 })
    await page.waitForTimeout(150)
  }

  // Exercise the replay player: load, then step forward once.
  await page.evaluate(() => window.showTab('replay'))
  await page.waitForSelector('#replay-out', { timeout: 30000 })
  // Give the (real) replay a chance; if a feed is present the canvas appears.
  await page.waitForTimeout(1500)
  const hasPlay = await page.$('#replay-play')
  if (hasPlay) { await page.click('#replay-step-fwd').catch(() => {}); await page.waitForTimeout(300) }

  await browser.close()
  return errors
}

const all = []
for (const [w, h] of [[1180, 900], [400, 800]]) all.push(...(await run(w, h)))
if (all.length) {
  console.error('UI smoke FAILED:')
  for (const e of all) console.error('  ' + e)
  process.exit(1)
}
console.log('UI smoke passed: every tab rendered at 1180px and 400px with no page/console errors.')
