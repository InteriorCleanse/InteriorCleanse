/**
 * The live-armed gate chain. Real money is reachable only when EVERY gate is
 * open; each gate gets a failing test, and the chain must ship CLOSED.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIRM_PHRASE, gateInputFromEnv, liveArmed, liveGates } from '../../src/live/gates.ts'
import type { GateInput } from '../../src/live/gates.ts'
import { config } from '../../config.ts'

const OPEN: GateInput = {
  liveTradingEnabled: true, configEnabled: true, envPhrase: config.live.envPhrase, typedConfirmation: CONFIRM_PHRASE,
  testnetTradesReconciled: config.live.minTestnetTrades, guardPresent: true, killSwitchEngaged: false, feedHealthy: true, venue: 'testnet',
}

test('with every gate open, live is armed', () => {
  assert.equal(liveArmed(OPEN), true)
})

test('each gate, closed on its own, disarms live', () => {
  const flips: Array<[keyof GateInput, unknown]> = [
    ['liveTradingEnabled', false],
    ['configEnabled', false],
    ['envPhrase', 'wrong'],
    ['typedConfirmation', 'nope'],
    ['testnetTradesReconciled', config.live.minTestnetTrades - 1],
    ['guardPresent', false],
    ['killSwitchEngaged', true],
    ['feedHealthy', false],
  ]
  for (const [k, v] of flips) {
    const input = { ...OPEN, [k]: v } as GateInput
    assert.equal(liveArmed(input), false, `closing ${String(k)} must disarm`)
    assert.ok(liveGates(input).some((g) => !g.ok), `${String(k)} should show a closed gate`)
  }
})

test('the chain ships CLOSED — the hard flag gate is shut in this build', () => {
  const input = gateInputFromEnv({ testnetTradesReconciled: 9999, guardPresent: true, killSwitchEngaged: false, feedHealthy: true, typedConfirmation: CONFIRM_PHRASE })
  assert.equal(liveArmed(input), false)
  const hardFlag = liveGates(input).find((g) => g.name === 'Hard flag')!
  assert.equal(hardFlag.ok, false)
})
