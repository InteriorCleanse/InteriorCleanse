---
name: hftbacktest-research
description: Tick-level backtests with hftbacktest (Python, MIT) that model queue position, order latency and fees, in the isolated research/ folder. Use when the user asks about high-frequency or order-book backtesting, fill realism, latency, queue position, or types /hftbacktest-research. Research only; nothing here trades.
---

# hftbacktest research (BACKTEST only)

hftbacktest (github.com/nkaz001/hftbacktest, MIT) replays full order-book and
trade data and simulates where an order sits in the queue, how long it takes
to arrive and what it pays. It answers "would this order really have filled?"
questions that candle backtests cannot.

## Setup (once)

`bash research/setup.sh` (or `research/setup.ps1`) builds
`research/.venv-hbt` with hftbacktest 2.4.4 in its own venv, because it pins a
different NumPy from vectorbt, and runs `research/hbt_mm.py --selftest` on a
SYNTHETIC order book to prove the install works.

## Data

Mr. Cash stores candles, not full depth, so real hftbacktest data has to come
from elsewhere: hftbacktest's converters turn exchange market-data archives or
its own Rust collector's output into `.npz` event files. Use
`--data day1.npz [day2.npz …] --snapshot eod.npz --tick <tick> --lot <lot>`.
Without real depth and trades, an hftbacktest result says nothing about the
market; say so rather than presenting a SYNTHETIC run as a finding.

## How to report a result

- Label it **BACKTEST** and state the assumptions the run printed: latency,
  queue model, maker and taker fees, tick and lot size.
- Queue and latency models are assumptions. Real fills depend on who else is
  quoting.
- No profitability language, and no expected-return figures.

## What it must not do

- hftbacktest can connect to a live exchange through its Rust connector. Never
  set that up, never add exchange keys, never add a second execution path.
  The bot's live-execution gate stays untouched.
- Do not change Mr. Cash's execution assumptions, fill model or `config.ts`
  because of a result here; propose it through the research pipeline instead.
