/**
 * THE MARKET SCHOOL CURRICULUM — the concepts Mr. Cash can teach, in its own
 * words, tied to what its engine actually detects.
 *
 * Every concept says four things: what it is (plain language), what the ENGINE
 * checks for it (the module and the chart objects it draws — so the lesson is
 * about this system, not a generic textbook), how it is commonly misread, and
 * which case-study kinds illustrate it. The quiz questions are static and
 * engine-grounded; grading happens on the server (`lessons.ts`), the answers
 * are never sent to the browser with the question.
 *
 * Nothing here is a claim that a concept "works". The evidence for each concept
 * comes from the case studies (HISTORICAL) and the paper record (PAPER), both
 * attached by the lesson generator at lesson time, with their sample status.
 *
 * This file is content. It imports only types.
 */

import type { AnnotationType } from '../intel/types.ts'
import type { CaseKind } from './caseStudies.ts'

export type ConceptLevel = 'foundation' | 'intermediate' | 'advanced'
export type ConceptTrack = 'structure' | 'liquidity' | 'imbalance' | 'sessions' | 'regimes' | 'risk' | 'statistics' | 'research' | 'markets'

export type QuizQuestion = {
  id: string
  prompt: string
  choices: string[]
  /** Index into `choices`. Stripped before the question leaves the server. */
  answer: number
  why: string
}

export type Concept = {
  id: string
  title: string
  level: ConceptLevel
  track: ConceptTrack
  /** What it is, in plain language. */
  summary: string
  /** What the engine actually checks, naming the module. */
  engineChecks: string[]
  /** Chart objects that show the concept, when the chart layer draws them. */
  annotationTypes: AnnotationType[]
  /** Case-study kinds that illustrate it. */
  caseKinds: CaseKind[]
  /** Strategy ids that rely on it. */
  strategies: string[]
  /** Common misreads — the counterexample side of the lesson. */
  misreads: string[]
  /** Knowledge-graph edges to other concept ids. */
  related: string[]
  quiz: QuizQuestion[]
}

const q = (id: string, prompt: string, choices: string[], answer: number, why: string): QuizQuestion => ({ id, prompt, choices, answer, why })

