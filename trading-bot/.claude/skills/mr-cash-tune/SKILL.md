---
name: mr-cash-tune
description: Change a Mr. Cash setting in config.ts and test the change honestly with the look-back test. Use when the user wants to try a different symbol, timeframe, killzone, RR, or filter, or asks "what if I change X".
---

# Mr. Cash — tune a setting honestly

1. Every setting lives in `trading-bot/config.ts`. Change exactly the one the user asked about; explain what it does in one sentence.
2. Run `npm run memory:reset` (lessons about one setup don't apply to another), then `npm run replay:raw`, and read the scoreboard: setups, win rate, expectancy in R, worst run, longest losing streak, and the breakdowns.
3. Compare against the previous setting if the user has those numbers; otherwise say plainly that one 30-day sample is a demonstration, not proof. Fewer than 20 setups means the numbers barely mean anything.
4. Run `npm run selftest` after any change; it must stay green.
5. Never present a backtest as a prediction, and never suggest real money.
