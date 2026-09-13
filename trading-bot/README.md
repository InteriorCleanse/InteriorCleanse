# Mr. Cash

Mr. Cash is a paper-trading bot. It practises with **pretend money** using the ICT session
model — Asia / London / New York ranges, liquidity sweeps, and inversion fair
value gaps — explains every decision in plain English, reads the news, proposes
a plan each day and asks you to agree to it, and refuses to repeat setups that
lost before.

It costs **nothing to run**. No exchange account, no API key, no subscription.
It cannot spend your money, because it has never been given a way to reach an
exchange.

---

## Start here (5 minutes)

### 1. Install Node

Node is the free program that runs the bot: **[nodejs.org](https://nodejs.org)**
→ the big green **LTS** button → run the installer. You need **22.18 or newer**;
the bot checks and tells you if not.

### 2. Open a terminal in this folder

- **Mac** — right-click the `trading-bot` folder → *New Terminal at Folder*
- **Windows** — open the folder, click the address bar, type `cmd`, press Enter

### 3. Prove it works — no internet needed

```bash
npm run selftest
```

45 green PASS lines means the install is fine. There's nothing to download
first: the bot has no required dependencies.

### 4. Open the app

```bash
npm start
```

Your browser opens the dashboard. Or, if you prefer talking:

```bash
npm run talk
```

Mac users can double-click `start-mac.command`; Windows users `start-windows.bat`.

---

## What you're looking at

### The Today tab (and `npm run brief`)

Every day the bot writes you a brief:

- **The ranges** — Asia's high and low (set overnight), London's, New York's,
  and yesterday's. These are where stop orders pile up, so they're the levels
  that get hunted.
- **What has happened** — which levels have been swept so far today, and which
  gaps have inverted.
- **Bias** — which way it leans and *why*, in a sentence. If nothing has been
  swept yet it says "no opinion", because pretending to have one is how
  accounts die.
- **Timing** — whether an entry window is open now, and when the next one is,
  in New York time *and* your local time.
- **News** — the high-impact events to stand aside for, and the headlines that
  stand out, each with a line on why it matters.
- **My proposed plan** — longs only / shorts only / both / sit out, the risk per
  trade, the trade cap. **You arm it, tighten it, or refuse it.** Once armed,
  every scan checks itself against your plan before doing anything.

Below that: **the checklist**. Every entry needs every box, in order. The first
✗ is what the bot is waiting for. That answers "why isn't it trading?" every
time, without you having to ask.

### The Chart tab

A live chart drawn by the bot itself: session boxes, session highs and lows,
yesterday's high/low, fair value gaps (green up, red down, **grey when
inverted**), sweep triangles, structure shifts, and — when there's a live
setup — the entry, stop and target lines. Hover for prices and New York time.

### The News tab (and `npm run news`)

The week's economic calendar with impact ratings, and headlines ranked by what
they touch (Fed, inflation, jobs, ETF flows, hacks, regulation, stablecoins…).
This ranks *attention*, not direction: it tells you when the tape will be
random and what the crowd is watching, so a sudden move makes sense instead of
feeling like chaos.

### The Test tab (and `npm run replay:raw`)

Replays the last 30 days of real candles and takes every setup that passed the
full checklist. Results in **R** — units of risk — with win rate, expectancy,
profit factor, worst run, longest losing streak, and breakdowns by session,
direction, level swept, entry type, weekday and exit reason. Nothing is tuned
and nothing is cherry-picked; a candle that hits both stop and target counts as
a loss.

### The Ask tab (and `npm run talk`)

Talk to it. Typed commands always work (`why`, `levels`, `whatif 105000`,
`arm long`, `risk 0.5`, `sitout`…). Free-form questions go to an optional AI
assistant — see *The AI assistant* below.

---

## The strategy, in plain English

Every day tells roughly the same story:

1. **Asia sets a range overnight** (8pm–midnight New York time). Its high and
   low collect stop orders — sell-stops above, buy-stops below.
2. **London opens and raids one side.** Price pokes past the Asia low, the stops
   get hit, and price closes back inside. That's a **liquidity sweep**. The poke
   was the point.
3. **Price reverses with force** — a big-bodied candle (**displacement**) that
   leaves a **fair value gap**: three candles where the first and third don't
   overlap, because price moved too fast for that slice to trade.
4. **An old gap flips.** The move *into* the sweep left a gap behind. The
   reversal closes straight through it. A gap that fails like that becomes an
   **inversion fair value gap** — it now works the other way round, as support.
5. **Price comes back and retests the flipped gap.** That retest is the entry.
6. **Stop** goes just past the sweep wick. **Target** is the liquidity on the
   other side of the range — the Asia high — or a fixed multiple of the risk if
   that's too close.

Mirror it for shorts. Entries are only allowed inside the **killzones** — London
2–5am and New York 8:30–11am ET — because that's when the desks that move
price are at work. The bot sits out weekends, stands aside around high-impact
news, stops after 2 trades or 2R of losses in a day, and insists on at least
2:1 reward to risk.

### Glossary

