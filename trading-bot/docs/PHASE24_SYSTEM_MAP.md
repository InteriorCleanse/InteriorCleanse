# Phase 23 → Phase 24 System Map

The audit that precedes Phase 24. For every subsystem: input, output, storage,
trigger, current state, the missing piece Phase 24 supplies, test coverage
and the failure mode to guard. Nothing here changes the engine.

## Ground rules confirmed

- `config.live.enabled = false`, `config.shadow.enabled = false`, `LIVE_TRADING_ENABLED` unset. The live gate chain (`src/live/gates.ts`) is untouched by Phases 22–24.
- The engine's only edge into the learning layers is `watch.ts → observePaperClose(p, now)` in a try/catch, result unread. Phase 24 adds one more emission of the same shape: `bus.emit('watch:cycle', …)` after a cycle, result unread.
- One store (`src/store.ts`, SQLite). One scheduler (the watch loop: candle-driven with a timer safety net). Phase 24 adds a table to the store and a subscriber to the bus; it does not add a second store or a second candle loop. Research jobs run on one bounded timer inside the learning layer and persist their state in the store so a restart resumes.

## Subsystems

| Subsystem | Input | Output | Storage | Trigger | State after 23 | Missing for 24 | Tests | Failure mode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Watch loop `src/watch.ts` | bus `candle:closed`, timer | `WatchState {snap, at}`; eventLog; paper positions via `managePositions` | positions, events, equity | candle close / timer | production | emit `watch:cycle` after each cycle so observers run after positions are final | watch.test | a slow observer must never block a cycle → observers run on the bus, try/catch, unawaited |
| Paper trader `src/paperTrader.ts` | signals, candles | immutable closed records with decision snapshot | positions table | watch cycle | production | MAE/MFE never written on close (`RECONCILIATION_FIELDS` exist, no producer) → `src/paper/reconcile.ts` computes from stored candles after close | paper tests, records tests | writing anything but reconciliation fields to a closed record (store throws) |
| Analyst `src/analyst/*` | positions, replay trades | EvidenceRecord, cohorts, theses, quality, narration | none (pure) + backtest cache in kv | request | production | the drift monitor (paper vs historical by dimension) and cohort-percentile baselines for "unusual" | analyst tests | pooling PAPER and BACKTEST (datasetOf throws) |
| Case studies `src/school/caseStudies.ts` | stored candles, records | CaseStudy with 4 frames, counterexamples | vault items via `caseStudyItem` | request (14-day scan, cached) | production | automatic creation from live events: a candidate at event time, resolved when the horizon is stored, audited, then into the vault | caseStudies, acceptance | outcome leaking into BEFORE (hindsightFindings) |
| Replay School `src/school/replaySchool.ts` | candles | stops without answers | none (cached bundle) | request | production | replay a specific completed live event (stop before its outcome) | school tests | payload containing the outcome |
| Lessons / curriculum | cases, dataset | Lesson with labels | none | request | production | versioned lesson snapshots when the evidence changes; quizzes and exercises from resolved live events | school tests | rewriting educational history (versions must append) |
| Debate / teacher | snapshot | restated engine reasons; bounded answers | none | request | production | none | teacher tests | the model deciding (validator) |
| Progress | engagements | mastery (engagement only) | kv `learning:events` | user action | production | none | school tests | mastery read as skill (note on every summary) |
| Hypotheses `src/research/hypotheses.ts` | NewHypothesis, StageResults | versioned record, §7 statuses | kv `hypothesis:` | lab / observer | production | stage results produced by a frozen, registered experiment rather than an ad-hoc call; maturity lifecycle above the statuses | hypotheses tests | banned words; status set by hand |
| Lab `src/research/lab.ts` | dataset | questions (50-trade bar), critique, proposals with gates | kv `proposal:` | request | production | a queue with priority; automatic question generation from events and drift; a review queue with APPROVE FOR PAPER TEST / REJECT / REQUEST MORE RESEARCH | lab tests | approval applying anything (it records only) |
| Overfitting / trials | R series, registry | deflated Sharpe, curve | kv `research:trials` | backtest POSTs | production | every experiment counts as a trial (registry fed by the runner) | lab tests | forgetting discarded trials |
| Regime atlas, Hawkes, prediction-market | datasets, candles, news history | descriptive maps / estimates | none | request | production | none | lab tests | claiming direction |
| Vault `src/knowledge/vault.ts` | NewItem, evidence | versioned items, statuses | kv `knowledge:` | observer, request | production | memory classes; failure memory; decay monitor with WATCH / CONTRADICTED; supporting/contradicting evidence lists with sample growth | vault tests | silent deletion (none exists) |
| Observer `src/learning/observer.ts` | closed position | post-mortem, evidence counts, hypothesis flags | vault, kv | watch close | production | the same flow for every paper event (entry, missed, exit) and reconciliation of MAE/MFE | observer tests | double counting on restart (idempotent ids) |
| Passport, reviews | records, stores | living passport, brief, EOD, weekly | none | request | production | daily learning digest and weekly research review and monthly audit generated on schedule, stored once per period | reviews tests | a read that writes (weekly sweep is a POST) |
| Learning API / routes | HTTP | JSON | — | request | production | live observer, queue, experiments, findings, contradictions, review, drift, champion/challenger, failure memory, next research, status | learningRoutes | POST without the token (guard) |
| Factory / vault passports `src/factory`, `src/vault` | genomes, backtests | campaigns, passports, decay, champion/challenger comparison | kv | request | production (Phase 14–15) | reuse `compareChallenger` and `championOf` for the champion/challenger view; nothing auto-promotes | factory, vault tests | automatic promotion to live (`nextStage` caps at shadow) |
| Backtest `src/backtest`, replay | candles, params | BacktestReport with in-sample / validation / OOS / walk-forward / Monte Carlo | none | request | production | the experiment runner and sandbox call `runBacktest(id, {params})` for parameter variants and evaluate trade subsets for filter / session / regime restrictions; every run registered | backtest tests | changing parameters until a result appears (runner freezes the spec first, each run is a registered trial) |
| AI narrator / CIO / researcher `src/ai` | context | validated narration; campaign proposals | none | request | production | `proposeCampaigns` reused in recommendations | ai tests | invented figures (validators) |
| Journal `src/journal.ts` | user entries | stats, review | journal table | user | production | none | journal tests | — |
| News history / brain | calendar | series memory, event study | kv | getNews | production | NEWS EVENT observations from blackouts starting within a candle | news tests | — |
| Intel alerts / delta `src/intel` | frames | alerts, deltas | in-memory | request | production | the observer reuses `detectAt` from the case-study engine (already diffs engine steps) rather than the annotation delta, so events carry engine evidence | intel tests | — |
| Recovery `src/recovery.ts` | store | boot log, re-adopted positions | kv | startup | production | research-ops state (last/next run, last digest day) persisted so a restart resumes without duplicating | recovery tests | duplicated experiments or digests after restart (deterministic ids) |

