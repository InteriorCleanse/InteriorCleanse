/**
 * THE OUT-OF-SAMPLE REFERENCE — stored with its provenance, read by the gate,
 * computed only on an explicit request.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tempDataDir, ROOT } from '../helpers.ts'

const tmp = tempDataDir('mrcash-oosref-')
process.env.MRCASH_DATA_DIR = tmp.dir
after(() => tmp.cleanup())

test('no reference reads as null; a stored unusable one is not handed to the gate; a usable one is', async () => {
  const { oosReferenceFor, usableOosAvgR, isStale } = await import('../../src/paper/oosReference.ts')
  const { store } = await import('../../src/store.ts')
  const { config } = await import('../../config.ts')
  assert.equal(oosReferenceFor('session-ifvg'), null)
  assert.equal(usableOosAvgR('session-ifvg'), null)

  const base = {
    strategyId: 'session-ifvg', symbol: config.symbol, interval: config.interval, source: 'BACKTEST', dataType: 'SIMULATED',
    window: { from: 1, to: 2 }, inSampleAvgR: 0.5, inSampleTrades: 40, notes: [], computedAt: Date.now(), engineVersion: 'x', fillModel: 'realistic',
    assumptions: { spreadBps: 5, slippageBps: 3, takerFeePercent: 0.1 },
  }
  // Thin OOS: stored, labelled, ignored by the gate.
  store().setJson(`oosref:session-ifvg:${config.symbol}:${config.interval}`, { ...base, oosTrades: 3, oosAvgR: 0.9, usable: false, reason: 'thin' })
  assert.equal(oosReferenceFor('session-ifvg')!.oosAvgR, 0.9)
  assert.equal(usableOosAvgR('session-ifvg'), null, 'a mean off three trades is not a reference')

  store().setJson(`oosref:session-ifvg:${config.symbol}:${config.interval}`, { ...base, oosTrades: 30, oosAvgR: 0.3, usable: true, reason: 'ok' })
  assert.equal(usableOosAvgR('session-ifvg'), 0.3)
  assert.equal(isStale(oosReferenceFor('session-ifvg')!), false)
  assert.equal(isStale({ ...oosReferenceFor('session-ifvg')!, computedAt: Date.now() - 8 * 86_400_000 }), true)
  // Provenance is printed on the row, so it can never be read as paper.
  assert.equal(oosReferenceFor('session-ifvg')!.source, 'BACKTEST')
  assert.equal(oosReferenceFor('session-ifvg')!.dataType, 'SIMULATED')
})

/**
 * NEVER ON A GET. The desk polls every fifteen seconds; a backtest costs
 * seconds. The refresh must be reachable only through the explicit POST, and
 * the read path must never call it.
 */
test('the reference is only ever computed on the explicit POST route', () => {
  const src = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8')
  const calls = [...src.matchAll(/refreshOosReference\(/g)].length
  assert.equal(calls, 1, 'refreshOosReference must have exactly one call site in the server')
  const idx = src.indexOf('refreshOosReference(')
  const window = src.slice(Math.max(0, idx - 900), idx)
  assert.match(window, /req\.method === 'POST'/, 'the one call site must sit inside a POST handler')
  const ref = readFileSync(join(ROOT, 'src', 'paper', 'oosReference.ts'), 'utf8')
  assert.equal(/usableOosAvgR[\s\S]*runBacktest/.test(ref.slice(ref.indexOf('export function usableOosAvgR'))), false, 'the gate lookup must not run a backtest')
})
