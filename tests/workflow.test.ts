import { describe, expect, it } from 'vitest'
import { can, type Actor } from '@/lib/authz'
import { buildBriefing } from '@/lib/assistant/briefings'
import { executeApprovedAction } from '@/lib/assistant/execute'
import { headlineFor, standingFor, watch, type WatchedCompany } from '@/lib/owner/mission'
import type { Membership } from '@/lib/session'
import { isWorkspaceId, pickActive, safeReturnPath } from '@/lib/workspace/active'
import {
  itemFromRow,
  progressLine,
  progressOf,
  summarise,
  summariseByWorkspace,
  todayIn,
  workflowNeedsYou,
  type WorkflowItem,
  type WorkflowSummary,
} from '@/lib/workflow/progress'
import { kindForBusinessType, PLAYBOOK, seedRows, STAGES, stepsFor } from '@/lib/workflow/template'

// ── Choosing the business ───────────────────────────────────────────────────

function membership(id: string, name: string): Membership {
  return {
    organizationId: id,
    name,
    slug: name.toLowerCase(),
    role: 'tenant_owner',
    isDemo: false,
    baseCurrency: 'USD',
    timezone: 'UTC',
    planKey: 'growth',
    subscriptionStatus: 'active',
  }
}

const CANDLES = membership('11111111-1111-4111-8111-111111111111', 'Candles')
const PROTEIN = membership('22222222-2222-4222-8222-222222222222', 'Protein')
const SOMEONE_ELSES = '33333333-3333-4333-8333-333333333333'

describe('the active business', () => {
  it('is the one the person chose, when they still belong to it', () => {
    expect(pickActive([CANDLES, PROTEIN], PROTEIN.organizationId)).toBe(PROTEIN)
  })

  it('falls back to the first for a workspace they do not belong to', () => {
    // A forged or stale cookie can neither reach another tenant nor tell the
    // person that one exists: it is ignored as if it were absent.
    expect(pickActive([CANDLES, PROTEIN], SOMEONE_ELSES)).toBe(CANDLES)
  })

  it('ignores anything that is not an id at all', () => {
    expect(pickActive([CANDLES, PROTEIN], "' or 1=1 --")).toBe(CANDLES)
    expect(pickActive([CANDLES, PROTEIN], null)).toBe(CANDLES)
    expect(pickActive([CANDLES, PROTEIN], undefined)).toBe(CANDLES)
    expect(isWorkspaceId('candles')).toBe(false)
  })

  it('is nothing at all for a person with no workspace', () => {
    expect(pickActive([], CANDLES.organizationId)).toBeUndefined()
  })

  it.each([
    ['/app/revenue', '/app/revenue'],
    ['/app/workflow?welcome=1', '/app/workflow?welcome=1'],
    ['/app', '/app'],
    ['https://evil.example/app', '/app/command-center'],
    ['//evil.example/app', '/app/command-center'],
    ['/apples', '/app/command-center'],
    ['/owner-admin', '/app/command-center'],
    ['/app\\..\\owner', '/app/command-center'],
    [42, '/app/command-center'],
  ])('only ever returns to a page inside the app: %s', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected)
  })
})

// ── The playbook ────────────────────────────────────────────────────────────

describe('the playbook template', () => {
  it('has unique keys that fit the database constraint', () => {
    const keys = PLAYBOOK.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^[a-z0-9-]{1,60}$/)
  })

  it('fits every title and detail within the column bounds', () => {
    for (const step of PLAYBOOK) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.title.length).toBeLessThanOrEqual(160)
      expect(step.detail.length).toBeLessThanOrEqual(2000)
    }
  })

  it('covers every stage for both kinds of brand', () => {
    for (const kind of ['physical', 'digital'] as const) {
      const stages = new Set(stepsFor(kind).map((s) => s.stage))
      expect([...stages].sort()).toEqual([...STAGES].sort())
    }
  })

  it('leaves out steps that do not apply, rather than creating them to skip', () => {
    const digital = stepsFor('digital').map((s) => s.key)
    const physical = stepsFor('physical').map((s) => s.key)
    expect(digital).not.toContain('landed-cost')
    expect(digital).not.toContain('inventory')
    expect(digital).toContain('licence')
    expect(physical).toContain('landed-cost')
    expect(physical).not.toContain('licence')
  })

  it('guesses the kind from how the workspace was described', () => {
    expect(kindForBusinessType('ecommerce')).toBe('physical')
    expect(kindForBusinessType('digital_products')).toBe('digital')
    expect(kindForBusinessType(null)).toBe('physical')
  })

  it('seeds rows for one workspace, positioned per stage with room between', () => {
    const rows = seedRows({ organizationId: 'org-1', userId: 'user-1', kind: 'physical' })
    expect(rows).toHaveLength(stepsFor('physical').length)
    expect(rows.every((r) => r.organization_id === 'org-1' && r.created_by === 'user-1')).toBe(true)
    const foundation = rows.filter((r) => r.stage === 'foundation').map((r) => r.position)
    expect(foundation).toEqual(foundation.map((_, i) => (i + 1) * 10))
  })
})

