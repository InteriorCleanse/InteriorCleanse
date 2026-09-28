# The research desk: the "350 Grok Bots" setup, as one room

The owner shared the "GROKBOT Guide", which describes a trading desk of
research bots. **The desk researches. It never trades.** It connects to no
broker, places no order and never edits the owner's files. What reaches the
owner is at most three decision cards a day, or "Nothing needs you today."

The **Research desk** tab (Markets group) and `GET /api/rdesk` show it.

## The six roles

Each role posts into one group chat ("The room"), in this order, and each
says what it could not check instead of guessing.

| Role | Job | Where its facts come from |
|---|---|---|
| **Scout** | Flags a market that moved past the owner's line in the last 24 hours, traded on unusual volume, or reached the high or low of its stored window. | The market watch's hourly candles. Markets whose feed is not live are skipped and say so. |
| **Reporter** | Finds why. Two outlets within 48 hours = CONFIRMED. One outlet, or social posts only = RUMOUR. Nothing = NO CLEAR CAUSE. | The news headlines already fetched for the News tab. |
| **Whale** | Insider buys and sells in the last 30 days. Planned (10b5-1) sales are called routine. | The Big money tab's SEC and Quiver feeds. Coins say NOT CONNECTED: there is no on-chain whale feed. |
| **Hunter** | Runs the owner's six-line checklist, PASS, FAIL or UNKNOWN per line, with the evidence. | See the checklist below. |
| **Skeptic** | Three reasons the idea could be wrong, the level that would prove it wrong, and PASSES or BREAKS LIMITS against `risk-limits`. | The same candles and the owner's limits. |
| **Chief** | Sends a card only when the checklist scores at least the owner's pass mark, the cause is CONFIRMED and the Skeptic says PASSES LIMITS. At most the owner's daily cap (default 3). | The other five. Everything held back is logged, not sent. |

### The checklist (Hunter)

1. Is there a confirmed news reason?
2. Is the company or project one I actually understand? (from the owner's `setups` list)
3. Is the move in the same direction as the trend of the stored window?
4. No earnings report or big scheduled event in the next 7 days? (for stocks this is UNKNOWN: there is no earnings feed)
5. Is volume above normal?
6. Could I explain this idea to a friend in two sentences? (always UNKNOWN: only the owner can answer)

UNKNOWN never counts as a pass. With lines 4 and 6 unanswerable for stocks,
the default pass mark of 4 needs every other line to pass.

## The owner's files

The guide keeps four files the bots read and never write. They live in the
tab's "Your files" form and are saved only when the owner presses Save:

- **watchlist**: the markets the desk may look at (blank = all watched markets).
- **rules**: the move lines for stocks (5%), coins (8%) and forex (1%), the volume multiple (2×) and whether highs and lows count.
- **setups**: the names the owner understands (checklist line 2) and the pass mark.
- **risk-limits**: cards per day (3), new ideas per week (2), and kinds of market to leave out.

Every value is bounded on the server; a bad value falls back to the default.

## Routines (New York time)

| When | Who | What |
|---|---|---|
| Weekdays 07:00 | Whale | new insider filings |
| Weekdays 09:45, 12:30, 15:30 | Scout and the room | scan the watchlist |
| Every day 00:00, 08:00, 16:00 | Scout and the room | coins only |
| Weekdays 16:30 | Chief | decision cards, or "Nothing needs you today" |
| Sundays 18:00 | Chief | weekly noise review: suggests changes, never makes them |

A routine runs once per date within 30 minutes of its time, so a restart
does not repeat it. One idea per market per New York day.

## The guide's four tests

- **Scorecard.** Five and twenty trading days after each card, the desk
  records whether price went the way the card said, per Scout rule. Under
  ten checked cards a rule says NOT ENOUGH DATA. It is a record of the
  flags, not a return.
- **Rules dry run.** Replays the owner's rules over the stored candles and
  counts flags per day. Above three a day it says tighten; none says loosen.
- **Rumour test.** A single outlet or social-only story is RUMOUR, and a
  RUMOUR never becomes a card.
- **Fire drill.** Runs the whole room now and times each step, so the owner
  can see the chain work end to end.

## What it does not do

- No orders, no broker, no second execution path. Mr. Cash's own trading is
  untouched; the desk only reads the market watch, the news and big money.
- No invented causes. A move without two outlets stays unconfirmed.
- No profitability claims. The scorecard counts direction only, labelled with
  its sample size.
- Ask hears the desk (today's cards and the last posts) in every hat.

Turn it off with `MRCASH_RESEARCH_DESK=0`. It also stays off when the market
watch is off (`MRCASH_MARKETS=0`).
