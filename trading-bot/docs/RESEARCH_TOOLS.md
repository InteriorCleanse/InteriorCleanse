# Research tools: vectorbt, hftbacktest, market making, morning filings

Added from the owner's list of five: a Quiver morning-filings job, VectorBT,
HftBacktest, a Kalshi market maker and a luxury watch website made with
Higgsfield. What was installed, what was adapted and what was left out, and
why.

## What was installed

| Piece | Where | What it is |
|---|---|---|
| vectorbt research | `research/vbt_sweep.py`, skill `/vectorbt-research` | Vectorised backtests on the candles Mr. Cash recorded. |
| hftbacktest research | `research/hbt_mm.py`, skill `/hftbacktest-research` | Tick-level backtests that model queue position, latency and fees. |
| Market-making study | skill `/market-making-study` (uses `hbt_mm.py`) | Explains quoting, inventory, adverse selection and prediction-market books, with a runnable study. |
| Morning filings brief | `src/bigmoney/service.ts`, skill `/mr-cash-morning-filings` | A fresh Big money read at 6:00 New York time, rung in the bell. |
| Candle exporter | `scripts/research-export.ts`, `npm run research:export` | Copies stored candles to CSV. It opens the database read-only. |

## Why the research bench sits outside the bot

Mr. Cash is TypeScript with zero runtime dependencies. vectorbt and
hftbacktest are Python libraries with large native stacks (NumPy, Numba,
pandas, polars). Putting them inside the bot would add a runtime, a second
language and hundreds of megabytes to every install. They live in
`research/` instead, each in its own virtual environment. hftbacktest pins an
older NumPy than vectorbt, so the two cannot share one. `src/` never imports
from `research/`, and a test enforces that.

## The workflow

1. **Record.** The bot stores candles as it watches.
2. **Export.** `npm run research:export -- --symbol BTCUSDT --interval 5m`
   writes `research/data/BTCUSDT_5m.csv` with the columns
   `open_time_ms,open,high,low,close,volume,source`. The database is opened
   read-only, so this is safe while the bot runs. Nothing is fetched or filled
   in: the CSV holds exactly what was recorded.
3. **Sweep.** `vbt_sweep.py` splits history 70/30. It chooses the top few
   parameter sets on the first part only, then reports them on the untouched
   second part, beside the number of combinations tried. Fees (0.1% a side)
   and slippage (0.05% a side) are charged by default. Below about 450
   candles it prints NOT ENOUGH DATA and stops.
4. **Decide nothing yet.** A sweep is a lead, not a change. Anything worth
   pursuing goes to the Research tab as a hypothesis and through
   out-of-sample, walk-forward, robustness, human review and paper testing.
   Strategies, risk, fusion, `config.ts` and the frozen paper-validation
   profile are not edited because of a sweep.

## hftbacktest data

Mr. Cash stores candles, not full order-book depth, so it cannot supply
hftbacktest's input. Real data comes from hftbacktest's own converters, which
produce `.npz` event files from exchange market-data archives or from its Rust
collector. Pass them with `--data`, plus `--snapshot` and the market's `--tick`
and `--lot`. The selftest's order book is SYNTHETIC and shows mechanics only.

## What was deliberately not installed

- **A live Kalshi market maker.** Running one is live trading through a
  second execution path, which this repository forbids. The market-making
  study teaches the same mechanics without placing an order. No Kalshi or
  Polymarket keys belong in this repository.
- **hftbacktest's live connector.** The library can trade live through its
  Rust connector. It is not configured, and the skill forbids setting it up.
- **A Robinhood connector.** Robinhood's official API covers crypto only, and
  the unofficial stock APIs break its terms of service. The Quiver post's
  "trade what Congress trades" step is replaced by a read-only brief. Mr. Cash
  has no stock execution path and this does not add one. The existing Alpaca
  connection stays read-only.
- **The Higgsfield / Seedance watch website.** It is a tool for making website
  media, not a trading skill, so it has no place in the trading bot.

## Licences

| Library | Licence | Note |
|---|---|---|
| vectorbt 1.1.0 | Apache 2.0 with Commons Clause | Free to use for research. The Commons Clause forbids selling the software itself, or a service whose value comes substantially from it. Installed with pip from PyPI, not vendored. |
| hftbacktest 2.4.4 | MIT | Installed with pip from PyPI, not vendored. `hbt_mm.py`'s quoting loop is adapted from hftbacktest's basic market-making example. |

The four skills were written in this repository; no third-party skill files
were copied.

## Verifying the install

```bash
bash research/setup.sh      # Windows: powershell -File research/setup.ps1
```

This runs both selftests. `vbt_sweep.py --selftest` writes a BACKTEST
report for a SYNTHETIC random walk to `research/out/`. `hbt_mm.py --selftest`
prints hftbacktest's summary for a SYNTHETIC order book, which takes a few
seconds while Numba compiles.
