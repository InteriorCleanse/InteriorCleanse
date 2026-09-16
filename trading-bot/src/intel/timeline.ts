/**
 * The event timeline (Phase 22H) — one ordered stream of everything that
 * happened, bucketed by category so the eye can find the moment that matters.
 *
 * Events are derived from annotations and from engine records that already
 * exist (signals, risk verdicts, trades). Every event carries the `at` time it
 * became KNOWABLE, so the timeline can be truncated at a replay cursor without
 * ever showing the future.
 */

import type { ChartAnnotation } from './types.ts'

export type TimelineCategory =
  | 'MARKET EVENT'
  | 'STRUCTURE EVENT'
  | 'LIQUIDITY EVENT'
  | 'STRATEGY EVENT'
  | 'SIGNAL EVENT'
  | 'RISK EVENT'
  | 'TRADE EVENT'

export type TimelineEvent = {
  id: string
  at: number
  category: TimelineCategory
  title: string
  detail: string
  timeframe: string
  severity: 'info' | 'warn' | 'action'
  /** The annotation this came from, so the chart can jump straight to it. */
  annotationId: string | null
  linkedTradeId: string | null
}

/** Which timeline lane an annotation belongs in. */
function categoryFor(a: ChartAnnotation): TimelineCategory {
  switch (a.layer) {
    case 'structure': return 'STRUCTURE EVENT'
    case 'liquidity': return 'LIQUIDITY EVENT'
    case 'imbalance': return 'MARKET EVENT'
    case 'orderblock': return 'MARKET EVENT'
    case 'ict': return 'STRATEGY EVENT'
    case 'trade': return 'SIGNAL EVENT'
    case 'context': return 'MARKET EVENT'
    default: return 'MARKET EVENT'
  }
}

/** Only the annotations that represent a MOMENT deserve a timeline entry. */
const MOMENTARY = new Set([
  'bos', 'choch', 'liquidity-sweep', 'liquidity-raid', 'failed-breakout',
  'fvg-bullish', 'fvg-bearish', 'fvg-mitigation', 'fvg-invalidation',
  'order-block-bullish', 'order-block-bearish', 'breaker-block', 'block-mitigation', 'block-invalidation',
  'silver-bullet-setup', 'unicorn-setup', 'turtle-soup-setup', 'strategy-setup',
  'entry', 'higher-high', 'higher-low', 'lower-high', 'lower-low',
])

function severityFor(a: ChartAnnotation): TimelineEvent['severity'] {
  if (a.layer === 'trade' || a.layer === 'ict') return 'action'
  if (a.lifecycleStatus === 'INVALIDATED' || a.annotationType === 'liquidity-sweep' || a.annotationType === 'choch') return 'warn'
  return 'info'
}

/** Build the timeline from a frame of annotations. Deterministic and ordered. */
export function timelineFromAnnotations(list: ChartAnnotation[]): TimelineEvent[] {
  return list
    .filter((a) => MOMENTARY.has(a.annotationType))
    .map((a) => ({
      id: `tl.${a.id}`,
      at: a.knownAt,
      category: categoryFor(a),
      title: `${a.annotationType}${a.direction ? ` (${a.direction})` : ''}`,
      detail: a.rationale,
      timeframe: a.timeframe,
      severity: severityFor(a),
      annotationId: a.id,
      linkedTradeId: a.linkedTradeId,
    }))
    .sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/** Add the risk and trade lanes, which come from engine records rather than marks. */
export function withEngineEvents(base: TimelineEvent[], input: {
  risk?: { at: number; approved: boolean; vetoedBy: string | null; reason: string } | null
  trades?: Array<{ id: string; openedAt: number; closedAt?: number; exitReason?: string; rMultiple?: number; direction: string; entry: number }>
}): TimelineEvent[] {
  const out = [...base]
  if (input.risk) {
    out.push({
      id: `tl.risk.${input.risk.at}`,
      at: input.risk.at,
      category: 'RISK EVENT',
      title: input.risk.approved ? 'Risk approved' : `Risk veto — ${input.risk.vetoedBy ?? 'blocked'}`,
      detail: input.risk.reason,
      timeframe: '',
      severity: input.risk.approved ? 'info' : 'warn',
      annotationId: null,
      linkedTradeId: null,
    })
  }
  for (const t of input.trades ?? []) {
    out.push({
      id: `tl.trade.open.${t.id}`, at: t.openedAt, category: 'TRADE EVENT',
      title: `PAPER ${t.direction} queued`, detail: `Entry $${t.entry.toFixed(2)}. Paper only — no money moved.`,
      timeframe: '', severity: 'action', annotationId: null, linkedTradeId: t.id,
    })
    if (t.closedAt !== undefined) {
      out.push({
        id: `tl.trade.close.${t.id}`, at: t.closedAt, category: 'TRADE EVENT',
        title: `PAPER ${t.direction} closed (${t.exitReason ?? 'done'})`,
        detail: `${(t.rMultiple ?? 0) >= 0 ? '+' : ''}${(t.rMultiple ?? 0).toFixed(2)}R. Paper only.`,
        timeframe: '', severity: (t.rMultiple ?? 0) >= 0 ? 'action' : 'warn', annotationId: null, linkedTradeId: t.id,
      })
    }
  }
  return out.sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/** Everything knowable at or before the cursor — the replay-safe view. */
export function timelineUpTo(events: TimelineEvent[], cursor: number): TimelineEvent[] {
  return events.filter((e) => e.at <= cursor)
}
