# Autonomous Market Observation and Continuous Research Operations (Phase 24)

Mr. Cash runs a continuous loop beside the paper engine:

    OBSERVE → RECORD → CLASSIFY → EXPLAIN → RESEARCH → TEST → CHALLENGE → REMEMBER → TEACH → REASSESS

It reads the engine's record and writes only its own stores. It never
changes a parameter, a strategy, a gate or a position. The engine would run
identically if the whole layer were deleted; `test/learning/observer.test.ts`
(the boundary tests) and `test/learning/adversarial.test.ts` pin that.

This document is the operator's map. The Phase 23 pieces it builds on are
documented in `MARKET_SCHOOL.md`, `CASE_STUDY_ENGINE.md`, `RESEARCH_LAB.md`,
`HYPOTHESIS_ENGINE.md`, `KNOWLEDGE_VAULT.md`, `LEARNING_LOOP.md` and
`AI_TEACHER_AND_DEBATE.md`; the audit that preceded this phase is
`PHASE24_SYSTEM_MAP.md`.

## Run Mr. Cash 24/7 in paper mode

```
cd trading-bot
npm install            # once
npm run doctor         # checks node, the data dir, the feed
npm start              # the app: watch loop + research ops + the desk on http://127.0.0.1:4173
```

Or, without the browser:

```
npm run watch          # the watch loop + research ops in a terminal
```

Nothing else is needed. The market feed starts, the watch loop reacts to
every candle close, the observer records each cycle off the bus, and the
research scheduler runs one bounded tick every 15 minutes. State persists in
the data directory (`MRCASH_DATA_DIR`, default `./data`); a restart resumes
where it stopped. Verify the boundaries any time:

```
npm run typecheck && npm run selftest && npm test
grep -n "enabled" config.ts | grep -E "live|shadow"     # both false
echo "${LIVE_TRADING_ENABLED:-unset}"                    # unset
```

The live execution gate (`config.live.enabled`, `LIVE_TRADING_ENABLED`) is
never read or written by any file under `src/observer`, `src/research`,
`src/knowledge`, `src/school` or `src/learning`.

## The two entry points

