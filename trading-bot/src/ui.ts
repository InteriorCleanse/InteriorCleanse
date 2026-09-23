/**
 * Everything that makes the terminal readable by a human being.
 * No jargon goes to the screen without a translation next to it.
 */

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR

const c = {
  dim: (s: string) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s: string) => (COLOR ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (COLOR ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s: string) => (COLOR ? `\x1b[33m${s}\x1b[0m` : s),
  blue: (s: string) => (COLOR ? `\x1b[36m${s}\x1b[0m` : s),
  magenta: (s: string) => (COLOR ? `\x1b[35m${s}\x1b[0m` : s),
}

export function heading(text: string): void {
  const line = '─'.repeat(Math.max(text.length + 2, 52))
  console.log('')
  console.log(c.blue(line))
  console.log(c.blue(c.bold(`  ${text}`)))
  console.log(c.blue(line))
}

export function sub(text: string): void {
  console.log('')
  console.log(c.bold(`  ${text}`))
  console.log('')
}

export function step(text: string): void {
  console.log(`${c.dim(timeNow())}  ${text}`)
}

export function note(text: string): void {
  console.log(c.dim(`         ${text}`))
}

export function line(text = ''): void {
  console.log(text ? `  ${text}` : '')
}

export function blank(): void {
  console.log('')
}

/** A short "here's what that meant" paragraph, indented and dimmed. */
export function plainEnglish(lines: string[]): void {
  console.log('')
  console.log(c.dim('  ┌─ In plain English ─────────────────────────────────'))
  for (const l of lines) console.log(c.dim(`  │ ${l}`))
  console.log(c.dim('  └────────────────────────────────────────────────────'))
}

/** The bot's reasoning, one tick or cross per step. */
export function evidence(steps: Array<{ step: string; passed: boolean; detail: string }>): void {
  for (const s of steps) {
    const mark = s.passed ? c.green('✓') : c.yellow('✗')
    console.log(`  ${mark} ${c.bold(s.step)}`)
    for (const l of wrap(s.detail, 66).split('\n')) console.log(c.dim(`      ${l}`))
  }
}

export function actionLabel(action: string): string {
  if (action === 'BUY') return c.green(c.bold('BUY'))
  if (action === 'SELL') return c.red(c.bold('SELL'))
  if (action === 'SKIP') return c.yellow(c.bold('SKIP'))
  return c.dim(c.bold('HOLD'))
}

export const good = (t: string) => c.green(t)
export const bad = (t: string) => c.red(t)
export const warn = (t: string) => c.yellow(t)
export const dim = (t: string) => c.dim(t)
export const bold = (t: string) => c.bold(t)
export const accent = (t: string) => c.magenta(t)

function timeNow(): string {
  return new Date().toLocaleTimeString()
}

/** A timestamp in the user's own local time. */
export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** The same instant, in New York time — the clock the session model uses. */
export function formatET(ms: number, withDate = false): string {
  return new Date(ms).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    ...(withDate ? { month: 'short', day: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' ET'
}

export function money(n: number, decimals = 2): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toFixed(decimals)}`
}

export function price(n: number): string {
  return n >= 1000
    ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : '$' + n.toFixed(2)
}

export function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function r(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}R`
}

export function duration(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

/** Prints an aligned table. Rows are arrays of already-formatted strings. */
export function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(stripAnsi(h).length, ...rows.map((row) => stripAnsi(row[i] ?? '').length)),
  )
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - stripAnsi(s).length))

  console.log('  ' + c.bold(headers.map((h, i) => pad(h, widths[i])).join('  ')))
  console.log('  ' + c.dim(widths.map((w) => '─'.repeat(w)).join('  ')))
  for (const row of rows) {
    console.log('  ' + row.map((cell, i) => pad(cell ?? '', widths[i])).join('  '))
  }
}

export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

export function wrap(text: string, width: number): string {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const w of para.split(' ')) {
      if ((cur + ' ' + w).trim().length > width) {
        out.push(cur.trim())
        cur = ''
      }
      cur += w + ' '
    }
    out.push(cur.trim())
  }
  return out.join('\n')
}

/** The banner shown at the top of every command. */
export function safetyBanner(): void {
  console.log('')
  console.log(c.green('  ● PAPER MODE — no real money, no exchange account, no orders sent.'))
}