function item(over: Partial<WorkflowItem> & { id: string }): WorkflowItem {
  return { stage: 'foundation', title: over.id, status: 'todo', dueOn: null, position: 10, ...over }
}

describe('progress', () => {
  const items: WorkflowItem[] = [
    item({ id: 'entity', status: 'done', position: 10 }),
    item({ id: 'bank', status: 'doing', position: 20 }),
    item({ id: 'tax', status: 'skipped', position: 30 }),
    item({ id: 'quotes', stage: 'product', status: 'blocked', blockedReason: 'no sample', position: 20 }),
    item({ id: 'spec', stage: 'product', status: 'todo', position: 10, dueOn: '2026-02-01' }),
    item({ id: 'ads', stage: 'growth', status: 'todo', position: 10, dueOn: '2026-01-15' }),
  ]
  const p = progressOf(items, '2026-03-01')

  it('leaves skipped steps out of the denominator', () => {
    // 1 done of 5 counted.
    expect(p.total).toBe(5)
    expect(p.done).toBe(1)
    expect(p.percent).toBe(20)
  })

  it('is on the earliest stage with an open step', () => {
    expect(p.currentStage).toBe('foundation')
    expect(p.currentStageLabel).toBe('Foundation')
  })

  it('puts blocked before in-progress before to-do within a stage', () => {
    expect(p.nextUp.map((i) => i.id)).toEqual(['bank', 'quotes', 'spec'])
  })

  it('finds overdue and blocked steps', () => {
    expect(p.overdue.map((i) => i.id).sort()).toEqual(['ads', 'spec'])
    expect(p.blockedItems.map((i) => i.id)).toEqual(['quotes'])
  })

  it('summarises with the oldest overdue step first', () => {
    const s = summarise(p)
    expect(s.overdueSteps.map((o) => o.title)).toEqual(['ads', 'spec'])
    expect(s.blockedSteps).toEqual([{ title: 'quotes', reason: 'no sample' }])
    expect(s.line).toBe('20% done · Foundation · 1 blocked · 2 overdue')
    expect(workflowNeedsYou(s)).toBe(true)
  })

  it('is complete when nothing is open, and unstarted when nothing exists', () => {
    const finished = progressOf([item({ id: 'a', status: 'done' }), item({ id: 'b', status: 'skipped' })], '2026-03-01')
    expect(finished.percent).toBe(100)
    expect(finished.currentStage).toBeNull()
    expect(progressLine(finished)).toBe('Playbook complete')

    const none = progressOf([], '2026-03-01')
    expect(none.started).toBe(false)
    expect(progressLine(none)).toBe('Playbook not started')
    expect(workflowNeedsYou(summarise(none))).toBe(false)
  })

  it('never rounds an unfinished playbook up to 100%', () => {
    const many = Array.from({ length: 199 }, (_, i) => item({ id: `d${i}`, status: 'done' }))
    expect(progressOf([...many, item({ id: 'last' })], '2026-03-01').percent).toBe(99)
  })

  it('groups rows from several workspaces, each judged in its own zone', () => {
    const rows = [
      { organization_id: 'a', id: '1', stage: 'brand', title: 'Logo', status: 'blocked', due_on: null, position: 10, blocked_reason: 'designer' },
      { organization_id: 'b', id: '2', stage: 'launch', title: 'List', status: 'todo', due_on: '2026-03-01', position: 10 },
    ]
    const byOrg = summariseByWorkspace(rows, (org) => (org === 'b' ? '2026-03-02' : '2026-03-01'))
    expect(byOrg.get('a')!.blocked).toBe(1)
    expect(byOrg.get('b')!.overdue).toBe(1)
  })

  it('reads an unexpected stage or status from the database without crashing', () => {
    const row = itemFromRow({ id: 'x', stage: 'weird', title: 'X', status: 'odd', due_on: '2026-01-01T00:00:00Z', position: null })
    expect(row).toMatchObject({ stage: 'operations', status: 'todo', dueOn: '2026-01-01', position: 0 })
  })

  it('works out today in the business’s own zone', () => {
    const lateEvening = new Date('2026-03-01T23:30:00Z')
    expect(todayIn('UTC', lateEvening)).toBe('2026-03-01')
    expect(todayIn('Asia/Tokyo', lateEvening)).toBe('2026-03-02')
    expect(todayIn('Not/AZone', lateEvening)).toBe('2026-03-01')
  })
})

