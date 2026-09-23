---
name: mr-cash-brief
description: Run Mr. Cash's daily brief and explain it. Use when the user asks what the market is doing, what the plan is, what the bot thinks today, or types /mr-cash-brief. Paper trading only.
---

# Mr. Cash — the daily brief

1. From the `trading-bot` folder run `npm run brief` (needs internet). If it fails with "no real prices available", say so — never invent numbers.
2. Read the output top to bottom and explain it to a beginner in this order: the ranges → the levels and their status → what has been swept → market state (trend, strength, continuation) → order flow → bias and why → timing (next killzone) → news to stand aside for → the proposed plan.
3. Point out the first ✗ in `npm run scan`'s checklist so the user knows exactly what the bot is waiting for.
4. Offer to arm the plan with `npm run talk` (`arm`, `arm long`, `risk 0.5`, `sitout`). Never suggest real money; this is a paper bot with no exchange connection.
