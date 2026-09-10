import { describe, expect, it } from 'vitest'
import {
  SUGGESTED_COMMANDS,
  TOOLS,
  TOOLS_BY_NAME,
  type ToolContext,
  readTools,
  writeTools,
} from '@/lib/assistant/tools'

/** Minimum valid arguments for each read tool, for the properties every read must hold. */
const READ_ARGS: Record<string, unknown> = {
  compare_periods: { metric: 'netRevenue' },
  get_metric_definition: { metric: 'roas' },
  search_knowledge: { question: 'refund policy' },
}

/** What a connected workspace would hand the two injected readers. */
const KNOWLEDGE_HITS = [
  {
    id: 'doc-1',
    title: 'Refund policy',
    source: 'notion',
    url: 'https://www.notion.so/refunds',
    snippet: 'Refunds are accepted within 30 days of delivery.',
    updatedAt: '2025-06-10T09:00:00.000Z',
  },
]

const PIPELINE = [
  { name: 'Annual', stage: 'Contract sent', amountMinor: 1_200_050, currency: 'GBP', probability: 90, expectedCloseOn: '2025-07-15', owner: null, source: 'hubspot' },
  { name: 'US deal', stage: 'Qualified', amountMinor: 50_000, currency: 'USD', probability: 20, expectedCloseOn: null, owner: null, source: 'hubspot' },
  { name: 'Early', stage: 'Qualified', amountMinor: null, currency: null, probability: null, expectedCloseOn: null, owner: null, source: 'hubspot' },
]

function ctx(over: Partial<ToolContext> = {}): ToolContext {
  return {
    organizationId: 'org-1',
    isDemo: true,
    currency: 'GBP',
    can: () => true,
    // Injected readers, as the route injects them with the user's client.
    searchKnowledge: async () => KNOWLEDGE_HITS,
    queryPipeline: async () => PIPELINE,
    ...over,
  }
}

describe('tool surface', () => {
  it('exposes no general-purpose capability', () => {
    // The blast radius of a successful prompt injection is bounded by this
    // list. A shell, a SQL string, a fetch, or a secret reader would make the
    // approval gate irrelevant, because the model could act around it.
    const forbidden = /bash|shell|exec|sql|query_raw|fetch|http|request|file|read_file|write_file|secret|credential|key|env|eval/i
    for (const tool of TOOLS) {
      expect(tool.name, `${tool.name} looks general-purpose`).not.toMatch(forbidden)
    }
  })

  it('never lets the model choose which tenant it is acting on', () => {
    // Scope comes from the session. If it were an argument, an injected
    // instruction could name someone else's workspace.
    const scopeKeys = /organization|organisation|tenant|workspace|account|org_?id|user_?id/i
    for (const tool of TOOLS) {
      const shape = (tool.schema as unknown as { shape?: Record<string, unknown> }).shape ?? {}
      for (const key of Object.keys(shape)) {
        expect(key, `${tool.name}.${key} lets the model pick a scope`).not.toMatch(scopeKeys)
      }
    }
  })

  it('has unique names and a matching lookup map', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(TOOLS_BY_NAME.size).toBe(TOOLS.length)
    for (const tool of TOOLS) expect(TOOLS_BY_NAME.get(tool.name)).toBe(tool)
  })

  it('describes every tool well enough for the model to choose between them', () => {
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(tool.description.length).toBeGreaterThan(40)
    }
  })

  it('splits cleanly into reads and writes', () => {
    expect(readTools().length + writeTools().length).toBe(TOOLS.length)
    expect(writeTools().length).toBeGreaterThan(0)
  })

  it('requires an elevated capability for every write', () => {
    for (const tool of writeTools()) {
      expect(tool.capability).toBe('assistant:approve_action')
    }
    for (const tool of readTools()) {
      expect(tool.capability).toBe('data:view')
    }
  })

  it('offers suggested commands that the tools can actually answer', () => {
    expect(SUGGESTED_COMMANDS.length).toBeGreaterThanOrEqual(3)
    for (const command of SUGGESTED_COMMANDS) expect(command.length).toBeGreaterThan(10)
  })
})

