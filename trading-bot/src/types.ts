/** The shared shapes used across the bot. */

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

export type StructureShift = {
  direction: 'bullish' | 'bearish'
  index: number
  time: number
  brokeSwing: Swing
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
  bias: Bias
  signal: Signal
  tradesToday: number
  lossesTodayR: number
}

// ---------------------------------------------------------------
// Replay
// ---------------------------------------------------------------

export type ReplayTrade = {
  index: number
  time: number
  action: 'BUY' | 'SELL'
  entryPrice: number
  exitPrice: number
  exitTime: number
  exitReason: 'target' | 'stop' | 'time' | 'hold-period'
  /** Profit or loss as a percent of entry, after fees. */
  pnlPercent: number
  pnlUsd: number
  /** Profit or loss in units of risk. +2 = made twice what was risked. */
  rMultiple: number | null
  outcome: 'WIN' | 'LOSS' | 'FLAT'
  setupKey: string
  session: SessionName | null
  quality?: number
  plan?: TradePlan
  blockedByMemory?: boolean
  blockReason?: string
}

export type ReplaySummary = {
  totalSetups: number
  taken: number
  skipped: number
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
