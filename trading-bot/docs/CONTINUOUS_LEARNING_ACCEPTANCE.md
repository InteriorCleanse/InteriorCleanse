# Continuous Learning — Acceptance, Security and Start-up

Phase 23 added the Market School, the Research Lab, the Knowledge Vault and
the learning loop on top of the paper-trading system. This document is the
reviewer's page: how to verify the phase, what it guarantees, what it does
not, what needs more data or a human, and how to start paper trading.

## The one sentence that matters

**The existing trading engine remains the sole source of trading decisions.**
Nothing under `src/school/`, `src/research/`, `src/knowledge/` or
`src/learning/` creates, modifies or recommends a trade, bypasses or
overrides risk, changes an entry, exit or size, touches live execution or the
live gate, or alters a parameter. The engine reaches the learning layers
through exactly one call — `observePaperClose` after a paper close, inside a
try/catch, result unread — and the learning layers reach the engine through
none.

## The 23-step acceptance workflow

`test/learning/acceptance.test.ts` runs these in order, in one process, over
a temporary data directory with zero paper trades:

1. Live and shadow gates are off and stay off.
2. The school index lists the curriculum with mastery UNSEEN and a 0–9 growth band; the knowledge graph has no dangling edges.
3. A lesson in zero-data mode teaches from the concept and history, labels every section, says NOT ENOUGH DATA for paper; the quiz carries no answer key.
4. A quiz is graded on the server and counted as engagement, not skill.
5. Every case study passes the no-hindsight audit.
6. Counterexamples pair what went the concept's way with what did not; the tally states no share under 10.
7. A replay stop contains nothing from the event candle onward; every BEFORE annotation is known by the cursor.
8. Answering a stop reveals the engine's reading and the outcome, with a clean hindsight audit.
9. The market debate's judge is the fused decision, restated.
10. The teacher without a model returns the lesson's own text, cited; a model that invents a win rate and a direction is replaced.
11. "Why is this here" maps chart objects and strategies to concepts.
12. The research lab drafts no question from zero data; the trial registry is empty.
13. A hypothesis is drafted UNTESTED with every field; banned words are refused; the status list is exactly the nine.
14. The out-of-sample check at zero trades is INSUFFICIENT DATA with no mean.
15. The overfitting detector says NOT ENOUGH DATA without a backtest; the deflation bar rises with trials.
16. The regime atlas is empty; the diffusion fit refuses under the minimum events.
17. A proposal fails its gates at zero data, requires HUMAN APPROVAL, names the failed gate, and cannot be approved.
18. The vault, the daily brief, end of day and the weekly review answer with labels.
19. The living passport says NOT ENOUGH DATA and what would change that.
20. A simulated paper close through the real observer writes one post-mortem, counts evidence, leaves an out-of-cohort hypothesis untouched, and is idempotent.
21. The reassessment expires an unreviewed item into STALE and deletes nothing.
22. The vault remembers a failed hypothesis; a revision keeps the old body.
23. Config is byte-identical, the engine files import no learning layer and read no learning store key, and the gates are still off.

Run it alone:

```
node --test --import ./test/setup.ts test/learning/acceptance.test.ts
```

## Verification commands

```
npm run typecheck        # 0 errors — tests are inside tsconfig
npm test                 # 771 tests at the time of writing, 0 failures
npm run selftest         # 80 checks, asserts LIVE_TRADING_ENABLED === false
BASE_URL=http://127.0.0.1:4173 npm run ui:smoke   # every tab (20) at 1180 px and 400 px, no page/console errors
```

Security regression is inside `npm test`: `test/security/harden.test.ts`
(nonce per request, script-src with the nonce and never unsafe-inline, the
header set, no inline handlers), `test/guard.test.ts` (state-change guard),
and `test/learningRoutes.test.ts` (a token-less POST to a learning route is
refused with 403; wrong method is 405). The three new tabs are external ES
modules under `web/js/`, loaded by `<script type="module">` tags that receive
the request nonce like every other script. No new dependency was added.

