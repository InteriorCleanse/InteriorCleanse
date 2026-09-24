/**
 * THE SECURITY AUDIT — `npm run security:audit`.
 *
 * A checklist a person can run before trusting a machine with real keys. It
 * reads the repository, the environment and the config, and prints PASS, WARN
 * or FAIL for each item with what to do about it. It never prints a secret: a
 * finding names the file, the line and the kind of key, never the value.
 *
 * Everything below is a pure function of what it is handed, so the tests run
 * it on fixtures; scripts/security-audit.ts gathers the real inputs.
 */

export type Level = 'PASS' | 'WARN' | 'FAIL' | 'INFO'
export type Finding = { level: Level; title: string; detail: string }

/** Kinds of key worth refusing to commit, by their published shapes. */
const PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: 'private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  // AWS before Alpaca: an AWS id also starts with AK.
  { kind: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'Alpaca key id', re: /\b(?:PK|AK)[A-Z0-9]{16,24}\b/ },
  // A package lockfile's sha512 integrity hash has the same shape; it is not a key.
  { kind: 'Kraken private key', re: /(?<!sha(?:256|384|512)-[A-Za-z0-9+/]{0,4})(?<![A-Za-z0-9+/-])[A-Za-z0-9+/]{86}==/ },
  { kind: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: 'OpenAI-style key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/ },
  { kind: 'Stripe live key', re: /\b[rs]k_live_[A-Za-z0-9]{16,}/ },
  { kind: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { kind: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  // An env-style line that gives one of Mr. Cash's own secrets a value.
  { kind: 'secret assigned in a file', re: /^\s*(?:export\s+)?(?:MRCASH_(?:ALPACA_SECRET|ALPACA_KEY|KRAKEN_SECRET|KRAKEN_KEY|VAULT_TOTP|VAULT_PASSCODE|PIN)|EXCHANGE_API_SECRET|EXCHANGE_API_KEY|ANTHROPIC_API_KEY)\s*=\s*[^\s#<'"]{6,}/ },
]

/**
 * Strings the tests use on purpose. They are TEST FIXTURES, not keys: the
 * last two open the worked example in Kraken's public API documentation
 * (its sample secret and the signature it produces).
 */
const FIXTURES = new Set(['PKABCDEFGHIJKLMNOPQRSTUV', 'TESTFIXTUREKEY', 'TESTFIXTURESECRET', 'kQH5HW/8p1uGOVjbgWA7', '4/dpxb3iT4tp/ZCVEwSn'])
/** Lines that say they are an example are documentation, not a leak. */
const EXAMPLE = /example|placeholder|dummy|redacted|your[-_ ]?key|xxxx|TEST FIXTURE|SYNTHETIC/i

export type SecretHit = { path: string; line: number; kind: string }

/** Lockfiles are hashes and URLs of public packages, and nothing else. */
const LOCKFILE = /(?:^|\/)(?:package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json)$/

export function scanForSecrets(files: Array<{ path: string; text: string }>): SecretHit[] {
  const hits: SecretHit[] = []
  for (const f of files) {
    if (LOCKFILE.test(f.path)) continue
    const lines = f.text.split('\n')
    lines.forEach((ln, i) => {
      if (ln.length > 4000 || EXAMPLE.test(ln)) return
      for (const p of PATTERNS) {
        const m = p.re.exec(ln)
        if (!m) continue
        if ([...FIXTURES].some((x) => m[0].includes(x))) continue
        hits.push({ path: f.path, line: i + 1, kind: p.kind })
        break
      }
    })
  }
  return hits
}

export type AuditState = {
  secretHits: SecretHit[]
  scannedFiles: number
  env: { exists: boolean; tracked: boolean; ignored: boolean; mode: number | null }
  dockerignoreCoversEnv: boolean | null
  allowPhone: boolean
  pinFrom: 'env' | 'config' | 'random'
  pinLength: number
  totpConfigured: boolean
  vaultConfigured: boolean
  login2faOff: boolean
  liveTradingEnabled: boolean
  runtimeDependencies: number
  nodeMajor: number
  brokerKeys: string[]
  webhookSecretLength: number
  cookieSecure: boolean
}

export function assess(s: AuditState): Finding[] {
  const out: Finding[] = []
  const add = (level: Level, title: string, detail: string) => out.push({ level, title, detail })

  if (s.secretHits.length === 0) add('PASS', 'No keys in tracked files', `${s.scannedFiles} tracked files scanned for broker, cloud and AI keys.`)
  else add('FAIL', `${s.secretHits.length} possible key(s) in tracked files`, s.secretHits.slice(0, 12).map((h) => `${h.path}:${h.line} (${h.kind})`).join('; ') + '. Revoke each key at its provider first, then remove it from the file and from git history.')

  if (!s.env.exists) add('INFO', 'No .env file', 'Nothing to protect yet. Keys, when you add them, go in .env and nowhere else.')
  else {
    if (s.env.tracked) add('FAIL', '.env is tracked by git', 'Run: git rm --cached .env, commit, and rotate every key that was in it.')
    else if (!s.env.ignored) add('FAIL', '.env is not ignored by git', 'Add .env to .gitignore before anything else.')
    else add('PASS', '.env is ignored by git', 'It cannot be committed by accident.')
    if (s.env.mode === null) add('INFO', '.env permissions not checked', 'On Windows, keep the file in your own user folder.')
    else if (s.env.mode & 0o077) add('WARN', '.env is readable by other users', `Mode ${s.env.mode.toString(8)}. Run: chmod 600 .env`)
    else add('PASS', '.env is private to you', `Mode ${s.env.mode.toString(8)}.`)
  }
  if (s.dockerignoreCoversEnv === false) add('FAIL', 'A Docker build would copy .env into the image', 'Add .env and the data folders to .dockerignore.')
  else if (s.dockerignoreCoversEnv) add('PASS', 'Docker builds leave .env out', '.dockerignore excludes it and the data folders.')

  if (!s.allowPhone) add('PASS', 'Reachable from this computer only', 'app.allowPhone is off: the app listens on 127.0.0.1 and nothing else can connect.')
  else {
    add('WARN', 'Reachable from your local network', 'app.allowPhone is on. Never port-forward it to the internet; use a VPN such as Tailscale or WireGuard to reach it from outside.')
    if (s.pinFrom === 'random') add('PASS', 'Phone PIN is fresh every start', 'Made from the OS secure random source and printed only in your terminal.')
    else if (s.pinLength < 8) add('WARN', `Phone PIN is ${s.pinLength} characters`, 'Use 8 or more, or leave it unset for a fresh random PIN each start.')
    else add('PASS', 'Phone PIN is long', `${s.pinLength} characters, set in ${s.pinFrom === 'env' ? '.env' : 'config.ts'}.`)
    if (s.totpConfigured && !s.login2faOff) add('PASS', 'Two-factor login for other devices', 'Other devices need the PIN and a 6-digit authenticator code.')
    else if (s.login2faOff) add('WARN', 'Two-factor login is switched off', 'MRCASH_LOGIN_2FA=0 is set. Remove it so other devices also need an authenticator code.')
    else add('WARN', 'Other devices need only the PIN', 'Run npm run vault:setup to add an authenticator code to the login.')
    if (!s.cookieSecure) add('INFO', 'Session cookie is not marked Secure', 'Plain http on your own network. If you put it behind a TLS proxy, set MRCASH_COOKIE_SECURE=1.')
  }

  if (s.vaultConfigured) add('PASS', 'The vault is set up', 'Real balances need a passcode and an authenticator code.')
  else if (s.brokerKeys.length) add('WARN', 'Broker keys without the vault', 'Real balances are behind the PIN only. Run npm run vault:setup.')
  else add('INFO', 'The vault is not set up', 'No broker keys are configured, so there are no real balances to guard yet.')

  if (s.brokerKeys.length) add('INFO', `Broker keys present: ${s.brokerKeys.join(', ')}`, 'At each provider: make the key read-only (no trading, and never withdrawals), restrict it to your IP address, and rotate it if it ever appeared on screen.')

  add(s.liveTradingEnabled ? 'FAIL' : 'PASS', s.liveTradingEnabled ? 'LIVE_TRADING_ENABLED is true' : 'Live trading is off', s.liveTradingEnabled ? 'Set it back to false in config.ts.' : 'LIVE_TRADING_ENABLED = false: no code path can send a real order.')

  add(s.runtimeDependencies === 0 ? 'PASS' : 'WARN', s.runtimeDependencies === 0 ? 'Zero runtime dependencies' : `${s.runtimeDependencies} runtime dependencies`, s.runtimeDependencies === 0 ? 'No third-party package runs inside the app, so none can be poisoned.' : 'Each one is code you did not write running with your keys. Review them.')

  add(s.nodeMajor >= 22 ? 'PASS' : 'FAIL', `Node ${s.nodeMajor}`, s.nodeMajor >= 22 ? 'A supported release. Keep it updated for security fixes.' : 'Mr. Cash needs Node 22 or newer.')

  if (s.webhookSecretLength === 0) add('PASS', 'TradingView webhook secret is fresh every start', 'Random, and printed only in your terminal.')
  else if (s.webhookSecretLength < 16) add('WARN', 'TradingView webhook secret is short', 'Use 16 characters or more, or leave it blank for a fresh one each start.')
  else add('PASS', 'TradingView webhook secret is long', `${s.webhookSecretLength} characters.`)

  return out
}

export function summarise(f: Finding[]): { fail: number; warn: number; pass: number } {
  return { fail: f.filter((x) => x.level === 'FAIL').length, warn: f.filter((x) => x.level === 'WARN').length, pass: f.filter((x) => x.level === 'PASS').length }
}
