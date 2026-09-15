/**
 * A tiny, leaf-level override registry for tunable strategy parameters.
 *
 * The factory (Phase 14) evaluates a genome by running a normal backtest with
 * that genome's parameter vector in force. Rather than thread a parameter map
 * through every strategy signature, a genome sets its overrides here for the
 * duration of one backtest and clears them afterwards; `atrPlan` (and any other
 * tunable reader) consults `activeParam` before falling back to config.
 *
 * This module holds process-wide state on purpose, so it must only ever be
 * used around a single, non-interleaved evaluation. The factory runs genomes
 * strictly one at a time, and `withParams`/`withParamsAsync` always restore the
 * previous value in a `finally`, so a normal run (no overrides set) reads
 * exactly the config defaults — the frozen baseline is untouched.
 */

let active: Record<string, number> | null = null

/** The active override for `name`, or undefined when nothing is overriding it. */
export function activeParam(name: string): number | undefined {
  return active ? active[name] : undefined
}

/** True while any override is in force (a factory evaluation is running). */
export function paramsActive(): boolean {
  return active !== null
}

/** Run `fn` with `params` in force, restoring the previous overrides afterwards. */
export function withParams<T>(params: Record<string, number> | null, fn: () => T): T {
  const prev = active
  active = params
  try {
    return fn()
  } finally {
    active = prev
  }
}

/** The async form: the overrides stay in force across the awaited work. */
export async function withParamsAsync<T>(params: Record<string, number> | null, fn: () => Promise<T>): Promise<T> {
  const prev = active
  active = params
  try {
    return await fn()
  } finally {
    active = prev
  }
}