describe('argument validation', () => {
  it('rejects a period the model invented', () => {
    const kpis = TOOLS_BY_NAME.get('query_kpis')!
    expect(kpis.schema.safeParse({ period: 'last_decade' }).success).toBe(false)
  })

  it('applies a default rather than failing on an omitted optional', () => {
    const kpis = TOOLS_BY_NAME.get('query_kpis')!
    const parsed = kpis.schema.safeParse({})
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.period).toBe('last_30')
  })

  it('bounds a limit so a request cannot pull an unbounded list', () => {
    const rank = TOOLS_BY_NAME.get('rank_products')!
    expect(rank.schema.safeParse({ limit: 500 }).success).toBe(false)
    expect(rank.schema.safeParse({ limit: 1.5 }).success).toBe(false)
    expect(rank.schema.safeParse({ limit: 5 }).success).toBe(true)
  })

  it('bounds the forecast horizon', () => {
    const f = TOOLS_BY_NAME.get('forecast_revenue')!
    expect(f.schema.safeParse({ daysAhead: 3_650 }).success).toBe(false)
    expect(f.schema.safeParse({ daysAhead: 30 }).success).toBe(true)
  })

  it('rejects a malformed date on a write tool', () => {
    const goal = TOOLS_BY_NAME.get('create_goal')!
    const base = { title: 'Hit £50k', metric: 'netRevenue', targetValue: 5_000_000 }
    expect(goal.schema.safeParse({ ...base, deadline: 'next Tuesday' }).success).toBe(false)
    expect(goal.schema.safeParse({ ...base, deadline: '2026-09-30' }).success).toBe(true)
  })
})

describe('read tools', () => {
  it('returns metrics with their formula, period and freshness attached', async () => {
    const kpis = TOOLS_BY_NAME.get('query_kpis')!
    const result = await kpis.execute({ period: 'last_30' }, ctx())
    const data = result.data as {
      metrics: { key: string; formula: string; period: string; currency: string }[]
    }

    expect(data.metrics.length).toBeGreaterThan(5)
    for (const metric of data.metrics) {
      expect(metric.formula.length).toBeGreaterThan(0)
      expect(metric.period.length).toBeGreaterThan(0)
      expect(metric.currency).toBe('GBP')
    }
    expect(result.citations?.length).toBeGreaterThan(0)
  })

  it('cites its sources on every read, so an answer can be traced', async () => {
    for (const tool of readTools()) {
      const args = tool.schema.parse(READ_ARGS[tool.name] ?? {})
      const result = await tool.execute(args, ctx())
      expect(result.citations?.length, `${tool.name} cited nothing`).toBeGreaterThan(0)
    }
  })

  it('never returns a preview from a read', async () => {
    for (const tool of readTools()) {
      const args = tool.schema.parse(READ_ARGS[tool.name] ?? {})
      const result = await tool.execute(args, ctx())
      expect(result.preview).toBeUndefined()
    }
  })

  it('reports an empty workspace as having no data instead of inventing zeroes', async () => {
    const quality = TOOLS_BY_NAME.get('inspect_data_quality')!
    const result = await quality.execute({ period: 'last_30' }, ctx({ isDemo: false }))
    const data = result.data as { hasAnyData: boolean; isDemoWorkspace: boolean }
    expect(data.hasAnyData).toBe(false)
    expect(data.isDemoWorkspace).toBe(false)
  })

  it('marks demo output as demo, so a briefing cannot be mistaken for real trading', async () => {
    const kpis = TOOLS_BY_NAME.get('query_kpis')!
    const result = await kpis.execute({ period: 'last_30' }, ctx())
    expect((result.data as { isDemoWorkspace: boolean }).isDemoWorkspace).toBe(true)
  })

  it('carries the ad-spend allocation caveat into any product ranking', async () => {
    const rank = TOOLS_BY_NAME.get('rank_products')!
    const result = await rank.execute({ period: 'last_30', by: 'revenue', limit: 3 }, ctx())
    const data = result.data as {
      products: { product: string; assessment: string }[]
      allocationCaveat: string
      allocationConfidence: string
    }
    expect(data.products.length).toBeLessThanOrEqual(3)
    expect(data.allocationCaveat.length).toBeGreaterThan(0)
    expect(data.allocationConfidence).toBeTruthy()
  })

  it('ranks by the requested dimension', async () => {
    const rank = TOOLS_BY_NAME.get('rank_products')!
    const byMargin = (await rank.execute({ period: 'last_30', by: 'margin', limit: 5 }, ctx()))
      .data as { products: { marginPercent: number }[] }
    const margins = byMargin.products.map((p) => p.marginPercent)
    expect([...margins].sort((a, b) => b - a)).toEqual(margins)
  })

  it('breaks profit down into components that account for all revenue', async () => {
    const bridge = TOOLS_BY_NAME.get('analyze_profit_bridge')!
    const result = await bridge.execute({ period: 'last_30' }, ctx())
    const data = result.data as { outflows: { label: string }[]; inflow: { amount: string } }
    expect(data.outflows.length).toBeGreaterThan(1)
    expect(data.inflow.amount).toContain('£')
  })

  it('declines to forecast from an empty workspace rather than projecting noise', async () => {
    const f = TOOLS_BY_NAME.get('forecast_revenue')!
    const result = await f.execute({ period: 'last_30', daysAhead: 30 }, ctx({ isDemo: false }))
    const data = result.data as { available: boolean; reason?: string }
    expect(data.available).toBe(false)
    expect(data.reason).toContain('Not enough history')
  })

  it('attaches assumptions and a range to every forecast it does give', async () => {
    const f = TOOLS_BY_NAME.get('forecast_revenue')!
    const result = await f.execute({ period: 'last_30', daysAhead: 30 }, ctx())
    const data = result.data as {
      available: boolean
      range?: { low: string; high: string }
      assumptions?: string[]
      caveat?: string
    }
    expect(data.available).toBe(true)
    expect(data.range?.low).toBeTruthy()
    expect(data.range?.high).toBeTruthy()
    expect(data.assumptions?.length).toBeGreaterThanOrEqual(3)
    expect(data.caveat).toContain('estimate')
  })

  it('explains a metric with its exclusions, not just its name', async () => {
    const def = TOOLS_BY_NAME.get('get_metric_definition')!
    const result = await def.execute({ metric: 'roas' }, ctx())
    const data = result.data as { formula: string; excludes: string[] }
    expect(data.formula.length).toBeGreaterThan(0)
    expect(Array.isArray(data.excludes)).toBe(true)
  })
})

