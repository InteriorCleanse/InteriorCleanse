import { describe, expect, it } from 'vitest'
import { forecast } from '@/lib/assistant/forecast'

describe('forecast', () => {
  it('refuses rather than guessing from too little history', () => {
    expect(forecast([100, 110, 120], 7)).toBeNull()
    expect(forecast([], 7)).toBeNull()
  })

  it('refuses a non-positive horizon', () => {
    expect(forecast([1, 2, 3, 4, 5], 0)).toBeNull()
  })

  it('projects a clean linear trend accurately', () => {
    // 100, 200, 300, 400, 500 → next three are 600, 700, 800 = 2100.
    const result = forecast([100, 200, 300, 400, 500], 3)
    expect(result).not.toBeNull()
    expect(result!.point).toBe(2_100)
    expect(result!.slope).toBe(100)
  })

  it('gives a zero-width interval when the fit is exact', () => {
    const result = forecast([100, 200, 300, 400], 2)!
    expect(result.low).toBe(result.point)
    expect(result.high).toBe(result.point)
  })

  it('widens the interval with noisier history', () => {
    const steady = forecast([100, 105, 110, 115, 120, 125], 7)!
    const noisy = forecast([100, 400, 10, 500, 5, 300], 7)!
    expect(noisy.high - noisy.low).toBeGreaterThan(steady.high - steady.low)
  })

  it('widens the interval with the horizon, not flat across it', () => {
    const series = [100, 180, 140, 260, 210, 320]
    const near = forecast(series, 1)!
    const far = forecast(series, 16)!
    const nearWidth = near.high - near.point
    const farWidth = far.high - far.point
    // √16 / √1 = 4, give or take the rounding to whole minor units.
    expect(farWidth / nearWidth).toBeGreaterThan(3.9)
    expect(farWidth / nearWidth).toBeLessThan(4.1)
  })

  it('is ordered low ≤ point ≤ high', () => {
    const result = forecast([100, 180, 140, 260, 210, 320], 10)!
    expect(result.low).toBeLessThanOrEqual(result.point)
    expect(result.point).toBeLessThanOrEqual(result.high)
  })

  it('never projects negative revenue', () => {
    const result = forecast([500, 400, 300, 200, 100], 30)!
    expect(result.point).toBeGreaterThanOrEqual(0)
    expect(result.low).toBeGreaterThanOrEqual(0)
  })

  it('flags a declining trend in its assumptions', () => {
    const result = forecast([500, 400, 300, 200], 7)!
    expect(result.slope).toBeLessThan(0)
    expect(result.assumptions.join(' ')).toContain('downward')
  })

  it('says so when the history is too noisy for the range to mean much', () => {
    const result = forecast([10, 900, 20, 850, 5, 800], 7)!
    expect(result.assumptions.join(' ')).toContain('wide and weak')
  })

  it('always states its assumptions', () => {
    const result = forecast([100, 200, 300, 400], 7)!
    expect(result.assumptions.length).toBeGreaterThanOrEqual(3)
    expect(result.assumptions.join(' ')).toContain('no seasonality')
  })

  it('ignores non-finite points rather than propagating NaN', () => {
    const result = forecast([100, Number.NaN, 200, 300, 400], 3)!
    expect(Number.isFinite(result.point)).toBe(true)
  })

  it('uses a wider z for a higher requested confidence', () => {
    const series = [100, 180, 140, 260, 210, 320]
    const eighty = forecast(series, 7, 0.8)!
    const ninetyFive = forecast(series, 7, 0.95)!
    expect(ninetyFive.high - ninetyFive.low).toBeGreaterThan(eighty.high - eighty.low)
  })
})
