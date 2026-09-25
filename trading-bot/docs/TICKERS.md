# Tickers: stocks, index futures, commodities and rates

The **Tickers** tab (More → Markets → Tickers) collects what to know about
eleven instruments before you trade them yourself. Mr. Cash does not trade
any of them.

| Group | Tickers |
| --- | --- |
| Stocks & ETF | SPY, NVDA, TSLA, AAPL |
| Index futures | ES (S&P 500), NQ (Nasdaq-100) |
| Commodities | CL (WTI crude oil), NG (natural gas), GC (gold), SI (silver) |
| Rates | ZN (10-year Treasury note) |

NQ, SI and ZN were added alongside the requested oil, gold and gas. NQ is
where NVDA, AAPL and TSLA carry the most weight. SI trades alongside gold.
ZN tracks the interest rates that move every other market here.

## Two kinds of information, always labelled

| Where | What | Source |
| --- | --- | --- |
| **Right now** | Price, 24-hour change, trend, volatility, range, a 48-close sparkline, the setup checklist count | The existing Markets watch (`GET /api/markets`, read-only), shown with its own label (LIVE DATA, DELAYED FEED, OVERRIDE, …) |
| **Everything else** | Contract facts, calendar, what moves it, notes for option spreads | Reference facts in `web/js/tickers-data.js`, reviewed 2026-09 |

There is no futures data feed, so every futures card says **NOT WATCHED** and
no futures price is estimated. Instead, each futures card shows the nearest
fund the watch does cover. That price is marked **STAND-IN, NOT <future>**,
and the card says how the fund differs from the future:

| Future | Stand-in | How it differs |
| --- | --- | --- |
| ES | SPY | About the S&P 500 ÷ 10 |
| NQ | QQQ | An ETF on the Nasdaq-100 |
| CL | USO | Holds oil futures and rolls them monthly, so it drifts over time |
| NG | UNG | The same monthly roll, and it can drift far |
| GC | GLD | Physical gold, a fraction of an ounce per share |
| SI | SLV | Physical silver, a little under an ounce per share |
| ZN | IEF | 7–10-year Treasuries: close to what ZN delivers, not the same |

These five funds (GLD, SLV, USO, UNG, IEF) are now on the default Markets
watchlist, in a group renamed **Indexes & funds**.

## What each card holds

- **The contract.** Multiplier, tick size (ES), exercise style, settlement,
  option expiries, strike spacing and trading hours.
- **Calendar.** Some dates follow a published rule, and those are computed,
  on weekdays only:
  - the next monthly options expiry (the third Friday), flagged when it is a
    quarterly "quad witching" date;
  - for each future, the front contract, its last trading day and the next
    contract. Each exchange's rule is below.
  - ES and NQ show the usual roll (eight days before expiry). GC, SI and ZN
    show first notice day. Once that date passes, the card says which
    contract traders are in now.

  The last-trading-day rules:

  | Future | Last trading day |
  | --- | --- |
  | ES, NQ | The third Friday of the contract month |
  | CL | Three business days before the 25th of the month before (four if the 25th is not a business day) |
  | NG | Three business days before the first day of the contract month |
  | GC, SI | The third-last business day of the contract month |
  | ZN | The seventh business day before the last business day of the contract month |


  Earnings and dividends show the **usual months only**, never an exact date.
  Exchange holidays can move expiries.
- **What moves it.** The usual drivers: Fed, CPI and jobs data, the big
  weights' earnings, AI capex (NVDA), deliveries (TSLA), the iPhone cycle
  (AAPL), and so on.
- **For option spreads.** Implied volatility around earnings, gap risk,
  early assignment before an ex-dividend date, and ES options settling into
  futures. **Plan a spread on …** opens the Spreads tab with the right
  contract size.
- **What a move is worth** (every future): contracts × price move = dollars
  and ticks. For example, $1 on CL is $1,000, $0.10 on NG is $1,000, and half
  a point on ZN is $500.
- **ES and SPY side by side.** One ES is about 500 SPY shares, or five SPY
  option contracts. Ten ES points are about $1 in SPY. This is a rule of
  thumb, and the page says so.

## In the Spreads tab

Pick any of the eleven above the strikes. The Spreads tab then
applies the following:

- **Contract size.**
  - $100 for stock options, $50 for ES and $20 for NQ.
  - $1,000 for CL and ZN, $100 for GC, $5,000 for SI and $10,000 for NG.
- **Days to expiry.** Shown from the expiry date you enter.
- **Earnings.** A warning when your expiry runs past a month in which that
  company usually reports.
- **Dividends.** A warning when a short call is open across a month in which
  it usually goes ex-dividend (SPY, AAPL).
- **Expiry within a day.** A warning when the spread expires today or
  tomorrow.
- **Exercise style.** The early-assignment warning only appears for
  American-style options. Where the product has both American-style and
  European-style series (ES, NQ, CL, NG), it tells you to check which one you
  trade.
- **Physical delivery.** For physically delivered futures (CL, NG, GC, SI,
  ZN), it reminds you to close well before the last trading day.

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
