/**
 * The live-armed gate chain. Real money is only reachable when EVERY gate is
 * open at once; a single closed gate means no order-placing code can run. The
 * gates are pure over an explicit input, so each one has a failing test, and so
 * the whole chain is inspectable (the UI and the doctor show exactly which gate
 * is closed). Nothing here places an order — it only decides whether the live
 * trader is allowed to.
 */

import { LIVE_TRADING_ENABLED, config } from '../../config.ts'

export type GateInput = {
  /** The top-level hard flag. Ships false and stays false. */
  liveTradingEnabled: boolean
  /** config.live.enabled */
  configEnabled: boolean
  /** The MRCASH_LIVE environment phrase, whatever it is set to. */
  envPhrase: string | undefined
  /** A confirmation the human typed for THIS arming, verbatim. */
  typedConfirmation: string | undefined
  /** How many testnet trades have been reconciled with zero mismatch. */
  testnetTradesReconciled: number
  /** The request carried a valid app guard (came from the app itself). */
  guardPresent: boolean
  /** The kill switch is currently engaged. */
  killSwitchEngaged: boolean
  /** The market feed is fresh and healthy. */
  feedHealthy: boolean
  /** The venue being armed. */
  venue: 'testnet' | 'live'
}

export type Gate = { name: string; ok: boolean; reason: string }

/** The phrase the human must type to confirm an arming. */
export const CONFIRM_PHRASE = 'ARM LIVE TRADING'

/** Evaluate every gate. Order matters only for reading; all must pass. */
export function liveGates(input: GateInput): Gate[] {
  const min = config.live.minTestnetTrades
  return [
    { name: 'Hard flag', ok: input.liveTradingEnabled === true, reason: input.liveTradingEnabled ? 'LIVE_TRADING_ENABLED is true.' : 'LIVE_TRADING_ENABLED is false — the top-level flag that ships false and blocks all live code.' },
    { name: 'Config enabled', ok: input.configEnabled === true, reason: input.configEnabled ? 'config.live.enabled is true.' : 'config.live.enabled is false.' },
    { name: 'Env phrase', ok: input.envPhrase === config.live.envPhrase, reason: input.envPhrase === config.live.envPhrase ? 'MRCASH_LIVE matches the required phrase.' : `MRCASH_LIVE must equal "${config.live.envPhrase}".` },
    { name: 'Typed confirmation', ok: input.typedConfirmation === CONFIRM_PHRASE, reason: input.typedConfirmation === CONFIRM_PHRASE ? 'Confirmation typed.' : `The human must type "${CONFIRM_PHRASE}" to arm.` },
    { name: 'Testnet track record', ok: input.testnetTradesReconciled >= min, reason: input.testnetTradesReconciled >= min ? `${input.testnetTradesReconciled} testnet trades reconciled (≥ ${min}).` : `Only ${input.testnetTradesReconciled} reconciled testnet trades; need ${min} before real money.` },
    { name: 'Guard', ok: input.guardPresent === true, reason: input.guardPresent ? 'Request carried the app guard.' : 'No app guard — the request did not come from the app itself.' },
    { name: 'Kill switch', ok: input.killSwitchEngaged === false, reason: input.killSwitchEngaged ? 'The kill switch is engaged — no new positions.' : 'Kill switch clear.' },
    { name: 'Feed health', ok: input.feedHealthy === true, reason: input.feedHealthy ? 'Market feed is fresh.' : 'Market feed is stale or down — will not trade blind.' },
  ]
}

/** True only when every gate is open. The single question the live trader asks. */
export function liveArmed(input: GateInput): boolean {
  return liveGates(input).every((g) => g.ok)
}

/** The current gate input from the environment and config, for the status view. Testnet count and runtime flags are supplied by the caller. */
export function gateInputFromEnv(runtime: { testnetTradesReconciled: number; guardPresent: boolean; killSwitchEngaged: boolean; feedHealthy: boolean; typedConfirmation?: string }): GateInput {
  return {
    liveTradingEnabled: (LIVE_TRADING_ENABLED as boolean) === true,
    configEnabled: config.live.enabled === true,
    envPhrase: process.env.MRCASH_LIVE,
    typedConfirmation: runtime.typedConfirmation,
    testnetTradesReconciled: runtime.testnetTradesReconciled,
    guardPresent: runtime.guardPresent,
    killSwitchEngaged: runtime.killSwitchEngaged,
    feedHealthy: runtime.feedHealthy,
    venue: config.live.venue,
  }
}
