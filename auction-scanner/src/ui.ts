/** Terminal output a person can read. */
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR

const c = {
  dim: (s: string) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s: string) => (COLOR ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (COLOR ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s: string) => (COLOR ? `\x1b[33m${s}\x1b[0m` : s),
  blue: (s: string) => (COLOR ? `\x1b[36m${s}\x1b[0m` : s),
}

export const good = c.green
export const bad = c.red
export const warn = c.yellow
export const dim = c.dim
export const bold = c.bold

export function heading(text: string): void {
  const line = '─'.repeat(Math.max(text.length + 2, 52))
  console.log('')
  console.log(c.blue(line))
  console.log(c.blue(c.bold(`  ${text}`)))
  console.log(c.blue(line))
}

export function line(text = ''): void {
  console.log(text ? `  ${text}` : '')
}

export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}
