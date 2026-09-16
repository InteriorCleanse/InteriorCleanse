/**
 * The alert centre (Phase 22K).
 *
 * Alerts are DERIVED from real changes in engine state — an annotation that
 * appeared, a lifecycle that moved, a risk veto that fired, a validation gate
 * that flipped. Every alert carries the actual reason the engine recorded.
 *
 * EXECUTION IS COMPLETELY SEPARATE. Nothing in this module can create, size,
 * approve or send an order; it has no access to the paper trader's write path,
 * no exchange import, and no side effects at all. An alert is a sentence.
 */

import type { FrameDelta, AnnotationChange } from './delta.ts'
import type { DataQuality } from './types.ts'

export type AlertSeverity = 'info' | 'warn' | 'critical'

export type AlertEvent = {
  id: string
  timestamp: number
  symbol: string
  timeframe: string
  /** The machine-readable event name. */
  event: AlertName
  title: string
  /** The real reason, from engine state. Never a generated narrative. */
  reason: string
  source: string
  severity: AlertSeverity
  dataQuality: DataQuality
  annotationId: string | null
  strategyIds: string[]
}

export type AlertName =
  | 'liquidity-sweep-detected'
  | 'bos-detected'
  | 'choch-detected'
  | 'fvg-created'
  | 'fvg-mitigated'
  | 'fvg-invalidated'
  | 'order-block-created'
  | 'order-block-invalidated'
  | 'strategy-setup-detected'
  | 'strategy-signal-generated'
  | 'signal-rejected'
  | 'risk-veto'
  | 'regime-change'
  | 'data-quality-degraded'
  | 'validation-gate-change'

/** Which alert (if any) an annotation change deserves. Unmapped changes stay silent. */
function alertFor(c: AnnotationChange): { event: AlertName; severity: AlertSeverity; title: string } | null {
  const t = c.annotationType
  if (c.kind === 'appeared') {
    if (t === 'liquidity-sweep' || t === 'liquidity-raid') return { event: 'liquidity-sweep-detected', severity: 'warn', title: 'Liquidity swept' }
    if (t === 'bos') return { event: 'bos-detected', severity: 'info', title: 'Break of structure' }
    if (t === 'choch') return { event: 'choch-detected', severity: 'warn', title: 'Change of character' }
    if (t === 'fvg-bullish' || t === 'fvg-bearish') return { event: 'fvg-created', severity: 'info', title: 'Fair value gap created' }
    if (t === 'order-block-bullish' || t === 'order-block-bearish') return { event: 'order-block-created', severity: 'info', title: 'Order block created' }
    if (t === 'silver-bullet-setup' || t === 'unicorn-setup' || t === 'turtle-soup-setup' || t === 'strategy-setup') {
      return { event: 'strategy-setup-detected', severity: 'warn', title: 'Strategy setup detected' }
    }
    if (t === 'entry') return { event: 'strategy-signal-generated', severity: 'critical', title: 'Engine signal' }
    return null
  }
  if (c.kind === 'lifecycle') {
    if (t.startsWith('fvg') && c.to === 'MITIGATED') return { event: 'fvg-mitigated', severity: 'info', title: 'Fair value gap mitigated' }
    if (t.startsWith('fvg') && c.to === 'INVALIDATED') return { event: 'fvg-invalidated', severity: 'warn', title: 'Fair value gap inverted' }
    if (t.includes('order-block') || t === 'breaker-block') {
      if (c.to === 'INVALIDATED') return { event: 'order-block-invalidated', severity: 'warn', title: 'Order block broken' }
    }
    return null
  }
  return null
}

