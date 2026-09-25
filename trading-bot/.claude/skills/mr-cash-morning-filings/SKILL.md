---
name: mr-cash-morning-filings
description: Read Mr. Cash's morning filings brief, covering congressional trades, insider Form 4 buys and sells, off-exchange (dark pool) volume and the most-active movers, and explain what big money filed. Use when the user asks what insiders or Congress bought, where big money is, for the morning brief, or types /mr-cash-morning-filings. Read-only; it places nothing.
---

# Mr. Cash: the morning filings brief

The Big money service refreshes every three hours. At 6:00 New York time it
also does a fresh read and, if anything came in, rings the bell with
"Morning filings brief". The data comes from:

- **SEC EDGAR Form 4.** Insider open-market buys (P) and sells (S). Free; set
  `MRCASH_SEC_CONTACT` in `.env` so the SEC knows who is asking.
- **Quiver Quantitative.** Congressional trades and off-exchange volume.
  Needs `MRCASH_QUIVER_KEY` in `.env`; without it those rows say NOT
  CONNECTED, and endpoints outside the plan say NOT IN PLAN.
- **Alpaca screener.** Most-active stocks and movers, if Alpaca read-only keys
  are set.

## Steps

1. With the bot running, fetch `GET /api/bigmoney` (or open the **Big money**
   tab). Add `?refresh=1` to force a fresh read; that is limited to once every
   10 minutes.
2. The answer is `{ ok, data }`. Read `data.digest` first, then `board`, the tickers ranked by how much filed
   activity they have, then the congress, insider and off-exchange lists.
3. Explain it to a beginner:
   - A filing is a disclosure after the fact. Congress has up to 45 days, and
     a Form 4 is due within two business days.
   - Amounts in congressional filings are ranges, not exact figures.
   - An insider sale can be tax or diversification, so only open-market buys
     and sells count. Grants and option exercises are left out.
   - Off-exchange volume shows where shares traded, not which way.
4. Show each source's status from `data.sources`: CONNECTED, NOT
   CONNECTED, NOT IN PLAN, ERROR or OVERRIDE. If a list is empty, say NOT ENOUGH DATA. Never fill a gap from
   memory or the news.

## What it must not do

- Place, stage or suggest sizing for any order. Mr. Cash has no stock
  execution path and this does not add one. There is no Robinhood connector.
  Robinhood's official API covers crypto only, and the unofficial stock APIs
  break its terms.
- Feed filings into Mr. Cash's strategies, fusion or risk. The data is shown
  to the owner; it is not a signal to the engine.
- Print API keys, or ask the user to paste them into the chat. They go in
  `.env` only.
- Use profitability language, or claim that following filings works.
