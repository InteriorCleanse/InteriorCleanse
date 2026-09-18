# The Case-Study Engine

Every case study is BEFORE / DURING / DECISION / AFTER, built from what the
engine could know at the time and nothing later. Module:
`src/school/caseStudies.ts`. Tests: `test/school/caseStudies.test.ts` and the
no-hindsight steps of `test/learning/acceptance.test.ts`.

## How a case is found

`stepEngine(candles, votesTail)` steps the real `IctEngine` once over stored
candles, computing strategy votes and the fused decision for the trailing
`votesTail` steps (the expensive part). `casesFromSteps(steps, candles)`
diffs consecutive steps and records an event when something appears that was
not there on the previous step:

| Kind | Detected from |
| --- | --- |
| liquidity-sweep | a sweep on `sweepsToday` / `swingSweepsToday` whose index is this candle |
| bos / choch | a structure shift whose index is this candle |
| fvg-created / fvg-retest / fvg-inverted | a gap created here, or whose state changed to mitigated / inverted |
| order-block-interaction / breaker-formation | an order block whose state changed to mitigated / broken |
| large-displacement | this candle's range ≥ 2.5 ATR |
| regime-transition / session-transition / volatility-expansion | the regime, session or volatility label changed |
| strategy-setup, silver-bullet-setup, unicorn-setup, turtle-soup-setup | a strategy voted BUY or SELL |
| strategy-rejection | a strategy held with all but one condition met |

Paper-derived kinds come from the record, not from a rescan:
`exceptional-mfe` (MFE at or above the cohort's 90th percentile, 10+
samples), `exceptional-mae` (MAE at or below the 10th), `unexpected-
strategy-failure` (a loss with fused score at or above the enter bar and a
checklist of 80+), `risk-veto` (from missed signals).

## The four frames

- **BEFORE** — `asOf` is the previous candle's close. Annotations are `annotate()` over the previous step filtered by `knowableAt(asOf)`. Session, regime, volatility, structure trend and price are read from the previous analysis. For a paper-derived case, `asOf` is one millisecond before the decision.
- **DURING** — the event candle, the detail string, ATR, range in ATRs.
- **DECISION** — the strategy votes (id, action, confidence, passed / failed counts) and the fused decision when votes were computed for this step; otherwise the note says they were not.
- **AFTER** — the next `horizon` candles (default 24): close-to-close move, maximum up and down excursions in ATRs, and `wentExpectedWay` against the concept's usual expectation. If the horizon is not fully covered by stored candles the case is INSUFFICIENT DATA and no outcome is stated.

`at` is the event candle's close. `knownAt` is never earlier than that
close: the engine steps once per closed candle, so nothing on a candle is
knowable before it closes.

## The no-hindsight guarantee

`hindsightFindings(c)` returns a list of violations; the tests require it to
be empty for every case:

1. no BEFORE annotation is known after `before.asOf`;
2. `before.asOf` is strictly before `at`;
3. when AFTER has candles, it begins after `at`;
4. `knownAt` is not before `before.asOf`.

The replay school's reveal runs the same audit and returns it with the
answer, so the reader sees the check, not just a promise.

## Counterexamples

`counterexamplesFor(cases, kind)` pairs a case that went the concept's way
with one that did not, for the same kind. The lesson attached to every pair:
*Similar-looking structure does not guarantee the same outcome. The same
event, read the same way by the same engine, went the other way here.*

`outcomeTally(cases)` gives, per kind, n and how many went the expected way.
A share is stated only at n ≥ 10, and the note says it is a description of
the window, not a probability.

## Into the vault

`caseStudyItem(c)` turns a case into a knowledge item of kind `case-study`
with the frames as payload, HISTORICAL or PAPER provenance, the record ids
and the period. The id is the case id, so the same event recorded twice is
one item.

## Costs

The scan over 14 days of 5-minute candles (about 4,000 steps, votes on the
last 600) runs on request and is cached per last-closed candle
(`src/learning/api.ts`). It is never run on a timer and never on the desk's
polling path.