describe('write tools', () => {
  it('stage a preview and never act on their own', async () => {
    for (const tool of writeTools()) {
      const args =
        tool.name === 'create_goal'
          ? {
              title: 'Reach £50k',
              metric: 'netRevenue',
              targetValue: 5_000_000,
              deadline: '2026-09-30',
            }
          : { name: 'Spend guard', metric: 'adSpend', comparator: 'above', threshold: 100_000 }

      const parsed = tool.schema.parse(args)
      const result = await tool.execute(parsed, ctx())

      expect(result.preview, `${tool.name} produced no preview`).toBeDefined()
      expect(result.preview!.summary.length).toBeGreaterThan(10)
      expect((result.data as { staged: boolean }).staged).toBe(true)
    }
  })

  it('writes a summary a human can actually check before agreeing', async () => {
    const goal = TOOLS_BY_NAME.get('create_goal')!
    const args = goal.schema.parse({
      title: 'Reach £50k',
      metric: 'netRevenue',
      targetValue: 5_000_000,
      deadline: '2026-09-30',
    })
    const preview = (await goal.execute(args, ctx())).preview!
    // The specific values must appear, or the operator is approving a shape.
    expect(preview.summary).toContain('Reach £50k')
    expect(preview.summary).toContain('2026-09-30')
    expect(preview.details).toEqual(args)
  })

  it('formats money in the operator’s own currency, not as raw units', async () => {
    const goal = TOOLS_BY_NAME.get('create_goal')!
    const args = goal.schema.parse({
      title: 'Quarter target',
      metric: 'contributionProfit',
      targetValue: 250_000,
      deadline: '2026-06-30',
    })
    const preview = (await goal.execute(args, ctx())).preview!

    // "250000" is a number someone has to decode before agreeing to it.
    expect(preview.summary).toContain('£250,000.00')
    expect(preview.fields).toContainEqual({ label: 'Target', value: '£250,000.00' })
    expect(preview.fields).toContainEqual({ label: 'Measure', value: 'Contribution profit' })
    // The raw arguments are untouched — they are what gets hashed and executed.
    expect((preview.details as { targetValue: number }).targetValue).toBe(250_000)
  })

  it('formats a non-money target in its own units', async () => {
    const goal = TOOLS_BY_NAME.get('create_goal')!
    const args = goal.schema.parse({
      title: 'Efficiency',
      metric: 'roas',
      targetValue: 3.5,
      deadline: '2026-06-30',
    })
    const preview = (await goal.execute(args, ctx())).preview!
    expect(preview.fields).toContainEqual({ label: 'Target', value: '3.50×' })
    expect(preview.summary).not.toContain('£')
  })

  it('never leaves a machine-cased metric key in front of a human', async () => {
    for (const tool of writeTools()) {
      const args =
        tool.name === 'create_goal'
          ? { title: 'X', metric: 'netRevenue', targetValue: 1_000, deadline: '2026-06-30' }
          : { name: 'X', metric: 'adSpend', comparator: 'above', threshold: 1_000 }
      const preview = (await tool.execute(tool.schema.parse(args), ctx())).preview!
      const shown = [preview.summary, ...preview.fields.map((f) => f.value)].join(' ')
      expect(shown).not.toMatch(/netRevenue|adSpend|contributionProfit|in_app/)
    }
  })

  it('names the integration a write would touch', async () => {
    const rule = TOOLS_BY_NAME.get('create_notification_rule')!
    const emailed = rule.schema.parse({
      name: 'Spend guard',
      metric: 'adSpend',
      comparator: 'above',
      threshold: 100_000,
      channel: 'email',
    })
    expect((await rule.execute(emailed, ctx())).preview!.targetIntegration).toBe('email')

    const inApp = rule.schema.parse({
      name: 'Spend guard',
      metric: 'adSpend',
      comparator: 'above',
      threshold: 100_000,
    })
    expect((await rule.execute(inApp, ctx())).preview!.targetIntegration).toBeNull()
  })
})

