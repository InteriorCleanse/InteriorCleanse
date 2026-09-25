# Price action: the candlestick method, measured

The owner asked for the knowledge in *The Candlestick Trading Bible* and the
most useful price-action research to be built into the bot. This page says
what was built, how it works and what the research actually shows.

## What the research shows (read this first)

- **The method: trend, level, signal.** The book's core teaching fits in three
  questions. Is the market trending, ranging or choppy? Is price at a level it
  has turned at before? Is there a clean candle signal there, pointing the same
  way? Its signals are the pin bar, the engulfing bar and the inside bar (with
  its failed-break cousin, the fakey), plus the classic Japanese patterns.
- **Patterns on their own are weak.** Thomas Bulkowski counted more than a
  hundred candle types over decades of stock data. A bullish engulfing called
  direction about 63% of the time, and a hammer about 60%, but the moves that
  followed were often small. Other long-run tests of the hammer on its own
  found close to a coin flip once costs were counted. Context (trend, level,
  volume) is what the better results have in common.
- **So no pattern is presented here as reliable.** Instead, the bot measures
  each one on the market you are looking at, against the baseline of every
  candle, and says INSUFFICIENT SAMPLE when there are too few cases.

## What was built

| Piece | Where | What it does |
|---|---|---|
| Candle library | `src/scanner/priceAction.ts` (`candleSignalsAt`) | Pin bars, engulfing bars, inside bars and fakeys, hammers and shooting stars, morning and evening stars, harami, tweezers, piercing line and dark cloud cover, three soldiers and three crows, doji. Each has what would confirm it and what would cancel it. |
| Trend · level · signal grade | `confluence` | Grades the last candle A (all three), B (two) or C (signal alone), with the reason for each check. |
| Bias score | `biasScore` | Six different readings (structure, averages, RSI, MACD, the last candle, volume) added up to a number from −6 to +6, with a plain lean: long, short or sit out. The idea comes from TradingPilotAI's single "bias score". Unlike that one, this uses six *different kinds* of reading, not four moving averages counted four times. |
| Pattern evidence | `patternEvidence` and `GET /api/scanner/evidence` | Walks the market's history candle by candle. It finds each pattern as it would have looked at the time, without using any later candle, and records the move `horizon` candles later in average true ranges. That move is compared with every candle's move, and again for the A/B grades only. Labelled BACKTEST. |
| Lessons | School → "Price action: candles in context" | Five lessons with quizzes: the method, the pin bar, engulfing bars and stars, inside bars and the fakey, and how to measure a pattern instead of believing it. |
| On screen | Scanner (a market's detail) and Home ("Price action at a glance") | The score gauge and its six parts, the three checks, and the evidence table. |

## Rules held

- Nothing here reaches the engine: the strategies, fusion and risk are
  unchanged, and a test checks that they do not import this file.
- The code is pure: no network, no clock. A test proves there is no
  look-ahead. Reading the history up to candle *n* gives exactly the same
  step as reading all of it.
- No profitability language. The grade and the score are summaries, not
  signals, and the page says so.

## Sources

- The Candlestick Trading Bible (summaries): sobrief.com/books/the-candlestick-trading-bible-invented-by-munehisa-homma
- Bulkowski, bullish engulfing: thepatternsite.com/BullEngulfing.html
- Bulkowski, hammer: thepatternsite.com/Hammer.html
- TradingPilotAI review, the bias score and its critique: brokerlistings.com/scams/tradingpilotai
