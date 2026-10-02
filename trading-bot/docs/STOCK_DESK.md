# Stock desk

The stock desk runs the owner's momentum and relative-strength plan on paper.
It buys only stocks, long only, from a fixed list of tech and tech-adjacent
leaders. It writes a research report before every buy and checks stops every
15 minutes. There is no broker behind it, no Robinhood connection and no
order path. Every fill is simulated from the last bar, with 5 basis points of
slippage each way. Every figure on the page is labelled PAPER.

Code: `src/stocks/universe.ts` (the list), `src/stocks/rules.ts` (pure rules),
`src/stocks/desk.ts` (the loop and the paper book). Tests:
`test/stocks/stocks.test.ts` (SYNTHETIC fixtures).

## When it wakes (Central Time)

| Window | What it does |
|---|---|
| 8:15–8:30 premarket | Builds the watch list: market check, theme rotation, catalyst-day scan, news sweep. No buys. |
| 8:30–15:00 regular | Every 15 minutes: stops first, then manage open positions, then look for up to two new buys. |
| Outside hours, weekends | Sleeps in one-hour steps until the next weekday 8:15, and logs that it did. |

**Scan now** on the page runs one cycle immediately. **Pause** stops new buys
but keeps managing stops. **Flatten** sells every position at the last mark.

## The market check

SPY, QQQ, XLK and SMH trend and day change, breadth across the list, VIXY
(a volatility proxy) and IEF (rates). The result is one of:

| Regime | Risk per trade | Minimum report score to buy |
|---|---|---|
| RISK-ON | 1% of equity | 65 |
| MIXED | 0.5% of equity | 75 |
| RISK-OFF | none | no buys; open positions are reviewed for exit |
| UNKNOWN | none | not enough data; no buys |

## What must be true before a buy (the DSC rule)

- In the list. No IPOs, nothing outside the themes.
- Gap under 3%. Average volume at least 500,000 shares (checked on the SIP
  feed; the free IEX feed undercounts, so the check is skipped there and the
  page says so).
- A named setup: a base breakout, a retest of the breakout level, or a
  pullback that held. Never in the first 30 minutes of the session.
- Stop below the level that proves the idea wrong, minus a tenth of the
  average true range. Reward at least twice the risk.
- A reason beyond the chart: positive news, a catalyst day in its theme, or
  its sector leading.
- At most 25% of equity in one stock and at most three open names per theme.

Anything that fails is a PASS, and the report says which rule failed.

## Catalyst days

When at least two names in a theme gap 3% or more and they make up at least
40% of that theme, the theme is having a catalyst day. The desk then looks at
the second-order names (the suppliers and partners in
`SECOND_ORDER`) that have **not** already run: gap under 3% and not gapping
down. It ranks names with their own news first, then the smallest gap, and
still waits for the first pullback that holds, 30–60 minutes in.

## The research report

Every candidate gets the same fields: ticker, setup, market regime, relative
strength, catalyst and news, fundamentals note, entry, stop, target,
reward/risk, position size, main risks, confidence score and final decision
(BUY or PASS) with the reason.

## Managing a position

Checked in this order every cycle:

1. The stop is breached on any bar since the last check: sell everything at
   the stop, or at the open if it gapped through.
2. The thesis level (prior close on a catalyst entry) is lost: exit.
3. The market turns RISK-OFF: exit.
4. The stock lags a strong sector badly: exit.
5. At 2R: sell half and raise the stop to the entry. A stop is never lowered.
6. Otherwise HOLD.

If the app stops with positions open, they stay on the paper book unmanaged
until it starts again; the page shows them and offers Flatten.

## When the data goes wrong

- A rate limit (HTTP 429), a server error (5xx) or a dropped connection is
  retried up to three times per page, honouring Retry-After (capped at ten
  seconds), before the IEX feed is tried. If no feed answers, the cycle logs
  "No stock data" and buys and sells nothing.
- Data that would arrive incomplete (pages that never end) is refused, and a
  bar served twice is kept once.
- If the newest daily bar is more than six days old, the cycle stops with
  "stock data is stale" instead of measuring gaps against an old close. A
  symbol whose bars stopped updating while the rest moved on is left out.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `MRCASH_STOCK_DESK` | on | `0` turns the desk off. It also stays off in any window started with `MRCASH_MARKETS=0` (the fleet's extra lanes), so a machine keeps one stock desk and one paper book, in the main window. |
| `MRCASH_STOCK_BANKROLL` | 10000 | Starting paper equity in dollars |
| `MRCASH_ALPACA_KEY`, `MRCASH_ALPACA_SECRET` | none | Read-only market data. Without them the desk logs "no data" and does nothing. |

## What it has shown so far

NOT ENOUGH DATA. The desk is new, and the equity curve only means something
after many closed paper trades across different market days.