// ── Who can work it ─────────────────────────────────────────────────────────

describe('workflow permissions', () => {
  const tenant = (role: Actor['tenantRole']): Actor => ({ userId: 'u', tenantRole: role, platformRole: null })

  it('lets the person doing a step move it, and only an admin rewrite the plan', () => {
    expect(can(tenant('viewer'), 'workflow:edit')).toBe(false)
    expect(can(tenant('member'), 'workflow:edit')).toBe(true)
    expect(can(tenant('member'), 'workflow:manage')).toBe(false)
    expect(can(tenant('tenant_admin'), 'workflow:manage')).toBe(true)
  })

  it('never lets support change a customer’s plan while looking at it', () => {
    const support: Actor = { userId: 'u', tenantRole: 'tenant_owner', platformRole: null, impersonating: true }
    expect(can(support, 'workflow:edit')).toBe(false)
    expect(can(support, 'workflow:manage')).toBe(false)
    expect(can({ userId: 's', tenantRole: null, platformRole: 'platform_support' }, 'workflow:edit')).toBe(false)
  })
})

// ── Mission control and briefings ───────────────────────────────────────────

const BLOCKED: WorkflowSummary = {
  started: true,
  percent: 40,
  stage: 'Product',
  blocked: 1,
  overdue: 0,
  line: '40% done · Product · 1 blocked',
  nextUp: ['Two quotes'],
  blockedSteps: [{ title: 'Two quotes', reason: 'supplier silent' }],
  overdueSteps: [],
}

function company(over: Partial<WatchedCompany> = {}): WatchedCompany {
  return {
    id: 'c1',
    name: 'Brand',
    isDemo: false,
    planKey: 'growth',
    subscriptionStatus: 'active',
    memberCount: 1,
    currency: 'USD',
    createdAt: '',
    netRevenueMinor: 100_00,
    contributionProfitMinor: 50_00,
    agentName: 'Arch',
    reportsToOwner: true,
    signals: [],
    ...over,
  }
}

describe('a playbook in mission control', () => {
  it('puts a business with a blocked step on watch, figures or not', () => {
    expect(standingFor(company({ workflow: BLOCKED }))).toBe('watch')
    expect(standingFor(company({ workflow: BLOCKED, netRevenueMinor: null }))).toBe('watch')
    expect(headlineFor(company({ workflow: BLOCKED }), 'watch')).toBe('Blocked: Two quotes — supplier silent')
  })

  it('never lets a playbook outrank a critical signal', () => {
    const critical = company({
      workflow: BLOCKED,
      signals: [{ id: 's', severity: 'critical', title: 'Losing money on every order', detail: '', metric: null } as never],
    })
    expect(standingFor(critical)).toBe('critical')
    expect(headlineFor(critical, 'critical')).toBe('Losing money on every order')
  })

  it('says a pre-revenue brand is building, not that nothing is connected', () => {
    const building = company({ netRevenueMinor: null, workflow: { ...BLOCKED, blocked: 0, blockedSteps: [], line: '40% done · Product' } })
    expect(standingFor(building)).toBe('unknown')
    expect(headlineFor(building, 'unknown')).toBe('Building: 40% done · Product')
  })

  it('leaves a company with no playbook exactly as before', () => {
    expect(standingFor(company())).toBe('healthy')
    expect(watch([company()], 'Arch').summary).toBe('Arch is watching 1 company; nothing needs you right now.')
  })
})

