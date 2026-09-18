# The Hypothesis Engine

Module: `src/research/hypotheses.ts`. Tests: `test/research/hypotheses.test.ts`.

## The record

A hypothesis carries every field the specification asks for, and nothing is
inferred from a missing one:

| Field | Meaning |
| --- | --- |
| question, observation, hypothesis, nullHypothesis | the four sentences; the observation is marked in-sample when it prompted the question |
| direction | positive, negative or difference — how support and contradiction are derived |
| dataset | `{ source: PAPER \| BACKTEST, label }` fixed at creation; one source per hypothesis |
| markets, timeframes, dateRange | what it is about |
| strategy, regime, session | the cohort in words |
| cohortFilters | the cohort in the analyst layer's own filter shape |
| sampleSize, method | the count of the latest stage and how it was measured |
| inSample, outOfSample | `StageResult`s: at, source, data type, trades, sample status, mean R, 95% interval, method, record ids, note |
| walkForward, robustness | walk-forward folds and Monte Carlo when supplied |
| counterevidence, limitations | appended, never removed |
| status, version, created, lastReviewed, nextReview | lifecycle |
| links, history, engineVersion | traceability |

## Statuses

Only these, in this order, and nothing flattering:

    UNTESTED → TESTING → INSUFFICIENT DATA → OBSERVED IN SAMPLE → NOT SUPPORTED
                                         → OOS SUPPORTED → UNDER REVIEW → STALE → REJECTED

Status is **derived** from the results by `deriveStatus`:

- INSUFFICIENT DATA — the latest stage is under the 10-trade bar;
- OBSERVED IN SAMPLE — the in-sample interval supports the direction, and no out-of-sample stage yet, or one whose interval includes zero;
- OOS SUPPORTED — the out-of-sample interval supports the direction;
- NOT SUPPORTED — the out-of-sample interval contradicts it (the contradiction is recorded as counterevidence, not dropped);
- UNDER REVIEW — new evidence flagged it (the learning loop does this after ten new paper closes in the cohort); a review re-derives;
- STALE — not reviewed within 30 days; the sweep marks it and the daily brief lists it;
- REJECTED — final.

`verdictOf(direction, result)` is the one place support and contradiction are
decided: a positive hypothesis is supported by an interval whose low end is
above zero, contradicted by one whose high end is below; a difference
hypothesis by any interval clear of zero.

## Banned words

`BANNED_WORDS = /\b(proven|guaranteed|certain(?:ly)?|best|perfect|fail-?proof)\b/i`
is refused in every text field, at creation and on every stage, review or
rejection note. The error says what to do instead: state what the evidence
shows.

## Versioning

Every change bumps the version and appends a history entry with the event,
the detail and the version it produced. A revised or reviewed hypothesis
keeps its earlier stages; nothing is overwritten.

## The out-of-sample discipline

The lab's out-of-sample stage (`researchTestHypothesis`) uses records decided
**after** the hypothesis was created, matching its cohort filters, from its
own source. The in-sample stage may use all matching records. The method
string on the result says which. A hypothesis about PAPER cannot be tested on
BACKTEST records, and vice versa.

## Review

`flagForReview` (from the learning loop, with the tally of agreeing and
disagreeing trades in the reason), `reviewHypothesis` (resets the clock,
re-derives the status), `markStale`, `reject`. `sweepStaleHypotheses(now)`
is run by the reassessment.

## Where it is used

- the Research Lab drafts questions into this shape and tests them;
- the learning loop counts new paper evidence per hypothesis and flags review;
- proposals link hypothesis ids and read their statuses for the OOS gate;
- the living passport lists a strategy's hypotheses with status and next review.