| Term | Means |
| --- | --- |
| **Liquidity** | Where the stop orders are. Above obvious highs, below obvious lows. |
| **Sweep** | Price pokes past a level and closes back on the original side. The stops got taken. |
| **Break** | Price closes clean through a level and keeps going. Not a sweep. The bot tells them apart. |
| **Displacement** | An unusually big-bodied candle — at least 1 ATR. The footprint of real buying or selling. |
| **ATR** | Average true range. How far price typically moves in one candle. Every threshold is measured in ATRs so the bot works on any symbol. |
| **FVG** | Fair value gap. Three candles where the first and third don't overlap. |
| **IFVG** | Inversion FVG. A gap that price closed through, which now acts the opposite way. |
| **MSS** | Market structure shift. A close beyond the most recent swing point in the opposite direction. Bonus evidence, not required. |
| **Killzone** | A time window when entries are allowed. |
| **R** | One unit of risk — the distance from entry to stop. +2R means you made twice what you risked. |
| **Expectancy** | Average result per trade in R. Positive means the edge is real *in that sample*. |

---

## Changing things

Everything lives in **`config.ts`**. One file, heavily commented, the only one
you touch.

```ts
symbol: 'BTCUSDT',            // try 'ETHUSDT' or 'SOLUSDT'
interval: '5m',               // the session model wants 5m or 1m
strategy: 'ict',              // or 'crossover' for the simple 9/21 teaching strategy

accountSizeUsd: 25,           // pretend balance
riskPerTradePercent: 1,       // one stop-out costs 1% — 25 cents

ict: {
  sessions: { asia: {start:'20:00', end:'00:00'}, london: {start:'02:00', end:'05:00'}, ... },
  killzones: ['london', 'newYork'],
  requireInversion: true,     // false = enter on any displacement gap (more trades, lower quality)
  minRR: 2,
  maxTradesPerDay: 2,
  dailyLossLimitR: 2,
  newsBlackoutMinutes: 15,
}
```

Change a number, save, run again. After changing the symbol or the model, run
`npm run memory:reset` — lessons about one setup don't apply to another.

### Ideas that tend to matter more than the entry

The model already includes the ones that usually make the difference between a
strategy that *looks* good and one that survives:

- **Killzone-only entries** — the same setup at 2pm is a different, worse trade.
- **News blackout** — no entries near high-impact events.
- **Minimum reward:risk** — 2:1 means you can be wrong more than half the time
  and still come out ahead.
- **Daily brakes** — a trade cap and a loss cap. Most blown accounts are one bad
  afternoon.
- **The inversion requirement** — fewer trades, but the gap has already proven
  it matters.
- **Bias alignment** and **structure shift** as quality points, not gates.
- **Memory** — refuse the exact setup that keeps losing, and *measure* whether
  refusing helped.

Things worth testing yourself with `npm run compare` after each change:
`requireInversion: false`, `minRR: 3`, London-only vs New York-only killzones,
`holdCandles` / `maxHoldCandles`, and `interval: '1m'`.

---

## The AI assistant (optional)

Everything else in the bot is rules you can read. The assistant is the one
place a language model is involved, and it's boxed in: it can explain the
bot's analysis, answer questions about the model, and talk through the plan
with you. It cannot place orders, change settings, or invent market data — it
only sees the same analysis you see, and it's told never to promise profits.

To turn it on:

```bash
npm install                      # installs the Anthropic SDK (once)
cp .env.example .env             # then put your key in .env
```