| Trigger | What runs | Bound |
|---|---|---|
| `watch:cycle` on the bus, after every engine cycle | `observeCycle` (record the engine's events, paper entries/exits, vetoes, unusual MAE/MFE) then `resolveCandidates` (rebuild due candidates into case studies, audit them, vault them) | 5 candidates resolved per cycle; the loop never awaits or reads the result |
| One timer, every 15 min (`RESEARCH_TICK_MS`) | `researchTick`: harvest failures · drift monitor · regenerate the queue · decay monitor · at most ONE cohort experiment with its challenger · daily digest / weekly review / monthly audit on period rolls | one experiment per tick; parameter experiments are never started automatically |

Ops state lives in the kv store under `research:ops` (last/next run, period
keys, last experiment, last error, last cycle). `GET /api/ops` shows it;
`POST /api/ops/run` runs a tick on demand.

## Where each thing lives

| Concern | Module | Store |
|---|---|---|
| Observations (22 event types, each with time, available-at, session, regime, engine and feature version, source, evidence, significance) | `src/observer/events.ts`, `src/observer/observer.ts` | `observations` table |
| Significance (why an event was selected; never a return prediction) | `src/observer/significance.ts` | on the observation |
| Live school (observing → RESULT REVEALED; replay stops before the outcome) | `src/observer/live.ts` | — |
| Experiments (frozen dataset, strategy version, parameters; in-sample, out-of-sample, baseline, Welch, walk-forward, Monte Carlo, multiple-testing context, counterevidence, reassessment) | `src/research/experiments.ts` | kv `experiment:` |
| Challenger (13 attacks; SURVIVES / WEAKENED / DISPROVED / UNTESTABLE) | `src/research/challenger.ts` | on the experiment |
| Sandbox (session / regime / volatility / confluence restrictions, parameter variants vs defaults) and champion / challengers | `src/research/sandbox.ts` | kv `experiment:` |
| Research queue and maturity lifecycle | `src/research/queue.ts` | kv `queue:` |
| "What should we study next" | `src/research/recommend.ts` | — |
| Human approval center | `src/research/review.ts` | kv `review:` |
| Failure memory (what, where, expected, what happened, how many times, replicated, still active) | `src/knowledge/failures.ts` | kv `failure:` (+ a vault mirror) |
| Memory classes and recall | `src/knowledge/memory.ts` | index over the other stores |
| Decay monitor (WATCH / REVIEW REQUIRED / CONTRADICTED) | `src/knowledge/decayMonitor.ts` | vault items |
| Historical → paper drift | `src/learning/drift.ts` | — |
| Daily digest (15 sections incl. STRATEGY / REGIME / SESSION BEHAVIOR and the LESSON OF THE DAY), weekly research review (WHAT CHANGED · OBSERVED · TESTED · SURVIVED · FAILED · CONTRADICTED PREVIOUS BELIEFS · NEEDS MORE DATA · IS STALE · SHOULD BE RESEARCHED NEXT · SHOULD NOT BE TOUCHED), monthly model audit (research activity incl. walk-forward, overfitting warnings, duplicate research and multiple-testing exposure; knowledge decay; strategies; data quality; boundaries) | `src/learning/digest.ts` | kv `digest:daily|weekly|monthly:` |
| Lesson versions and case exercises | `src/school/updates.ts` | kv `lesson-version:` |
| Scheduler and status | `src/learning/ops.ts`, `src/learning/status.ts` | kv `research:ops` |
| Routes | `src/learning/api.ts`, `src/server.ts` (`/api/observer`, `/api/ops`, `/api/research/*`, `/api/knowledge/*`, `/api/school/*`) | — |
| UI | Observer tab (`web/js/live.js`), Research tab (Sandbox, Experiments), Knowledge tab (Memory, Digests & audits) | — |

## Maturity lifecycle

    OBSERVATION → QUESTION → HYPOTHESIS → TESTING → INSUFFICIENT DATA
      → OBSERVED IN SAMPLE → OOS TESTING → OOS SUPPORTED → ROBUSTNESS REVIEW
      → UNDER REVIEW → REASSESSMENT

Maturity is derived from the hypothesis and its experiments every time the
queue regenerates; it is never typed in. No stage is called proven,
guaranteed or best.

## Research boundaries

- The AI is not a trading strategy. It never reaches the signal engine,
  fusion, risk, sizing or execution gates; the boundary tests fail the build
  if a learning-layer file value-imports any of them or calls any writer.
- Nothing is manufactured. An observation is what the engine saw on a cycle,
  content-addressed on type, symbol, timeframe, availability and reference.
- BEFORE frames use only what was knowable at the close; AFTER frames come
  only from stored candles; a candidate is judged due against the last
  STORED candle, never the clock. `hindsightFindings` audits every case.
- Every experiment freezes its inputs before it runs and is never re-run
  into a different answer. Every result is measured against a defined
  baseline. Parameters are never moved until a result appears — a parameter
  experiment is a sandbox request a person makes, against the defaults.
- Priority never reads the size of an observed edge.
- Knowledge is never deleted: it moves to WATCH, REVIEW REQUIRED, STALE or
  CONTRADICTED with the reason in its history; a review confirms, revises or
  retires. Corrupted rows are skipped, counted and left in place.
- PAPER and BACKTEST are never pooled. A mixed dataset asks no question.
- Drift is reported as a difference, never a cause.
- The champion is never replaced automatically. Approving a proposal
  advances a paper-test stage and changes nothing in production.
- New data does not become new strategy. The digest, review and audit
  describe; they promote nothing.

## Reading the panels

Observer tab → **Live observer**: "Mr. Cash is observing…" with what was
knowable at the close; **RESULT REVEALED** after the horizon is stored.
**Today's learning**: the digest assembled now, with the LESSON OF THE DAY.
**Research queue**, **Experiments**, **Findings & contradictions**,
**Requiring review** (knowledge decay + the human approval center),
**Paper vs historical**, **Champion / challengers**, **Failure memory**,
**Next research**, **System status**.

## Failure recovery

Ids are deterministic everywhere (observation, case, experiment, queue item,
failure, digest, lesson version, review). A tick that runs twice writes
nothing twice. On restart: a stranded RUNNING experiment is finished before
anything new starts; a running flag older than four ticks is cleared; a
period that rolled while the process was down is written on the first tick;
a digest already on record is re-read, not rewritten.

## Performance

The observer runs after the engine cycle and is bounded per cycle. The
research tick is bounded to one experiment and runs off its own timer; a
tick in flight is shared, never doubled. Backtests are never run on a read:
the drift monitor and the champion view use the cached backtest
(`POST /api/evidence/backtest` computes one) and say so when there is none.
