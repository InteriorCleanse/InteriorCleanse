/** Tiny CSV helpers shared by the store, its exports and the migration. */

import type { LedgerRow } from './types.ts'

export const LEDGER_HEADER = 'timestamp,symbol,action,price,quantity,reason,mode,outcome,pnl'

/** Quotes a value when it contains a comma, a quote or a newline. */
export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Splits one CSV line, honouring quotes. */
export function csvSplit(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

export function ledgerRowToCsv(row: LedgerRow): string {
  return [row.timestamp, row.symbol, row.action, String(row.price), String(row.quantity), csvEscape(row.reason), row.mode, row.outcome, String(row.pnl)].join(',')
}

/**
 * Parses a whole ledger file. Records are separated by newlines that are
 * NOT inside quotes, so a quoted reason may span lines.
 */
export function parseLedgerCsv(text: string): LedgerRow[] {
  const records: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') inQuotes = !inQuotes
    if (ch === '\n' && !inQuotes) { records.push(cur); cur = '' }
    else cur += ch
  }
  if (cur.trim()) records.push(cur)
  return records
    .map((r) => r.replace(/\r$/, ''))
    .filter((r) => r.trim().length > 0)
    .filter((r) => !r.startsWith('timestamp,'))
    .map((line) => {
      const f = csvSplit(line)
      return { timestamp: f[0] ?? '', symbol: f[1] ?? '', action: f[2] ?? '', price: Number(f[3] ?? 0), quantity: Number(f[4] ?? 0), reason: f[5] ?? '', mode: f[6] ?? '', outcome: f[7] ?? '', pnl: Number(f[8] ?? 0) }
    })
}