describe('knowledge and pipeline tools', () => {
  it('says plainly when nothing is connected, and still says where it looked', async () => {
    const search = TOOLS_BY_NAME.get('search_knowledge')!
    const bare = ctx({ searchKnowledge: undefined, queryPipeline: undefined })
    const result = await search.execute({ question: 'refund policy', limit: 5 }, bare)
    expect(result.data).toMatchObject({ available: false })
    expect(result.citations).toEqual(['knowledge_documents'])

    const pipeline = TOOLS_BY_NAME.get('query_pipeline')!
    expect((await pipeline.execute({}, bare)).data).toMatchObject({ available: false })
  })

  it('returns passages with a citation per document', async () => {
    const search = TOOLS_BY_NAME.get('search_knowledge')!
    const result = await search.execute({ question: 'refund policy', limit: 5 }, ctx())
    const data = result.data as { matches: { title: string; url: string; passage: string }[]; note: string }
    expect(data.matches[0]!.title).toBe('Refund policy')
    expect(data.matches[0]!.passage).toContain('30 days')
    expect(result.citations).toEqual(['doc:doc-1'])
    // The note reminds the model these are intentions, not measurements.
    expect(data.note).toMatch(/not measured results/)
  })

  it('tells the model to say so when nothing matched, rather than guess', async () => {
    const search = TOOLS_BY_NAME.get('search_knowledge')!
    const result = await search.execute(
      { question: 'unicorns', limit: 5 },
      ctx({ searchKnowledge: async () => [] }),
    )
    expect((result.data as { note: string }).note).toMatch(/do not guess/i)
  })

  it('totals the pipeline per currency and never across them', async () => {
    const pipeline = TOOLS_BY_NAME.get('query_pipeline')!
    const data = (await pipeline.execute({}, ctx())).data as {
      openDeals: number
      openValue: { currency: string; display: string }[]
      dealsWithoutAmount: number
      caution: string
    }
    expect(data.openDeals).toBe(3)
    expect(data.openValue.map((v) => v.currency).sort()).toEqual(['GBP', 'USD'])
    expect(data.openValue.find((v) => v.currency === 'GBP')!.display).toContain('12,000.50')
    expect(data.dealsWithoutAmount).toBe(1)
    expect(data.caution).toMatch(/not revenue/i)
  })

  it('bounds the question and the result count', () => {
    const search = TOOLS_BY_NAME.get('search_knowledge')!
    expect(search.schema.safeParse({ question: 'x' }).success).toBe(false)
    expect(search.schema.safeParse({ question: 'refunds', limit: 50 }).success).toBe(false)
    expect(search.schema.safeParse({ question: 'refunds' }).success).toBe(true)
  })
})
