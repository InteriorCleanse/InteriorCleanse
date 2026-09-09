import { describe, expect, it } from 'vitest'
import {
  DATA_CATEGORIES,
  DELETION_GRACE_DAYS,
  LEGAL_STATUS,
  RETENTION_SUMMARY,
  SUB_PROCESSORS,
} from '@/lib/legal'
import { RETENTION } from '@/lib/retention'
import { GRACE_PERIOD_DAYS as ENDPOINT_GRACE } from '@/app/api/workspace/route'

/**
 * The legal pages render facts, and facts drift. These pin the ones that are
 * derived from code to the code, and hold the draft banner up until somebody
 * with the authority to remove it does so on purpose.
 */

describe('the legal pages', () => {
  it('carry the draft banner until a reviewer has signed off', () => {
    // Generated prose with a lawyer's tone would be believed. The banner is
    // the difference between a data inventory and an instrument.
    expect(LEGAL_STATUS.reviewedAt).toBeNull()
    expect(LEGAL_STATUS.banner).toMatch(/not yet in force/i)
    expect(LEGAL_STATUS.banner).toMatch(/not been reviewed by a lawyer/i)
  })

  it('state retention from the purge job, not from memory', () => {
    // One entry per rule, same figures. The notice cannot say 180 days while
    // the job does 90.
    expect(RETENTION_SUMMARY).toHaveLength(RETENTION.length)
    for (const rule of RETENTION) {
      expect(RETENTION_SUMMARY.map((r) => r.days)).toContain(rule.days)
    }
  })

  it('quote the same deletion grace period the endpoint enforces', () => {
    expect(DELETION_GRACE_DAYS).toBe(ENDPOINT_GRACE)
  })

  it('name every sub-processor with what it receives', () => {
    for (const processor of SUB_PROCESSORS) {
      expect(processor.purpose.length, `${processor.name} has no purpose`).toBeGreaterThan(10)
      expect(processor.receives.length, `${processor.name} has no receives`).toBeGreaterThan(20)
    }
  })

  it('list the database as the one non-optional sub-processor', () => {
    // Everything else degrades honestly when absent; the readiness console
    // says which are configured. The notice has to agree.
    const required = SUB_PROCESSORS.filter((p) => !p.optional).map((p) => p.name)
    expect(required).toEqual(['Supabase'])
  })

  it('never describe a credential as displayable', () => {
    const credentials = DATA_CATEGORIES.find((c) => c.label.includes('credentials'))!
    expect(credentials.detail).toMatch(/never shows one back|masked hint/)
  })

  it('say the audit log and business records are not expired on a timer', () => {
    const audit = DATA_CATEGORIES.find((c) => c.label === 'Audit log')!
    const records = DATA_CATEGORIES.find((c) => c.label.includes('Business records'))!
    expect(audit.detail).toMatch(/never expired/i)
    expect(records.detail).toMatch(/never expired on a timer/i)
    expect(RETENTION.map((r) => r.table)).not.toContain('audit_logs')
  })
})