## Boundary tests

- `test/intel/boundary.test.ts` — no engine module imports the intelligence layer; the observation layers (analyst, school, research, knowledge, learning) are the permitted readers.
- `test/learning/observer.test.ts` — no engine module imports school / research / knowledge / learning except `watch.ts → learning/observer.ts`; that call runs after `managePositions`, inside a try/catch, result unassigned; the learning layers value-import nothing that decides (`caseStudies.ts` may import the pure `fuse()` and nothing else), call no position, order, passport or parameter writer, reference no exchange credential, and never assign to `config`.

## Provenance discipline

Every figure on the three tabs carries a label: OBSERVED, INFERRED,
HYPOTHESIS, SIMULATED or INSUFFICIENT DATA, with its source (PAPER = live
market, simulated execution; BACKTEST = simulated; HISTORICAL = engine scan
over stored candles; ENGINE = restated engine output). PAPER and BACKTEST are
never pooled. Sample bars: 0–9 / 10–49 / 50–199 / 200+. The words PROVEN,
GUARANTEED, CERTAIN, BEST, PERFECT and FAIL-PROOF are refused in hypotheses
and rejected in AI answers.

## What requires more data

| Needs | Before it can |
| --- | --- |
| 10 closed paper trades in a cohort | a lesson's paper panel, a passport reading, a weekly figure |
| 50 in a cohort with an interval clear of zero | a research question to be drafted; an atlas cell to be "established" |
| 20 out-of-sample trades and a deflated Sharpe over the recorded trials | the OOS and deflation gates of a proposal |
| 12 releases and 40 price events in 30 days | a news-to-price diffusion estimate |
| an OOS reference (`POST /api/validation/oos-reference`) | the paper-vs-backtest comparison on the passport |
| a cached backtest (`POST /api/evidence/backtest`) | the overfitting detector's verdict |

## What requires a human

- Approving or rejecting a proposal — and then, separately, editing config and committing with the proposal id. Approval applies nothing.
- Reviewing a knowledge item (CONFIRMED / REVISED / RETIRED) or a hypothesis.
- Enabling shadow or live trading. This phase did not touch those gates; `config.live.enabled` and `config.shadow.enabled` are false and `LIVE_TRADING_ENABLED` is not set.

## Known limitations

- The engine does not record higher-timeframe alignment on a trade; the passport and post-mortems say so rather than inferring it.
- Walk-forward fold results are not attached to the cached Evidence backtest, so the walk-forward proposal gate is unmet unless a caller supplies the share; a proposal is honest about that.
- The deflated Sharpe is computed on the cached backtest's per-trade R series (SIMULATED); the paper series is used only where its sample allows.
- The Hawkes fit is a bounded grid search, not a full optimiser; it reports its bounds.
- Case studies scan the last 14 days of stored candles; older history is not scanned unless the store holds it.
- Prediction-market arithmetic is teaching only; there is no venue connection and none is planned by this phase.
- The Instagram slides that prompted the quant add-ons were used for the public ideas only (the deflated Sharpe paper, Hawkes processes, regime maps, prediction-market arbitrage arithmetic); no branding, content or signals were copied.

## Starting paper trading

```
cd trading-bot
npm run typecheck && npm run selftest
npm start            # web app on http://127.0.0.1:4173, watch loop running
```

Then open the SCHOOL, RESEARCH and KNOWLEDGE tabs. On the first run after
this phase, press *Backfill post-mortems* on the KNOWLEDGE tab (or
`POST /api/knowledge/backfill`) so every closed paper record already on
disk gets its post-mortem. The learning loop runs on every close from then
on; the reassessment runs from the weekly review's button or
`POST /api/knowledge/reassess`.

Headless: `npm run watch`. The loop calls the same observer.
