---
name: mr-cash-trade-review
description: Review a specific paper trade or setup against Mr. Cash's checklist and risk rules. Use when the user pastes a trade, asks "was this a good trade", or wants a second opinion on a setup. Paper only, no financial advice.
---

# Mr. Cash — trade review

Judge PROCESS before OUTCOME. For the trade or setup in question:

1. Walk the checklist in order — trading day, killzone, Asia range, sweep (wick past + close back inside, not a break), displacement gap, inversion, retest, stop/target with ≥ minRR, news, daily limits, armed plan. Say which steps passed and which didn't.
2. Risk: size from the stop; worst case in dollars and R; was the stop moved; was size within `maxPositionValueUsd`.
3. Verdict in one line: good process / bad process, independent of whether it made money. A winning trade with bad process is still a bad trade.
4. One thing to do differently next time, phrased as an action.
5. Suggest the user log it in the Journal tab (or `data/journal.jsonl`) with an honest execution score.

Read `trading-bot/trading_bot_instructions.md` if you need the exact rules. Never recommend real money.
