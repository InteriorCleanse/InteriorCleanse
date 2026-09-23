/**
 * Backtest metrics, worked out by hand. Pure input → pure numbers, so every
 * figure here is checkable with a pencil.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMetrics } from '../../src/backtest/metrics.ts'
import type { TradeLike } from '../../src/backtest/metrics.ts'
import { config } from '../../config.ts'

const DAY = 86_400_000
function trade(i: number, r: number, outcome: 'WIN' | 'LOSS' | 'FLAT'): TradeLike {
  return { time: i * DAY, rMultiple: r, pnlUsd: r * 100, outcome }
}

test('empty trade list gives all-zero, nothing-decided metrics', () => {
  const m = computeMetrics([])
  assert.equal(m.trades, 0)
  assert.equal(m.totalR, 0)
  assert.equal(m.winRate, null)
  assert.equal(m.avgR, null)
  assert.equal(m.profitFactor, null)
  assert.equal(m.sharpeR, null)
  assert.equal(m.spanDays, null)
  assert.equal(m.enoughData, false)
})

test('win rate, totals and expectancy are computed over the trades taken', () => {
  const trades = [trade(0, 2, 'WIN'), trade(1, -1, 'LOSS'), trade(2, 2, 'WIN'), trade(3, -1, 'LOSS')]
  const m = computeMetrics(trades)
  assert.equal(m.trades, 4)
  assert.equal(m.wins, 2)
  assert.equal(m.losses, 2)
  assert.equal(m.winRate, 0.5)
  assert.equal(m.totalR, 2)
  assert.equal(m.avgR, 0.5)
  assert.equal(m.expectancyR, 0.5)
  assert.equal(m.profitFactor, 2) // 4 gross win / 2 gross loss
})

test('FLAT trades count as taken but not as decided', () => {
  const m = computeMetrics([trade(0, 2, 'WIN'), trade(1, 0, 'FLAT'), trade(2, -1, 'LOSS')])
  assert.equal(m.trades, 3)
  assert.equal(m.flat, 1)
  assert.equal(m.winRate, 0.5) // 1 win / (1 win + 1 loss)
})

test('max drawdown is the worst peak-to-trough on the cumulative-R curve', () => {
  // curve: +2, +1(-1 dd from peak 2? no), ... work it out:
  // cum after each: 3, 1, 4, 2, 5 → peaks 3,3,4,4,5; dd max = 3-1 = 2
  const trades = [trade(0, 3, 'WIN'), trade(1, -2, 'LOSS'), trade(2, 3, 'WIN'), trade(3, -2, 'LOSS'), trade(4, 3, 'WIN')]
  const m = computeMetrics(trades)
  assert.equal(m.totalR, 5)
  assert.equal(m.maxDrawdownR, 2)
})

test('longest losing streak counts consecutive losses only', () => {
  const trades = [trade(0, -1, 'LOSS'), trade(1, -1, 'LOSS'), trade(2, 2, 'WIN'), trade(3, -1, 'LOSS'), trade(4, -1, 'LOSS'), trade(5, -1, 'LOSS')]
  const m = computeMetrics(trades)
  assert.equal(m.longestLosingStreak, 3)
})

test('profit factor is Infinity when there are wins and no losses', () => {
  const m = computeMetrics([trade(0, 1, 'WIN'), trade(1, 1, 'WIN')])
  assert.equal(m.profitFactor, Infinity)
})

test('memory-blocked trades are excluded from every figure', () => {
  const trades: TradeLike[] = [trade(0, 2, 'WIN'), { ...trade(1, -5, 'LOSS'), blockedByMemory: true }]
  const m = computeMetrics(trades)
  assert.equal(m.trades, 1)
  assert.equal(m.totalR, 2)
})

test('enoughData tracks the confidence threshold', () => {
  const min = config.replay.minSetupsForConfidence
  const under = Array.from({ length: min - 1 }, (_, i) => trade(i, 1, 'WIN'))
  const atLeast = Array.from({ length: min }, (_, i) => trade(i, 1, 'WIN'))
  assert.equal(computeMetrics(under).enoughData, false)
  assert.equal(computeMetrics(atLeast).enoughData, true)
})
