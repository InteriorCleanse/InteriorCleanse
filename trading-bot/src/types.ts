/** The shared shapes used across the bot. */

import type { FeatureSnapshot } from './features/types.ts'
import type { RegimeReading } from './features/regime.ts'

/** One price candle: what the market did over one slice of time. */
export type Candle = {
  openTime: number
  closeTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** What the bot decided to do on a given candle. */
export type Action = 'BUY' | 'SELL' | 'HOLD' | 'SKIP'

/**
 * One step of the bot's reasoning. Every decision is a list of these,
 * so "why?" always has an answer — and so does "why not?".
 */
export type EvidenceStep = {
  step: string
  passed: boolean
  detail: string
}

/** A decision, plus the numbers and the reasoning behind it. */
export type Signal = {
  action: Action
  reason: string
  price: number
  time: number
  /** A short label for this kind of setup, used by memory. */
  setupKey: string
  evidence: EvidenceStep[]
  /** Present on ICT signals: the full trade plan. */
  plan?: TradePlan
  /** Present on crossover signals. */
  fastMA?: number
  slowMA?: number
  /** 0–100, how many quality boxes the setup ticks. */
  quality?: number
}

/** Where to get in, where to get out, and what it's worth. */
export type TradePlan = {
  direction: 'long' | 'short'
  entry: number
  stop: number
  takeProfit: number
  rr: number
  targetLabel: string
  stopLabel: string
  entryLabel: string
}

/** The risk module's verdict. */
export type RiskDecision = {
  approved: boolean
  finalAction: Action
  reason: string
  quantity: number
  positionValueUsd: number
  riskUsd: number
}

/** A simulated (fake, local) order. */
export type PaperOrder = {
  symbol: string
  action: Action
  price: number
  quantity: number
  time: number
  feeUsd: number
  notionalUsd: number
  stop?: number
  takeProfit?: number
}

// ---------------------------------------------------------------
// ICT / session model
// ---------------------------------------------------------------

export type SessionName = 'asia' | 'london' | 'newYork' | 'nyPM'

/** A session's high and low for one trading day. */
export type SessionRange = {
  name: SessionName
  label: string
  dayKey: string
  startTime: number
  endTime: number
  high: number
  low: number
  highTime: number
  lowTime: number
  /** True once a candle after the window's end has been seen. */
  complete: boolean
  candles: number
}

export type LevelKind =
  | 'asia-high' | 'asia-low'
  | 'london-high' | 'london-low'
  | 'ny-high' | 'ny-low'
  | 'pdh' | 'pdl'
  | 'eqh' | 'eql'
  | 'swing-high' | 'swing-low'

/** A price the market is likely to react to, with a name a human can read. */
export type Level = {
  kind: LevelKind
  price: number
  time: number
  label: string
  /** Set when a candle poked through and closed back inside — a sweep. */
  sweptAt?: number
  /** Set when a candle closed clean through it — a breakout, not a sweep. */
  brokenAt?: number
}

/** A raid on a level: price poked past it, then closed back inside. */
export type Sweep = {
  level: Level
  /** 'above' = a high was raided (sell-side stop hunt), 'below' = a low. */
  side: 'above' | 'below'
  index: number
  time: number
  wick: number
  depthAtr: number
}

export type Swing = {
  index: number
  time: number
  price: number
  kind: 'high' | 'low'
}

/** A fair value gap and where it is in its life. */
export type FVG = {
  id: string
  direction: 'bullish' | 'bearish'
  top: number
  bottom: number
  createdIndex: number
  createdTime: number
  sizeAtr: number
  fromDisplacement: boolean
  /**
   * fresh     — untouched
   * mitigated — price has traded into it
   * inverted  — price CLOSED through it, so it now works the other way round
   * expired   — too old to matter
   */
  state: 'fresh' | 'mitigated' | 'inverted' | 'expired'
  invertedIndex?: number
  invertedTime?: number
  /** Set on the candle where an inverted gap was retested. */
  retestIndex?: number
}

/**
 * A close beyond a confirmed swing point.
 *   BOS   — "break of structure": the break went WITH the prevailing trend
 *           (a new higher high in an uptrend, a new lower low in a downtrend).
 *           Continuation.
 *   CHoCH — "change of character": the FIRST break AGAINST the prevailing
 *           trend. The earliest warning that the trend may be turning.
 * The prevailing trend is the direction of the previous break; the very
 * first break, with nothing before it, is called a BOS.
 */
export type StructureShift = {
  direction: 'bullish' | 'bearish'
  kind: 'BOS' | 'CHoCH'
  index: number
  time: number
  brokeSwing: Swing
  /** The candle's close that did the breaking. */
  price: number
}

/** A swing point with its place in the sequence: higher high, lower low, and so on. The first of each kind is just H or L. */
export type LabelledSwing = Swing & { label: 'HH' | 'HL' | 'LH' | 'LL' | 'H' | 'L' }

/**
 * An ORDER BLOCK: the last candle against the move, right before a
 * displacement candle. Institutions are believed to have filled orders
 * there, and price often returns to it before continuing.
 *
 *   Bullish OB — the last DOWN candle before a strong move UP. Support.
 *   Bearish OB — the last UP candle before a strong move DOWN. Resistance.
 *
 * The zone is the whole candle, wick to wick (the decision recorded in
 * orderblocks.ts). Lifecycle: fresh → mitigated (price traded into it) →
 * broken (price CLOSED through it). A broken order block flips its role
 * and becomes a BREAKER block: a bullish OB that breaks now acts as
 * resistance, and the other way round.
 */
export type OrderBlock = {
  id: string
  direction: 'bullish' | 'bearish'
  top: number
  bottom: number
  /** The index of the order-block candle itself. */
  index: number
  time: number
  /** The displacement candle that validated it. */
  displacementIndex: number
  sizeAtr: number
  /** True when the displacement also broke structure (BOS/CHoCH) — a stronger block. */
  withStructureBreak: boolean
  /** True when the displacement left a fair value gap — the classic confirmation. */
  withFvg: boolean
  state: 'fresh' | 'mitigated' | 'broken' | 'expired'
  mitigatedIndex?: number
  brokenIndex?: number
  brokenTime?: number
}

/**
 * Where price sits between the last confirmed swing high and swing low.
 * Above the middle is PREMIUM (expensive — where shorts are looked for),
 * below it is DISCOUNT (cheap — where longs are looked for).
 */
export type DealingRange = {
  high: number
  low: number
  equilibrium: number
  /** 0 = at the low, 100 = at the high. */
  position: number
  zone: 'premium' | 'discount' | 'equilibrium'
  fromLabel: string
}

export type Bias = {
  direction: 'bullish' | 'bearish' | 'neutral'
  reason: string
}

/** Everything the bot knows about the market at one moment. */
export type IctAnalysis = {
  index: number
  time: number
  price: number
  dayKey: string
  weekday: string
  etClock: string
  session: SessionName | null
  inKillzone: boolean
  nextKillzone: { name: SessionName; label: string; startsIn: number } | null
  atr: number
  sessions: Partial<Record<SessionName, SessionRange>>
  previousDay: { high: number; low: number } | null
  levels: Level[]
  sweepsToday: Sweep[]
  fvgs: FVG[]
  structureShifts: StructureShift[]
  /** Live order blocks and breakers. */
  orderBlocks: OrderBlock[]
  /** The most recent confirmed swings with their HH/HL/LH/LL labels. */
  swings: LabelledSwing[]
  /** The trend the structure breaks currently describe. */
  structureTrend: 'bullish' | 'bearish' | null
  dealingRange: DealingRange | null
  /** Raids on confirmed swing highs/lows today. Kept apart from `sweepsToday`, which the session checklist reads. */
  swingSweepsToday: Sweep[]
  bias: Bias
  signal: Signal
  tradesToday: number
  lossesTodayR: number
  /** The shared readings (VWAP, profile, averages, momentum, volatility) as of this candle. */
  features: FeatureSnapshot
}

// ---------------------------------------------------------------
// Replay
// ---------------------------------------------------------------

export type ReplayTrade = {
  index: number
  time: number
  action: 'BUY' | 'SELL'
  /** The price the signal wanted. */
  intendedEntry: number
  /** The price the simulated order actually filled at (next candle open + costs). */
  entryPrice: number
  /** When the fill happened. */
  entryTime: number
  exitPrice: number
  exitTime: number
  exitReason: 'target' | 'stop' | 'time' | 'hold-period'
  /** Spread, slippage and fees, in dollars, for the whole trade. */
  costsUsd: number
  /** Profit or loss as a percent of entry, after fees. */
  pnlPercent: number
  pnlUsd: number
  /** Profit or loss in units of risk. +2 = made twice what was risked. */
  rMultiple: number | null
  outcome: 'WIN' | 'LOSS' | 'FLAT'
  setupKey: string
  session: SessionName | null
  /**
   * The regime the feature engine read AT THE SIGNAL CANDLE, when the replay
   * had one in hand (the ICT, strategy and fused replays; the crossover replay
   * has no feature engine and leaves it null). Recorded at decision time so an
   * attribution by regime is causal — never recomputed from later candles.
   */
  regime?: 'trending-up' | 'trending-down' | 'ranging' | 'breakout' | 'transition' | null
  quality?: number
  plan?: TradePlan
  blockedByMemory?: boolean
  blockReason?: string
}

export type ReplaySummary = {
  totalSetups: number
  taken: number
  skipped: number
  /** Setups the order could not fill: the next candle opened too far from the intended price. */
  missed: number
  /** Everything the simulated fills cost, in dollars, across the taken trades. */
  costsUsd: number
  wins: number
  losses: number
  flat: number
  winRate: number | null
  avgPnlPercent: number | null
  avgR: number | null
  expectancyR: number | null
  totalR: number
  totalPnlUsd: number
  profitFactor: number | null
  bestTrade: ReplayTrade | null
  worstTrade: ReplayTrade | null
  maxDrawdownR: number | null
  maxDrawdownPercent: number | null
  longestLosingStreak: number
  enoughData: boolean
}

export type Breakdown = {
  title: string
  rows: Array<{ label: string; trades: number; wins: number; winRate: number | null; totalR: number; avgR: number | null }>
}

/** One row of the memory ledger. */
export type LedgerRow = {
  timestamp: string
  symbol: string
  action: string
  price: number
  quantity: number
  reason: string
  mode: string
  outcome: string
  pnl: number
}

// ---------------------------------------------------------------
// News
// ---------------------------------------------------------------

export type CalendarEvent = {
  title: string
  country: string
  time: number
  impact: 'High' | 'Medium' | 'Low' | 'Holiday' | 'Unknown'
  forecast: string
  previous: string
  actual?: string
}

export type Headline = {
  title: string
  link: string
  source: string
  time: number
  score: number
  tags: string[]
  whyItMatters: string
}

export type NewsReport = {
  fetchedAt: number
  fromCache: boolean
  calendar: CalendarEvent[]
  headlines: Headline[]
  standouts: Headline[]
  blackouts: Array<{ start: number; end: number; title: string }>
  errors: string[]
}

// ---------------------------------------------------------------
// Order flow
// ---------------------------------------------------------------

/** A cluster of resting orders big enough to matter. */
export type Wall = {
  side: 'bid' | 'ask'
  price: number
  qty: number
  usd: number
  /** How many times the typical bucket this one holds. */
  multiple: number
  distancePct: number
}

export type BookSnapshot = {
  time: number
  price: number
  bestBid: number
  bestAsk: number
  spreadPct: number
  /** Dollars resting within 1% below / above price. */
  bidUsd1pct: number
  askUsd1pct: number
  /** 0.5 = balanced, above = more bids than asks nearby. */
  imbalance: number
  walls: Wall[]
  levelsRead: number
}

export type BigTrade = { time: number; side: 'buy' | 'sell'; usd: number; price: number; qty: number }

export type TapeSnapshot = {
  time: number
  from: number
  to: number
  trades: number
  buys: number
  sells: number
  buyUsd: number
  sellUsd: number
  /** Buy dollars minus sell dollars. Positive = buyers were more aggressive. */
  deltaUsd: number
  /** Share of trades that were buys, 0–1. */
  buyShare: number
  tradesPerMinute: number
  bigTrades: BigTrade[]
  bigBuys: number
  bigSells: number
}

export type FlowReport = {
  book: BookSnapshot | null
  tape: TapeSnapshot | null
  errors: string[]
  lines: string[]
}

// ---------------------------------------------------------------
// Market state
// ---------------------------------------------------------------

export type MarketState = {
  trend: 'uptrend' | 'downtrend' | 'range'
  /** 0–100, how much the evidence agrees. */
  strength: number
  continuation: { score: number; label: string; reasons: string[] }
  volatility: 'quiet' | 'normal' | 'wild'
  watchOuts: string[]
  evidence: string[]
  summary: string
  /** The regime feature (trend/range/breakout/transition), when the analysis carried one. Additive; the card's other fields are unchanged. */
  regime?: RegimeReading
}

// ---------------------------------------------------------------
// Alerts raised by the watch loop
// ---------------------------------------------------------------

export type AppEvent = {
  id: number
  time: number
  kind: 'setup' | 'sweep' | 'killzone' | 'news' | 'trend' | 'flow' | 'tradingview' | 'info'
  title: string
  body: string
  severity: 'info' | 'warn' | 'action'
}
