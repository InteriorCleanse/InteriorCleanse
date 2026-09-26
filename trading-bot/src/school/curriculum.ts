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
export type ConceptTrack = 'basics' | 'priceaction' | 'scalping' | 'structure' | 'liquidity' | 'imbalance' | 'sessions' | 'regimes' | 'risk' | 'statistics' | 'research' | 'markets'

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
  // ---------------------------------------------------------------- basics (start here)
  // For someone new to trading. These describe how markets and orders work in general; where the app has
  // a tool for the idea (the Planner, the Journal, the paper fill model) the lesson says which one.
  {
    id: 'what-you-trade', title: 'What you are actually trading', level: 'foundation', track: 'basics',
    summary: 'A share is a small piece of a company. A coin is a token on a crypto network. An ETF is a basket traded like one share. An option is a contract whose price comes from a share or index. Your broker (Robinhood, Webull, tastytrade, Kraken…) routes your order to a market where a buyer meets a seller. Stocks trade 09:30–16:00 New York time with thinner extended hours around them; crypto trades every hour of every day.',
    engineChecks: ['Mr. Cash watches one crypto market (BTCUSDT) and trades it on paper only; nothing it does touches a real account.', 'Linked brokers are read-only: the Desk shows balances, never an order button (src/broker/).'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['Owning a coin or a share is not the same as owning an option on it: the option can expire worth nothing while the share still exists.', 'A market being open 24/7 (crypto) does not mean liquidity is the same at 3 a.m. as at the New York open.'],
    related: ['bid-ask', 'order-types', 'options-basics'],
    quiz: [
      q('wyt-1', 'Which of these trades around the clock, weekends included?', ['US stocks', 'Bitcoin', 'US stock options', 'Treasury bonds'], 1, 'Crypto venues run 24/7; US stocks and options keep exchange hours.'),
      q('wyt-2', 'What does your broker do when you press buy?', ['Sells you its own shares at a price it picks', 'Routes your order to a market where it can be matched with a seller', 'Guarantees you the last price you saw', 'Holds the order until the end of the day'], 1, 'The broker routes the order; the price you get depends on who is selling at that moment.'),
    ],
  },
  {
    id: 'candles-timeframes', title: 'Candles and timeframes', level: 'foundation', track: 'basics',
    summary: 'A candle summarises trading over a fixed period: where price opened, the highest and lowest it reached, and where it closed. A green body closed above its open; red closed below. The wicks are the extremes that did not hold. The same market looks different on a 1-minute, 5-minute or daily chart, so always know which timeframe you are reading.',
    engineChecks: ['The engine builds its view from 5-minute candles (src/data/candleStore.ts) and checks higher timeframes for alignment; the Chart tab draws the same candles.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['A candle is not finished until its period closes: a big green 5-minute candle at minute 2 can close red at minute 5.', 'A pattern on the 1-minute chart can be noise inside a single daily candle.'],
    related: ['what-you-trade', 'mtf-alignment', 'bos'],
    quiz: [q('ct-1', 'A candle opened at 100, went up to 104, down to 98 and closed at 101. What was its high?', ['100', '101', '104', '98'], 2, 'The high is the top of the upper wick: 104.')],
  },
  {
    id: 'bid-ask', title: 'Bid, ask and the spread', level: 'foundation', track: 'basics',
    summary: 'The bid is the highest price someone will pay right now; the ask is the lowest price someone will sell at. Buy at market and you pay the ask; sell at market and you get the bid. The gap between them is the spread, a cost you pay on every round trip. Busy markets have tight spreads; thin ones, like far-out option strikes, can have very wide ones.',
    engineChecks: ['Paper fills are charged a spread and slippage by the fill model (src/execution.ts), so the paper record already pays this cost.', 'The Planner reminds you to prefer option strikes with a tight bid-ask spread.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['The "last price" on screen is the last trade, not the price you will get.', 'A 10-cent spread on a $0.50 option is a 20% cost before the trade has moved at all.'],
    related: ['order-types', 'execution-costs'],
    quiz: [q('ba-1', 'Bid 1.20, ask 1.30. You buy at market, then sell at market straight away. Roughly what happened?', ['You broke even', 'You lost about the 0.10 spread per share', 'You gained 0.10', 'Nothing; market orders are free'], 1, 'You bought at the ask (1.30) and sold at the bid (1.20).')],
  },
  {
    id: 'order-types', title: 'Order types: market, limit, stop, bracket', level: 'foundation', track: 'basics',
    summary: 'A market order fills now at whatever the other side offers. A limit order fills only at your price or better, and may not fill at all. A stop order waits until price touches a level and then becomes a market order — the usual way to cap a loss. A stop-limit becomes a limit instead, so it may not fill in a fast move. A bracket (or OCO) sends a stop and a target together; when one fills, the other is cancelled.',
    engineChecks: ['The paper bot plans every trade with an entry, a stop and a target before it enters; the risk engine rejects a plan whose stop sits on the entry or is absurdly wide (src/risk/rules/perTrade.ts).', 'The Planner tab turns your entry and stop into a size and a plain-text ticket you can paste next to the broker\'s order form.'],
    annotationTypes: ['entry', 'stop-loss', 'take-profit'], caseKinds: [], strategies: [],
    misreads: ['A stop is not a promise of that price: if the market gaps through it, a stop fills at the next available price.', 'A stop-limit can leave you in a losing trade if price jumps past your limit.'],
    related: ['bid-ask', 'position-sizing', 'r-multiple'],
    quiz: [
      q('ot-1', 'You want to cap a loss if price falls to 95, and you accept any fill once it gets there. Which order?', ['Limit sell at 95', 'Stop (market) sell at 95', 'Market sell now', 'Stop-limit with a limit of 96'], 1, 'A stop becomes a market order at 95; it fills even in a fast drop, though possibly below 95.'),
      q('ot-2', 'What does a bracket (OCO) order do?', ['Buys twice', 'Sends a stop and a target; when one fills the other is cancelled', 'Doubles your size at the target', 'Only works on crypto'], 1, 'One-cancels-other: the exit that fills first cancels the other.'),
    ],
  },
  {
    id: 'position-sizing', title: 'Position sizing: risk a fixed slice', level: 'foundation', track: 'basics',
    summary: 'Decide how much of the account you are willing to lose if the stop is hit — many traders use 0.5% to 1% — and let that decide the size. Size = amount at risk ÷ distance from entry to stop. A wide stop means a small position; a tight stop allows a larger one. The loss at the stop stays the same either way, which is what keeps one bad day from ending the account.',
    engineChecks: ['The paper bot sizes every trade from a fixed risk per trade and caps the size (src/risk/rules/perTrade.ts).', 'The Planner tab does the same arithmetic for your own trades, never spends more cash than you hold, and warns above 2% risk.'],
    annotationTypes: ['entry', 'stop-loss'], caseKinds: [], strategies: [],
    misreads: ['"I\'ll just buy 100 shares" is a size chosen by habit, not by risk.', 'Moving the stop further away after entering quietly multiplies the risk you planned.'],
    related: ['order-types', 'r-multiple', 'drawdown'],
    quiz: [q('ps-1', 'Account $5,000, risk 1%, entry 20.00, stop 19.50. How many shares?', ['50', '100', '250', '500'], 1, '1% of 5,000 is $50; $50 ÷ $0.50 = 100 shares.')],
  },
  {
    id: 'options-basics', title: 'Options: calls, puts, strike and expiry', level: 'foundation', track: 'basics',
    summary: 'A call gives the right to buy 100 shares at the strike price until expiry; a put gives the right to sell. You pay a premium per share, so a $2.00 option costs $200 per contract. A buyer can lose at most the premium. At expiry a call is worth only what the share is above the strike (a put, below it); break-even for a call is strike + premium.',
    engineChecks: ['Mr. Cash does not trade options. The Planner\'s option calculator sizes contracts by the loss at your stop, always shows the worst case (the whole premium), and compares strikes at expiry.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['Being right about direction is not enough: the move must beat the premium, and arrive before expiry.', 'Cheap far-out strikes look attractive because most of them expire worthless.'],
    related: ['options-decay-iv', 'bid-ask', 'position-sizing'],
    quiz: [
      q('opt-1', 'A 105 call costs $1.50. What is its break-even at expiry?', ['103.50', '105.00', '106.50', '150.00'], 2, 'Strike plus premium: 105 + 1.50.'),
      q('opt-2', 'How much does one contract cost at a quoted premium of $0.80?', ['$0.80', '$8', '$80', '$800'], 2, 'Standard US equity options cover 100 shares: 0.80 × 100.'),
    ],
  },
  {
    id: 'options-decay-iv', title: 'Time decay and implied volatility', level: 'intermediate', track: 'basics',
    summary: 'Part of an option\'s price is time value, and it melts as expiry approaches — faster in the last few weeks (theta). Another part is implied volatility: how big a move the market is pricing in. Before earnings or big news implied volatility is high; right after, it often collapses (an "IV crush"), so an option can lose value even when the share moves your way.',
    engineChecks: ['The Planner\'s strike table is at expiry only and says so: it ignores time value and implied volatility, so it is a floor for thinking, not a price forecast.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['A share going up does not mean a call goes up if implied volatility fell at the same time.', 'Holding a short-dated option over a quiet weekend costs time value with no move to show for it.'],
    related: ['options-basics', 'volatility-regime', 'news-diffusion'],
    quiz: [q('iv-1', 'You buy a call the day before earnings. The share rises a little on the report, yet the call loses value. The likeliest reason?', ['The broker made an error', 'Implied volatility collapsed after the event', 'Calls lose value when shares rise', 'The spread narrowed'], 1, 'The pre-event premium priced a bigger move; when the uncertainty passed, that part of the price fell away.')],
  },
  {
    id: 'leverage-margin', title: 'Leverage, margin and the day-trade rule', level: 'intermediate', track: 'basics',
    summary: 'Margin is borrowing from your broker; leverage is controlling more than your cash. At 10× leverage a 10% move against you erases the margin behind the position. Crypto futures and perpetuals can liquidate you automatically. In the US, a margin account has long needed $25,000 to make four or more day trades in five business days (the pattern day trader rule); FINRA has proposed changing it, so check your broker\'s current terms.',
    engineChecks: ['The paper bot caps open positions and their total value (by default, no more than the paper account itself), plus daily trade and loss limits (src/risk/rules/).'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['Leverage does not change whether a trade idea is good; it changes how fast a bad one hurts.', 'A cash account avoids margin calls but has its own settlement limits on reusing money the same day.'],
    related: ['position-sizing', 'drawdown'],
    quiz: [q('lev-1', 'At 5× leverage, roughly what move against you erases the margin behind a position?', ['5%', '20%', '50%', '100%'], 1, '1 ÷ 5 = 20%; fees and funding make it a little less.')],
  },
  {
    id: 'trading-plan', title: 'A trading plan and a journal', level: 'foundation', track: 'basics',
    summary: 'Write the plan before the trade: what you are waiting for, where you get in, where you are wrong (the stop), where you take profit, and how much you risk. Afterwards, journal what happened and whether you followed the plan. Judging trades by whether you followed the plan, not by whether one made money, is how a small sample teaches you anything.',
    engineChecks: ['The Journal tab records moments and trades with the market context attached; the paper bot writes its own plan before every entry and keeps it next to the result.'],
    annotationTypes: ['entry', 'stop-loss', 'take-profit'], caseKinds: [], strategies: [],
    misreads: ['A winning trade that broke the plan is a lesson in luck, not in skill.', 'Ten trades are too few to judge a method; the School\'s sample-size lesson shows why.'],
    related: ['position-sizing', 'psychology', 'sample-size'],
    quiz: [q('tp-1', 'You broke your plan and the trade made money. How should the journal score it?', ['A good trade — it made money', 'A plan violation, whatever the result', 'Ignore it', 'Double the size next time'], 1, 'The process is what you can repeat; one result is noise.')],
  },
  {
    id: 'psychology', title: 'The mind: FOMO, revenge and overtrading', level: 'foundation', track: 'basics',
    summary: 'Most early damage is behavioural. FOMO is chasing a move that already happened. Revenge trading is taking a quick new trade to win back a loss. Overtrading is trading because you are bored or watching. Simple rules help: a maximum number of trades or a maximum loss per day, and stepping away once either is reached.',
    engineChecks: ['The paper bot enforces a daily trade cap and a daily loss limit (src/risk/rules/dailyLimits.ts), and the Stop button is a kill switch that blocks new positions until you resume.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['Doubling size after a loss to "get it back" is how a normal losing day becomes an account-ending one.', 'Not trading is a position too: a day with no setup is not a wasted day.'],
    related: ['trading-plan', 'position-sizing', 'drawdown'],
    quiz: [q('psy-1', 'You hit your daily loss limit at 10:15. What does the rule say?', ['One more trade to win it back', 'Stop for the day', 'Double the size', 'Switch to options'], 1, 'The limit exists for exactly this moment.')],
  },
  // ---------------------------------------------------------------- price action (the candlestick-trading method)
  // Trend, level, signal: the method popularised by the "Candlestick Trading Bible". The Scanner finds each
  // shape by fixed rules (src/scanner/priceAction.ts) and measures what followed it on the market's own history.
  {
    id: 'pa-trend-level-signal', title: 'Trend, level, signal: reading candles in context', level: 'foundation', track: 'priceaction',
    summary: 'A candle pattern means little on its own. The method asks three questions in order. Is the market trending, ranging or choppy? Is price at a level it has turned at before (support, resistance, supply or demand)? Is there a clean candle signal there, pointing the same way as the trend or away from the range edge? When all three line up the setup is worth a look; when only the candle is there, the method says wait.',
    engineChecks: ['The Scanner grades the last candle of every watched market A (all three), B (two) or C (the signal alone), with the reason for each check (src/scanner/priceAction.ts, confluence).', 'Levels are clusters of swing points confirmed by the time of the candle, within half an average true range of each other.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['A grade A setup is a reason to look closer, not a trade: the grade has not been tested as a trading rule here.', 'A range is not a trend. In a range the method only takes signals at the edges, never in the middle.'],
    related: ['pa-pin-bar', 'pa-engulfing', 'pa-inside-fakey', 'pa-evidence', 'candles-timeframes'],
    quiz: [
      q('pa-tls-1', 'A bullish pin bar forms in the middle of a downtrend, nowhere near a level. What does the method say?', ['Buy it: pin bars reverse trends', 'Pass: the signal is alone, with the trend against it and no level behind it', 'Sell it', 'Double the size'], 1, 'Signal alone is grade C. The method waits for trend and level to agree.'),
      q('pa-tls-2', 'Which of these is a "level" in this method?', ['Any round number', 'A price where the market has turned more than once', 'Yesterday\'s close', 'The moving average'], 1, 'A level earns its place by price having reacted there before.'),
    ],
  },
  {
    id: 'pa-pin-bar', title: 'The pin bar: rejection in one candle', level: 'foundation', track: 'priceaction',
    summary: 'A pin bar has a long tail, at least two thirds of the whole candle, with the body and the short end in the other third. The tail shows price was pushed one way and rejected inside the same candle. A bullish pin has the tail below; a bearish pin has it above. A hammer is a bullish pin after a drop, and a shooting star is a bearish pin after a rise.',
    engineChecks: ['Detected on every watched market by fixed rules: tail ≥ ⅔ of the range, body in the far third, and a candle at least 0.6 ATR tall so slivers do not count (src/scanner/priceAction.ts).'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['The tail is where price was rejected, not where it is going: a bullish pin at a resistance level is still under resistance.', 'On a 1-minute chart a pin bar can be a single large order; the method prefers higher timeframes.'],
    related: ['pa-trend-level-signal', 'pa-engulfing'],
    quiz: [q('pa-pin-1', 'Where is the long tail on a bullish pin bar?', ['Above the body', 'Below the body', 'There is no tail', 'On both sides equally'], 1, 'The long lower tail is the rejected push down.')],
  },
  {
    id: 'pa-engulfing', title: 'Engulfing bars, stars and tweezers', level: 'foundation', track: 'priceaction',
    summary: 'An engulfing bar is a candle whose body swallows the previous body in the opposite colour: control changed hands within two candles. A morning or evening star spreads the same change over three candles: a strong candle, a small pause, a strong reply. Tweezers are two candles stopping at the same high or low. Harami, piercing line and dark cloud cover are milder versions of the same story.',
    engineChecks: ['All of these are found on the last closed candle of each watched market (src/scanner/priceAction.ts), each with what would confirm it and what would cancel it.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['A big engulfing candle after a long move can be the last push, not the turn.', 'Stars and tweezers need the move before them: in a flat market they are just noise.'],
    related: ['pa-trend-level-signal', 'pa-pin-bar'],
    quiz: [q('pa-eng-1', 'What makes a bullish engulfing bar?', ['Any green candle', 'A green body that swallows the previous red body', 'Two green candles in a row', 'A long upper wick'], 1, 'The second body must cover the first, in the opposite colour.')],
  },
  {
    id: 'pa-inside-fakey', title: 'Inside bars and the fakey', level: 'intermediate', track: 'priceaction',
    summary: 'An inside bar sits entirely within the previous candle (the mother bar): the market paused. On its own it has no direction; traders watch which side breaks. A fakey is what happens when that break fails: price pokes out of the mother bar and closes back inside it. The trapped breakout traders then have to get out, which can push price the other way.',
    engineChecks: ['Inside bars and bullish and bearish fakeys are detected by fixed rules on each watched market (src/scanner/priceAction.ts).'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['An inside bar in a choppy market is the normal state of things, not a setup.', 'A fakey needs the close back inside; a wick outside that is still open is not one yet.'],
    related: ['pa-trend-level-signal', 'liquidity-sweep'],
    quiz: [q('pa-fk-1', 'An inside bar breaks higher, then the same candle closes back inside the mother bar. What is that?', ['A breakout', 'A bearish fakey', 'A doji', 'A bullish engulfing'], 1, 'The failed break higher traps buyers: a bearish fakey.')],
  },
  {
    id: 'pa-evidence', title: 'Do candle patterns work? Measure, do not believe', level: 'intermediate', track: 'priceaction',
    summary: 'Books and videos describe candle patterns with confidence, but published counts (for example Thomas Bulkowski\'s study of more than a hundred candle types) find most of them call direction only modestly better than a coin flip, and the moves after them are often small. Context helps, costs hurt, and small samples mislead. The honest move is to measure a pattern on the market you trade, against the baseline of every candle, before trusting it.',
    engineChecks: ['The Scanner\'s "What followed these patterns here" table walks each market\'s history candle by candle, finds every pattern as it would have looked at the time, and compares the move after it with every candle\'s move. Labelled BACKTEST, with INSUFFICIENT SAMPLE below 30 cases (src/scanner/priceAction.ts, patternEvidence).'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['A high hit rate on 12 cases is a story, not evidence.', 'Beating a coin flip is not enough: the pattern has to beat what every candle did anyway (the drift), and then cover fees and slippage.'],
    related: ['pa-trend-level-signal', 'sample-size'],
    quiz: [q('pa-ev-1', 'A pattern "went its way" 60% of the time, but every candle went up 58% of the time over the same horizon. What have you learned?', ['The pattern is reliable', 'Very little: it barely beats the baseline', 'It never works', 'Trade it with more size'], 1, 'The comparison with the baseline is the whole point.')],
  },
  // ---------------------------------------------------------------- scalping (technical and fundamental)
  // The Scalp desk (src/scalp/model.ts) turns these into a live reading and a break-even calculator.
  {
    id: 'scalp-costs', title: 'Scalping is a costs game first', level: 'foundation', track: 'scalping',
    summary: 'A scalp aims for a small move, so the fixed costs of every trade (half the spread in and out, the fee on both sides, slippage) are a large share of the target. After costs a win nets less and a loss costs more, so the win rate needed to break even rises above the textbook stop ÷ (target + stop). With a 10 bps fee per side, a 20 bps target is a cost trap: the round trip alone is over 20 bps. Cut costs first (maker orders, a cheaper fee tier, the tightest markets), then look for an edge.',
    engineChecks: ['The Scalp desk computes the round trip from the paper engine\'s own assumptions (config.execution: spread, taker fee both sides, slippage) and the break-even win rate for any target and stop (src/scalp/model.ts, breakEven).'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['"I win 60% of my scalps" means nothing without the costs: at the wrong shape 60% still loses money.', 'Fees quoted per side are paid twice per trade.'],
    related: ['scalp-execution', 'scalp-liquidity', 'bid-ask'],
    quiz: [
      q('sc-c-1', 'Target 20 bps, stop 20 bps, round-trip costs 10 bps. What win rate breaks even?', ['50%', '60%', '75%', '40%'], 2, 'A win nets 10, a loss costs 30: 30 ÷ (10 + 30) = 75%.'),
      q('sc-c-2', 'Which change helps a scalper most at a 0.1% taker fee?', ['Smaller targets', 'More trades', 'Maker (limit) orders and a cheaper fee tier', 'A tighter stop'], 2, 'Costs are the biggest lever; smaller targets make the share of costs worse.'),
    ],
  },
  {
    id: 'scalp-liquidity', title: 'When to scalp: liquidity windows', level: 'foundation', track: 'scalping',
    summary: 'Scalping needs many participants: tight spreads, deep books, and moves that carry. Those come at session opens and overlaps (London open, the New York open, the London and New York overlap) and around the stock-market open for equities and index futures. The quiet hours, weekends and holidays give wider spreads and random chop. Crypto trades all day, but its liquidity still follows the traditional sessions.',
    engineChecks: ['The Scalp desk reads the session and killzone from src/sessions.ts and marks the liquidity window good, thin or quiet, with minutes to the next killzone.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['A 24/7 market is not equally liquid 24/7.', 'The first seconds after an open can be the widest spreads of the day: wait for the book to fill.'],
    related: ['scalp-costs', 'scalp-news', 'sessions-killzones'],
    quiz: [q('sc-l-1', 'Which time usually suits a scalper best?', ['Sunday night', 'The London and New York overlap', 'Lunchtime in New York', 'Just before a holiday close'], 1, 'The overlap has the most participants and the tightest books.')],
  },
  {
    id: 'scalp-news', title: 'The fundamental side of scalping: the news clock', level: 'foundation', track: 'scalping',
    summary: 'Scalpers do not trade the meaning of the news; they trade around its timing. High-impact releases (US jobs, CPI, the Fed decision and press conference, central-bank rate decisions) widen spreads, empty the book and gap price through stops. The rule: be flat before a high-impact release and wait until the spread and the tape settle. Also know the market\'s own clock: crypto funding times, futures rollovers, the equity open and close auctions, earnings for single stocks, and weekend gaps.',
    engineChecks: ['The Scalp desk reads the economic calendar and news blackouts (src/news.ts) and says stand aside within 15 minutes of a high-impact release.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['"I will just use a tight stop" fails in news: stops fill at the next available price, which can be far away.', 'A low-impact release can still move a thin market.'],
    related: ['scalp-liquidity', 'scalp-execution'],
    quiz: [q('sc-n-1', 'US CPI is out in 8 minutes. What does the scalping rule say?', ['Buy now before it moves', 'Be flat and wait until the spread settles after the release', 'Double the size', 'Tighten the stop'], 1, 'Spreads widen and price gaps; being flat is the plan.')],
  },
  {
    id: 'scalp-toolkit', title: 'The technical toolkit: VWAP, fast averages, levels, tape', level: 'intermediate', track: 'scalping',
    summary: 'Classic scalping tools on the 1- to 5-minute chart:\n- VWAP: the day\'s volume-weighted average price, where many large orders are benchmarked.\n- The 9 and 20 EMAs: for pullbacks in a trend.\n- The opening range: the high and low of the first minutes.\n- Yesterday\'s high and low, and the session ranges.\n- The tape and the book: aggressive buying or selling (delta), how imbalanced the book is, and absorption, meaning big resting orders soaking up the pushes.\nTrend tape: buy pullbacks to VWAP or the EMAs in the trend direction. Chop: fade only the range edges, or wait.',
    engineChecks: ['The engine already computes VWAP and volume profile (src/features/), the session ranges, and the order book and tape (src/orderflow.ts). The Scalp desk reads trend versus chop with an efficiency ratio and shows the live spread, book balance and tape speed.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['VWAP is a reference, not a wall: in a strong trend price can stay on one side all day.', 'Order-book walls can be pulled in a second; watch what trades, not only what rests.'],
    related: ['scalp-execution', 'scalp-costs', 'pa-trend-level-signal'],
    quiz: [q('sc-t-1', 'The tape is trending up cleanly. Where is the textbook scalp?', ['Short the high', 'A pullback to VWAP or the 9/20 EMA, long, stop beyond the pullback low', 'Anywhere in the middle of the range', 'Buy the top of a spike'], 1, 'With the trend, from a reference, with a defined stop.')],
  },
  {
    id: 'scalp-execution', title: 'Execution: limit vs market, stops, slippage', level: 'intermediate', track: 'scalping',
    summary: 'At a scalper\'s size and speed, how you get in and out is part of the edge. A market order pays the spread and the taker fee, and slips in a thin book. A limit order rests, pays the (lower) maker fee and no spread, but may not fill, and the fills you do get are more often the ones that go against you. Stops go beyond the noise (at least one typical candle), not inside it. A target has to be traded through, not just touched, to count.',
    engineChecks: ['The paper engine\'s fill model charges spread, slippage and fees, enters at the next candle\'s open and counts a target only when traded through (config.execution; src/paper/). The Scalp desk suggests a starting stop of one typical candle and a target that keeps costs under a third.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['A backtest that fills every limit at the touch overstates a scalper\'s results badly.', 'Moving a stop "just a bit" in a scalp turns a small loss into a large one.'],
    related: ['scalp-costs', 'order-types', 'scalp-discipline'],
    quiz: [q('sc-e-1', 'Why can limit orders flatter a scalping backtest?', ['They are always cheaper', 'Real limits fill less often, and more often when price is about to go against you', 'They never fill', 'They avoid fees entirely'], 1, 'Adverse selection: the easy fills are the ones you did not want.')],
  },
  {
    id: 'scalp-discipline', title: 'Scalping discipline: count, cap, stop', level: 'foundation', track: 'scalping',
    summary: 'Scalping produces many decisions a day, so small leaks compound: overtrading when bored, revenge trades after a loss, and size creeping up. Professionals cap the number of trades and the daily loss, stop after a set number of losses in a row, and journal every trade with its reason and costs. Fatigue is real: performance usually drops late in a long session.',
    engineChecks: ['The risk engine enforces a daily trade cap and a daily loss limit, and the Stop button is a kill switch (src/risk/). The Journal records each trade with its costs.'],
    annotationTypes: [], caseKinds: [], strategies: [],
    misreads: ['Many small wins can hide one large loss that erases them; judge by net R, not by win count.', 'More screen time is not more edge.'],
    related: ['psychology', 'trading-plan', 'scalp-costs'],
    quiz: [q('sc-d-1', 'You have lost three scalps in a row, as your rule allows. What now?', ['Double size to win it back', 'Stop for the session and review the journal', 'Switch to a faster chart', 'Remove the stop'], 1, 'The rule exists for exactly this moment.')],
  },
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
