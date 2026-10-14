# Politician watcher

Big Money tab → **Politician watcher**. It runs the owner's "trading watcher"
brief on the congress trades Kestrel already reads from Quiver Quantitative.

**It sends no orders.** Kestrel has no order path from here or anywhere. A
paper idea becomes a record only when you press **Log as a paper plan in my
journal**. That writes an open plan to your own journal and nothing else.

## Every run, in order

1. **New disclosures** from the members you list, since the last check.
   - A name matches on whole words: "Pelosi" matches "Nancy Pelosi", but
     "Nancy Pelosi" does not match "Nancy Mace".
   - The first check, and the first check after you change the list, looks back
     14 days only and remembers older trades as seen, so it does not flood.
2. **Nothing new?** The report says "Nothing new" and stops.
3. **For each new trade:** the ticker, buy or sell, the size range as filed,
   the date they traded, and the date they disclosed it (with the lag).
4. **Overlap** with your linked brokerage account. This is read-only Alpaca
   (`src/broker/alpaca.ts`). Without a linked account it says overlap is
   unknown.
5. **Move since:** the close on the day they traded (or the last session
   before, for a weekend trade) against the latest close.
6. **Three lines:** what to do, how much of your balance to risk, and what
   would prove it wrong.
7. **Paper only:** it proposes; you confirm. Nothing is sent anywhere.

## The plan is a fixed rule

The plan is a rule, not a forecast. Congress has up to 45 days to disclose,
so part of any move is usually gone before you hear about it.

| Case | Plan |
|---|---|
| A sale, and you hold the stock | REVIEW HOLDING. One member's sale is weak evidence on its own. |
| A sale, and you don't hold it | NO ACTION. Members sell for taxes, diversification or ethics rules. |
| Not a buy or a sale | NO ACTION. |
| A buy, prices not readable | WATCH, with risk 0% until prices are connected. |
| A buy, already more than 10% above their price | WATCH, don't chase. Interesting again only on a pullback toward their price. |
| A buy, more than 10% below their price | WATCH. Their trade is losing too. Worth a look only after a close back above it. |
| A buy within ±10% of their price | PAPER IDEA. Buy near today's price. The stop is 5% under the lower of their price and today's. Size so the stop costs your risk. |

Risk is the stock desk's own 1% of your balance, never above your cap. The
cap can be set lower but never above 5%. The balance is your linked account's
equity; without one, the plan gives the risk as a percentage and no share
count.

## When it runs

After every Big Money refresh (about every three hours, and at 6:00 New York),
and whenever you press **Check now**. New trades also ring the bell.

## Setup

- `MRCASH_QUIVER_KEY` for congress trades.
- `MRCASH_ALPACA_KEY` and `MRCASH_ALPACA_SECRET` for prices and the read-only
  account. Paper keys work.
- The list and the cap are set on the page. `MRCASH_WATCH_POLITICIANS` and
  `MRCASH_WATCH_RISK_CAP` give the starting values.

"Liquid", named in the original brief, is not connected. Kestrel reads
holdings from Alpaca. A read-only reader for another broker can be added if it
has an API.

## API

| Route | |
|---|---|
| `GET /api/watcher` | Settings, the latest report, recent reports, and when the filings were read. |
| `POST /api/watcher/settings` | `{ names, riskCapPct }`, cleaned and capped. Changing the list restarts the 14-day look-back. |
| `POST /api/watcher/check` | Runs a check now on the latest filings. |
| `POST /api/watcher/log` | `{ key }` logs a PAPER IDEA as an open plan in your journal. |

All POSTs need the app token.

Code: `src/bigmoney/watcher.ts` (rules, memory, the check) and
`web/js/watcher.js`. Tests: `test/bigmoney/watcher.test.ts` and
`test/server.test.ts`.
