import { addDays, type PipelineDeal } from '@/lib/crm/pipeline'
import { searchTerms, snippet, type KnowledgeHit } from '@/lib/knowledge/search'

/**
 * The demo workspace's CRM and notes.
 *
 * The demo dataset is computed in memory rather than written to the database,
 * so the pipeline page and the knowledge tools would show a demonstration
 * workspace nothing at all — the one workspace a prospect actually explores.
 * These are the same shapes the real tables produce, built from a fixed date
 * so the figures never drift, and they only ever reach a workspace flagged
 * `is_demo`, where every surface carries the badge.
 *
 * Hand-written rather than generated: a pipeline of seven deals is read one
 * deal at a time, and each one is there to show something — an overdue close,
 * a deal with no amount, a stage the vendor calls something of its own.
 */

/** A HubSpot-shaped default pipeline, probabilities as HubSpot ships them. */
export const DEMO_STAGES = [
  { stage: 'Appointment scheduled', probability: 20, outcome: 'open' },
  { stage: 'Qualified to buy', probability: 40, outcome: 'open' },
  { stage: 'Presentation scheduled', probability: 60, outcome: 'open' },
  { stage: 'Decision maker bought-in', probability: 80, outcome: 'open' },
  { stage: 'Contract sent', probability: 90, outcome: 'open' },
  { stage: 'Closed won', probability: 100, outcome: 'won' },
  { stage: 'Closed lost', probability: 0, outcome: 'lost' },
] as const satisfies readonly { stage: string; probability: number; outcome: PipelineDeal['outcome'] }[]

type StageName = (typeof DEMO_STAGES)[number]['stage']

type Sketch = {
  name: string
  stage: StageName
  amountMinor: number | null
  /** Days from today; null for a deal nobody has dated. */
  closeInDays: number | null
  /** Days ago the row last changed; closed deals use this for the window. */
  updatedDaysAgo: number
  owner: string | null
}

const DEALS: readonly Sketch[] = [
  { name: 'Harbour & Co — wholesale spring order', stage: 'Contract sent', amountMinor: 1_840_000, closeInDays: 6, updatedDaysAgo: 1, owner: 'Maya Chen' },
  { name: 'Nordic Living — retail listing, 12 stores', stage: 'Decision maker bought-in', amountMinor: 2_650_000, closeInDays: 18, updatedDaysAgo: 3, owner: 'Maya Chen' },
  { name: 'Fern & Field — corporate gift boxes', stage: 'Presentation scheduled', amountMinor: 720_000, closeInDays: 9, updatedDaysAgo: 2, owner: 'Ravi Patel' },
  { name: 'The Larder Collective — candle range', stage: 'Qualified to buy', amountMinor: 1_120_000, closeInDays: 41, updatedDaysAgo: 6, owner: 'Ravi Patel' },
  // No amount yet: the page must count it, not sum it as zero.
  { name: 'Bloom Hotels — amenity kit trial', stage: 'Qualified to buy', amountMinor: null, closeInDays: null, updatedDaysAgo: 4, owner: 'Maya Chen' },
  // Past its expected close and still open: the thing the page is for.
  { name: 'Greenway Garden Centres — seasonal range', stage: 'Appointment scheduled', amountMinor: 480_000, closeInDays: -4, updatedDaysAgo: 11, owner: 'Ravi Patel' },
  { name: 'Sunday Market — pop-up partnership', stage: 'Appointment scheduled', amountMinor: 150_000, closeInDays: 25, updatedDaysAgo: 8, owner: null },
  { name: 'Oakline Interiors — showroom stock', stage: 'Closed won', amountMinor: 940_000, closeInDays: -12, updatedDaysAgo: 12, owner: 'Maya Chen' },
  { name: 'Cobble Lane Gifts — reorder', stage: 'Closed won', amountMinor: 310_000, closeInDays: -33, updatedDaysAgo: 33, owner: 'Ravi Patel' },
  { name: 'Metro Department Store — listing', stage: 'Closed lost', amountMinor: 3_200_000, closeInDays: -20, updatedDaysAgo: 20, owner: 'Maya Chen' },
  // Won well outside the 90-day window, so the page's "recently" means it.
  { name: 'Old Mill Boutique — opening order', stage: 'Closed won', amountMinor: 120_000, closeInDays: -140, updatedDaysAgo: 140, owner: 'Ravi Patel' },
]

