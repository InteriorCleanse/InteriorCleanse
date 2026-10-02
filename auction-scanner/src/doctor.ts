/**
 * `node src/doctor.ts` — what is connected, what is missing, and the fix for
 * each. Prints PASS, WARN or INFO lines. Never prints a secret.
 */
import { accessSync, constants, existsSync } from 'node:fs'
import { ENV_PATH, env, flag, loadEnv } from './env.ts'
import { sourceStatuses } from './sources/registry.ts'
import { aiStatus } from './ai.ts'
import { DATA_DIR, ensureDataDir } from './store.ts'
import { VERSION } from './version.ts'
import { BRAND } from './brand.ts'
import * as ui from './ui.ts'

type Level = 'PASS' | 'WARN' | 'INFO'
function say(level: Level, title: string, detail = ''): void {
  const tag = level === 'PASS' ? ui.good('PASS') : level === 'WARN' ? ui.warn('WARN') : ui.dim('INFO')
  ui.line(`${tag}  ${title}${detail ? `\n        ${ui.dim(detail)}` : ''}`)
}

loadEnv()
ui.heading(`${BRAND} ${VERSION} — doctor`)

const [major, minor] = process.versions.node.split('.').map(Number)
if (major > 22 || (major === 22 && minor >= 18)) say('PASS', `Node ${process.versions.node}`)
else say('WARN', `Node ${process.versions.node} is too old`, 'Install Node 22.18 or newer from nodejs.org.')

if (existsSync(ENV_PATH)) say('PASS', '.env found')
else say('INFO', 'No .env file', 'Copy .env.example to .env to connect a source, fix the PIN or turn on the AI explainer. The app runs without it, showing SAMPLE cars.')

for (const s of sourceStatuses()) {
  if (s.kind !== 'api') continue
  say(s.connected ? 'PASS' : 'WARN', `${s.name}: ${s.connected ? 'connected' : 'not connected'}`, s.connected ? '' : s.reason)
}
say('INFO', 'Every other auction house is directory-only', 'They publish no API. Gavel opens their search and tells you how to register.')

const ai = await aiStatus()
say(ai.available ? 'PASS' : 'INFO', `AI explainer: ${ai.available ? `on (${ai.model})` : 'off'}`, ai.available ? '' : ai.reason)

if (flag('GAVEL_LIVE_BIDDING')) say('WARN', 'GAVEL_LIVE_BIDDING=1 is set', 'No connected source can take a bid by API, so every bid still stays on paper. The switch changes nothing today.')
else say('PASS', 'Bidding is PAPER (GAVEL_LIVE_BIDDING is off)', 'The Bid button records a paper bid and opens the lot with your number.')

try {
  ensureDataDir()
  accessSync(DATA_DIR, constants.W_OK)
  say('PASS', `Data directory is writable`, DATA_DIR)
} catch {
  say('WARN', `Data directory is not writable`, `${DATA_DIR} — set GAVEL_DATA_DIR to a folder you can write to.`)
}

say(env('GAVEL_PIN') ? 'PASS' : 'INFO', env('GAVEL_PIN') ? 'Owner PIN is fixed in .env' : 'Owner PIN is random each start', env('GAVEL_PIN') ? '' : 'It is printed when the app starts. Set GAVEL_PIN to keep it.')
say(env('GAVEL_SESSION_SECRET').length >= 32 ? 'PASS' : 'INFO', env('GAVEL_SESSION_SECRET').length >= 32 ? 'Session secret set' : 'Sessions reset on restart', env('GAVEL_SESSION_SECRET').length >= 32 ? '' : 'Set GAVEL_SESSION_SECRET (32+ random characters) so members stay signed in across restarts.')
say(env('GAVEL_STRIPE_WEBHOOK_SECRET') ? 'PASS' : 'INFO', env('GAVEL_STRIPE_WEBHOOK_SECRET') ? 'Stripe webhook secret set' : 'Stripe webhook not configured', env('GAVEL_STRIPE_WEBHOOK_SECRET') ? '' : 'Optional. Members can be added by hand on the Members page, or with GAVEL_MEMBER_CODES.')
say(env('GAVEL_MEMBER_CODES') ? 'INFO' : 'INFO', env('GAVEL_MEMBER_CODES') ? `${env('GAVEL_MEMBER_CODES').split(',').filter(Boolean).length} shared access code(s) in GAVEL_MEMBER_CODES` : 'No shared access codes', 'Codes issued on the Members page are per member and safer.')
ui.line()
