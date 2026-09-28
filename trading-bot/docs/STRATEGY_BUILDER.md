# The strategy builder

The **Strategy builder** tab (More → Calls and plans) takes a strategy
described in plain English, turns it into rules and code you can read, and
backtests it on Kestrel's own stored candles. It is the idea behind the AI
strategy builders such as Astral ("describe the setup, inspect the code,
backtest it"), done without a language model and without ever trading.

## How it works

1. **You describe it.** For example: *Buy when RSI(14) is below 30 and price
   is above the 200 EMA. Sell when RSI is above 60. Stop 1.5 ATR, take profit
   2R.* Five examples are one click away.
2. **It says what it understood.** Each rule it read is listed. Anything it
   had to fill in is listed as an assumption, such as a default stop,
   take-profit or time limit. Anything it could not read is listed as "not
   understood" and left out, never guessed.
3. **It shows the code.** The rule set is rendered as code, so you can check
   exactly what was tested. The text is shown, not run.
4. **It backtests it** on the stored candles for the bot's market (up to
   20,000):
   - Each signal is read on a closed candle and filled on a later one,
     through the paper engine's fill model: spread, slippage, latency, fees,
     and a stop gapped through fills at the open. A candle that touches both
     the stop and the target counts as the stop.
   - Only one position is open at a time.
   - The first 70% of the candles are **in-sample** and the last 30% are
     **out-of-sample**. The two are reported side by side, and the
     out-of-sample column is the one that counts.
   - For comparison, it shows the price change over the same out-of-sample
     window.
5. **It keeps you honest about retries.** Every run is recorded in the
   existing trial registry. The deflated Sharpe therefore gets stricter the
   more variations you try.
6. **The verdict** is one of:
   - **NOT ENOUGH DATA**: under 30 out-of-sample trades.
   - **FAILED OUT-OF-SAMPLE**: expectancy at or below zero after costs.
   - **NO EDGE SHOWN**: positive, but the deflated Sharpe cannot tell it
     from luck.
   - **SURVIVED OUT-OF-SAMPLE**: a backtest pass, not a promise; the next
     step is a paper test.
7. **It checks stability across time.** The whole history is cut into three
   equal periods, each with its own trades, expectancy and win rate.
   - **CONSISTENT**: every period leans the same way.
   - **MIXED**: the periods disagree. A rule that only worked in one period
     is fragile, whatever the totals say.
   - **NOT ENOUGH DATA**: a period has fewer than 10 trades.
8. **Claude can rephrase it (optional).** With the AI assistant on
   (`ANTHROPIC_API_KEY` in `.env`), a description with phrases the builder
   did not understand gets an "Ask Claude to rephrase it" button.
   - Claude rewrites the description using only the builder's phrases. It
     may not add rules, invent numbers or claim anything about performance,
     and it names anything it had to leave out.
   - You see the rewrite, what the builder understands in it, and the cost.
   - Nothing runs until you choose "Use this and backtest". The same visible
     parser then reads it, so the model never decides what is tested.
9. **You can save it.** Named strategies are kept on this computer with
   their latest verdict, as "My strategies". Saving does not count as
   another run.

## What it understands

| Kind | Phrases |
|---|---|
| RSI | "RSI(14) below 30", "RSI above 70" |
| Averages | "price above the 200 EMA", "price crosses below the 50 SMA", "the 20 EMA crosses above the 50 EMA", "golden cross", "death cross" |
| Breakouts | "breaks above the 20 candle high", "new 50 bar low" |
| Volume | "volume 2x the average", "volume 1.5 times the 30 bar average" |
| Candles | "3 red candles in a row", "price drops 2% in 12 candles" |
| Exits | "sell when …" (or "cover when …" for a short), "stop 1.5%", "stop 2 ATR", "take profit 3%", "target 2R", "2:1", "no take profit", "exit after 48 candles" |
| Direction | Long by default. Start with "Short when …" for a short. |

Conditions on the entry side must all hold. Early-exit conditions trigger an
exit when any one of them holds, and that exit fills at the next candle's
open.

**News-event rules** (for example "short airlines after a plane crash") are
recognised and left out. The desk has no history of headlines to test them
on, and it will not guess one.

## Routes and code

- `GET /api/builder`: examples, grammar, saved strategies, stored-candle
  count, trial count.
- `POST /api/builder/run` with `{ text, name? }`: the parse, the code and
  the backtest.
- `POST /api/builder/rephrase` with `{ text }`: a suggested rewrite (needs the AI assistant; costs a fraction of a cent).
- `POST /api/builder/save` with `{ name, text }`.
- `POST /api/builder/delete` with `{ id }`.
- Every POST goes through the same CSRF check as the rest of the app.
- Code: `src/research/builder.ts`, `web/js/builder.js`.
- Tests: `test/research/builder.test.ts`.

## What will not happen

- **Nothing trades.** The engine never imports the builder, and the
  existing boundary test enforces that. A strategy built here reaches Mr.
  Cash only through research, an out-of-sample test, review and a paper
  test.
- **No hindsight.** A condition reads the closed candle and nothing after it
  (tested by rewriting later candles and checking earlier signals do not
  change). Fills come after the signal candle.
- **No number without data.** Under 200 stored candles there is no
  backtest, only NOT ENOUGH DATA.
