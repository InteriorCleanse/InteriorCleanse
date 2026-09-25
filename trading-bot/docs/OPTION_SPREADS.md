# Option spreads

The **Spreads** tab (More → Markets → Spreads) plans option spreads for trades
you place yourself. It is separate from the **Planner**, which keeps the
single-option calculators: contracts by premium, and a strike comparison.

## What it covers

Every structure here is **defined risk**. Each option you sell is paired with
one you buy, so the most you can lose is fixed before you enter.

| You expect | Structure | Debit or credit |
| --- | --- | --- |
| It goes up | Bull call spread | Debit |
| It goes up | Bull put spread | Credit |
| It goes down | Bear put spread | Debit |
| It goes down | Bear call spread | Credit |
| It finishes near one price | Long call butterfly, long put butterfly | Debit |
| It finishes near one price | Iron butterfly | Credit |
| It stays inside a range | Iron condor | Credit |

You choose what you expect and a structure, then type the strikes and each
leg's price from your broker's option chain. The page shows:

- what you pay or collect
- the most you can lose and the most you can make
- the break-evens and the reward-to-risk ratio
- the payoff at expiry as a chart
- how many spreads fit your risk budget, sized by the worst case

Opening fees are charged on every contract in the spread. **Copy the order
ticket** puts a plain-text summary of the multi-leg order on your clipboard.

## What it does not do

- **It places nothing and sends nothing.** `web/js/spread-math.js` and
  `web/js/spreads.js` make no network calls, and a test enforces this.
  **Mr. Cash does not trade options.** The engine's strategies, risk, fills and
  validation are built for crypto, and changing that needs its own research
  and paper validation (see `CLAUDE.md`).
- **Every number is at expiry.** Time value, implied volatility and the odds
  of reaching any price are not modelled, and the page does not guess them.
- **It refuses bad input rather than guess.** Examples include strikes out of
  order, a debit spread priced as a credit, a spread that can never lose
  (usually a typo or a stale quote), and a spread that cannot make money.

## Warnings it shows

- **Early assignment on sold legs.** US stock options are American-style.
- **Credit spreads that risk several times what they can make.**
- **Broken-wing butterflies.** Unequal wings put a larger loss on one side.
- **Order entry.** Enter the spread as one multi-leg order at a limit price,
  never leg by leg.
- **Pin risk.** Close or roll before the final day if the price is near a sold
  strike.

Tests: `test/web/spreads.test.ts`, with a worked example for every structure
(TEST FIXTURE prices).
