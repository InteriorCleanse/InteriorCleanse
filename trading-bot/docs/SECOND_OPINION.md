# AI second opinion

Home → **Second opinion**, under the desks table.

When Kestrel sees a setup forming, Claude reads the same market state Kestrel
saw and makes its own call: BUY, SELL or HOLD, with a confidence, up to four
reasons, risk notes and key levels. The call is recorded before the outcome.
Once the horizon has passed, it is scored against Kestrel's own call on the
same rule.

The idea comes from "decision-layer" setups, where a model is given a
structured market state instead of a chart and returns a structured decision.
Here the model is only ever a witness.

**It never trades.** The engine, fusion, risk, sizing, the paper trader and
the live gate never read an opinion. It cannot place, block or resize anything.

## Why it is a witness, not the decider

- **It can't be backtested honestly.** A language model may have read what
  happened in any past period it is tested on. Only forward, timestamped calls
  count, so opinions are taken live and the prompt carries the time of day,
  never the date.
- **Its confidence is not a measured probability.** The page says so, and the
  calibration table checks it against what happened.
- **It is not repeatable.** The same input can give a different answer, so
  every answer is kept as it was given.

## What the model sees

Numbers and labels Kestrel computed:
- the price path (last 24 closes);
- returns over 1 h, 4 h and 24 h;
- average candle range and volume ratio;
- today's range and the prior day's range, as distances from price;
- session and killzone;
- structure trend, trend strength, volatility and market regime;
- order-book spread and imbalance;
- the tape's buy share, delta and pace;
- the scoring rule.

What it does **not** see:
- Kestrel's verdict: the fused decision, the strategy votes, the signal and the
  bias. Without these it cannot just echo Kestrel.
- Any third-party text, such as news headlines. Nothing in the prompt can carry
  an instruction.

## When it asks

- Only when Kestrel's call is LONG, SHORT, LONG WATCH or SHORT WATCH.
- Once per candle at most, and not again within 30 minutes unless Kestrel's call
  changes.
- Under a daily cap: `MRCASH_SECOND_OPINION_DAILY`, default 24.
- **Ask now** on Home takes one immediately and counts against the same cap.
- `MRCASH_SECOND_OPINION=0` turns it off. `MRCASH_SECOND_OPINION_MODEL`
  overrides the model; the default is the one in `config.ai`.
- It needs `ANTHROPIC_API_KEY` in `.env`. Every call that reaches the model is
  logged with its cost.

## How it is scored

One rule for both sides, fixed when the call is made:
- **Horizon:** 12 candles, one hour on 5-minute candles.
- **Threshold:** half the average candle range at that moment, never below 0.15%.
- **BUY** is right if price ends the horizon more than the threshold higher.
  **SELL** is right if it ends more than the threshold lower. **HOLD** is right
  if it ends within ± the threshold.
- Kestrel's LONG counts as BUY, SHORT as SELL, and a WATCH as HOLD, because
  nothing was done yet.

Only candles after the decision candle are read, and only once the horizon
candle has closed. A gap in the stored candles leaves a call unscored rather
than guessed.

The scoreboard shows:
- calls scored;
- how often each side was right;
- how often they agreed;
- who was right when they disagreed;
- the AI's hit rate by confidence band.

Under 30 scored calls it shows tallies, not percentages, labelled NOT ENOUGH
DATA. Above that it is still a SMALL SAMPLE. A gap between the two hit rates is
not evidence until it holds over hundreds of calls and different market
regimes.

## API

| Route | |
|---|---|
| `GET /api/second-opinion` | Status, the latest 20 records and the scoreboard. Read-only. |
| `POST /api/second-opinion/ask` | Takes one opinion now on the current snapshot. Needs the app token, like every POST. |

Code:
- `src/ai/secondOpinion.ts`: state, trigger, parsing, record, scoring and
  scoreboard.
- `askAIStructured` in `src/ai.ts`.
- The bus subscriber in `src/server.ts`.
- The panel in `web/js/opinion.js`.

Tests: `test/ai/secondOpinion.test.ts` and `test/server.test.ts`.

Records live in the app's store under `secondopinion:log`, which keeps the
latest 1,000.
