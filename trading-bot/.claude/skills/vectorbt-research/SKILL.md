---
name: vectorbt-research
description: Backtest research on Mr. Cash's recorded candles with vectorbt (Python), in the isolated research/ folder. Use when the user asks to sweep parameters, test an idea on history, run a vectorbt backtest, or types /vectorbt-research. Research only; it never changes how Mr. Cash trades.
---

# vectorbt research (BACKTEST only)

vectorbt (github.com/polakowo/vectorbt, Apache 2.0 with Commons Clause) runs
thousands of backtests at once on NumPy arrays. Here it is a research bench
next to the bot, not part of it: nothing in `src/` imports it, and Mr. Cash
keeps zero runtime dependencies.

## Setup (once)

```bash
cd trading-bot
bash research/setup.sh          # Windows: powershell -File research/setup.ps1
```

This makes `research/.venv-vbt` (vectorbt 1.1.0, plotly<6) and runs the
selftest on a SYNTHETIC random walk. If the selftest fails, report the pip
error; do not paper over it.

## Run

1. Export candles the bot already stored (read-only, safe while it runs):
   `npm run research:export -- --symbol BTCUSDT --interval 5m`
2. `research/.venv-vbt/bin/python research/vbt_sweep.py --csv research/data/BTCUSDT_5m.csv`
   (Windows: `research\.venv-vbt\Scripts\python`).
3. Read the JSON report in `research/out/` with the user.

## How to report a result

- Label it **BACKTEST**. Say where the candles came from (the `source`
  column) and how many there are.
- Put in-sample and out-of-sample side by side, and say how many combinations
  were tried. The more tried, the more a good in-sample number can be luck.
- Fees and slippage are charged; say what they were.
- If the script prints NOT ENOUGH DATA, that is the answer. Never lengthen the
  history with invented candles, and never quote a return as what to expect.
- No profitability language: not profitable, proven, guaranteed, best,
  superior, edge established, expected return.

## What it must not do

- Do not edit `src/`, `config.ts`, strategies, risk, fusion or the frozen
  paper-validation profile because of a sweep. A result that looks worth
  pursuing goes into the bot's own pipeline: research, out-of-sample,
  walk-forward, robustness, human review, paper test (see
  `trading-bot/CLAUDE.md`). Offer to write it up as a hypothesis for the
  Research tab instead.
- The moving-average crossover in `vbt_sweep.py` is a textbook example of the
  method, not Mr. Cash's strategy.
- Never point it at a live broker. vectorbt's Telegram and data-download
  helpers are not used here.
