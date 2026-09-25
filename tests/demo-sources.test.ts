import { describe, expect, it } from 'vitest'
import { summarisePipeline } from '@/lib/crm/pipeline'
import {
  DEMO_DOCUMENTS,
  DEMO_STAGES,
  buildDemoPipeline,
  searchDemoKnowledge,
} from '@/lib/demo/sources'

const TODAY = '2026-03-01'
const build = () => buildDemoPipeline({ today: TODAY, currency: 'USD' })

describe('demo pipeline', () => {
  it('is identical on every build', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()))
  })

  it("uses only the demo pipeline's own stages, with the stage's probability and outcome", () => {
    const byStage = new Map<string, (typeof DEMO_STAGES)[number]>(
      DEMO_STAGES.map((s) => [s.stage, s]),
    )
    for (const deal of build()) {
      const stage = byStage.get(deal.stage)
      expect(stage, `${deal.name} is in an unknown stage`).toBeDefined()
      expect(deal.probability).toBe(stage!.probability)
      expect(deal.outcome).toBe(stage!.outcome)
      expect(deal.source).toBe('demo')
    }
  })

  it('keeps every amount in the workspace currency, or carries no currency at all', () => {
    for (const deal of buildDemoPipeline({ today: TODAY, currency: 'GBP' })) {
      if (deal.amountMinor === null) expect(deal.currency).toBeNull()
      else {
        expect(deal.currency).toBe('GBP')
        expect(deal.amountMinor).toBeGreaterThan(0)
      }
    }
  })

  it('has something for each thing the pipeline page shows', () => {
    const closedSince = '2025-12-01T00:00:00.000Z' // 90 days before TODAY
    const summary = summarisePipeline(build(), TODAY, closedSince)
    expect(summary.open.count).toBe(7)
    expect(summary.overdue).toBe(1)
    expect(summary.closingSoon).toBeGreaterThanOrEqual(3)
    expect(summary.open.withoutAmount).toBe(1)
    expect(summary.open.totals).toHaveLength(1)
    // Two won and one lost inside the window; the old win is outside it.
    expect(summary.won.count).toBe(2)
    expect(summary.lost.count).toBe(1)
    expect(summary.open.stages.map((s) => s.stage)[0]).toBe('Contract sent')
  })

  it('never produces a total across currencies, because there is only one', () => {
    const summary = summarisePipeline(build(), TODAY)
    expect(summary.open.totals.map((t) => t.currency)).toEqual(['USD'])
  })
})

describe('demo knowledge', () => {
  it('finds the refund policy by title and quotes the passage', () => {
    const hits = searchDemoKnowledge('what is our refund policy', 5)
    expect(hits[0]!.title).toBe('Refund policy')
    expect(hits[0]!.snippet).toMatch(/30 days/)
    expect(hits[0]!.id).toBe('demo-doc-refunds')
  })

  it('finds a target in a plan, which is the note the assistant must not confuse with a figure', () => {
    const hits = searchDemoKnowledge('roas target', 5)
    expect(hits[0]!.title).toBe('Q1 advertising plan')
    expect(hits[0]!.snippet).toMatch(/above 2\.0/)
  })

  it('matches the last term as a prefix, like the database search does', () => {
    expect(searchDemoKnowledge('wholesal', 5)[0]!.title).toMatch(/Wholesale/)
  })

  it('returns nothing rather than something for a question with no match', () => {
    expect(searchDemoKnowledge('unicorn migration', 5)).toEqual([])
    expect(searchDemoKnowledge('the and of', 5)).toEqual([])
  })

  it('respects the limit', () => {
    expect(searchDemoKnowledge('order', 1)).toHaveLength(1)
  })

  it('has no links and no real source, so nothing on the page points anywhere', () => {
    for (const doc of DEMO_DOCUMENTS) {
      expect(doc.url).toBeNull()
      expect(doc.source).toBe('demo')
      expect(doc.content.length).toBeGreaterThan(100)
    }
  })
})
