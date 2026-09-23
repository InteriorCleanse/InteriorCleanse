/**
 * THE LIVING STRATEGY PASSPORT — everything known about one strategy, assembled
 * fresh on every request from the records that exist, with each part labelled.
 *
 * It is "living" because nothing here is stored as a conclusion: the paper
 * cohort, the OOS reference, the vault passports and their decay reading, the
 * hypotheses, the proposals awaiting a human, the post-mortems, the regime
 * atlas row and the trial count are all read at request time. Change the
 * record and the passport changes. There is no field that says "works".
 *
 * Read-only. Imports nothing that decides.
 */

import { config } from '../../config.ts'
import { SAMPLE_BARS, cohort } from '../analyst/cohorts.ts'
import type { Cohort } from '../analyst/cohorts.ts'
import { paperDataset } from '../analyst/records.ts'
import type { Dataset } from '../analyst/records.ts'
import { thesisFor } from '../analyst/thesis.ts'
import type { Thesis } from '../analyst/thesis.ts'
import { listItems } from '../knowledge/vault.ts'
import type { KnowledgeItem } from '../knowledge/vault.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { oosReferenceFor } from '../paper/oosReference.ts'
import type { OosReference } from '../paper/oosReference.ts'
import { listHypotheses } from '../research/hypotheses.ts'
import type { Hypothesis } from '../research/hypotheses.ts'
import { listProposals } from '../research/lab.ts'
import type { Proposal } from '../research/lab.ts'
import { trialsFor } from '../research/overfitting.ts'
import { regimeAtlas } from '../research/regimeAtlas.ts'
import type { FamilyRow } from '../research/regimeAtlas.ts'
import { conceptsForStrategy } from '../school/curriculum.ts'
import { dataGrowth } from '../school/lessons.ts'
import type { DataGrowth } from '../school/lessons.ts'
import { metaById } from '../strategies/registry.ts'
import type { StrategyMeta } from '../strategies/types.ts'
import { passportsFor } from '../vault/store.ts'
import type { Passport } from '../vault/passport.ts'
import { VERSION } from '../version.ts'

export type LivingPassport = {
  strategyId: string
  meta: StrategyMeta | null
  enabled: boolean
  generatedAt: number
  engineVersion: string
  concepts: Array<{ id: string; title: string }>
  paper: { cohort: Cohort; thesis: Thesis; growth: DataGrowth; provenance: Dataset['provenance'] } | { status: 'NOT ENOUGH DATA'; n: number; growth: DataGrowth; note: string }
  oosReference: OosReference | null
  vaultPassports: Array<Pick<Passport, 'id' | 'status' | 'origin' | 'oos' | 'oosLowerAvgR' | 'decay' | 'regimeFit'>>
  hypotheses: Array<Pick<Hypothesis, 'id' | 'question' | 'status' | 'version' | 'nextReview'>>
  proposals: Array<Pick<Proposal, 'id' | 'kind' | 'title' | 'status' | 'requires' | 'expiresAt'>>
  postMortems: Array<Pick<KnowledgeItem, 'id' | 'title' | 'created_at' | 'status'>>
  atlas: { volatility: FamilyRow | null; regime: FamilyRow | null }
  trials: number
  /** What would change the current reading, in either direction. */
  wouldChange: string[]
  notes: string[]
}

export function livingPassport(strategyId: string, closed: PaperPosition[], opts: { now?: number; enabledIds?: string[] } = {}): LivingPassport {
  const now = opts.now ?? Date.now()
  const meta = metaById().get(strategyId) ?? null
  const mine = closed.filter((p) => p.strategyId === strategyId)
  const d = paperDataset(mine)
  const co = cohort(d, { name: strategyId, filters: [{ dimension: 'strategyId', values: [strategyId] }] })
  const n = co.stats.n
  const growth = dataGrowth(n)
  const paper: LivingPassport['paper'] = n >= SAMPLE_BARS.insufficient
    ? { cohort: co, thesis: thesisFor(co), growth, provenance: d.provenance }
    : { status: 'NOT ENOUGH DATA', n, growth, note: `${n} closed paper trade${n === 1 ? '' : 's'} — under the ${SAMPLE_BARS.insufficient}-trade bar. No paper result is stated for this strategy yet.` }
  const family = meta?.family ?? null
  const atlasRow = (dim: 'volatility' | 'regime') => (family && n > 0 ? regimeAtlas(d, dim).rows.find((r) => r.family === family) ?? null : null)
  const hyps = listHypotheses({ strategy: strategyId })
  const props = listProposals({ strategyId })
  const pms = listItems({ kind: 'lesson', tag: strategyId })
  const wouldChange: string[] = []
  if (paper && 'thesis' in paper) wouldChange.push(...paper.thesis.wouldChange)
  else wouldChange.push(`${SAMPLE_BARS.insufficient - n} more closed paper trade(s) would allow a first reading.`)
  const oos = oosReferenceFor(strategyId)
  if (!oos) wouldChange.push('An out-of-sample backtest reference (POST /api/validation/oos-reference) would allow the paper-vs-backtest comparison.')
  return {
    strategyId, meta, enabled: (opts.enabledIds ?? config.strategies.enabled).includes(strategyId), generatedAt: now, engineVersion: VERSION,
    concepts: conceptsForStrategy(strategyId).map((c) => ({ id: c.id, title: c.title })),
    paper, oosReference: oos,
    vaultPassports: passportsFor(strategyId).map((p) => ({ id: p.id, status: p.status, origin: p.origin, oos: p.oos, oosLowerAvgR: p.oosLowerAvgR, decay: p.decay, regimeFit: p.regimeFit })),
    hypotheses: hyps.map((h) => ({ id: h.id, question: h.question, status: h.status, version: h.version, nextReview: h.nextReview })),
    proposals: props.map((p) => ({ id: p.id, kind: p.kind, title: p.title, status: p.status, requires: p.requires, expiresAt: p.expiresAt })),
    postMortems: pms.slice(0, 20).map((i) => ({ id: i.id, title: i.title, created_at: i.created_at, status: i.status })),
    atlas: { volatility: atlasRow('volatility'), regime: atlasRow('regime') },
    trials: trialsFor(strategyId),
    wouldChange,
    notes: [
      'Assembled at request time from the stored records; nothing here is a stored conclusion.',
      'PAPER = live market, simulated execution. BACKTEST = simulated. They are shown apart and never pooled.',
      `${hyps.length} hypothesis/es, ${props.filter((p) => p.status === 'PROPOSED').length} proposal(s) awaiting a human, ${pms.length} post-mortem(s).`,
      'The engine reads none of this.',
    ],
  }
}
