# The AI Teacher and the Market Debate

Two ways to talk about the market that cannot become a way to trade it.
Modules: `src/school/teacher.ts`, `src/school/debate.ts`. Tests:
`test/school/teacher.test.ts`.

## The market debate

`marketDebate({ analysis, votes, decision, news })` lays the engine's own
outputs out as three sides:

- **BULL** and **BEAR** — the structure trend, the regime read, today's sweeps by side, every strategy that voted BUY or SELL with its confidence and up to three of its passed evidence steps, and the fusion's *confirms* on the decided side with its *invalidates* on the other.
- **NEUTRAL** — no structural trend, a ranging / transition / breakout regime, strategies that held with all but one condition met (and which condition), being outside every session, and a high-impact blackout within the hour.

Every point carries its source (a strategy id, `fusion`, `structure`,
`regime`, `liquidity`, `news`), the field it restates, and REAL or ESTIMATED
quality (the regime read is ESTIMATED when the feature is marked
approximate). `backing` is the sum of confidences of the strategies voting
that way.

**The judge is the fused decision as the engine made it.** The debate never
re-decides. It shows the *invalidates* as "what would flip it" and lists
unknowns (no regime classified, no analysis). Its note: *Nothing here is a
forecast.* Without a decision the judge says NO ENGINE and the sides are shown
for reading only.

## The AI teacher

`teach(ctx, ai?)` answers a question about a lesson, a case study or the
current debate — and only from them. The system prompt (`TEACHER_SYSTEM`)
states the boundaries; the validator enforces them:

| Rule | How it is checked |
| --- | --- |
| Every paragraph cites its context item | `[[section:<heading>]]`, `[[case:<id>]]`, `[[debate:BULL\|BEAR\|NEUTRAL\|JUDGE]]`; an unknown citation rejects the whole answer; a paragraph without one rejects it |
| Every figure is in the context | every number in the teacher's own sentences must appear in the lesson sections, the tally notes, the case frames or the rendered debate |
| No decision different from the engine's | LONG / SHORT / LONG WATCH / SHORT WATCH / NO TRADE mentioned while the engine says otherwise, unless restating "the engine says X" |
| No quality, direction or causal claims | the analyst narrator's `BANNED_QUALITY`, `BANNED_DIRECTION`, `BANNED_CAUSAL` |
| No banned words | proven, guaranteed, certain, best, perfect, fail-proof |
| No recommendation | "you should", "I recommend", "take the trade", "enter long", "buy now", "sell now" |

Verbatim quotes of the context are exempt from the word lists — the
curriculum legitimately says "bullish gap" or "the best-of-N result" — while
the teacher's own sentences are held to them. That distinction is what lets
the deterministic answer (the lesson's own sections, cited) always validate.

If the model is unavailable, throws, or its answer is rejected, the reader
gets the deterministic teaching with the problems listed. `source` says which
happened. The route wires `askAI` with the "Teacher" skill only when
`aiStatus()` reports the SDK and key are present; the tests inject a fake
model to prove that an answer inventing a win rate, citing a missing section,
predicting direction, using a banned word or recommending an action is
replaced.

## Why two layers of the same idea

The analyst narrator (`src/analyst/narrate.ts`), the intel explainer
(`src/intel/explain.ts`) and the teacher share one design: a deterministic
text that is always valid, a model that may do better, and a validator that
decides which one the reader sees. The engine is the only source of trading
decisions; the language models are only ever asked to explain what it did,
and are not believed when they say more.
