# Tickers: SPY, ES, NVDA, TSLA, AAPL

The **Tickers** tab (More → Markets → Tickers) collects what to know about
five instruments before you trade them yourself. Mr. Cash does not trade any
of them.

## Two kinds of information, always labelled

| Where | What | Source |
| --- | --- | --- |
| **Right now** | Price, 24-hour change, trend, volatility, range, a 48-close sparkline, the setup checklist count | The existing Markets watch (`GET /api/markets`, read-only), shown with its own label (LIVE DATA, DELAYED FEED, OVERRIDE, …) |
| **Everything else** | Contract facts, calendar, what moves it, notes for option spreads | Reference facts in `web/js/tickers-data.js`, reviewed 2026-09 |

ES has no futures data feed, so its card says **NOT WATCHED** and no ES price
is estimated.

## What each card holds

- **The contract.** Multiplier, tick size (ES), exercise style, settlement,
  option expiries, strike spacing and trading hours.
- **Calendar.** Some dates follow a published rule, and those are computed:
  - the next monthly options expiry (the third Friday), flagged when it is a
    quarterly "quad witching" date;
  - for ES, the front contract (for example `ESZ6`), its last trading day, the
    usual roll eight days earlier, and the next contract.

  Earnings and dividends show the **usual months only**, never an exact date.
  Exchange holidays can move expiries.
- **What moves it.** The usual drivers: Fed, CPI and jobs data, the big
  weights' earnings, AI capex (NVDA), deliveries (TSLA), the iPhone cycle
  (AAPL), and so on.
- **For option spreads.** Implied volatility around earnings, gap risk,
  early assignment before an ex-dividend date, and ES options settling into
  futures. **Plan a spread on …** opens the Spreads tab with the right
  contract size.
- **ES and SPY side by side.** One ES is about 500 SPY shares, or five SPY
  option contracts. Ten ES points are about $1 in SPY. This is a rule of
  thumb, and the page says so.

## In the Spreads tab

Pick SPY, ES, NVDA, TSLA or AAPL above the strikes. The Spreads tab then
applies the following:

- **Contract size.** $50 a point for ES; $100 for the others.
- **Days to expiry.** Shown from the expiry date you enter.
- **Earnings.** A warning when your expiry runs past a month in which that
  company usually reports.
- **Dividends.** A warning when a short call is open across a month in which
  it usually goes ex-dividend (SPY, AAPL).
- **Expiry within a day.** A warning when the spread expires today or
  tomorrow.
- **Exercise style.** The early-assignment warning only appears for
  American-style options. For ES it says to check the series: quarterly ES
  options are American-style, while the weekly and end-of-month ones are
  European-style.

## Keeping it honest

- The reference holds **no prices and no forecasts**, and a test enforces
  both.
- The Tickers page makes one network call, a GET to `/api/markets`, and
  places nothing. A test enforces this.
- Specifications and schedules change. Confirm them with the company, the
  exchange and your broker. When facts change, update `tickers-data.js` and
  its `REVIEWED` date.

Tests: `test/web/tickers.test.ts` (TEST FIXTURE dates, each checkable against
a calendar).
