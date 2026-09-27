# Bidding: paper by default

## The gate

A bid is **PAPER** unless both are true:

1. `GAVEL_LIVE_BIDDING=1` is set in the server's environment, and
2. the listing's source reports `capabilities.bid === true`.

No source reports it. `POST /api/bid` therefore always records a paper bid,
returns `mode: 'PAPER'`, a message that says so in plain words, and `openUrl`
(the lot on the auction's own site; `null` for a SAMPLE car). If both
conditions were ever true and no adapter existed, the route answers 501 rather
than pretending. The UI never says a bid was placed on an auction.

## The flow, as built

1. On a card, **Plan my bid** opens the Plan screen (`GET /api/listing/:id`).
2. The ledger recalculates on every input (`POST /api/plan`).
3. **Place a PAPER bid** (`POST /api/bid`) validates the amount (1 to
   5,000,000), stores a `PaperBid` with `mode: 'PAPER'` and `outcome: 'open'`,
   and shows a receipt with a PAPER stamp. Bidding above the plan's number
   asks for confirmation first.
4. **Open the lot with this number** opens the auction's page in a new tab.
5. In Watch, the member records how it ended: won, lost, withdrawn. Over ten
   cars the record shows whether the numbers run high or low.

## The number

```
resale target      what you believe it sells for after fixes (defaults to the comps estimate)
− buyer fee        from the house's published schedule, or your override percent
− transport        miles × a typical open-carrier rate (config.plan.transportPerMileUsd)
− repairs          what the photos and the inspection say
− cushion          config.plan.surpriseReserveUsd, for what you find after it arrives
− your margin      config.plan.targetMargin × resale
= never bid above  rounded down to the nearest $100
```

`headroom` is that number minus the price now. Negative means it is already
not your car. When the house uses a sliding scale and no override is set, the
fee counts as $0 and the plan says so in a warning, so the number is known to
be too high until the fee is typed in.

Never going above the number is the whole game.
