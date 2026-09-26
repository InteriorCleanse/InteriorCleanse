# The prediction desk: the "$50 → $5,273" experiment, on paper

A creator reported giving a Grok bot $50 and one instruction, "pay for
yourself or you die", and reaching $5,273 after 48 hours trading prediction
markets. **That is a creator-reported result, not independently verified.**
No trade logs, account statements or third-party audit have been shown.

Mr. Cash now runs the general idea the honest way: on paper, with a $100
paper bankroll, the creator's reported parameters kept as written, and the
score he did not publish. The **Prediction desk** tab (More → Calls and
plans) and `GET /api/predict` show it.

## What it does, every ten minutes

1. **Scan.** The open markets on Polymarket (Gamma API) and Kalshi (Trade
   API), both public, no keys. About 200 from each venue, the most traded
   first.
2. **Read.** Ten minds read every market, each from one angle (below). Each
   says what it sees and how sure it is, or says it is QUIET (nothing to add)
   or BLIND (names what it is waiting on). None invents a fact.
3. **Council.** A confidence-weighted average of the minds that gave a
   number. The gap between the council and the price is the mispricing.
4. **Paper position.** Where the gap reaches the creator's 8-point line, and
   the desk's own guards pass (35% council confidence, spread under 8¢,
   $1,000 of liquidity, closes within 60 days and not within the hour), it
   opens a PAPER position on the cheaper side at the price a fill would cost
   (the ask for YES, one minus the bid for NO), sized by a quarter-Kelly on
   the council's probability and capped at the creator's 6% of bankroll. At
   most ten open at once, one per market, and never twice on the same market.
5. **Log.** Every decision, opened or skipped, with the reason and the
   evidence for and against from every mind.
6. **Settle.** Only when the venue resolves the market. A market that has
   closed but not resolved stays open and says so. A win pays $1 a contract;
   a loss pays nothing. Every mind that gave a number is then scored.

The bell reports each paper position and each settlement. Ask hears the desk
(the sheet, open positions and the widest gaps) in every hat.

## The ten minds

| Mind | Reads | Gives a number? |
|---|---|---|
| CROWD | The price itself, the market's own probability. One voice among ten, not the anchor: the council measures its distance from this price, so the price must not also dominate the council. | Yes |
| LONGSHOT | The favourite–longshot bias: contracts under 12¢ have historically paid out less often than their price, heavy favourites over 88¢ slightly more often. Quiet in the middle. | At the edges |
| CLOCK | Time left. A must-happen question with under three days left and a mid price leans NO; a heavy favourite with little time left leans YES. | Sometimes |
| DRIFT | The day's price change, half of it carried forward. | When the venue gives it |
| DEPTH | Liquidity and volume. Speaks only to confidence: a thin book means the mid is not a probability. | No |
| SPREAD | Bid and ask. Speaks only to confidence: a wide spread eats an edge before it exists. | No |
| HEADLINES | Headlines in the last three days that share the question's words. Reports them; never guesses their direction. | No |
| CALENDAR | A scheduled release (FOMC, CPI, jobs, GDP, PCE) before the market closes that decides it. Lowers confidence: the price will jump then, not drift. | No |
| FAMILY | The other outcomes of the same event. When they add up to more than 103%, each is overpriced and is divided through. | When there is an overround |
| ORACLE | A language model's estimate with its reasons, from the question, the price and the related headlines. Off by default. | When on |

Every rule is hand-set and openly untested as a trading rule. The
thresholds are `PARAMS` in `src/predict/minds.ts`.

## The seven-day sheet

The sheet from the guide, filled in by the desk: starting balance, simulated
positions, wins, losses, largest win, largest loss, ending balance (cash plus
open positions marked at the latest mid), return, what the desk got right,
what it got wrong. It starts on the first successful scan, counts the days,
and says TEST COMPLETE after seven. Wins and losses count only after the
venue resolves; "marked now" is never a result.

## The brain

Each mind is scored on its own after every resolution with the Brier score
(0.25 is a coin flip; skill is 1 − Brier ÷ 0.25), so the record shows which
angles know something and which are noise. A mind needs 30 resolved
positions before its score means anything; until then it reads NOT ENOUGH
DATA. The council's weights stay the fixed ones. A change to them from the
record would be a strategy change, and goes through research, an
out-of-sample test and human review first.

## Settings

- `MRCASH_PREDICT=0` turns the desk off.
- `MRCASH_PREDICT_AI=1` turns the ORACLE mind on. It needs `ANTHROPIC_API_KEY`
  in `.env`, asks only about markets the other nine already flag, at most
  three a pass and once an hour per market, and costs money per question.
- `MRCASH_POLYMARKET_URL` and `MRCASH_KALSHI_URL` point the sources at a mock
  for testing.
- The record is `predictions.json` in the data directory.

## What will not happen

- **No orders.** There is no wallet, no key and no execution path. The desk
  cannot trade, on either venue, in any mode.
- **The engine never sees it.** Nothing here feeds a strategy, a filter, risk
  or sizing.
- **No estimate where there is no data.** Neither venue answering is NOT
  CONNECTED. A market that has closed but not resolved stays open. A mind
  without the data it needs is BLIND.
- **No promise.** A paper result, however it reads after seven days, is a
  paper result. Prediction markets carry fees, slippage, and the risk that
  the market is right and the desk is wrong.

## Code and tests

- `src/predict/sources.ts`: the two venues, parsed into one shape.
- `src/predict/minds.ts`: the ten minds, the council, paper sizing.
- `src/predict/desk.ts`: the desk, the sheet, the brain, the record.
- `web/js/predict.js`: the tab.
- `test/predict/predict.test.ts`: parsers, minds, council, sizing, settlement
  and the scoreboard, on SYNTHETIC fixtures in a temp directory.
