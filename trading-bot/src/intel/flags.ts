/**
 * Feature flags for the intelligence layer (Phase 22Q).
 *
 * Each capability is independently switchable, and the master switch gates them
 * all. The point of routing every check through here is that "is this on?" has
 * exactly one answer in one place — and that a test can prove the layer is
 * genuinely inert when it is off.
 *
 * These are NOT trading flags. Nothing here can enable execution, and turning
 * every one of them off changes no trading behaviour whatsoever: the engine does
 * not import this module, or any module in `src/intel/`.
 */

import { config } from '../../config.ts'

export type IntelFlag =
  | 'enabled'
  | 'chartMarkup'
  | 'mtfMarkup'
  | 'replayIntelligence'
  | 'tradingViewExport'
  | 'alertCenter'
  | 'aiExplanation'

/**
 * Is a capability on? Everything except the master switch also requires the
 * master switch, so `enabled: false` turns the whole layer off in one move.
 */
export function intelEnabled(flag: IntelFlag = 'enabled'): boolean {
  const c = config.intelligence
  if (!c?.enabled) return false
  if (flag === 'enabled') return true
  return c[flag] === true
}

/** The full flag state, for the UI and the diagnostics route. */
export function intelFlags(): Record<IntelFlag, boolean> {
  return {
    enabled: intelEnabled('enabled'),
    chartMarkup: intelEnabled('chartMarkup'),
    mtfMarkup: intelEnabled('mtfMarkup'),
    replayIntelligence: intelEnabled('replayIntelligence'),
    tradingViewExport: intelEnabled('tradingViewExport'),
    alertCenter: intelEnabled('alertCenter'),
    aiExplanation: intelEnabled('aiExplanation'),
  }
}

/** The standard "this capability is off" payload, so every route says it the same way. */
export function disabledPayload(flag: IntelFlag): { ok: false; error: string; flag: IntelFlag; flags: Record<IntelFlag, boolean> } {
  return {
    ok: false,
    error: `The intelligence capability "${flag}" is turned off in config.intelligence. No data is produced while it is off.`,
    flag,
    flags: intelFlags(),
  }
}

/** Caps, read from config so a huge window cannot wedge a page or blow a Pine limit. */
export function intelLimits(): { maxAnnotations: number; maxPineDrawings: number } {
  return {
    maxAnnotations: config.intelligence?.maxAnnotations ?? 2000,
    maxPineDrawings: config.intelligence?.maxPineDrawings ?? 400,
  }
}
