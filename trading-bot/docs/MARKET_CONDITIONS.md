# Market conditions

The **Conditions** page (More → Markets → Conditions, or `GET /api/conditions`)
answers one question for every watched market: *is this a market worth being
in right now?* It is a READING, not a signal, and it never places, stops or
starts anything by itself.

## What it watches

| Asset class | Markets | Hours |
|---|---|---|
| Crypto | BTC/USDT, ETH/USDT, SOL/USDT (Binance public candles) | 24/7 |
| Forex | The majors: EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF (Kraken's FX book, not interbank) | Sunday 17:00 to Friday 17:00 ET; 16:55–17:10 ET reads as "rollover" |
| Stocks | Apple, Nvidia, Tesla; SPY, QQQ, DIA (Alpaca IEX feed) | 09:30–16:00 ET, pre-market 04:00, after-hours to 20:00, US holidays by exchange rule |
| Options | Read through the underlying stocks and ETFs | Regular session only, 09:30–16:00 ET (13:00 on early-close days) |
| Futures | Read through funds: SPY for ES, QQQ for NQ, GLD for gold, SLV for silver, USO for crude, UNG for gas, IEF for the 10-year | CME Globex, Sunday 18:00 to Friday 17:00 ET, 17:00–18:00 ET daily break |

The watchlist is `MRCASH_WATCHLIST` (see `src/markets/sources.ts`); the default
now includes all six forex majors. NZD/USD is not listed because Kraken does not
quote it. CME holiday hours vary by product and are not modelled: on a US
holiday the futures panel says so instead of guessing.

## How a market is graded

Each market is read from its own closed hourly candles, its trading hours and
the economic calendar. The engine's own market is also read from its 5-minute
candles.

- **Poor** (a hard condition), any one of:
  - a shock candle: the last range is at least 3× the average range;
  - volatility in the top 3% of the market's own recent history;
  - a high-impact release for the market's currency, from 15 minutes before
    to 30 minutes after it. A forex pair answers to both of its currencies;
    crypto and US stocks answer to USD.
- **Caution**, any one of:
  - a big candle (2× the average range);
  - elevated (85th percentile) or dead (10th percentile) volatility;
  - chop (the last day's efficiency ratio is under 15%);
  - volume under 30% of usual;
  - a gap larger than 1.5× the average range;
  - thin hours (pre-market, after-hours, FX rollover);
  - a high-impact release within two hours.
- **Closed**: the market is shut. **No data**: the feed is stale or thin, and
  nothing is inferred.

The score starts at 100 and loses 40 for each poor reading and 12 for each
caution. The thresholds live in `THRESHOLDS` in `src/conditions/model.ts`. None
of them has been tested as a trading rule.

## Across markets

- **Stress breadth**: the share of open markets graded poor, and the share with
  elevated volatility. It reads **stressed** at 35% poor or 50% elevated.
- **Currency strength**: each major's 24-hour move against the dollar, centred
  on the average, strongest first. At the weekend it is labelled as the last
  session's move.
- **Risk tone**: stocks and bitcoin against the havens (gold, Treasuries, the
  yen and the franc). It is a description, never an input.

## The verdict and the kill switch

The verdict is:

- **POOR** when the engine's own market is poor, or when stress is market-wide.
- **NOT ENOUGH DATA** when the engine's market cannot be read.
- **CAUTION** or **GOOD** otherwise.

When the verdict turns POOR, or recovers from POOR, the bell says so, checked
every five minutes. The Conditions page then offers the existing kill switch
(`src/killswitch.ts`), which blocks every new entry in every mode until you
resume.

**Pressing it is your decision.** The software does not press it for you.
Stopping entries automatically would change how Mr. Cash decides to trade, and
the standing rules in `CLAUDE.md` allow that only after research, an
out-of-sample test, human review and a paper test. If the owner wants the stop
to be automatic, the change is small: call `stop()` when the verdict is POOR,
and release only a stop the guard itself set, after several clear checks. It
needs that rule amended first, and it should be tested on paper so its effect
on the validation record is visible.
