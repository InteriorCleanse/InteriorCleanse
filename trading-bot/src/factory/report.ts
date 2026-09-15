/**
 * A readable text form of a campaign result for the terminal: the ranked
 * survivors, each with the settings it found and the evidence for why it
 * survived, and a plain reminder that surviving is not a green light.
 */

import type { CampaignRecord } from './campaign.ts'
import type { Judged } from './select.ts'

function paramStr(params: Record<string, number>): string {
  return Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join(', ')
}

function judgedLine(j: Judged): string {
  const oos = j.oosAvgR === null ? '—' : `${j.oosAvgR.toFixed(3)}R`
  const conf = `${Math.round(j.deflated.probability * 100)}%`
  return `  ${paramStr(j.evaluation.genome.params).padEnd(22)} OOS ${String(j.oosTrades).padStart(3)} trades · ${oos} avg · stability ${(j.stabilityShare * 100).toFixed(0)}% · deflated ${conf}`
}

export function campaignLines(rec: CampaignRecord): string[] {
  const L: string[] = []
  L.push(`CAMPAIGN: ${rec.strategyId} · ${rec.method} · seed ${rec.seed}`)
  L.push(`  ${rec.evaluated.length} genome(s) tried  →  ${rec.selection?.survivors.length ?? 0} survivor(s)`)
  const sel = rec.selection
  if (!sel) { L.push('  (not finished)'); return L }
  if (sel.survivors.length === 0) {
    L.push('  No survivor cleared every gate — which is the common and honest outcome.')
  } else {
    L.push('  Survivors, best out-of-sample first:')
    for (const s of sel.survivors) L.push(judgedLine(s))
  }
  // Show the top few rejected so the reader sees what almost made it and why.
  const rejected = sel.all.filter((j) => !j.survived).slice(0, 3)
  if (rejected.length) {
    L.push('  Nearest misses:')
    for (const r of rejected) { L.push(judgedLine(r)); L.push(`      ✗ ${r.reasons.find((x) => x.startsWith('Only') || x.includes('under') || x.includes('spike') || x.includes('unproven')) ?? r.reasons[0]}`) }
  }
  L.push(`  Trials applied to the deflated Sharpe: ${sel.trials}. The more genomes tried, the higher the bar.`)
  L.push('  Nothing here is enabled. A survivor still needs a passport before it can trade (Phase 15).')
  return L
}
