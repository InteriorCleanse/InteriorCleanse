# Scalping: the Scalp desk, the lessons, the 5-minute call

The owner asked for a bot with a crucial fundamental and technical
understanding of scalping, and one that can predict the future. This is what
was built, and what can honestly be said about each.

## The core truth: scalping is a costs game first

A scalp aims for a small move, so the costs of every trade are a large share
of the target:

- half the spread going in and half coming out
- the fee on both sides
- slippage

At the paper engine's own assumptions (`config.execution`: 1 bp spread, 0.1%
taker fee a side, 2 bps slippage a side), a round trip costs **25 bps**. With
BTC at $80,000 that is about $200 per whole coin.

A 20 bps target cannot break even at any win rate. A 40 bps target with a
30 bps stop needs about 79% wins; the same shape with no costs needs 43%.
That is why the first lever a professional scalper pulls is cost:

- maker (limit) orders
- a cheaper fee tier
- the tightest markets

## What was built

| Piece | Where | What it does |
|---|---|---|
| **Scalp desk** tab (Markets group) | `web/js/scalp.js`, `GET /api/scalp` | Grades conditions right now as good, thin or stand aside, with a 0–100 score and a reason for each reading. See the readings below. |
| Playbook | same | Textbook moves for the current conditions: in a trend, a pullback to VWAP or the 9/20 EMA; in chop, trade only the edges or wait; otherwise trade only at levels. Includes a starting shape: a stop one typical candle wide and a target that keeps costs under a third. |
| Break-even calculator | `GET /api/scalp/breakeven` | For any target, stop and your own venue's costs: the round trip, the share of the target it takes, and the win rate needed with and without costs. A curve shows how the bar rises as targets shrink. |
| The 5-minute call | a second call desk (`/api/forecast?window=5`); a 15m / 5m switch on The call tab | Up or down over the next five minutes, settled and scored against a coin flip, with its own record (`forecasts-5m.json`) and backtest. |
| Lessons | School → "Scalping: the technical and fundamental side" | Six lessons with quizzes: costs first, liquidity windows, the news clock, the technical toolkit, execution, and discipline. |
| Ask → Scalper | the hat reads the live Scalp desk | It answers costs first, then liquidity, news, spread, tape, and only then the setup. |

The desk's readings:

- **Liquidity window:** the session, the killzone, weekends.
- **Typical move:** how far an average candle travels, in basis points.
- **Costs vs move:** the round trip as a share of that move.
- **Live spread:** from the order book.
- **Tape speed:** how many trades are going through.
- **Trend or chop:** whether moves carry or go nowhere.
- **News clock:** high-impact releases and blackouts.

Any of costs, spread or news can force "stand aside" on its own.

## The fundamental side, for a scalper

Scalpers trade around the *timing* of news, not its meaning:

- **High-impact releases** widen spreads, empty the book and gap price
  through stops: US jobs, CPI, the Fed decision and press conference, and
  other central-bank rate decisions.
- **The rule** is to be flat before them and wait until the spread and tape
  settle. The desk says stand aside within 15 minutes of a high-impact
  release, or inside a news blackout.
- **Know the market's own clock:**
  - crypto funding times
  - futures rollovers
  - the equity open and close auctions
  - earnings for single stocks
  - weekend gaps

## Predicting the future: the honest version

No person or model can see the future. What a forecaster can do is state a
probability, show its working and keep score. Mr. Cash does exactly that:

- The 15-minute and 5-minute desks log every call before its window closes.
- Each call is settled against the real close and scored with the Brier
  score against a coin flip.
- Until the live record has 30 calls, every number is labelled NOT ENOUGH
  DATA.

The first backtest on sample data scored slightly worse than a coin flip.
The desk shows that openly, which is what makes it worth listening to if it
ever does better.

## Rules held

- Nothing here reaches the engine or places an order. The paper engine keeps
  trading its own 5-minute strategies with the same costs and gates.
- No change to strategies, risk, fusion or `config.ts`; the desk only reads
  `config.execution`.
- Every surface is labelled: READING, ARITHMETIC, PAPER FORECAST or BACKTEST.
- No profitability language.
