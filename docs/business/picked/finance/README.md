# Picked financial model

`picked-model.xlsx` projects cash month by month from October 2026 to
December 2027. Every figure is a projection from the yellow input cells, not
a result. Change an input and every sheet recalculates.

| Sheet | What it shows |
| --- | --- |
| README | How the model works |
| Inputs | Every assumption, in yellow: prices, costs, run size, waitlist, conversion, churn, starting cash |
| Unit Economics | Contribution per order by channel: one-off, subscription, wholesale, distributor |
| Monthly Cash Flow | Cash in, cash out, inventory runs, the low point, break-even |
| Scenarios | Low, base, and high demand, for lean (144) and standard (1,000) runs |
| calc_* (hidden) | The engine behind the scenarios |

## What it says, at the default inputs

Defaults: $25,000 starting cash, 144-pouch lean runs, $54.99 price, a $30
lean pouch cost (a placeholder), 300 people on the waitlist at 10%
conversion, $25 to win each paid customer.

| Measure | Result |
| --- | --- |
| Contribution per order | One-off $22.10, subscription $14.09, wholesale $3.50, distributor −$2.38 |
| Lowest cash | −$4,393, December 2027 |
| Operating break-even | September 2027 (launch costs excluded) |
| Launch costs paid back | Not by December 2027 |

## The two numbers that decide everything

Four runs with only the waitlist size and the lean pouch cost changed:

| Waitlist | Lean pouch cost | Lowest cash | Operating break-even | Cash, Dec 2027 |
| --- | --- | --- | --- | --- |
| 300 | $30 | −$4,393 (Dec 2027) | Sep 2027 | −$4,393 |
| 300 | $23 | +$1,907 (May 2027) | Apr 2027 | +$3,671 |
| 2,000 | $30 | −$8,884 (May 2027) | Mar 2027 | +$2,200 |
| 2,000 | $23 | −$1,828 (May 2027) | Mar 2027 | +$12,280 |

What that means:

1. **Pouch cost is the biggest lever.** At $30 a pouch, wholesale loses money
   on every pouch and more sales burn more cash. At $23 the business funds
   itself. Get the real quote before deciding anything else.
2. **A bigger waitlist brings break-even forward but needs more cash up
   front,** because stock is bought before it sells. With 2,000 on the list,
   plan for 1,000-pouch runs (lower unit cost) and $10k to $15k more
   starting cash, or open pre-orders in waves.
3. **Wholesale and distributors don't pay at these costs.** Sell direct and
   on subscription first; go to stores once the unit cost is near $16
   (`LAUNCH_GUIDE.md`, rung 5).

## Replace first

1. The pouch cost per unit, from the manufacturer's quote (`MANUFACTURING.md`).
2. Starting cash.
3. Waitlist size and conversion, from Klaviyo the week pre-orders open.
4. The manufacturer's deposit and payment terms.

## Not in the model yet

Hydration sticks, creatine, and Amazon appear as costs only, not revenue.
Add them when each has a real quote and a launch date.