## What Phase 24 adds, and where

| Piece | Module | Store |
| --- | --- | --- |
| Observer + significance + candidates | `src/observer/*` | `observations` table (deterministic ids) |
| Live School + replay conversion | `src/observer/live.ts`, `replaySchool` extension | — |
| Experiment registry, runner, baseline, sandbox, challenger | `src/research/experiments.ts`, `challenger.ts`, `sandbox.ts` | kv `experiment:` |
| Research queue, maturity, recommendations, review queue | `src/research/queue.ts`, `maturity.ts`, `recommend.ts` | kv `queue:` |
| Memory classes, failure memory, decay monitor | `src/knowledge/memory.ts`, `failures.ts`, `decayMonitor.ts` | kv `failure:` + vault |
| Drift monitor | `src/learning/drift.ts` | — |
| Digest, weekly research review, monthly audit | `src/learning/digest.ts` | vault items, one per period |
| Education updates | `src/school/updates.ts` | kv `lesson-version:` |
| Scheduler, status, recovery | `src/learning/ops.ts`, `status.ts` | kv `research:ops` |
| Reconciliation of MAE/MFE | `src/paper/reconcile.ts` | positions (reconciliation fields only) |

## Boundaries carried forward

- No file under the learning layers value-imports a deciding module, calls a position / order / passport / parameter writer, or assigns to `config` (test/learning/observer.test.ts). `src/paper/reconcile.ts` is the one new writer and it may write only the store's reconciliation fields.
- Every new record has a deterministic id from its content so a restart cannot duplicate it.
- The engine reads none of the new stores (acceptance step 23 extended to the new prefixes).

## Delivered

The modules planned above were built in seven parts (commits "Phase 24, P1"
through "Phase 24, P7"). The operator's map — how to run Mr. Cash 24/7 in
paper mode, the two entry points, where each store lives, the maturity
lifecycle, the research boundaries and failure recovery — is
`AUTONOMOUS_RESEARCH_OPS.md`. The adversarial tests are
`test/learning/adversarial.test.ts`, the growth stages
`test/learning/growth.test.ts`, and the 22-step lifecycle demonstration
`test/learning/lifecycle.test.ts`.