export const CONCEPTS: Concept[] = [
  // ---------------------------------------------------------------- liquidity
  {
    id: 'liquidity', title: 'Liquidity: where the resting orders are', level: 'foundation', track: 'liquidity',
    summary: 'Liquidity is a pool of resting orders — stops above a high, stops below a low, entries clustered at an obvious level. Price is often drawn to those pools because that is where size can be filled. The engine marks the pools it can locate from candles: session highs and lows, the previous day and week, and equal highs or lows.',
    engineChecks: ['liquidity.ts keeps the levels list (session, previous-day, previous-week, equal highs/lows) and records the exact time each level was set.', 'The Asia range and session ranges come from sessions.ts, in New York time, rolling at 18:00 ET.'],
    annotationTypes: ['buyside-liquidity', 'sellside-liquidity', 'previous-day-high', 'previous-day-low', 'previous-week-high', 'previous-week-low', 'session-high', 'session-low', 'equal-highs', 'equal-lows'],
    caseKinds: ['liquidity-sweep'], strategies: ['session-ifvg', 'turtle-soup', 'unicorn'],
    misreads: ['Every round number is not liquidity. The engine only marks levels it can date: a specific high or low that printed at a specific time.', 'A level being marked is not a prediction that price will visit it.'],
    related: ['liquidity-sweep', 'equal-highs-lows', 'sessions-killzones'],
    quiz: [
      q('liq-1', 'Which of these does the engine record as a liquidity level?', ['A round number like 100,000', 'The previous day\'s high, with the time it printed', 'A moving average', 'The volume-weighted average price'], 1, 'The engine dates each level it marks; round numbers and averages are not liquidity pools in its model.'),
      q('liq-2', 'When does the ICT trading day roll over in this system?', ['00:00 UTC', '09:30 New York', '18:00 New York', 'Midnight New York'], 2, 'Sessions and the day key roll at 18:00 ET (sessions.ts), so the "previous day" is measured on that clock.'),
    ],
  },
  {
    id: 'liquidity-sweep', title: 'Liquidity sweep: the raid and the return', level: 'foundation', track: 'liquidity',
    summary: 'A sweep is a wick through a marked level that closes back on the original side. The reading is that resting stops were taken and price rejected the excursion. The engine measures the wick depth in ATRs and records which level was raided and from which side.',
    engineChecks: ['liquidity.ts: detectSweeps checks the candle pierced a level and closed back through it, and records the wick share and depth in ATR.', 'Swing sweeps (detectSwingSweep) raid confirmed swing highs/lows and are kept on a separate list.'],
    annotationTypes: ['liquidity-sweep', 'liquidity-raid', 'failed-breakout'],
    caseKinds: ['liquidity-sweep', 'turtle-soup-setup'], strategies: ['session-ifvg', 'turtle-soup'],
    misreads: ['A close beyond the level is not a sweep; it is a break. The engine requires the close back on the original side.', 'A sweep says nothing on its own about direction afterwards. The counterexample cases show sweeps that kept going.'],
    related: ['liquidity', 'displacement', 'choch'],
    quiz: [
      q('swp-1', 'What makes a wick through a level a sweep rather than a breakout, in the engine\'s test?', ['Volume was high', 'The candle closed back on the original side of the level', 'It happened in London', 'The wick was at least 3 ATR'], 1, 'detectSweeps requires the pierce and the close back through; the wick depth is recorded, not required to be large.'),
      q('swp-2', 'A sweep of the Asia low has just printed. What does the engine conclude about direction?', ['Price will go up', 'Price will go down', 'Nothing yet — a sweep is one condition; the strategies still need displacement and structure', 'It cancels the trading day'], 2, 'A sweep is one step in a checklist. The session strategy still needs displacement, a gap and a retest before it votes.'),
    ],
  },
  {
    id: 'equal-highs-lows', title: 'Equal highs and lows', level: 'intermediate', track: 'liquidity',
    summary: 'Two or more swing highs at nearly the same price look like a ceiling; the stops above them make an obvious pool. The engine marks equal highs/lows within a small tolerance of each other and treats them as liquidity, not as support or resistance.',
    engineChecks: ['liquidity.ts groups swings within the configured tolerance into equal-highs / equal-lows levels.'],
    annotationTypes: ['equal-highs', 'equal-lows'], caseKinds: ['liquidity-sweep'], strategies: ['turtle-soup'],
    misreads: ['"Double top" is a reversal story; equal highs are a liquidity location. The engine does not infer reversal from them.'],
    related: ['liquidity', 'liquidity-sweep'],
    quiz: [q('eq-1', 'The engine marks equal highs as…', ['Resistance that will hold', 'A liquidity pool above which stops likely rest', 'A sell signal', 'A trend line'], 1, 'Equal highs are a location of resting orders in the model, not a directional call.')],
  },
  // ---------------------------------------------------------------- imbalance
  {
    id: 'fair-value-gap', title: 'Fair value gap (FVG)', level: 'foundation', track: 'imbalance',
    summary: 'A three-candle gap: the first candle\'s high sits below the third candle\'s low (bullish) or the first\'s low above the third\'s high (bearish). The middle candle moved so fast that price was not traded across a range. The engine records the gap edges, its size in ATRs, whether displacement created it, and its state: fresh, mitigated (retested) or inverted (closed through).',
    engineChecks: ['fvg.ts: detectFvg finds the three-candle gap and sizes it in ATR; the engine tracks state changes on every candle.', 'The chart shows the gap, its midpoint, and mitigation / invalidation marks with the time they happened.'],
    annotationTypes: ['fvg-bullish', 'fvg-bearish', 'fvg-midpoint', 'fvg-mitigation', 'fvg-invalidation'],
    caseKinds: ['fvg-created', 'fvg-retest', 'silver-bullet-setup'], strategies: ['session-ifvg', 'silver-bullet', 'unicorn'],
    misreads: ['A gap is a place price may return to, not a promise that it will hold. Many gaps are filled and run through.', 'The size in ATR matters: a gap smaller than the configured minimum is not recorded at all.'],
    related: ['inversion-fvg', 'displacement', 'order-block'],
    quiz: [
      q('fvg-1', 'A bullish fair value gap exists when…', ['Two candles close higher in a row', 'Candle one\'s high is below candle three\'s low', 'The RSI is oversold', 'Volume doubles'], 1, 'That is the three-candle definition detectFvg implements.'),
      q('fvg-2', 'What does the engine call a gap that price has traded back into?', ['Fresh', 'Mitigated', 'Inverted', 'Broken'], 1, 'Mitigated = retested. Inverted = closed through, at which point it flips role.'),
    ],
  },
  {
    id: 'inversion-fvg', title: 'Inversion FVG (IFVG)', level: 'intermediate', track: 'imbalance',
    summary: 'When price closes through a gap instead of respecting it, the gap inverts: a bullish gap that failed becomes a bearish reference, and the retest of the inverted gap is the setup the session strategy is built around. The engine records the inversion time and the retest.',
    engineChecks: ['fvg.ts tracks state = inverted when a close passes through the gap; the session strategy (sessionIfvg.ts) requires sweep → displacement → inversion → retest in order.'],
    annotationTypes: ['fvg-invalidation', 'fvg-mitigation'], caseKinds: ['fvg-inverted', 'strategy-setup'], strategies: ['session-ifvg'],
    misreads: ['An inversion is a close through the gap, not a wick through it.', 'The retest must happen after the inversion; the engine checks the order of events, and so should you.'],
    related: ['fair-value-gap', 'liquidity-sweep', 'displacement', 'sessions-killzones'],
    quiz: [q('ifvg-1', 'In the session strategy, which order of events is required?', ['Retest → sweep → displacement', 'Sweep → displacement → inversion FVG → retest', 'Inversion → sweep → retest', 'Any order, as long as all happen'], 1, 'sessionIfvg.ts checks the chain in that order; the evidence list on every vote shows each step.')],
  },
  {
    id: 'displacement', title: 'Displacement', level: 'foundation', track: 'imbalance',
    summary: 'A candle, or a short run of candles, that moves far relative to recent volatility — measured in ATRs. Displacement is what leaves gaps behind and what the strategies read as intent. The engine measures it, it does not eyeball it.',
    engineChecks: ['The engine flags a gap as fromDisplacement when the middle candle\'s range clears the configured ATR multiple.', 'The case-study engine records any candle at 2.5 ATR or more as a large-displacement event.'],
    annotationTypes: ['fvg-bullish', 'fvg-bearish'], caseKinds: ['large-displacement', 'fvg-created'], strategies: ['session-ifvg', 'breakout'],
    misreads: ['A big candle in a wild regime is ordinary; the ATR normalisation is what makes "big" mean something.', 'Displacement into a level is not the same as displacement away from one; the direction relative to structure matters.'],
    related: ['fair-value-gap', 'volatility-regime', 'bos'],
    quiz: [q('disp-1', 'Why does the engine measure displacement in ATRs rather than in dollars?', ['ATR is easier to compute', 'So that "large" means large relative to the current volatility, not a fixed size', 'Because exchanges report ATR', 'It does not; it uses dollars'], 1, 'A fixed-dollar threshold would fire constantly in a wild regime and never in a quiet one.')],
  },
  // ---------------------------------------------------------------- structure
  {
    id: 'order-block', title: 'Order blocks and breakers', level: 'intermediate', track: 'structure',
    summary: 'An order block is the last opposing candle before a displacement that broke structure: the candle where the move was set up. The engine marks it with the gap and structure-break context, and tracks it as fresh, mitigated (price returned) or broken. A broken block that price then respects from the other side is a breaker.',
    engineChecks: ['orderblocks.ts: detectOrderBlock requires displacement and reads withFvg and withStructureBreak; state changes are recorded per candle.'],
    annotationTypes: ['order-block-bullish', 'order-block-bearish', 'breaker-block', 'block-mitigation', 'block-invalidation'],
    caseKinds: ['order-block-interaction', 'breaker-formation', 'unicorn-setup'], strategies: ['unicorn'],
    misreads: ['Not every last-down-candle is an order block; the engine requires the displacement and the break.', 'A mitigated block is one price returned to — that is a fact about the past, not a signal.'],
    related: ['fair-value-gap', 'bos', 'displacement'],
    quiz: [q('ob-1', 'What must follow the candidate candle for the engine to record an order block?', ['Three green candles', 'A displacement that breaks structure', 'A news release', 'A session open'], 1, 'The displacement and the structure break are what make the last opposing candle meaningful in the model.')],
  },
  {
    id: 'bos', title: 'Break of structure (BOS)', level: 'foundation', track: 'structure',
    summary: 'A close beyond the most recent confirmed swing in the direction of the trend: a higher high in an uptrend, a lower low in a downtrend. It says the trend continued. The engine confirms swings only after the candles either side exist, so a BOS is dated at the close that broke it.',
    engineChecks: ['structure.ts labels swings (HH/HL/LH/LL) and records structureShifts with kind BOS or CHoCH, the swing broken, and the index and time of the break.'],
    annotationTypes: ['bos', 'higher-high', 'higher-low', 'lower-high', 'lower-low'], caseKinds: ['bos'], strategies: ['trend-pullback', 'unicorn', 'silver-bullet'],
    misreads: ['A wick beyond the swing is not a break; the engine uses the close.', 'A swing is confirmed later than it prints. On a replay, the label appears when the engine could know it, not when the swing happened.'],
    related: ['choch', 'dealing-range', 'displacement'],
    quiz: [q('bos-1', 'A swing high prints at 10:00. When can the engine first label it?', ['At 10:00', 'Only after enough later candles confirm it is a swing', 'At the session close', 'Never; swings are drawn by hand'], 1, 'Swing confirmation needs candles on both sides — the reason replay labels appear late, and why that lateness is honest.')],
  },
  {
    id: 'choch', title: 'Change of character (CHoCH)', level: 'foundation', track: 'structure',
    summary: 'A close beyond the most recent swing AGAINST the prevailing trend: the first lower low in an uptrend, or higher high in a downtrend. It is the earliest structural sign the trend may be changing — and it is often wrong on its own.',
    engineChecks: ['structure.ts classifies a shift as CHoCH when the broken swing is against structureTrend; the trend flips only on the engine\'s own rule, not on a single CHoCH.'],
    annotationTypes: ['choch'], caseKinds: ['choch'], strategies: ['turtle-soup', 'session-ifvg'],
    misreads: ['CHoCH is not a reversal; it is a first warning. The counterexample cases show plenty that resolved as pullbacks.'],
    related: ['bos', 'liquidity-sweep'],
    quiz: [q('choch-1', 'The difference between BOS and CHoCH in the engine is…', ['Candle size', 'Whether the broken swing is with or against the current structure trend', 'Session', 'Volume'], 1, 'Same detector, opposite relation to the trend.')],
  },
  {
    id: 'dealing-range', title: 'Dealing range, premium and discount', level: 'intermediate', track: 'structure',
    summary: 'The range between the last significant swing low and swing high. Above its midpoint is premium (expensive), below is discount (cheap). The idea is to buy in discount and sell in premium; the engine marks the range and its equilibrium.',
    engineChecks: ['structure.ts derives the dealing range from confirmed swings; the chart draws the range and its 50% line.'],
    annotationTypes: ['dealing-range'], caseKinds: ['bos', 'choch'], strategies: ['unicorn', 'trend-pullback'],
    misreads: ['Discount is not a buy signal; it is a location filter. Price can spend a long time in discount while falling.'],
    related: ['bos', 'order-block'],
    quiz: [q('dr-1', 'Price is at 30% of the dealing range measured from the low. That is…', ['Premium', 'Discount', 'Equilibrium', 'Undefined'], 1, 'Below the midpoint is discount.')],
  },
  // ---------------------------------------------------------------- sessions
  {
    id: 'sessions-killzones', title: 'Sessions and killzones', level: 'foundation', track: 'sessions',
    summary: 'The day is divided by New York time: Asia, London, New York AM and New York PM. Each session has a range the engine tracks, and each strategy states which sessions it is allowed to act in. Killzones are the windows where the session strategies look for their setups.',
    engineChecks: ['sessions.ts converts every timestamp to New York time with correct daylight-saving handling and labels the session; the ICT day rolls at 18:00 ET.', 'Session ranges (high, low, time set) are on every analysis; the session strategy reads the Asia range for its sweep.'],
    annotationTypes: ['session-boundary', 'session-high', 'session-low'], caseKinds: ['session-transition'], strategies: ['session-ifvg', 'silver-bullet'],
    misreads: ['UTC and New York are not interchangeable; the DST switch moves the sessions by an hour on the UTC clock twice a year.', 'A session being "active" does not mean a setup exists.'],
    related: ['silver-bullet-window', 'asia-range', 'liquidity'],
    quiz: [
      q('sess-1', 'Which clock do sessions run on?', ['UTC', 'The exchange\'s local time', 'New York time, with daylight saving applied', 'The user\'s browser time'], 2, 'sessions.ts does the ET conversion; the UTC-day guard test forbids UTC date keys in the engine.'),
      q('sess-2', 'The London session in this configuration runs…', ['08:00–16:00 London time', '02:00–05:00 New York time', '00:00–09:00 UTC', 'All day'], 1, 'config.ict.sessions.london is 02:00–05:00 ET.'),
    ],
  },
  {
    id: 'silver-bullet-window', title: 'The silver-bullet windows', level: 'intermediate', track: 'sessions',
    summary: 'Three one-hour windows in New York time — 03:00, 10:00 and 14:00 — in which the silver-bullet strategy looks for a fresh gap in the direction of structure being retested. Outside those hours it does not vote.',
    engineChecks: ['silverBullet.ts: the first evidence step is the window check against SILVER_BULLET_HOURS; then direction from structureTrend; then a fresh gap in that direction being retested now.'],
    annotationTypes: ['silver-bullet-window', 'silver-bullet-setup'], caseKinds: ['silver-bullet-setup', 'strategy-rejection'], strategies: ['silver-bullet'],
    misreads: ['The window is a filter, not an edge. The evidence tab shows how the window cohort actually did, with its sample status.'],
    related: ['sessions-killzones', 'fair-value-gap', 'bos'],
    quiz: [q('sb-1', 'Which hour (New York) is NOT a silver-bullet window in this system?', ['03:00', '10:00', '12:00', '14:00'], 2, 'SILVER_BULLET_HOURS = [3, 10, 14].')],
  },
  {
    id: 'asia-range', title: 'The Asia range', level: 'foundation', track: 'sessions',
    summary: 'The high and low set during the Asia session. London often raids one side of it. The session strategy needs a sweep of the Asia high or low before it will look for displacement and a gap.',
    engineChecks: ['sessions.ts builds the Asia range; sessionIfvg.ts requires a sweep of asia-high or asia-low as its liquidity step.'],
    annotationTypes: ['session-high', 'session-low'], caseKinds: ['liquidity-sweep', 'strategy-setup'], strategies: ['session-ifvg'],
    misreads: ['A narrow Asia range is not a guarantee of a big London move. It is a location for stops, nothing more.'],
    related: ['sessions-killzones', 'liquidity-sweep'],
    quiz: [q('asia-1', 'Why does the session strategy care about the Asia range?', ['Volume is highest in Asia', 'Its high and low are liquidity pools the London session often sweeps', 'Asia sets the daily trend', 'It does not'], 1, 'The sweep of the Asia range is the first structural condition in sessionIfvg.ts.')],
  },
  // ---------------------------------------------------------------- regimes
  {
    id: 'regimes', title: 'Market regimes', level: 'intermediate', track: 'regimes',
    summary: 'The engine classifies the market as trending-up, trending-down, ranging, breakout or transition from its own features. The fused decision weights strategy families differently by regime: trend strategies count for more in a trend, mean-reversion in a range.',
    engineChecks: ['features/regime.ts computes the regime from the feature snapshot; fusion/weights.ts applies regimeWeight per family.', 'Every paper trade records the regime at decision time so the evidence tab can cohort by it.'],
    annotationTypes: ['trend-regime', 'range-regime', 'volatility-regime'], caseKinds: ['regime-transition'], strategies: [],
    misreads: ['The regime is a read of the past N candles, not a forecast. It flips late by construction.', 'A strategy family "doing well in trends" is a cohort observation with a sample size, not a rule.'],
    related: ['volatility-regime', 'strategy-regime-map', 'mtf-alignment'],
    quiz: [q('reg-1', 'How does the fused decision use the regime?', ['It refuses to trade outside trends', 'It changes the weight each strategy family gets', 'It picks the strategy with the best backtest', 'It ignores it'], 1, 'fusion/weights.ts: regimeWeight(family, regime) scales each vote.')],
  },
  {
    id: 'volatility-regime', title: 'Volatility regimes', level: 'intermediate', track: 'regimes',
    summary: 'The current ATR against its longer average: quiet, normal or wild. Stops, targets and displacement thresholds are all expressed in ATR, so the volatility label is what keeps "big" and "small" meaningful across regimes.',
    engineChecks: ['features/volatility computes the ratio and label; the case-study engine records expansions from normal to wild.'],
    annotationTypes: ['volatility-regime'], caseKinds: ['volatility-expansion', 'large-displacement'], strategies: [],
    misreads: ['Wild is not "good for trading"; it is bigger stops and bigger slippage. The execution model charges for it.'],
    related: ['regimes', 'displacement', 'execution-costs', 'strategy-regime-map'],
    quiz: [q('vol-1', 'Volatility is labelled from…', ['The VIX', 'The current ATR relative to its longer average', 'Twitter', 'Candle colour'], 1, 'The ratio in the feature snapshot.')],
  },
  {
    id: 'mtf-alignment', title: 'Multi-timeframe alignment', level: 'advanced', track: 'regimes',
    summary: 'Higher-timeframe structure gives context to the trading timeframe. The chart layer shows the higher-timeframe objects; whether alignment improves outcomes is a hypothesis to test, not an assumption. The paper record does not store an alignment flag, so the evidence tab shows this field as not recorded.',
    engineChecks: ['intel/mtf.ts computes higher-timeframe layers for the chart; no strategy currently gates on them.'],
    annotationTypes: [], caseKinds: ['regime-transition'], strategies: [],
    misreads: ['"Aligned with the daily" is a story until it is a cohort with a sample size.'],
    related: ['regimes', 'sample-size'],
    quiz: [q('mtf-1', 'Does the fused decision currently require higher-timeframe alignment?', ['Yes, always', 'No; the chart shows it, no strategy gates on it', 'Only in London', 'Only for shorts'], 1, 'The engine is the source of truth: no strategy reads the MTF layer.')],
  },
  // ---------------------------------------------------------------- risk
  {
    id: 'r-multiple', title: 'R-multiples', level: 'foundation', track: 'risk',
    summary: 'One R is the distance from entry to stop. A trade\'s result in R is its profit divided by that distance. Measuring in R makes trades comparable across prices and volatility; every metric in this system is in R first and dollars second.',
    engineChecks: ['paperTrader.ts computes rMultiple from entry, stop and exit with the realistic fill model; replay does the same for backtests.'],
    annotationTypes: ['entry', 'stop-loss', 'take-profit', 'risk-reward'], caseKinds: ['exceptional-mfe', 'exceptional-mae'], strategies: [],
    misreads: ['A 2R target does not mean a 2R result: fills, spread and slippage are charged, so realised R is below planned R.'],
    related: ['expectancy', 'execution-costs', 'drawdown'],
    quiz: [q('r-1', 'Entry 100, stop 99, exit 101.5 on a long. Result in R (before costs)?', ['+0.5R', '+1.5R', '+2R', '+15R'], 1, '(101.5 − 100) / (100 − 99) = 1.5.')],
  },
  {
    id: 'expectancy', title: 'Expectancy and profit factor', level: 'intermediate', track: 'risk',
    summary: 'Expectancy is the mean result per trade in R. Profit factor is gross wins over gross losses. Both are only as good as the sample behind them: a positive expectancy over 12 trades is a description of 12 trades.',
    engineChecks: ['backtest/metrics.ts and analyst/cohorts.ts compute both; the cohort layer withholds profit factor under the early-sample bar and attaches a 95% t-interval to the mean.'],
    annotationTypes: [], caseKinds: ['unexpected-strategy-failure'], strategies: [],
    misreads: ['A high win rate with a negative expectancy is common: many small wins, a few large losses.', 'Expectancy without an interval is a point estimate pretending to be a fact.'],
    related: ['r-multiple', 'sample-size', 'drawdown'],
    quiz: [q('exp-1', 'Win rate 70%, average win +0.5R, average loss −2R. Expectancy?', ['+0.35R', '−0.25R', '+1.5R', '0R'], 1, '0.7×0.5 − 0.3×2 = −0.25R. A high win rate can lose money.')],
  },
  {
    id: 'drawdown', title: 'Drawdown', level: 'foundation', track: 'risk',
    summary: 'The fall from a peak in cumulative R to the following trough. It is the cost of staying in the game and the number that decides whether a strategy is survivable, not whether it is "good". The validation gates measure it on closed trades.',
    engineChecks: ['paper/validation.ts and backtest/metrics.ts compute max drawdown in R on the closed-trade equity curve; Monte Carlo shuffles the trade order to show the range of drawdowns the same trades could have produced.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['The drawdown you saw is one draw from a distribution. The Monte Carlo 95th percentile is the one to plan around.'],
    related: ['expectancy', 'sample-size'],
    quiz: [q('dd-1', 'Why does the backtester shuffle trade order (Monte Carlo)?', ['To improve the Sharpe', 'To show the range of drawdowns the same trades could have produced in a different order', 'To remove losing trades', 'To speed up the test'], 1, 'The realised drawdown is one path; the shuffle shows the others.')],
  },
  {
    id: 'execution-costs', title: 'Spread, slippage and fees', level: 'intermediate', track: 'risk',
    summary: 'Paper fills are charged spread, slippage that grows with volatility, latency and exchange fees. A strategy that is profitable before costs and flat after is a common outcome — and the honest one.',
    engineChecks: ['execution.ts applies the realistic fill model; every paper position stores the intended entry and the actual fill so the cost is visible per trade.'],
    annotationTypes: ['entry', 'entry-zone'], caseKinds: [], strategies: [],
    misreads: ['"Ideal" fills in a backtest are a fantasy setting kept only for comparison.'],
    related: ['r-multiple', 'volatility-regime'],
    quiz: [q('cost-1', 'Where can you see what execution cost a paper trade?', ['Nowhere; it is netted silently', 'In the intended entry versus the actual fill stored on the position', 'In the news tab', 'Only in live trading'], 1, 'The position record keeps both prices.')],
  },
  // ---------------------------------------------------------------- statistics
  {
    id: 'sample-size', title: 'Sample size and confidence intervals', level: 'intermediate', track: 'statistics',
    summary: 'Under 10 trades a cohort is INSUFFICIENT; 10–49 is EARLY; 50–199 DEVELOPING; 200+ LARGER. The mean R carries a 95% Student-t interval, and a thesis is only stated with the number of further trades that would falsify it. Nothing in this system upgrades a small sample by describing it confidently.',
    engineChecks: ['analyst/cohorts.ts: SAMPLE_BARS and sampleStatus; analyst/attribution.ts: meanWithInterval and tradesNeededToDecide; analyst/thesis.ts: falsification thresholds.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['"It worked five times" is an anecdote. Five is under every bar this system uses.', 'A confidence interval that includes zero means the sign of the edge is not established.'],
    related: ['expectancy', 'overfitting', 'hypothesis-method'],
    quiz: [
      q('ss-1', 'A cohort of 8 trades has mean +0.9R. What does the evidence tab call it?', ['A proven edge', 'INSUFFICIENT SAMPLE', 'DEVELOPING DATASET', 'OOS SUPPORTED'], 1, 'Under 10 is INSUFFICIENT SAMPLE, whatever the mean.'),
      q('ss-2', 'The 95% interval on a cohort mean is −0.2R to +0.6R. The sign of the edge is…', ['Positive', 'Negative', 'Not established', 'Certain'], 2, 'An interval spanning zero leaves the sign open.'),
    ],
  },
  {
    id: 'overfitting', title: 'Overfitting and the deflated Sharpe ratio', level: 'advanced', track: 'statistics',
    summary: 'Try enough rule variants and the best one will look excellent by luck alone. The deflated Sharpe ratio (Bailey & López de Prado, 2014) raises the bar with the number of trials, the track length, and the skew and fat tails of the returns, and returns the probability that the observed Sharpe beats what pure chance would have produced. Every backtest the research lab runs is counted as a trial.',
    engineChecks: ['factory/stats.ts: expectedMaxZ(trials) and deflatedSharpe; research/overfitting.ts adds the skew/kurtosis correction and keeps the trial registry.', 'factory/gate.ts applies the deflated bar to any factory survivor; nothing the factory finds reaches the engine without a human.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['A backtest Sharpe of 2 over 40 trades after 500 trials is not evidence of anything.', 'Trials that were run and discarded still count; forgetting them is the overfit.'],
    related: ['sample-size', 'hypothesis-method', 'strategy-regime-map'],
    quiz: [
      q('ovf-1', 'What happens to the deflated-Sharpe bar as more variants are tried?', ['It falls', 'It rises', 'It is unchanged', 'It becomes negative'], 1, 'Expected maximum of N draws grows with N.'),
      q('ovf-2', 'Which trials count toward the number the deflation uses?', ['Only the winners', 'Only the ones shown on screen', 'Every variant that was evaluated, including discarded ones', 'None'], 2, 'The registry counts every evaluation; that is the point of it.'),
    ],
  },
  {
    id: 'hypothesis-method', title: 'The hypothesis method', level: 'advanced', track: 'research',
    summary: 'An observation becomes a question, the question a hypothesis with a null, the hypothesis a test with a dataset that was fixed before the result was seen, then an out-of-sample check, then robustness. The statuses are UNTESTED, TESTING, INSUFFICIENT DATA, OBSERVED IN SAMPLE, NOT SUPPORTED, OOS SUPPORTED, UNDER REVIEW, STALE, REJECTED. There is no status that declares a result settled.',
    engineChecks: ['research/hypotheses.ts refuses the words proven, guaranteed, certain, best, perfect and fail-proof in any text field, derives status from results, and versions every change.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['Choosing the cohort after seeing the result is the most common way to manufacture an edge.'],
    related: ['sample-size', 'overfitting'],
    quiz: [q('hyp-1', 'Which of these is a hypothesis status in this system?', ['PROVEN', 'OOS SUPPORTED', 'CERTAIN', 'BEST'], 1, 'The other three are banned words.')],
  },
  {
    id: 'strategy-regime-map', title: 'Strategy families by regime', level: 'advanced', track: 'research',
    summary: 'Different strategy families do different things in different conditions: trend and breakout families in expansions, mean-reversion in quiet ranges, and most families struggling in the noisy middle. The research lab maps each family\'s recorded results across volatility and regime buckets, with the sample size in every cell, so the map shows where an edge has REPEATED across similar conditions — and where it has not.',
    engineChecks: ['research/regimeAtlas.ts builds the family × regime and family × volatility tables from evidence records (PAPER and BACKTEST kept apart); cells under the sample bar show n only.', 'The engine\'s own regime weighting (fusion/weights.ts) is fixed configuration; the atlas is read-only research and changes nothing.'],
    annotationTypes: ['trend-regime', 'range-regime', 'volatility-regime'], caseKinds: ['regime-transition', 'volatility-expansion'], strategies: [],
    misreads: ['A family that "wins in calm markets" over 7 trades has not won anywhere yet.', 'The map is descriptive; it is not permission to switch strategies by hand.'],
    related: ['regimes', 'volatility-regime', 'overfitting'],
    quiz: [q('map-1', 'A cell in the regime atlas shows "n = 6" and no mean. Why?', ['A bug', 'The cell is under the sample bar, so only the count is shown', 'The strategy is disabled', 'The regime is unknown'], 1, 'Cells under SAMPLE_BARS.insufficient show n only.')],
  },
  // ---------------------------------------------------------------- markets
  {
    id: 'news-diffusion', title: 'News-to-price diffusion', level: 'advanced', track: 'markets',
    summary: 'Markets react to information, then to themselves. A scheduled release excites price activity, and that activity excites more activity, each burst decaying over time. A self-exciting (Hawkes) model separates the two: how hard a release hits (exogenous intensity), how much the market feeds on its own reaction (endogenous), and how fast it fades (half-life = ln 2 / β). The research lab fits this on the stored release history and price events; it is an ESTIMATE with a sample size, never a forecast.',
    engineChecks: ['news/history.ts remembers every release instance; news/brain.ts runs the event study (range after the release vs an ordinary window on the same days); research/hawkes.ts fits the exponential kernel by bounded maximum likelihood.', 'The engine\'s own news handling is a blackout window around high-impact releases (config); the diffusion estimate does not change it.'],
    annotationTypes: ['news-marker'], caseKinds: ['volatility-expansion'], strategies: [],
    misreads: ['A big reaction once is not a kernel; the fit needs many instances and says INSUFFICIENT DATA until it has them.', 'Excitation is about activity, not direction. A high news→price weight does not say which way.'],
    related: ['volatility-regime', 'sample-size'],
    quiz: [
      q('nd-1', 'In the diffusion model, the half-life of a burst is…', ['β', 'ln 2 / β', '1 / α', 'The session length'], 1, 'Exponential decay at rate β halves in ln2/β.'),
      q('nd-2', 'What does the endogenous component measure?', ['The size of the release surprise', 'Activity created by the market reacting to its own activity', 'The number of headlines', 'The direction of the move'], 1, 'Price → price excitation.'),
    ],
  },
  {
    id: 'prediction-market-edge', title: 'Prediction-market edge, costs and Kelly', level: 'advanced', track: 'markets',
    summary: 'In a binary market the YES and NO prices should sum to one. If the sum of the asks is below one on a single venue, or the same event trades at different YES prices on two venues, there is a theoretical edge. Detection is the easy half: fees, spread, slippage from walking the book, and the time to settle must be subtracted before the edge is real, and the position is sized with a fraction of Kelly so that a wrong probability estimate does not ruin you. Mr. Cash teaches the arithmetic with SIMULATED examples; it is not connected to any prediction market and does not trade them.',
    engineChecks: ['school/predictionMarket.ts is a pure calculator: single-venue edge, cross-venue divergence, cost-adjusted net edge, Kelly fraction with a cap. No venue connection exists in this system.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['A 3% theoretical edge with 2% fees and 1.5% slippage is a loss.', 'Full Kelly assumes the probability is exactly right. It never is; fractional Kelly is the practical rule.'],
    related: ['expectancy', 'execution-costs', 'r-multiple'],
    quiz: [
      q('pm-1', 'YES ask 0.46, NO ask 0.51 on one venue. Theoretical edge before costs?', ['0.03', '0.97', '−0.03', '0.05'], 0, '1 − (0.46 + 0.51) = 0.03.'),
      q('pm-2', 'Why size with a fraction of Kelly rather than full Kelly?', ['Regulations', 'Because the probability estimate is uncertain and full Kelly is unforgiving of error', 'Kelly only works for stocks', 'Fees are lower'], 1, 'Full Kelly maximises log growth only if the inputs are right.'),
    ],
  },
]

const BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]))

export function conceptById(id: string): Concept | null {
  return BY_ID.get(id) ?? null
}

export function conceptIds(): string[] {
  return CONCEPTS.map((c) => c.id)
}

/** Concepts that a case-study kind illustrates. */
export function conceptsForCaseKind(kind: CaseKind): Concept[] {
  return CONCEPTS.filter((c) => c.caseKinds.includes(kind))
}

/** Concepts a strategy relies on — for the strategy passport and the chart's "why is this here". */
export function conceptsForStrategy(strategyId: string): Concept[] {
  return CONCEPTS.filter((c) => c.strategies.includes(strategyId))
}

/** Concepts that explain an annotation type — for the chart's "why is this here". */
export function conceptsForAnnotation(type: AnnotationType): Concept[] {
  return CONCEPTS.filter((c) => c.annotationTypes.includes(type))
}

export type GraphNode = { id: string; title: string; level: ConceptLevel; track: ConceptTrack }
export type GraphEdge = { from: string; to: string; kind: 'related' | 'strategy' | 'case-kind' }

/** The knowledge graph: concepts, the strategies that use them, the case kinds that illustrate them. */
export function conceptGraph(): { nodes: GraphNode[]; edges: GraphEdge[]; dangling: string[] } {
  const nodes = CONCEPTS.map((c) => ({ id: c.id, title: c.title, level: c.level, track: c.track }))
  const edges: GraphEdge[] = []
  const dangling: string[] = []
  for (const c of CONCEPTS) {
    for (const r of c.related) { if (BY_ID.has(r)) edges.push({ from: c.id, to: r, kind: 'related' }); else dangling.push(`${c.id} → ${r}`) }
    for (const s of c.strategies) edges.push({ from: c.id, to: `strategy:${s}`, kind: 'strategy' })
    for (const k of c.caseKinds) edges.push({ from: c.id, to: `case:${k}`, kind: 'case-kind' })
  }
  return { nodes, edges, dangling }
}

/** A question without its answer — what the browser receives. */
export function publicQuestion(qq: QuizQuestion): Omit<QuizQuestion, 'answer' | 'why'> {
  return { id: qq.id, prompt: qq.prompt, choices: qq.choices }
}
