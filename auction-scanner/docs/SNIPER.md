# The Sniper

A target is a saved hunt: makes, models, a year range, a mileage cap, states,
the most you will spend, a minimum Steal score, and whether the starter rules
must pass. The engine (`src/sniper/engine.ts`) matches every scanned car to
every active target, ranks the picks by fit, and writes a **fire plan** for
each one.

## The fire plan follows the auction's closing rule

| Where | Rule | Fire plan |
|---|---|---|
| eBay Motors | Hard end time, no extension | **Snipe**: place the maximum with about eight seconds left (`fireAt = endsAt − 8s`) |
| Cars & Bids, Bring a Trailer, GovDeals, ACV | Soft close: a late bid extends the clock | **Proxy**: place the maximum early and let it run |
| Copart, IAA, Manheim, ADESA, local, collector | Live lane at a set time | **Pre-bid** the maximum before the lane |
| Fixed price | Nothing to snipe | Buy if at or under the number, else offer or pass |

The maximum is the bid plan's "never bid above", capped by the target's
budget. The plan says when the budget is the binding number.

## Armed targets fire on paper

An armed target records a **PAPER** bid at the fire plan's number the moment a
pick appears, once per car per target, and writes an alert. Nothing is sent
to an auction. The route that would place a real bid is the same gate as the
Bid button (`GAVEL_LIVE_BIDDING` and a source's `capabilities.bid`), and no
source has it. The real bid is placed by a person on the auction's site, at
the number and the time the fire plan gives.

## The clock

While the app runs, the sniper rescans every ten minutes (`sniperIntervalMs`
in `startServer`, 0 in tests) whenever a target is active, and on **Scan now**.
Scans share the feed's 60-second cache. With no live source connected the
sniper hunts the SAMPLE feed, labelled, so it can be practised before a key
exists.

## Files

`src/sniper/targets.ts` (validation and the store), `engine.ts` (matching,
fire plans, fit), `alerts.ts` (the record, deduplicated). Routes:
`GET /api/sniper`, `POST /api/sniper/targets`, `POST /api/sniper/targets/:id`,
`DELETE /api/sniper/targets/:id`, `POST /api/sniper/run`,
`POST /api/sniper/alerts/read`.