describe('a playbook in a briefing', () => {
  it('raises blocked and overdue steps for attention, and offers to dig in', () => {
    const briefing = buildBriefing({
      kind: 'morning',
      isDemo: true,
      currency: 'USD',
      workflow: {
        ...BLOCKED,
        overdue: 2,
        overdueSteps: [
          { title: 'Launch list', dueOn: '2026-02-01' },
          { title: 'Photography', dueOn: '2026-02-10' },
        ],
      },
    })
    expect(briefing.attention).toContain('Playbook step blocked: Two quotes — supplier silent.')
    expect(briefing.attention).toContain('2 playbook steps are overdue, the oldest “Launch list”.')
    expect(briefing.followUps).toContain('What is blocked on the playbook, and who has it?')
  })

  it('carries the playbook even on a day with no figures', () => {
    const briefing = buildBriefing({ kind: 'morning', isDemo: false, currency: 'USD', workflow: BLOCKED })
    expect(briefing.headline).toContain('No data')
    expect(briefing.attention).toEqual(['Playbook step blocked: Two quotes — supplier silent.'])
    expect(briefing.followUps[0]).toBe('What is next on the playbook?')
  })

  it('adds nothing when there is no playbook', () => {
    const briefing = buildBriefing({ kind: 'morning', isDemo: false, currency: 'USD' })
    expect(briefing.attention).toEqual([])
  })
})

// ── Carrying out an approved step move ──────────────────────────────────────

function fakeClient(found: { id: string; title: string } | null) {
  const updates: { patch: Record<string, unknown>; filters: [string, unknown][] }[] = []
  return {
    updates,
    client: {
      from: (table: string) => {
        expect(table).toBe('workflow_items')
        const call = { patch: {} as Record<string, unknown>, filters: [] as [string, unknown][] }
        const self = {
          update: (patch: Record<string, unknown>) => {
            call.patch = patch
            updates.push(call)
            return self
          },
          eq: (column: string, value: unknown) => {
            call.filters.push([column, value])
            return self
          },
          select: () => self,
          maybeSingle: () => Promise.resolve({ data: found, error: null }),
        }
        return self
      },
    } as unknown as Parameters<typeof executeApprovedAction>[0]['supabase'],
  }
}

describe('executing an approved step move', () => {
  const STEP = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

  it('updates the step in the approval’s own workspace and nowhere else', async () => {
    const db = fakeClient({ id: STEP, title: 'Open a bank account' })
    const result = await executeApprovedAction({
      supabase: db.client,
      toolName: 'update_workflow_step',
      args: { stepId: STEP, status: 'blocked', note: 'Waiting on the EIN letter', dueOn: '2026-03-10' },
      organizationId: 'org-1',
      actorUserId: 'user-1',
    })
    expect(result).toEqual({ ok: true, summary: '“Open a bank account” moved to blocked.', recordId: STEP })
    expect(db.updates[0]!.patch).toEqual({ status: 'blocked', due_on: '2026-03-10', blocked_reason: 'Waiting on the EIN letter' })
    expect(db.updates[0]!.filters).toEqual([
      ['id', STEP],
      ['organization_id', 'org-1'],
    ])
  })

  it('never sets completion itself; the database stamps it', async () => {
    const db = fakeClient({ id: STEP, title: 'Open a bank account' })
    await executeApprovedAction({
      supabase: db.client,
      toolName: 'update_workflow_step',
      args: { stepId: STEP, status: 'done' },
      organizationId: 'org-1',
      actorUserId: 'user-1',
    })
    expect(db.updates[0]!.patch).toEqual({ status: 'done' })
  })

  it('says so when the step has gone', async () => {
    const db = fakeClient(null)
    const result = await executeApprovedAction({
      supabase: db.client,
      toolName: 'update_workflow_step',
      args: { stepId: STEP, status: 'done' },
      organizationId: 'org-1',
      actorUserId: 'user-1',
    })
    expect(result).toEqual({ ok: false, reason: 'That step is no longer in this business’s playbook.' })
  })

  it('refuses stored arguments that no longer validate', async () => {
    const db = fakeClient(null)
    const result = await executeApprovedAction({
      supabase: db.client,
      toolName: 'update_workflow_step',
      args: { stepId: 'not-a-uuid', status: 'finished' },
      organizationId: 'org-1',
      actorUserId: 'user-1',
    })
    expect(result.ok).toBe(false)
    expect(db.updates).toEqual([])
  })
})