/** Alerts implied by one frame delta. Deterministic and ordered. */
export function alertsFromDelta(delta: FrameDelta, ctx: { symbol: string; timeframe: string }): AlertEvent[] {
  const out: AlertEvent[] = []
  for (const c of delta.changes) {
    const a = alertFor(c)
    if (!a) continue
    out.push({
      id: `al.${c.id}.${a.event}`,
      timestamp: c.at,
      symbol: ctx.symbol,
      timeframe: c.timeframe || ctx.timeframe,
      event: a.event,
      title: a.title,
      reason: c.summary,
      source: `annotation:${c.layer}`,
      severity: a.severity,
      dataQuality: c.dataQuality,
      annotationId: c.id,
      strategyIds: c.strategyIds,
    })
  }
  return out.sort((x, y) => x.timestamp - y.timestamp || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/** A risk veto alert, from the risk engine's own verdict. */
export function riskVetoAlert(input: { at: number; symbol: string; timeframe: string; vetoedBy: string; reason: string }): AlertEvent {
  return {
    id: `al.risk.${input.at}.${input.vetoedBy}`,
    timestamp: input.at, symbol: input.symbol, timeframe: input.timeframe,
    event: 'risk-veto', title: `Risk veto — ${input.vetoedBy}`,
    reason: input.reason, source: 'risk-engine', severity: 'warn',
    dataQuality: 'REAL', annotationId: null, strategyIds: [],
  }
}

/** A rejected-signal alert: a real setup the system refused, with the real category. */
export function signalRejectedAlert(input: { at: number; symbol: string; timeframe: string; category: string; detail: string; strategyIds: string[] }): AlertEvent {
  return {
    id: `al.rejected.${input.at}.${input.category}`,
    timestamp: input.at, symbol: input.symbol, timeframe: input.timeframe,
    event: 'signal-rejected', title: `Setup not taken — ${input.category}`,
    reason: input.detail, source: 'trade-intelligence', severity: 'warn',
    dataQuality: 'REAL', annotationId: null, strategyIds: input.strategyIds,
  }
}

/** A regime change, when the regime reading actually moved. */
export function regimeChangeAlert(input: { at: number; symbol: string; timeframe: string; from: string | null; to: string | null; reason: string }): AlertEvent | null {
  if (input.from === input.to) return null
  return {
    id: `al.regime.${input.at}.${input.to ?? 'none'}`,
    timestamp: input.at, symbol: input.symbol, timeframe: input.timeframe,
    event: 'regime-change', title: `Regime ${input.from ?? 'unknown'} → ${input.to ?? 'unknown'}`,
    reason: input.reason, source: 'feature-engine', severity: 'info',
    dataQuality: 'REAL', annotationId: null, strategyIds: [],
  }
}

/** Data quality degraded — e.g. the tape stopped being trusted. */
export function dataQualityAlert(input: { at: number; symbol: string; timeframe: string; detail: string }): AlertEvent {
  return {
    id: `al.dq.${input.at}`,
    timestamp: input.at, symbol: input.symbol, timeframe: input.timeframe,
    event: 'data-quality-degraded', title: 'Data quality degraded',
    reason: input.detail, source: 'feature-engine', severity: 'warn',
    dataQuality: 'UNAVAILABLE', annotationId: null, strategyIds: [],
  }
}

/** A validation gate changing state, from the validation engine's own verdict. */
export function validationGateAlert(input: { at: number; symbol: string; timeframe: string; from: string; to: string; detail: string }): AlertEvent | null {
  if (input.from === input.to) return null
  return {
    id: `al.validation.${input.at}.${input.to}`,
    timestamp: input.at, symbol: input.symbol, timeframe: input.timeframe,
    event: 'validation-gate-change', title: `Validation verdict ${input.from} → ${input.to}`,
    reason: input.detail, source: 'validation-engine', severity: 'info',
    dataQuality: 'REAL', annotationId: null, strategyIds: [],
  }
}

/** Newest first, capped — what the alert centre lists. */
export function recentAlerts(list: AlertEvent[], limit = 100): AlertEvent[] {
  return list.slice().sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? -1 : 1)).slice(0, limit)
}
