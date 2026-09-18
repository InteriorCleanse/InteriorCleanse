# The Market School

How Mr. Cash teaches what its engine does, from its own record, without ever
telling you what to trade.

## What it is

The Market School is the SCHOOL tab and the `/api/school/*` routes. It has
seven parts:

| Part | Module | What it does |
| --- | --- | --- |
| Curriculum | `src/school/curriculum.ts` | 25 concepts in the engine's own terms: what it is, what the engine checks (by module), common misreads, related concepts, the strategies that use it, the case kinds that illustrate it, a quiz |
| Lessons | `src/school/lessons.ts` | Assembles a lesson at request time from the curriculum, the engine's historical case studies and the paper record |
| Case studies | `src/school/caseStudies.ts` | BEFORE / DURING / DECISION / AFTER frames found by stepping the real engine over stored candles — see `docs/CASE_STUDY_ENGINE.md` |
| Replay School | `src/school/replaySchool.ts` | Stops on stored candles that ask before they tell |
| Market debate | `src/school/debate.ts` | Bull, bear and neutral cases restated from the engine's outputs; the judge is the fused decision |
| Teacher | `src/school/teacher.ts` | A bounded AI teacher — see `docs/AI_TEACHER_AND_DEBATE.md` |
| My Learning | `src/school/progress.ts` | Engagement per concept. Not skill. |

Other markets: `src/school/predictionMarket.ts` teaches prediction-market
edge, costs and Kelly with SIMULATED arithmetic. There is no venue connection.

## The curriculum

Every concept states four things, and the test in `test/school/school.test.ts`
checks the structure:

- **summary** — plain language, written for this engine, labelled INFERRED in a lesson because it is a definition, not a result;
- **engineChecks** — the module that actually runs (`liquidity.ts`, `fvg.ts`, `structure.ts`, `sessions.ts`, …), labelled OBSERVED;
- **misreads** — the counterexample side of the lesson;
- **related / strategies / caseKinds / annotationTypes** — the knowledge graph edges. The graph has no dangling edges; strategy ids are checked against the registry; case kinds against `CONCEPT_OF`.

Tracks: liquidity, imbalance, structure, sessions, regimes, risk, statistics,
research, markets. Levels: foundation, intermediate, advanced.

The quiz answer key never leaves the server. `publicQuestion()` strips it;
`gradeQuiz()` grades on the server and returns each question's *why*.

## A lesson

`buildLesson(conceptId, { cases, dataset, now })` returns sections, each with
an evidence label and a provenance line:

1. What it is — INFERRED, curriculum text.
2. What the engine checks — OBSERVED, engine version stamped.
3. How it is commonly misread — INFERRED.
4. From the chart — OBSERVED, HISTORICAL case studies the engine found; or INSUFFICIENT DATA when the scan found none.
5. Where it went the other way — OBSERVED, counterexample pairs.
6. How often the event went its expected way — the tally; no share is stated under ten instances.
7. What the paper record shows — OBSERVED with the cohort's n, mean R and 95% interval at or above the 10-trade bar; NOT ENOUGH DATA below it. Only for concepts that map to an honest cohort (a strategy set, a session set, a regime set). A concept with no such mapping shows no paper panel rather than an invented one.

**Zero-data behaviour.** With no paper record the lesson still teaches from
the concept text and the historical cases, and its notes say so
("Zero-data mode"). Nothing is fabricated to fill the paper panel.

**Data growth bars.** `dataGrowth(n)` puts every count on the same scale:
0–9 (INSUFFICIENT SAMPLE), 10–49 (EARLY SAMPLE), 50–199 (DEVELOPING DATASET),
200+ (LARGER DATASET). These are the `SAMPLE_BARS` of the analyst layer;
the school adds no thresholds of its own.

## Replay School

`buildReplayLesson(candles)` steps the engine once, builds replay frames with
`buildReplayFrames` (each filtered by `knowableAt`), finds the case studies,
and picks up to eight stops spread across the window. For each stop:

- `stopView(bundle, k)` returns the BEFORE frame (the previous candle's close), the context, and the question. It does **not** contain the answer, the DURING detail, the decision or the AFTER frame. The route test checks the JSON for those keys.
- `revealStop(bundle, k, choice)` returns the answer, the explanation, the frames, and `hindsightFindings()` for the case — the same audit the tests run.

Two question types: *what did the engine detect on the next candle* (the kind
plus three distractor kinds) and, at a strategy setup, *what did the fused
decision come to* (LONG / SHORT / WATCH / NO TRADE).

## My Learning

Mastery is **engagement**: lessons viewed, quizzes taken and their scores,
cases and counterexamples reviewed, replay stops answered. Levels: UNSEEN →
INTRODUCED (a lesson opened) → PRACTISING (a quiz or replay answered) →
FAMILIAR (best quiz ≥ 80 %, a counterexample reviewed, two practices). The
note on every summary reads: *Engagement only — not trading skill, not read
by the engine.* Suggestions point at unseen foundations first, then at
practised concepts with no counterexample reviewed.

## Routes

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/school` | concepts with mastery, graph, progress, data growth |
| GET | `/api/school/lesson?id=` | a lesson |
| POST | `/api/school/quiz` | `{ conceptId, answers }` → graded; counted as engagement |
| POST | `/api/school/engage` | `{ kind, conceptId, caseId? }` — lesson-viewed, case-reviewed, counterexample-reviewed |
| GET | `/api/school/cases?kind=&concept=&limit=` | case studies (BEFORE annotations counted, served per case) |
| GET | `/api/school/case?id=` | one case with its concepts and counterexamples |
| GET | `/api/school/counterexamples?kind=` | pairs |
| GET | `/api/school/replay` · `/replay/stop?k=` | lesson and a stop (no answer) |
| POST | `/api/school/replay/answer` | `{ k, choice }` → reveal |
| GET | `/api/school/debate` | the current debate |
| POST | `/api/school/teach` | `{ question, conceptId?, caseId?, debate? }` |
| GET | `/api/school/why?type=&strategy=` | the chart's "Why is this here" |
| GET | `/api/school/progress` | My Learning |
| GET | `/api/school/prediction-market?yes=&no=&fee=&slip=&p=` | SIMULATED arithmetic |

Every POST passes the same state-change guard as the rest of the app
(`x-mrcash-csrf` plus same-origin); a token-less POST is refused with 403.

## What it never does

It never creates, modifies or recommends a trade. It never changes a
parameter. It never upgrades a small sample by describing it confidently. The
boundary tests in `test/learning/observer.test.ts` pin that no file under
`src/school/` value-imports anything that decides, sizes, places or manages an
order (the one exception, `caseStudies.ts`, imports the pure `fuse()` to step
the real engine over stored candles), calls no position or order writer, and
never assigns to `config`.
