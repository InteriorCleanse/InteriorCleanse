import { describe, expect, it } from 'vitest'
import { computeSignals, type SignalInput } from '@/lib/signals'
import type { Change } from '@/lib/periods'

const change = (direction: Change['direction'], percent: number | null): Change => ({
  absolute: 0,
  percent,
  direction,
})

const base: SignalInput = {
  revenue: null,
  profit: null,
  spend: null,
  contributionMargin: 0.3,
  refundRate: 0.02,
  unallocatedMinor: 0,
  formatMoney: (m) => `$${(m / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
}

describe('computeSignals', () => {
  it('says nothing when everything is healthy', () => {
    expect(computeSignals(base)).toEqual([])
  })

  it('raises revenue-up-profit-down as critical, and leads with it', () => {
    const signals = computeSignals({
      ...base,
      revenue: change('up', 0.03),
      profit: change('down', -0.07),
      contributionMargin: 0.1, // also thin, but the critical one must sort first
    })
    expect(signals[0]!.id).toBe('revenue-up-profit-down')
    expect(signals[0]!.severity).toBe('critical')
  })

  it('flags ad efficiency only when spend outruns revenue by more than double', () => {
    const off = computeSignals({ ...base, spend: change('up', 0.2), revenue: change('up', 0.15) })
    expect(off.find((s) => s.id === 'ad-efficiency-falling')).toBeUndefined()
    const on = computeSignals({ ...base, spend: change('up', 0.5), revenue: change('up', 0.1) })
    expect(on.find((s) => s.id === 'ad-efficiency-falling')?.detail).toMatch(/50%.*10%/)
  })

  it('does not divide by a null percentage', () => {
    // Growth from a zero baseline has a null percent; it must not throw or fire.
    const signals = computeSignals({ ...base, spend: change('up', null), revenue: change('up', null) })
    expect(signals.find((s) => s.id === 'ad-efficiency-falling')).toBeUndefined()
  })

  it('warns on thin margin and high refunds, but not at healthy levels', () => {
    expect(computeSignals({ ...base, contributionMargin: 0.12 }).some((s) => s.id === 'thin-margin')).toBe(true)
    expect(computeSignals({ ...base, contributionMargin: 0.2 }).some((s) => s.id === 'thin-margin')).toBe(false)
    expect(computeSignals({ ...base, refundRate: 0.09 }).some((s) => s.id === 'high-refunds')).toBe(true)
    expect(computeSignals({ ...base, refundRate: 0.05 }).some((s) => s.id === 'high-refunds')).toBe(false)
  })

  it('treats an unavailable margin as unknown, not as a problem', () => {
    expect(computeSignals({ ...base, contributionMargin: null }).some((s) => s.id === 'thin-margin')).toBe(false)
    expect(computeSignals({ ...base, refundRate: null }).some((s) => s.id === 'high-refunds')).toBe(false)
  })

  it('reports unattributed spend as info, with the amount', () => {
    const s = computeSignals({ ...base, unallocatedMinor: 394000 }).find((x) => x.id === 'unallocated-spend')
    expect(s?.severity).toBe('info')
    expect(s?.detail).toContain('$3,940.00')
  })

  it('surfaces overdue pipeline as its own signal, worded as not-revenue', () => {
    const one = computeSignals({ ...base, pipelineOverdue: 1 }).find((s) => s.id === 'pipeline-overdue')
    expect(one?.title).toMatch(/1 deal past/)
    expect(one?.detail).toMatch(/not revenue/)
    const many = computeSignals({ ...base, pipelineOverdue: 3 }).find((s) => s.id === 'pipeline-overdue')
    expect(many?.title).toMatch(/3 deals past/)
    expect(computeSignals({ ...base, pipelineOverdue: 0 }).some((s) => s.id === 'pipeline-overdue')).toBe(false)
  })

  it('orders critical before warning before info', () => {
    const signals = computeSignals({
      ...base,
      revenue: change('up', 0.03),
      profit: change('down', -0.07),
      contributionMargin: 0.1,
      unallocatedMinor: 1000,
    })
    const ranks = signals.map((s) => s.severity)
    expect(ranks).toEqual([...ranks].sort((a, b) => ({ critical: 0, warning: 1, info: 2 })[a] - ({ critical: 0, warning: 1, info: 2 })[b]))
  })
})
