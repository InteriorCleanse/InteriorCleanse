/**
 * ROAD TO LIVE — the step list is read from the records, never estimated, and
 * the owner's steps are never marked done by software. Inputs are SYNTHETIC
 * TEST FIXTURES shaped like the real API responses.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error — plain browser JS module, no type declarations
import { buildRoad } from '../../web/js/road-math.js'

const gate = (id: string, met: boolean, value: number | null, threshold: number) => ({ id, label: id, met, value, threshold, unit: '' })
const liveClosed = { armed: false, caps: { maxNotionalUsd: 25, maxTradesPerDay: 3, maxOpenPositions: 1 }, gates: [
  { name: 'Hard flag', ok: false, reason: 'LIVE_TRADING_ENABLED is false.' },
  { name: 'Config enabled', ok: false, reason: 'config.live.enabled is false.' },
  { name: 'Env phrase', ok: false, reason: 'unset' },
  { name: 'Typed confirmation', ok: false, reason: 'not typed' },
  { name: 'Testnet track record', ok: false, reason: 'Only 0 reconciled testnet trades; need 20 before real money.' },
] }

test('with an empty record the road is NOT READY, starts at step one, and estimates nothing', () => {
  const r = buildRoad({ validation: { gates: { verdict: 'INSUFFICIENT SAMPLE', metCount: 0, total: 9, gates: [gate('tradesTotal', false, 0, 40), gate('weeks', false, 0, 4)] }, shadow: { status: 'NOT_READY', scoredOrders: 0, blockers: ['No read-only exchange key is present (EXCHANGE_API_KEY / EXCHANGE_API_SECRET).'] } }, firstFill: { status: 'WAITING', chain: [] }, checkpoints: { reached: [], all: [], next: { label: 'first paper fill' } }, live: liveClosed })
  assert.equal(r.verdict, 'NOT READY')
  assert.equal(r.done, 0)
  assert.equal(r.total, 8)
  assert.equal(r.current.id, 'paper')
  assert.doesNotMatch(JSON.stringify(r), /days? (left|to go)|estimated|expected/i)
})

test('the owner\'s steps are never done by software, even when every automatic step is', () => {
  const r = buildRoad({ validation: { gates: { verdict: 'GATES MET', metCount: 9, total: 9, gates: [] }, shadow: { status: 'READY', scoredOrders: 25, blockers: [] } }, firstFill: { status: 'ACCEPTED', chain: [] }, checkpoints: { all: [1, 2, 3, 4, 5].map((i) => ({ id: String(i), reviewed: true })) }, live: { ...liveClosed, gates: liveClosed.gates.map((g) => g.name === 'Testnet track record' ? { ...g, ok: true, reason: '20 testnet trades reconciled (≥ 20).' } : g) } })
  const by = Object.fromEntries(r.steps.map((s: { id: string; status: string }) => [s.id, s.status]))
  assert.equal(by.paper, 'done'); assert.equal(by.firstfill, 'done'); assert.equal(by.shadow, 'done'); assert.equal(by.testnet, 'done'); assert.equal(by.checkpoints, 'done'); assert.equal(by.keys, 'done')
  assert.equal(by.security, 'owner')
  assert.equal(by.arm, 'owner')
  assert.equal(r.verdict, 'NOT READY')
  assert.equal(r.current.id, 'security')
})

test('missing endpoints read as waiting, not as done', () => {
  const r = buildRoad({ validation: null, firstFill: null, checkpoints: null, live: null })
  assert.equal(r.done, 0)
  assert.ok(r.steps.every((s: { status: string }) => s.status !== 'done'))
})
