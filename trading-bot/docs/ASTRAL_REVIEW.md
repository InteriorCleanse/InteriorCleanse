# Review: the Astral strategies of @lucas_lalk

Asked: "implement these strategies and validate anything that's useful to add
to the trading bot brain" (heyastral.ai/u/lucas_lalk, read 2026-10-17).

**Outcome: nothing is added to the engine.** None of the five Bitcoin
strategies with public rules held up on a year of BTCUSDT once Kestrel's
costs were applied. The parts worth keeping are research tools: the builder
now understands VWAP and trend-efficiency rules, and a script reruns this
review on any candles.

## What is on the profile

| | Count | What happened |
|---|---|---|
| Strategies listed | 37 | |
| Rules hidden (source-locked) | 27 | Cannot be tested or copied. Their headline numbers cannot be checked. |
| Stocks or other coins only | 5 | CRM; SPY/QQQ/AAPL/NVDA; PEPE/DOT; DOT/SOL/AVAX/LINK. Kestrel trades BTCUSDT. |
| Bitcoin, rules public | 5 | Tested below. |

Every published figure on the profile is a BACKTEST with **0 bps commission
and 0 bps slippage**, over windows of **3 to 90 days**. Annualising a 3-day
window is how "+8.4%" becomes "162,977% a year". On one card the author notes:
"crazy returns if no fees or slippage".

## How they were tested

- **Data:** BTCUSDT spot candles from Binance's public archive
  (data.binance.vision), 1 October 2025 to 30 September 2026. That is 525,600
  1-minute, 105,120 5-minute and 35,040 15-minute candles.
- **Engine:** each rule set written as a Strategy Builder rule set and run
  through `backtestSpec`. Signals read closed candles and fill at the next
  candle's open through the paper engine's fill model. A stop that is gapped
  through fills at the open.
- **Two runs each:**
  - **As published:** no fees, spread or slippage.
  - **Kestrel costs:** 0.1% fee per side, 1 bp spread, 2 bp slippage. That is
    about 0.26% for a round trip.
- **Split:** the first 70% of the year is in-sample. The last 30% (about 13 June
  to 30 September 2026, when simply holding BTC gained 30.7%) is
  out-of-sample, and only that part decides the verdict.
- **Deflated Sharpe:** counted over 5 trials (the five tested here). The
  author's version numbers (V18, V19, V-A199, v23, v48) suggest hundreds of
  variants were tried. The true bar is far stricter than the one applied
  here.

## Results (out-of-sample, BACKTEST)

| Strategy | Rules | Trades | As published | With Kestrel costs | Verdict |
|---|---|---|---|---|---|
| BTCUSD 5m VWAP scalper | price > 1.5 volume-weighted deviations below the 20-candle VWAP and trend efficiency(14) < 25; exit back at VWAP, +0.5% or −0.3% | 673 | 59.8% wins, −0.003% a trade, −2% compounded | 12% wins, −0.25% a trade, −81.7% compounded | FAILED OUT-OF-SAMPLE |
| High Win-Rate RSI 15m | RSI(14) < 30; +1% target, −4% stop | 37 | 94.6% wins, +0.73% a trade, +30.6% | 94.6% wins, +0.50% a trade, +20.1% | NO EDGE SHOWN |
| 5/50 EMA trend 15m | 5 EMA crosses above 50 EMA, price above 200 EMA; exit on the cross back | 103 | 27.2% wins, +0.22% a trade, +22.2% | 16.5% wins, −0.03% a trade, −5.6% | FAILED OUT-OF-SAMPLE |
| 1m red candle, BTC leg | buy after every red 1-minute candle, sell one candle later | 50,412 | 48.8% wins, −0.001% a trade, −33.9% | 0.1% wins, −0.25% a trade, −100% | FAILED OUT-OF-SAMPLE |
| RSI-MR v23, BTC leg | RSI(14) < 25; +6% target, −1% stop | 26 | 19.2% wins, +0.35% a trade, +8.4% | 19.2% wins, +0.10% a trade, +1.7% | NOT ENOUGH DATA (30 needed) |

"Compounded" means every out-of-sample trade at full size, one after another.
Holding BTC over the same window: +30.7%.

### What the numbers say

- **Costs decide the short-hold strategies.** The 1-minute and VWAP
  strategies make or lose a few hundredths of a percent per trade before
  costs. A 0.26% round trip turns that into steady losses. The red-candle rule
  loses even with no costs at all on this year.
- **The "high win-rate" RSI strategy is the closest to a result, and it is not one.**
  - It lost money in-sample: 141 trades, 77% wins, −0.09R a trade, profit
    factor 0.62, a 15R drawdown.
  - It turned positive only in the last third, a rising market (thirds:
    −0.13R, −0.03R, +0.06R; MIXED). The author's 90-day window is exactly
    that stretch.
  - Even then it trailed simply holding BTC, and the deflated Sharpe calls
    it UNCLEAR.
  - The 94% win rate comes from a +1% target against a −4% stop: one stop
    erases four wins.
- **The EMA trend rule loses consistently.** Its result was negative in every
  third of the year. The published +38.5% in 50 days does not repeat.

## What changed in Kestrel

- **Builder conditions** (research only), in `src/research/builder.ts`:
  - `price closes above the 20 candle VWAP`
  - `price is 1.5 deviations below the 20 candle VWAP`
  - `trend efficiency(14) below 25`

  These are documented in `docs/STRATEGY_BUILDER.md` and tested in
  `test/research/builder.test.ts`.
- **`npm run research:external -- --dir <folder>`**
  (`scripts/external-strategies.ts`): reruns these five rule sets on any
  folder of kline CSVs, with and without costs.
- **`src/backtest/metrics.ts`:** the time span is now found with a loop, so a
  250,000-trade 1-minute backtest no longer overflows the call stack. Results
  are unchanged.
- **Nothing in the engine.** No strategy, threshold, filter or risk setting
  changed. A rule set reaches Kestrel only through research, an out-of-sample
  test, walk-forward, robustness, human review and a paper test, and none of
  these got past the out-of-sample step.

## Rerun it on your own candles

```bash
npm run research:export -- --interval 15m    # also 5m, 1m: writes research/data/BTCUSDT_<interval>.csv
npm run research:external -- --dir research/data
```

Or point `--dir` at a folder of monthly files from
data.binance.vision (`BTCUSDT-15m-2026-09.csv` and so on). Add
`--json out.json` to keep the numbers.
