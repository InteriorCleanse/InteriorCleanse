/**
 * THE TRADINGVIEW SESSION SCRIPT — one set of session times, not two.
 *
 * `pine/ict-sessions.pine` draws the Asia / London / New York AM / New York PM
 * boxes, their highs and lows, the killzone shading and the sweeps. Its session
 * times used to be hand-typed constants with a comment above them reading "Keep
 * the session times equal to config.ts" — which is a person's memory standing in
 * for a guarantee, and the exact shape of defect this codebase keeps finding:
 * one concept written twice, agreeing today, drifting silently later.
 *
 * So the script is now SERVED with its session inputs generated from
 * `config.ict.sessions`. Change a killzone in config and the chart follows on the
 * next copy. The checked-in file keeps working on its own, and a test pins its
 * defaults to config so the repo copy cannot drift either.
 *
 * Read-only: this renders text. It reads config and a template and returns a
 * string. It cannot trade, and nothing here is on the order path.
 */

import { config } from '../../config.ts'

export type SessionKey = 'asia' | 'london' | 'newYork' | 'nyPM'

/** Pine wants "2000-0000" where config says "20:00" → "00:00". */
export function toPineSession(start: string, end: string): string {
  const strip = (t: string): string => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
    if (!m) throw new Error(`"${t}" is not a HH:MM time`)
    const h = Number(m[1])
    if (h > 24 || Number(m[2]) > 59) throw new Error(`"${t}" is not a valid time`)
    return String(h % 24).padStart(2, '0') + m[2]
  }
  return `${strip(start)}-${strip(end)}`
}

/** The four session windows, exactly as config has them, in Pine's format. */
export function sessionWindows(): Record<SessionKey, { pine: string; label: string; killzone: boolean }> {
  const s = config.ict.sessions
  const kz = new Set<string>(config.ict.killzones)
  const one = (k: SessionKey) => ({
    pine: toPineSession(s[k].start, s[k].end),
    label: s[k].label,
    killzone: kz.has(k),
  })
  return { asia: one('asia'), london: one('london'), newYork: one('newYork'), nyPM: one('nyPM') }
}

/** The four `input.session(...)` lines the script uses, generated from config. */
export function sessionInputLines(): string {
  const w = sessionWindows()
  const pad = (s: string) => s.padEnd(10)
  return [
    `${pad('asiaSess')} = input.session("${w.asia.pine}", "${w.asia.label} session (ET)")`,
    `${pad('londonSess')} = input.session("${w.london.pine}", "${w.london.label}${w.london.killzone ? ' killzone' : ''} (ET)")`,
    `${pad('nySess')} = input.session("${w.newYork.pine}", "${w.newYork.label}${w.newYork.killzone ? ' killzone' : ''} (ET)")`,
    `${pad('nyPmSess')} = input.session("${w.nyPM.pine}", "${w.nyPM.label}${w.nyPM.killzone ? ' killzone' : ''} (ET)")`,
  ].join('\n')
}

const START = 'asiaSess   = input.session('
const END = 'showFvg'

/**
 * Take the checked-in template and replace its four session inputs with the
 * ones config currently describes. Everything else in the script is untouched.
 *
 * Throws rather than guessing if the template no longer has the block — a
 * silently un-substituted script would be the drift this exists to prevent.
 */
export function renderSessionScript(template: string): string {
  const a = template.indexOf(START)
  const b = template.indexOf(END, a)
  if (a < 0 || b < 0) throw new Error('the session input block was not found in ict-sessions.pine — the template changed shape')

  const w = sessionWindows()
  const kzNames = (Object.keys(w) as SessionKey[]).filter((k) => w[k].killzone).map((k) => w[k].label)
  const header = [
    `// Session times below are generated from config.ts (${config.ict.timezone}).`,
    `// Entry killzones right now: ${kzNames.join(' and ') || '(none)'}.`,
    `// Editing them here only changes the chart — the bot reads config.ts.`,
    '',
  ].join('\n')

  return template.slice(0, a) + header + sessionInputLines() + '\n' + template.slice(b)
}