Get a key at [console.anthropic.com](https://console.anthropic.com). The bot
uses `claude-opus-5` by default; switch to `claude-fable-5-1` in `config.ts`
if you want Anthropic's most capable model at roughly twice the price. **Every
answer prints what it cost** — typically well under a cent — and `npm run talk`
shows the running total when you quit. Your key lives in `.env`, which is
listed in `.gitignore` and never leaves your machine.

---

## Putting it on TradingView

```bash
npm run tradingview
```

That prints the exact clicks. Two scripts, both free-plan friendly:

- **`pine/ict-sessions.pine`** — an *indicator* that draws what the bot sees:
  session boxes, highs/lows, yesterday's levels, gaps that turn grey when
  inverted, sweep triangles, killzone shading.
- **`pine/ict-strategy.pine`** — a backtestable *strategy* version of the
  sweep → displacement → gap → retest model, with the Strategy Tester report.

Keep the session times equal to `config.ts` (they're New York time). Compare
the **story** with `npm run replay:raw` — same sweeps, same gaps, same handful
of entries — rather than the exact numbers; TradingView models fills and sizing
differently, and its gap logic is simpler than the bot's.

Honest limit: the bot can't log into TradingView for you. There's no free
public API for that. You paste the script and read the result with your own
eyes — which is the right way round anyway.

---

## What this costs

**$0.** The bot, Node, the price data, the news feeds, and TradingView's free
plan are all free. The only optional cost is the AI assistant, which is
pay-as-you-go and shows you every cent. Your $25 stays in your pocket — the
`accountSizeUsd: 25` is a *pretend* balance, so the risk maths is sized to a
real-world amount rather than an imaginary fortune.

With $25 and no leverage, one honest consequence: risking 1% ($0.25) with a
0.4% stop needs a ~$60 position, which is more than the account. The bot caps
the position at $25 and tells you the real risk is smaller. That's the maths
working, not a bug — and it's why professionals size from the stop.

---

## Is this safe?

- **There is no live-trading code.** Not disabled — absent. `src/execution.ts`
  writes to a text file and your screen. That is all it can do.
- **No exchange keys.** The bot never asks for one; the public price endpoints
  have no accounts to key into.
- **`LIVE_TRADING_ENABLED` is `false`** in `config.ts`, and a guard throws if
  anything ever flips it.
- **The dashboard is local-only.** It binds to `127.0.0.1` — nobody else can
  reach it, not even on your wifi.
- **Nothing is uploaded.** Ledger, lessons, plan and settings all stay in this
  folder. The optional AI call sends only the analysis text you can see on the
  Today tab.

The worst thing this bot can do to you is be wrong on paper.

---

## The honest part: will it make money?

Nobody can promise that, and anyone who does is selling something. What this
bot *can* do is show you, with real candles and fees taken out, exactly what
the model would have done over the last month — and it will show you that
honestly whether the answer is flattering or not.

The ICT session model is popular because the story is real: sessions do set
ranges, stops do get run, and reversals do leave gaps. Whether the *edge* is
real, on this symbol, in this month, with these settings, is an empirical
question. `npm run replay:raw` is the only answer worth trusting, and even that
is one month of one market. Twenty setups is a demonstration, not proof.

**Do not put real money behind this because a look-back test looked good.**
The skill this bot teaches — testing an idea without lying to yourself — is
worth far more than any particular set of session times.

---

## When something goes wrong

**"Stopped — no real prices available"** — the bot couldn't reach the price
endpoints and refused to guess. Check your internet. Some countries and
networks block Binance; a phone hotspot usually proves whether that's it.

**"Feed problems" in the news** — one or more news sources didn't answer. The
bot carries on with the others and says so. If all of them fail it uses its
last cached copy and labels it stale.

**"This bot needs a newer version of Node"** — install the LTS from nodejs.org,
then close and reopen your terminal.

**"Port 4173 is already being used"** — change `webPort` in `config.ts`.

**Every scan says HOLD** — that's normal most of the day. Read the first ✗ in
the checklist. This model only acts when a specific story plays out inside a
killzone; most candles fail that test, and patience is the edge.

**"Memory is completely empty"** — run `npm run replay:raw` first.

**The assistant is off** — copy `.env.example` to `.env`, add your key, and run
`npm install` once.

---

## Other tools you may have heard of

AutoHedge, Vibe-Trading and FinceptTerminal are covered honestly in
[`docs/OTHER_TOOLS.md`](docs/OTHER_TOOLS.md) — what each one is, which of them
can plug into Claude as an MCP server, and which one you should keep away from
a funded wallet.

## Every command

```bash
npm start               # the dashboard
npm run talk            # chat: brief, plan, questions, what-ifs
npm run brief           # today's brief in the terminal
npm run news            # calendar + headlines
npm run scan            # one real decision, logged
npm run replay:raw      # the honest look-back test
npm run replay:memory   # the same, with memory allowed to refuse
npm run compare         # both side by side
npm run memory:show     # what it remembers
npm run memory:reset    # forget everything
npm run plan:clear      # forget today's armed plan
npm run selftest        # offline logic check
npm run tradingview     # TradingView setup steps
```

## Every file

```
config.ts                ← YOUR SETTINGS. The only file you need to edit.
trading_bot_instructions.md  the rules the code keeps — hand this to Claude for changes

src/
  index.ts               the command line
  talk.ts                the chat
  server.ts              the local web app
  bot.ts                 one scan; the shared "what does the bot think" analysis
  ictStrategy.ts         the session model — the checklist lives here
  sessions.ts            the New York clock and session ranges
  liquidity.ts           sweeps vs breaks, equal highs/lows
  fvg.ts                 fair value gaps and their inversion
  structure.ts           ATR, swings, displacement, structure shifts
  brief.ts               the daily brief and proposed plan
  plan.ts                the plan you arm
  news.ts                calendar + headlines, scoring, blackouts
  ai.ts                  the optional assistant (boxed in)
  risk.ts                sizing from the stop; the part that says no
  execution.ts           pretend orders. No network. No exchange. Ever.
  memory.ts              the two memory files
  adaptiveFilter.ts      decides whether memory should refuse a setup
  replay.ts              the look-back tests
  strategy.ts            the simple crossover strategy
  market.ts              real prices (and refusing to fake them)
  ui.ts                  makes the terminal readable
  selftest.ts            offline logic checks
  tradingview.ts         TradingView setup steps

web/index.html           the dashboard
pine/ict-sessions.pine   TradingView indicator
pine/ict-strategy.pine   TradingView strategy
pine/strategy.pine       TradingView crossover strategy

data/
  ledger.csv             every decision. Opens in Excel.
  learnings.md           lessons, in plain English
  plan.json              today's armed plan (created when you arm one)
```
