# The Learning Loop

What happens after a paper trade closes, how conclusions are reassessed, the
living strategy passport, and the three reviews. Modules under
`src/learning/`. Tests: `test/learning/observer.test.ts`,
`test/learning/reviews.test.ts`, `test/learning/acceptance.test.ts`.

## The one edge into the engine

`src/watch.ts`, after `managePositions()` has finalised a close:

```ts
try { observePaperClose(p, now) } catch (err) { eventLog.push('info', 'Learning loop skipped', …, 'warn') }
```

Its result is not read. A failure cannot affect the cycle. That is the whole
contract: the engine would run identically if `src/learning/` did not exist.
`test/learning/observer.test.ts` pins that this is the only import from the
learning layers anywhere in the engine, that it runs after
`managePositions`, inside a try/catch, and that the result is not assigned.

## observePaperClose

1. `fromPaperPosition(p)` — the immutable record becomes an `EvidenceRecord`.
2. `postMortemOf(record)` — kind (win, loss, flat, loss-on-full-checklist, missed, unreadable), observations, and the *cannot conclude* list. Nothing is re-simulated; excursions are reported as stored.
3. `addItem(postMortemItem(...))` — into the vault, id = the trade id (idempotent).
4. For every CURRENT / REVIEW REQUIRED directional knowledge item whose filters match: `recordEvidence` as supporting or contradicting.
5. For every PAPER hypothesis (or OOS SUPPORTED one) whose cohort filters match and which is not REJECTED / STALE / UNDER REVIEW: count the trade under `learning:hyp-evidence:<id>` (reset when the hypothesis is reviewed); at ten, `flagForReview` with the tally of agreeing and disagreeing trades.

A second observation of the same close writes nothing and counts nothing.

## reassessAll

`sweepStale` (vault), `sweepStaleHypotheses`, `sweepProposals`. Records
expire into review; nothing is deleted. Run from `POST /api/knowledge/reassess`,
from the weekly review with `reassess: true`, and from the vault tab's button.

## The living strategy passport — `src/learning/passport.ts`

`livingPassport(strategyId, closed)` is assembled at request time from the
records that exist, with each part labelled, and stores nothing as a
conclusion:

- strategy meta and whether it is enabled; the concepts it relies on;
- the PAPER cohort with its thesis and data-growth bar, or NOT ENOUGH DATA under 10 trades;
- the OOS reference (BACKTEST, SIMULATED) when one was computed;
- the factory vault passports with their OOS evidence and decay reading;
- hypotheses with status, version and next review;
- proposals with status and what they require;
- post-mortems (the vault's lessons tagged with the strategy);
- the regime-atlas rows for its family;
- the trial count;
- *what would change this reading* — from the thesis's falsification, or the trades needed for a first reading, or the missing OOS reference.

There is no field that says "works".

## The reviews — `src/learning/reviews.ts`

Every block carries an evidence label and a source. Nothing is a forecast.

- **Daily brief** — what is due (vault reviews, stale items, hypotheses under review or past their date, proposals awaiting a human), what to study (My Learning suggestions), the record (closed trades, growth bar, last-7 stats at the bar or INSUFFICIENT DATA), yesterday's post-mortems. Its note: *This brief lists what is due and what to study. It does not say what the market will do today.*
- **End of day** — today's closes as post-mortems with the total R ("a day, not a sample"), the no-trade journal by category (risk-veto, stale-data, kill-switch, price-ran-away, cancelled, other), new vault items. A quiet day is data too.
- **Weekly review** — this week vs the prior week, described and not trended ("two weekly means are two small samples"), by strategy with sample status, vault / hypothesis / proposal / trial counts, the reassessment block, engagement totals. Its note: parameters unchanged by this review; changes go through a proposal a human decides.

## Zero-data behaviour

Everything above answers with zero paper trades: NOT ENOUGH DATA or
INSUFFICIENT DATA where a figure would otherwise be, growth bars at 0–9, and
the lesson and the replay school teaching from HISTORICAL candles. Nothing is
fabricated to fill a panel.

## Data growth bars

0–9 · 10–49 · 50–199 · 200+ — the analyst layer's `SAMPLE_BARS`, shown on the
school index, every lesson's paper panel, the passport, the daily brief and
the weekly review.
