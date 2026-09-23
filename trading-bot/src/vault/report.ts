/**
 * A readable text form of the vault for the terminal: every passport, its
 * stage, its out-of-sample edge, its decay reading, and — for a challenger —
 * whether it would be promoted.
 */

import type { Passport } from './passport.ts'
import { assessPromotion, champion } from './store.ts'

function line(p: Passport): string {
  const oos = p.oos.avgR === null ? '—' : `${p.oos.avgR.toFixed(3)}R`
  const decay = p.decay.decaying ? 'DECAYING' : 'ok'
  const promo = assessPromotion(p)
  const tail = promo.promote ? `  → would promote to ${promo.to}` : ''
  return `  ${p.strategyId.padEnd(18)} ${p.status.padEnd(10)} OOS ${String(p.oos.trades).padStart(3)}·${oos.padStart(7)} floor ${p.oosLowerAvgR.toFixed(3)}R · decay ${decay}${tail}`
}

export function vaultLines(passports: Passport[]): string[] {
  const L: string[] = []
  if (!passports.length) { L.push('  The vault is empty. Breed some survivors (npm run factory) and mint the ones that clear the gates.'); return L }
  L.push(`VAULT: ${passports.length} passport(s)`)
  for (const p of passports) L.push(line(p))
  const families = [...new Set(passports.map((p) => p.strategyId))]
  L.push('  Champions:')
  for (const f of families) { const c = champion(f); L.push(`    ${f.padEnd(18)} ${c ? c.id : '(none — nothing healthy)'}`) }
  L.push('  Nothing here trades automatically, and nothing is ever auto-promoted to live.')
  return L
}