/** Every deal, open and closed, relative to `today` (ISO date) in one currency. */
export function buildDemoPipeline(options: { today: string; currency: string }): PipelineDeal[] {
  const { today, currency } = options
  return DEALS.map((sketch, index) => {
    const stage = DEMO_STAGES.find((s) => s.stage === sketch.stage)!
    return {
      id: `demo-deal-${index + 1}`,
      name: sketch.name,
      stage: stage.stage,
      outcome: stage.outcome,
      amountMinor: sketch.amountMinor,
      currency: sketch.amountMinor === null ? null : currency,
      probability: stage.probability,
      expectedCloseOn: sketch.closeInDays === null ? null : addDays(today, sketch.closeInDays),
      owner: sketch.owner,
      source: 'demo',
      updatedAt: `${addDays(today, -sketch.updatedDaysAgo)}T09:00:00.000Z`,
    }
  })
}

export type DemoDocument = {
  id: string
  title: string
  source: 'demo'
  url: null
  content: string
  /** ISO timestamp. */
  updatedAt: string
}

/**
 * Four notes, each written so a question about the figures has a note that
 * *sounds* like an answer and is not one. The advertising plan states a ROAS
 * target; the dashboards state the ROAS. The distinction is the product.
 */
export const DEMO_DOCUMENTS: readonly DemoDocument[] = [
  {
    id: 'demo-doc-refunds',
    title: 'Refund policy',
    source: 'demo',
    url: null,
    updatedAt: '2026-01-14T10:20:00.000Z',
    content: [
      'Customers may return any unused item within 30 days of delivery for a full refund to the original payment method.',
      'Refunds are issued within 5 working days of the return arriving. Return shipping is deducted at a flat $6.50 unless the item arrived damaged.',
      'Candles that have been lit and diffusers that have been opened are excluded. Books are accepted if unmarked.',
      'Exchanges follow the same window. Gift orders can be refunded to store credit at the recipient’s request.',
    ].join('\n\n'),
  },
  {
    id: 'demo-doc-ads-q1',
    title: 'Q1 advertising plan',
    source: 'demo',
    url: null,
    updatedAt: '2026-01-06T16:45:00.000Z',
    content: [
      'Goal: hold blended ROAS above 2.0 while scaling candle spend by 40% through February.',
      'The brand campaign is capped at 38% of the daily budget. It is not expected to attribute well and should not be judged on ROAS alone; its job is new customers.',
      'Review weekly. If contribution margin drops below 32% for two consecutive weeks, cut the brand campaign first and hold the candle campaign.',
      'Targets are targets. The dashboard is the record of what happened.',
    ].join('\n\n'),
  },
  {
    id: 'demo-doc-wholesale',
    title: 'Wholesale pricing decision — February',
    source: 'demo',
    url: null,
    updatedAt: '2026-02-11T09:05:00.000Z',
    content: [
      'Agreed: wholesale is 50% of retail, minimum first order $1,500, and net 30 terms for accounts that order more than $5,000 a quarter.',
      'The Stoneware Mug is excluded from the wholesale list until its unit cost comes down; at current cost it loses money after fulfilment.',
      'Pipeline deals are tracked in HubSpot and are not revenue until an order is placed.',
    ].join('\n\n'),
  },
  {
    id: 'demo-doc-diffuser',
    title: 'Supplier notes — Cedar Reed Diffuser',
    source: 'demo',
    url: null,
    updatedAt: '2026-02-24T13:30:00.000Z',
    content: [
      'Lead time is six weeks from purchase order. Reorder when stock reaches 120 units.',
      'Glass is sourced separately and has been late twice this winter; keep two weeks of glass on hand.',
      'The supplier will quote a 4% discount on orders above 800 units. Not yet taken up.',
    ].join('\n\n'),
  },
]

/**
 * Ranked search over the demo notes, standing in for the Postgres full-text
 * search a real workspace uses. Title matches count for more than body
 * matches, the last term matches as a prefix, and nothing matching returns
 * nothing — the assistant is told to say so rather than guess.
 */
export function searchDemoKnowledge(question: string, limit: number): KnowledgeHit[] {
  const terms = searchTerms(question)
  if (terms.length === 0) return []

  const scored = DEMO_DOCUMENTS.map((doc) => {
    const title = doc.title.toLowerCase()
    const body = doc.content.toLowerCase()
    let score = 0
    terms.forEach((term, index) => {
      const pattern = new RegExp(
        `\\b${escape(term)}${index === terms.length - 1 ? '' : '\\b'}`,
        'g',
      )
      if (pattern.test(title)) score += 3
      score += body.match(pattern)?.length ?? 0
    })
    return { doc, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.doc.updatedAt.localeCompare(a.doc.updatedAt))
    .slice(0, Math.max(1, limit))
    .map(({ doc }) => ({
      id: doc.id,
      title: doc.title,
      source: doc.source,
      url: doc.url,
      snippet: snippet(doc.content, question),
      updatedAt: doc.updatedAt,
    }))
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
