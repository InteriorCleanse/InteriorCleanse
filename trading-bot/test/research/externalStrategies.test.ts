/**
 * The external-strategy review script: CSV loading and the report shape.
 * Every candle here is a SYNTHETIC TEST FIXTURE written to a temp folder.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseKlines, loadCandles, runAll, asPublished, ASTRAL_LUCAS_LALK } from '../../scripts/external-strategies.ts'

const T0 = Date.parse('2026-01-01T00:00:00Z')

test('kline CSVs: header rows skipped, microsecond timestamps become milliseconds, bad rows dropped', () => {
  const us = (ms: number) => String(ms * 1000)
  const text = [
    'open_time_ms,open,high,low,close,volume,source',
    `${us(T0)},100,101,99,100.5,12,${us(T0 + 899_999)},0,0,0,0,0`,
    `${T0 + 900_000},100.5,102,100,101,8,0`,
    `${T0 + 1_800_000},abc,1,1,1,1`,
    `${T0 + 2_700_000},101,100,102,101,5`,
  ].join('\n')
  const c = parseKlines(text, '15m')
  assert.equal(c.length, 2)
  assert.deepEqual([c[0].openTime, c[0].closeTime], [T0, T0 + 899_999])
  assert.equal(c[1].closeTime, T0 + 900_000 + 900_000 - 1, 'no close time column: derived from the interval')
})

test('a folder: only files named for the interval, merged and de-duplicated in time order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ext-'))
  try {
    const row = (i: number) => `${T0 + i * 900_000},100,101,99,100,1`
    writeFileSync(join(dir, 'BTCUSDT-15m-2026-02.csv'), [row(3), row(4)].join('\n'))
    writeFileSync(join(dir, 'BTCUSDT-15m-2026-01.csv'), [row(0), row(1), row(2), row(3)].join('\n'))
    writeFileSync(join(dir, 'BTCUSDT-5m-2026-01.csv'), row(0))
    writeFileSync(join(dir, 'BTCUSDT_15m.txt'), row(9))
    const c = loadCandles(dir, '15m')
    assert.deepEqual(c.map((k) => (k.openTime - T0) / 900_000), [0, 1, 2, 3, 4])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the review runs both cost models and says NOT ENOUGH DATA where candles are missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ext-'))
  try {
    const rows: string[] = []
    let p = 60_000
    for (let i = 0; i < 1500; i++) {
      const o = p, c = p * (1 + Math.sin(i / 7) * 0.006 + Math.sin(i / 53) * 0.003)
      rows.push(`${T0 + i * 900_000},${o},${Math.max(o, c) * 1.001},${Math.min(o, c) * 0.999},${c},${10 + (i % 5)}`)
      p = c
    }
    writeFileSync(join(dir, 'BTCUSDT_15m.csv'), rows.join('\n'))
    const out = runAll(dir)
    assert.equal(out.length, ASTRAL_LUCAS_LALK.length)
    for (const r of out) {
      if (r.strategy.interval === '15m') { assert.ok(r.published && r.kestrel, `${r.strategy.id} ran`); assert.equal(r.candles, 1500) }
      else { assert.equal(r.kestrel, null, `${r.strategy.id} has no ${r.strategy.interval} candles`); assert.equal(r.candles, 0) }
    }
    const a = asPublished()
    assert.equal(a.takerFeePercent + a.makerFeePercent + a.spreadBps + a.slippageBps, 0)
    assert.equal(a.latencyCandles, 1, 'still fills on the next candle: no costs, but no hindsight either')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
