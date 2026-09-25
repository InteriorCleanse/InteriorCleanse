---
name: market-making-study
description: Explain and study how market making works (quoting both sides, inventory, adverse selection, fees and rebates, prediction-market books such as Kalshi) using the hftbacktest study in research/. Use when the user asks about market-making bots, Kalshi or Polymarket market makers, spreads and inventory risk, or types /market-making-study. Study only; Mr. Cash does not market-make and this never places orders.
---

# Market making: a study, not a bot

Market-making bots are often pitched as "earning the spread". This skill
teaches what actually happens, using a backtest you can read line by line.

## What to explain

1. **The quote.** Buy a little below the middle, sell a little above. The
   spread is what's earned when both sides fill.
2. **Inventory.** Fills rarely come in pairs. The bot ends up holding a
   position and carries its price risk; skewing quotes leans against that.
3. **Adverse selection.** The fills that do arrive tend to come from traders
   who know more, just before the price moves against the quote. This is the
   main way market makers lose.
4. **Fees, rebates and queue position.** Being first in the queue matters;
   latency decides it. A maker rebate can be the whole margin.
5. **Prediction markets (Kalshi, Polymarket).** Prices are probabilities from
   0 to 100 cents that settle at 0 or 100. Near settlement, one piece of news
   can move a contract to 0 or 100 in seconds, so inventory risk jumps. Books
   are thin. Kalshi is a US CFTC-regulated exchange. Its API and its fee
   schedule are its own, so read Kalshi's documentation for the current terms
   rather than trusting a video.

## The runnable study

`research/.venv-hbt/bin/python research/hbt_mm.py --selftest` runs
hftbacktest's basic quoting loop on a SYNTHETIC order book. Change
`--half-spread`, `--skew`, `--max-position`, `--latency-ms` and
`--maker-fee` (negative means a rebate) and compare how fills, inventory
and fees change. The output is labelled BACKTEST, and a SYNTHETIC book shows
mechanics only, not a market.

## Hard limits

- Do not build, run or wire a live market maker, on Kalshi or anywhere else.
  That would be live trading and a second execution path, which this
  repository forbids.
- Do not add Kalshi, Polymarket or exchange API keys to the repository, and
  do not write order-placing code.
- No profitability language, and no "passive income" framing. If the user
  wants to trade on Kalshi themselves, that is their decision, made outside
  this repository.
