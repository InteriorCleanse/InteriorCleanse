/**
 * npm run security:audit — the checklist in src/security/audit.ts, run on this
 * machine. Reads only; changes nothing; prints no secret. Exits 1 on any FAIL
 * so it can sit in CI or a pre-push hook.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { config, LIVE_TRADING_ENABLED } from '../config.ts'
import { assess, scanForSecrets, summarise, type AuditState } from '../src/security/audit.ts'
import { vaultConfigFromEnv, totpSecretFromEnv } from '../src/security/vault.ts'
import * as ui from '../src/ui.ts'

const ROOT = join(import.meta.dirname, '..')
const git = (...args: string[]): string | null => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null }
}

// Tracked text files under this folder, read as they are on disk now.
const tracked = (git('ls-files', '-z') ?? '').split('\0').filter(Boolean)
const files: Array<{ path: string; text: string }> = []
for (const p of tracked) {
  const full = join(ROOT, p)
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|pdf|mp4|sqlite|db)$/i.test(p) || !existsSync(full)) continue
  try {
    if (statSync(full).size > 1_000_000) continue
    files.push({ path: p, text: readFileSync(full, 'utf8') })
  } catch { /* unreadable: skip */ }
}

const envPath = join(ROOT, '.env')
const envExists = existsSync(envPath)
try { if (envExists) process.loadEnvFile(envPath) } catch { /* malformed .env: the app would say so */ }
const dockerignore = join(ROOT, '.dockerignore')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }

const state: AuditState = {
  secretHits: scanForSecrets(files),
  scannedFiles: files.length,
  env: {
    exists: envExists,
    tracked: !!git('ls-files', '--error-unmatch', '.env'),
    ignored: git('check-ignore', '-q', '.env') !== null,
    mode: envExists && process.platform !== 'win32' ? statSync(envPath).mode & 0o777 : null,
  },
  dockerignoreCoversEnv: existsSync(join(ROOT, 'Dockerfile')) ? existsSync(dockerignore) && /^\.env\b/m.test(readFileSync(dockerignore, 'utf8')) : null,
  allowPhone: !!config.app.allowPhone,
  pinFrom: process.env.MRCASH_PIN ? 'env' : config.app.pin ? 'config' : 'random',
  pinLength: (process.env.MRCASH_PIN || config.app.pin || '').length,
  totpConfigured: totpSecretFromEnv() !== null,
  vaultConfigured: vaultConfigFromEnv() !== null,
  login2faOff: process.env.MRCASH_LOGIN_2FA === '0',
  liveTradingEnabled: LIVE_TRADING_ENABLED as boolean,
  runtimeDependencies: Object.keys(pkg.dependencies ?? {}).length,
  nodeMajor: Number(process.versions.node.split('.')[0]),
  brokerKeys: [
    process.env.MRCASH_ALPACA_KEY && 'Alpaca',
    process.env.MRCASH_KRAKEN_KEY && 'Kraken',
    process.env.EXCHANGE_API_KEY && 'Binance (shadow)',
    process.env.ANTHROPIC_API_KEY && 'Anthropic',
  ].filter(Boolean) as string[],
  webhookSecretLength: (config.tradingview.webhookSecret || '').length,
  cookieSecure: process.env.MRCASH_COOKIE_SECURE === '1',
}

const findings = assess(state)
ui.heading('SECURITY AUDIT')
console.log(ui.dim('  Reads only. No secret is printed: findings name the file and line, never the value.'))
console.log('')
const paint = { PASS: ui.good, WARN: ui.warn, FAIL: ui.bad, INFO: ui.dim } as const
for (const f of findings) {
  console.log(`  ${paint[f.level](f.level.padEnd(4))}  ${f.title}`)
  console.log(ui.dim(`        ${f.detail}`))
}
const s = summarise(findings)
console.log('')
console.log(`  ${s.pass} pass · ${s.warn} warn · ${s.fail} fail`)
console.log(ui.dim('  This checks what a script can see. It is not a penetration test; see docs/SECURITY.md for the threat model.'))
process.exit(s.fail ? 1 : 0)
