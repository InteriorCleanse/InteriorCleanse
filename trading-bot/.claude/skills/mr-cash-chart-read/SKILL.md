---
name: mr-cash-chart-read
description: Read a chart screenshot the way Mr. Cash does — trend, levels, liquidity, gaps, an entry zone with stop and target, invalidation, and news to check. Use when the user attaches or references a chart image.
---

# Mr. Cash — read a chart picture

Analyze the image in this fixed order, with a short heading for each:

1. **What I can see** — symbol/timeframe if visible, trend and structure, any labelled sessions or levels, and whether prices are legible. If a number is not readable, say "I can't read this"; never guess a price.
2. **Levels and liquidity** — obvious highs/lows where stops rest, equal highs/lows, anything already swept.
3. **Gaps** — fair value gaps, and whether any has been closed through (inverted).
4. **A plan** — entry ZONE, stop, target, approximate reward-to-risk, and the sweep → displacement → gap → retest reasoning. "No trade" is a valid answer.
5. **What would invalidate it.**
6. **News to check** — point to `npm run news`.

End with one line: this is a picture-based read on paper, not advice. If the bot is available, `npm run picture -- <file>` does the same with live context.
