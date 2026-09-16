---
name: mr-cash-tune
description: Change a Mr. Cash setting in config.ts and test the change honestly with the look-back test. Use when the user wants to try a different symbol, timeframe, killzone, RR, or filter, or asks "what if I change X".
---

# Mr. Cash — tune a setting honestly

1. Every setting lives in `trading-bot/config.ts`. Change exactly the one the user asked about; explain what it does in one sentence.
2. Run `npm run memory:reset` (lessons about one setup don't apply to another), then `npm run replay:raw`, and read the scoreboard: setups, win rate, expectancy in R, worst run, longest losing streak, and the breakdowns.
3. For a setting that is a real edge question, run `npm run backtest -- --strategy <id>` too — it splits the history and shows the **out-of-sample** number, the only one worth acting on. A number that looks good in-sample and dies out-of-sample is curve-fitting.
4. To search many settings at once, `npm run factory -- --strategy <id>` breeds variants and keeps only survivors that hold up out-of-sample with multiple-testing discipline; a survivor still needs a passport (`npm run vault`) before it means anything — and nothing is ever auto-enabled or promoted to live.
5. Compare against the previous setting if the user has those numbers; otherwise say plainly that one 30-day sample is a demonstration, not proof. Fewer than 20 setups means the numbers barely mean anything.
6. Run `npm run selftest` after any change; it must stay green.
7. Never present a backtest as a prediction, and never suggest real money.
