# Big money

The **Big money** tab (More → Markets → Big money) shows what large and
connected money has **disclosed**, and which stocks are trading the most
today. It is read-only. None of it is a signal, and the engine never sees
it: a test fails if the strategy, risk, fusion or paper-trading code imports
it.

## Sources

| Source | What | Cost | Delay | Setting |
| --- | --- | --- | --- | --- |
| **SEC EDGAR** | Insider trades from Form 4 filings (officers, directors, 10% owners) | Free | About 2 business days | `MRCASH_SEC_CONTACT` (see below) |
| **Quiver Quantitative** | Congress trades (STOCK Act), insider rows, off-exchange ("dark pool") volume | Paid API key | Congress up to 45 days; off-exchange a day or more | `MRCASH_QUIVER_KEY` |
| **Alpaca** | The 20 most-traded stocks by volume, and the biggest gainers and losers | Your existing read-only keys | Minutes | `MRCASH_ALPACA_KEY` / `_SECRET` |

How each source works:

- **SEC EDGAR.** The SEC asks every automated client to identify itself, so
  set `MRCASH_SEC_CONTACT` to your name or email. Without it, the source
  stays **NOT CONNECTED** and makes no requests. Mr. Cash reads the raw
  Form 4 XML and stays well under the SEC's ten-requests-a-second limit. It
  remembers each filing it has read, so each one is fetched only once.
- **Quiver.** The key goes in `.env` only. It is sent as an
  `Authorization: Token …` header, never in a URL, and never saved or logged.
  If a dataset is not in your plan, the page says **NOT IN PLAN** and shows
  it empty, with nothing guessed.
- **Alpaca.** Uses Alpaca's market-data screener, which is read-only.

`MRCASH_BIGMONEY_TICKERS` sets which companies to pull insider filings for,
up to 25. The default is `AAPL,NVDA,TSLA,MSFT,AMZN,META,GOOGL,AMD,AVGO,JPM`.

## What the page shows

- **Sources.** Each source's status (CONNECTED, OVERRIDE, NOT CONNECTED,
  NOT IN PLAN or ERROR), with the reason.
- **What the filings say.** A plain-language summary built from counts and
  dates only. Examples: purchases versus sales disclosed by Congress, the
  largest open-market insider purchase, how many insider sales were under
  10b5-1 plans, and where the records overlap. It never says what to do.
- **Where the money went.** One row per ticker:
  - Congress buys and sells, number of members, and the low end of the
    disclosed ranges;
  - open-market insider buys and sells, in dollars;
  - the off-exchange share of volume;
  - the ticker's rank by volume today.

  Tap a row to filter the feeds.
- **Most traded today.** Volume bars and the biggest movers.
- **Insider trades and Congress trades.** Full feeds you can filter by buys,
  sells and ticker.

## Honest reading

- **Disclosures are late by law.** Congress can report up to 45 days after
  the trade, and only as a dollar range.
- **Only open-market purchases (code P) and sales (code S) count as buying
  or selling.** Grants, option exercises and tax withholding are shown,
  greyed out, for what they are.
- **10b5-1 sales are flagged.** They were scheduled months ahead under a
  pre-arranged plan and say little about the insider's view today.
- **Off-exchange share and volume say nothing about direction.** They show
  how much traded where, not who bought.
- **None of this has been tested as a trading rule here.**

## Schedule

- **Refresh interval:** every 3 hours, with the first run a minute after
  start-up.
- **Morning filings brief:** a fresh read at 6:00 New York time, adjusted
  for daylight saving. If anything came in, the digest rings the bell as
  "Morning filings brief". If nothing is connected it stays quiet. Claude Code
  can explain it with `/mr-cash-morning-filings`.
- **Check now:** the page button runs a refresh on demand, at most every
  10 minutes.
- **Persistence:** the last result is saved to `bigmoney.json` in the data
  directory, so a restart shows it straight away.
- **On/off switch:** it follows the same `MRCASH_MARKETS=0` switch as the
  Markets watch, so only one lane of the 24/7 fleet fetches filings.

Code: `src/bigmoney/` (parse, sources, service). Route: `GET /api/bigmoney`.
Tests: `test/bigmoney/bigmoney.test.ts`, which uses SYNTHETIC fixtures and a
fake network.
