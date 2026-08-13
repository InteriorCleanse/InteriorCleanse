import { describe, expect, it } from 'vitest'
import {
  APPROVAL_TTL_MS,
  type ActionApproval,
  canonicalise,
  checkApproval,
  describeExpiry,
  fingerprint,
} from '@/lib/assistant/approval'

const NOW = new Date('2026-06-01T12:00:00Z')
const later = (ms: number) => new Date(NOW.getTime() + ms)

async function approvalFor(
  toolName: string,
  args: unknown,
  over: Partial<ActionApproval> = {},
): Promise<ActionApproval> {
  return {
    id: 'appr-1',
    organizationId: 'org-1',
    requestedFor: 'user-1',
    toolName,
    argumentsHash: await fingerprint(toolName, args),
    summary: 'Do the thing',
    targetIntegration: null,
    state: 'approved',
    expiresAt: later(APPROVAL_TTL_MS),
    ...over,
  }
}

describe('canonicalise', () => {
  it('is independent of key order', () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }))
  })

  it('preserves array order, because order is meaning', () => {
    // ["a","b"] and ["b","a"] are different recipients / line items.
    expect(canonicalise(['a', 'b'])).not.toBe(canonicalise(['b', 'a']))
  })

  it('treats an undefined field as absent', () => {
    expect(canonicalise({ a: 1, b: undefined })).toBe(canonicalise({ a: 1 }))
  })

  it('distinguishes null from absent', () => {
    expect(canonicalise({ a: 1, b: null })).not.toBe(canonicalise({ a: 1 }))
  })

  it('normalises numeric formatting', () => {
    expect(canonicalise({ n: 1.0 })).toBe(canonicalise({ n: 1 }))
    expect(canonicalise({ n: -0 })).toBe(canonicalise({ n: 0 }))
  })

  it('does not confuse a number with its string form', () => {
    expect(canonicalise({ n: 1 })).not.toBe(canonicalise({ n: '1' }))
  })

  it('refuses non-finite numbers rather than hashing NaN', () => {
    expect(() => canonicalise({ n: NaN })).toThrow()
    expect(() => canonicalise({ n: Infinity })).toThrow()
  })

  it('handles nesting', () => {
    expect(canonicalise({ a: { y: 1, x: 2 }, z: [1, { b: 2, a: 1 }] })).toBe(
      canonicalise({ z: [1, { a: 1, b: 2 }], a: { x: 2, y: 1 } }),
    )
  })
})

describe('fingerprint', () => {
  it('is stable for equivalent arguments', async () => {
    const a = await fingerprint('create_task', { title: 'X', due: '2026-06-02' })
    const b = await fingerprint('create_task', { due: '2026-06-02', title: 'X' })
    expect(a).toBe(b)
  })

  it('changes when any argument changes', async () => {
    const base = await fingerprint('create_task', { title: 'X', qty: 1 })
    expect(await fingerprint('create_task', { title: 'Y', qty: 1 })).not.toBe(base)
    expect(await fingerprint('create_task', { title: 'X', qty: 2 })).not.toBe(base)
    expect(await fingerprint('create_task', { title: 'X' })).not.toBe(base)
  })

  it('binds the tool name, so an approval cannot be replayed on another tool', async () => {
    const args = { amount: 100 }
    expect(await fingerprint('refund_order', args)).not.toBe(
      await fingerprint('charge_customer', args),
    )
  })
})

describe('checkApproval', () => {
  const args = { campaignId: 'c1', action: 'pause' }

  it('passes for an exact match', async () => {
    const result = await checkApproval({
      approval: await approvalFor('pause_campaign', args),
      toolName: 'pause_campaign',
      args,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok).toBe(true)
  })

  it('passes when the same arguments arrive in a different key order', async () => {
    const result = await checkApproval({
      approval: await approvalFor('pause_campaign', args),
      toolName: 'pause_campaign',
      args: { action: 'pause', campaignId: 'c1' },
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok).toBe(true)
  })

  it('refuses when any argument changed after approval', async () => {
    const result = await checkApproval({
      approval: await approvalFor('pause_campaign', args),
      toolName: 'pause_campaign',
      args: { campaignId: 'c2', action: 'pause' },
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.code).toBe('arguments_changed')
  })

  it('refuses a silently added argument', async () => {
    const result = await checkApproval({
      approval: await approvalFor('send_email', { to: 'a@x.com' }),
      toolName: 'send_email',
      args: { to: 'a@x.com', bcc: 'attacker@evil.com' },
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok === false && result.code).toBe('arguments_changed')
  })

  it('refuses an approval granted to someone else', async () => {
    const result = await checkApproval({
      approval: await approvalFor('pause_campaign', args, { requestedFor: 'user-2' }),
      toolName: 'pause_campaign',
      args,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok === false && result.code).toBe('wrong_user')
  })

  it('refuses an approval from another organization without confirming it exists', async () => {
    const result = await checkApproval({
      approval: await approvalFor('pause_campaign', args, { organizationId: 'org-2' }),
      toolName: 'pause_campaign',
      args,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok === false && result.code).toBe('wrong_org')
    // Same wording as a missing approval — a cross-tenant id is not confirmed.
    expect(result.ok === false && result.reason).toBe('This action has not been approved yet.')
  })

  it('refuses a mismatched tool', async () => {
    const result = await checkApproval({
      approval: await approvalFor('pause_campaign', args, { toolName: 'delete_campaign' }),
      toolName: 'pause_campaign',
      args,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok === false && result.code).toBe('wrong_tool')
  })

  it('refuses an expired approval', async () => {
    const result = await checkApproval({
      approval: await approvalFor('pause_campaign', args, { expiresAt: later(-1) }),
      toolName: 'pause_campaign',
      args,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok === false && result.code).toBe('expired')
  })

  it('refuses an approval that is merely pending', async () => {
    const result = await checkApproval({
      approval: await approvalFor('pause_campaign', args, { state: 'pending' }),
      toolName: 'pause_campaign',
      args,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok === false && result.code).toBe('not_approved')
  })

  it('refuses to execute the same approval twice', async () => {
    const result = await checkApproval({
      approval: await approvalFor('pause_campaign', args, { state: 'executed' }),
      toolName: 'pause_campaign',
      args,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok === false && result.code).toBe('already_executed')
  })

  it('refuses when there is no approval at all', async () => {
    const result = await checkApproval({
      approval: null,
      toolName: 'pause_campaign',
      args,
      actorUserId: 'user-1',
      organizationId: 'org-1',
      now: NOW,
    })
    expect(result.ok === false && result.code).toBe('missing')
  })
})

describe('describeExpiry', () => {
  it('counts down and then reports expiry', () => {
    expect(describeExpiry(later(30_000), NOW)).toBe('30s')
    expect(describeExpiry(later(300_000), NOW)).toBe('5 min')
    expect(describeExpiry(later(-1), NOW)).toBe('expired')
  })
})
