# The Knowledge Vault

What Mr. Cash remembers — including what did not work. Module:
`src/knowledge/vault.ts`; routes `/api/knowledge/*`; tab KNOWLEDGE. Tests:
`test/knowledge/vault.test.ts`.

## Three rules

1. **Append, never rewrite.** A revision bumps the version and keeps the prior body in the item's history. The record of what was believed, and when, is part of the knowledge.
2. **Contradiction counts.** Supporting and contradicting evidence are counted apart. 25 new supporting observations send an item to REVIEW REQUIRED; 5 contradictions do — far fewer, on purpose.
3. **Nothing here decides anything.** The vault is memory. The school, the lab and the reviews read it; the engine never does (pinned by `test/learning/acceptance.test.ts` step 23 and the boundary tests).

## An item

| Field | Meaning |
| --- | --- |
| kind | concept, case-study, research-result, hypothesis, counterexample, strategy-observation, regime-observation, session-observation, data-quality-warning, lesson, failed-hypothesis, reassessment |
| evidenceLabel | OBSERVED, INFERRED, HYPOTHESIS, SIMULATED, INSUFFICIENT DATA |
| provenance | source (PAPER, BACKTEST, HISTORICAL, ENGINE, USER, NONE), engine version, symbol, timeframe, period, record ids, sample size, method |
| status | CURRENT, WATCH, REVIEW REQUIRED, STALE, CONTRADICTED, SUPERSEDED, RETIRED (WATCH and CONTRADICTED are set by the decay monitor, `src/knowledge/decayMonitor.ts`) |
| created_at, last_reviewed, review_due | the clock; items expire into review after 30 days unreviewed |
| new_evidence_count, contradictory_evidence_count | counted apart |
| version, history | every event with its detail |
| links, tags, payload | related items, filters, and the producing module's structured data (a case's frames, a post-mortem) |

Ids are deterministic from kind + title + creation time, so the same event
recorded twice is one record (`addItem` returns the prior).

## Directional items and the learning loop

An item whose payload is `{ direction: 'positive' | 'negative', filters }` is
a claim about a cohort. When a paper trade matching the filters closes, the
learning loop (`src/learning/observer.ts`) records it as supporting or
contradicting evidence on that item. That is how a strategy observation made
on day one is confronted with day ninety's trades without anyone remembering
to look.

## Post-mortems

Every closed paper trade produces a `lesson` item titled
"Post-mortem · strategy · kind · R": observations from the immutable record
(exit, R, duration, what the decision-time snapshot recorded or that there
was none, excursions as stored or "not computed until reconciliation", news
proximity, spread) plus an explicit *cannot conclude* list (an edge from one
trade; a better stop; higher-timeframe alignment the engine does not record).
Sample size 1, OBSERVED, PAPER. The id is the trade id, so a restart
replaying the loop writes nothing twice.

## Review

`POST /api/knowledge/review` with CONFIRMED (counters and clock reset),
REVISED (new body, version bump, old body kept in history) or RETIRED. A
retired item does not come back to review.

`POST /api/knowledge/reassess` runs `reassessAll`: vault items past their
review date become STALE, hypotheses past theirs become STALE, undecided
proposals past 30 days EXPIRE. Nothing is deleted; each history says why.
The weekly review's reassessment block reports the last sweep; a plain GET
of the weekly review does not sweep.

`POST /api/knowledge/backfill` runs the observer over every closed paper
record that has no post-mortem yet — for the first boot after this phase.

## What did not work

`vaultSummary().failed` counts failed hypotheses and counterexamples. They
are kept, listed and filterable, never pruned. The daily brief prints the
number.

## Routes

`GET /api/knowledge?kind=&status=&tag=&limit=`, `/item?id=`, `/passport?strategy=`
(see `docs/LEARNING_LOOP.md`), `/brief`, `/eod`, `/weekly`, `/graph`;
`POST /api/knowledge/review`, `/reassess`, `/backfill`.

## Owner notes: telling him something to remember

Knowledge → Vault → **Tell him something to remember** (or `POST /api/knowledge/note`)
stores something you heard — a date, a headline, a reel — as a vault item:

- `kind: hypothesis`, `evidenceLabel: HYPOTHESIS`, `provenance.source: USER`,
  `sampleSize: 0`, tagged `owner-note` (and the market, if you give one).
- The source link is written into the body as **not verified by Mr. Cash**.
- An optional **watch date** becomes the item's `review_due`, so the note stays
  CURRENT until that day and then comes due for review — that is how it
  resurfaces when it matters. Without one it takes the normal 30-day cadence.
- Certainty words (`guaranteed`, `proven`, …) are refused, the source must be an
  http(s) link, and the watch date must be in the next two years.

A note is memory, not a signal. The vault is never read by the engine
(`test/knowledge/note.test.ts` checks that no decision-making module imports
it), and the decay monitor ages only data-derived items, so a note cannot move
a trade. Testing one needs data for its market: a note about a stock the bot
has no price feed for stays UNTESTED.
