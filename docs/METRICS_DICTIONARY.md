# Metrics dictionary

Definitions are fixed here before any of them is computed, so the engine in
Checkpoint 2 implements an agreed contract rather than inventing one.

Every metric surfaced in the product must carry: **formula, source, time range,
currency, freshness timestamp, and a drill-down path.** A figure that cannot
show its formula does not ship.

| Metric | Formula | Notes |
| --- | --- | --- |
| Gross sales | Merchandise/service value before discounts, refunds, tax, shipping | Unless the source defines it otherwise; store both source-native and normalised |
| Net revenue | Gross sales − discounts − refunds + recognised shipping revenue | Taxes excluded by default |
| Gross profit | Net revenue − COGS − direct fulfilment cost | |
| Contribution profit | Gross profit − payment fees − marketplace fees − return costs − allocated ad spend | Allocation rule must be visible |
| Operating profit estimate | Contribution profit − allocated overhead | Explicitly an estimate |
| ROAS | Attributed revenue ÷ ad spend | State the attribution window |
| MER | Total net revenue ÷ total ad spend | Blended; not attribution-dependent |
| CAC | Acquisition spend ÷ new customers acquired | |
| AOV | Net revenue ÷ completed non-test orders | |
| Refund rate | Refunded order value ÷ gross order value | |
| Contribution margin | Contribution profit ÷ net revenue | |

## Rules

- **Decimal-safe money math.** Never binary floating point for stored financial
  values. Amounts are stored as integer minor units or `numeric`.
- **Division by zero is explicit.** Zero spend yields "not applicable", never
  `Infinity`, `NaN`, or a silent `0`.
- **Currencies are never silently mixed.** Store the currency and the
  exchange-rate source and date alongside every converted figure.
- **Assumptions are versioned.** Changing a COGS or overhead rule must not
  rewrite history; calculation-version metadata is preserved.
- **Ad-spend allocation is never a black box.** The chosen model, its
  confidence, and the unallocated remainder are all displayed. Spend is never
  double counted.
