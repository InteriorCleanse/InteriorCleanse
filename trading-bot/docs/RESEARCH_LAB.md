# The Research Lab

Questions from the record, a critique of every claim, and a strategy-evolution
pipeline that ends at a human, not at the engine. Modules under
`src/research/`; routes `/api/research/*`; tab RESEARCH.

## Research questions

`researchQuestions(dataset)` walks the evidence cohorts (strategy, session,
regime, volatility, hour, weekday, news bucket, quality bucket). Where a
cohort has at least 50 trades and a 95% Student-t interval clear of zero, it
drafts a hypothesis in the §6 form — question, observation, hypothesis, null,
direction, dataset fixed to one source, cohort filters, method — with status
UNTESTED. Two limitations are recorded on every draft: it is drafted from the
very trades it describes (in-sample by construction), and how many cohorts
were examined to find it (the multiple-comparison bar). A MIXED dataset is
never the basis of a question.

## Self-critique

`critiqueCohort(cohort, ctx)` lists the standard ways a result can be wrong,
each with its number: sample size against the bars, multiple comparisons
(Šidák), regime coverage from the cohort's composition, data quality when a
missing-candle share is supplied, execution costs by source, look-ahead, and
survivorship for strategy cohorts. The worst severity is stated. A critique is
attached to every question and every proposal; there is no view without one.

## The overfitting detector — `src/research/overfitting.ts`

Try enough rule sets and the best one looks brilliant by luck. Two pieces:

- **Deflated Sharpe ratio** in the full Bailey & López de Prado form: the expected maximum Sharpe of N trials under the null is the benchmark; the observed per-trade Sharpe is tested against it with a standard error that uses track length, skewness and kurtosis. Verdicts: SURVIVES DEFLATION (probability ≥ `config.factory.deflatedSharpeMin`), UNCLEAR, LIKELY LUCK, or INSUFFICIENT DATA under 20 trades. The factory's normal-approximation figure (`factory/stats.ts`) is reported alongside.
- **Trial registry** (`research:trials`): every backtest evaluation counts — the Evidence tab refresh, the OOS reference, factory campaigns, lab runs, manual entries — discarded variants as much as kept ones. `trialsFor(strategyId)` is the N the deflation uses. The curve view shows how the bar rises with N.

## The regime atlas — `src/research/regimeAtlas.ts`

Strategy family × volatility (quiet / normal / wild) and family × regime
(ranging / transition / trending-up / trending-down / breakout), from evidence
records, PAPER and BACKTEST kept apart. A cell under 10 trades shows n only.
"Established" needs 50+ trades and a 95% interval clear of zero. A **repeat**
is the same sign in adjacent established cells — the atlas's bar for "this is
where the family has worked, on this record". "Struggles" are established
negative cells. The engine's own regime weights (`fusion/weights.ts`) are
configuration; the atlas reads the record and changes nothing.

## News-to-price diffusion — `src/research/hawkes.ts`

A self-exciting model of price events (candles moving ≥ 3σ of the trailing
288 returns) on the stored release history:

    λ_P(t) = μ + Σ α_NP e^{−β(t − t_news)} + Σ α_PP e^{−β(t − t_price)}

Fitted by maximum likelihood over a bounded grid (β between 1/720 and 1 per
minute, branching ratio capped below 1) with the exponential-kernel recursion.
Reports the half-life ln 2 / β, events per release α_NP / β, the branching
ratio α_PP / β (the share of price events that are echoes), and intensity
shares. INSUFFICIENT DATA under 12 releases or 40 price events. It is an
ESTIMATE of activity and never says direction; the engine's own blackout
window is unchanged.

## Hypotheses

See `docs/HYPOTHESIS_ENGINE.md`. From the lab you can adopt a drafted
question or draft one by hand, run the in-sample stage, run the
out-of-sample stage (records decided **after** the draft date, matching the
cohort, from the hypothesis's own source), mark it reviewed, or reject it.

## Proposals — the evolution pipeline

Any change to what the engine does is a `Proposal`: parameter-variant, filter,
retire, promote or watch. `makeProposal` gates it:

| Gate | Bar |
| --- | --- |
| oos-sample | out-of-sample trades ≥ `config.factory.minOosTrades` |
| deflated | deflated Sharpe ≥ `config.factory.deflatedSharpeMin` over the registry's trial count |
| walk-forward | share of folds positive ≥ `config.factory.stabilityMinShare` |
| hypothesis | a linked hypothesis is OOS SUPPORTED |
| paper | paper trades ≥ `config.replay.minSetupsForConfidence` |
| critique | no HIGH-severity concern |

Retire and watch need only the paper and critique gates. A proposal is
PROPOSED when every required gate is met, otherwise GATES FAILED and it cannot
be decided. A human APPROVES or REJECTS a PROPOSED proposal by name with a
note; undecided proposals EXPIRE after 30 days. **Approval records a decision
and applies nothing.** Applying a change is a config edit a person makes and
commits with the proposal id. The engine never reads proposals; no module in
the research layer imports `paramOverrides` or writes a passport.

## Routes

`GET /api/research` (overview), `/questions`, `/hypotheses?status=&strategy=`,
`/hypothesis?id=`, `/overfitting?strategy=`, `/atlas?dim=&source=`,
`/diffusion`, `/proposals?status=`; `POST /api/research/hypothesis`,
`/hypothesis/test`, `/hypothesis/review`, `/proposal`, `/proposal/decide`,
`/trial`. Every POST goes through the app's state-change guard.

## Words it will not use

PROVEN, GUARANTEED, CERTAIN, BEST, PERFECT, FAIL-PROOF are refused in any
hypothesis text field, and the AI teacher's validator rejects them too.
