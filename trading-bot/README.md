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

80 green PASS lines means the install is fine. There's nothing to download
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

Twenty-two tabs, in five groups. The first five are on the bottom bar of a
phone; the rest are under **More**. Every screen says which kind of data it is
showing — PAPER (live prices, simulated fills), BACKTEST, REPLAY, MOCK — and
says NOT ENOUGH DATA rather than estimating when the record is thin.

| Group | Tabs | What they are for |
|---|---|---|
| The desk | **Home**, **Today**, **Chart**, **Ask**, and **Journal** under More | The brain (every model he runs, live), the daily brief and decision, the annotated chart, a conversation with the bot in any of its hats, and your journal. |
| Markets | Markets, Planner, Flow, News, Intel, TradingView | Every market he watches around the clock — crypto, stocks, forex and indexes, read-only (docs/MULTI_MARKET.md) — the order book and tape, the calendar and headlines, the engine's own chart markup with provenance, and the Pine export. |
| Is it working? | Evidence, Validation, Operations, Test, Replay | Attribution by session, regime and strategy; the frozen validation gates; heartbeat, feed, integrity, reconciliation, soak and the first-fill acceptance chain; look-back tests; the replay player. |
| Learn | School, Research, Knowledge, Observer | Lessons from its own case studies; the quant lab (overfitting detector, regime atlas, news diffusion, sandbox); the versioned vault and daily digests; what it is observing right now. |
| Under the hood | Playbook, Factory, Vault, Memory | Every strategy's vote; the breeding and out-of-sample survivor tests; passports and decay; the raw ledger, lessons and doctor. |

The longer references live in `docs/`: `PAPER_SOAK_RUNBOOK.md` for running it
around the clock, `FIRST_FILL_ACCEPTANCE.md` for how the first paper fill is
verified, `SIGNAL_CORE.md` for the moving picture on the desk,
`QUANT_LAB.md` for the four research tools, and `SECURITY.md`.

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

### The Playbook tab (and `npm run strategies`)

Mr. Cash reads the market through several strategies at once, and this tab
shows every one of them side by side: what it looks for, whether it is turned
on, and its vote right now with the reason. Each strategy is judged entirely
on its own — nothing is combined into a single decision yet, and **only the
ICT session model opens paper trades**; the rest are opinions you can watch.

The strategies:

- **ICT session model** — the full checklist (Asia range, killzone sweep,
  displacement, inverted gap, retest). The bot's original brain.
- **VWAP reclaim** — price dips through the day VWAP and closes back on the
  other side.
- **Volatility breakout** — a range that compressed and then broke, taken as
  volatility expands.
- **Trend pullback** — in a trend, join it on a pullback into discount (or
  premium) that lands on an order block.
- **Range mean-reversion** — in a range, fade a stretch past the VWAP band
  back to the average.
- **Order-flow momentum** — ride a hard push on the live tape. This one
  **needs the stream**: with the tape down it holds and says so, never
  guessing flow from a candle.
- **MA crossover** — the simple teaching strategy.

Turn any on or off, and test one in full on real past prices from the tab or
with `npm run replay:raw -- --strategy <id>`. `npm run strategies` prints them
all with a comparison table. Every vote carries the same evidence list the
checklist uses, so "why?" and "why not?" both have an answer.

**The fused decision.** The Today tab combines the votes into one call —
**LONG, SHORT, LONG WATCH, SHORT WATCH, or NO TRADE** — with a 0–100
agreement score, the strategies **for** it, what is **against or missing**,
and a table of every vote with its regime weight. The weights are
regime-aware: a range-fade counts for nothing in a trend, a trend-follower
nothing in a range, and a disallowed strategy shows a weight of 0. A WATCH
names exactly what would confirm it. The weights are shown with every
decision, never hidden.

This is still only shown, not acted on: the paper trader keeps trading the
ICT session model alone. Set `fusion.driveTrading: true` in `config.ts` to
let the fused decision drive paper trades instead (still through the risk
check). `npm run brief` and `/api/decision` show the same call.

### The Ask tab (and `npm run talk`)

Talk to it. Typed commands always work (`why`, `levels`, `whatif 105000`,
`arm long`, `risk 0.5`, `sitout`…). Free-form questions go to an optional AI
assistant — see *The AI assistant* below.

---

### The Flow tab (and `npm run flow`)

Where the big orders are. The order book within 1% of price on each side,
the biggest **walls** (clusters of resting orders, with how many times the
typical size they are and how far from price), and the **tape** — the last
thousand trades: how many per minute, what share were buyer-initiated, the net
dollar pressure, and every print over $100k. Every reading is logged to
`data/orderflow.csv`, so the tab also shows how pressure changed through the
day. Honest caveat, printed every time: the book is intent and gets pulled;
the tape already happened.

**Live order flow** sits at the top of the tab and is a different thing from
the REST snapshot below it. While the stream is up, Mr. Cash counts every
trade as it prints and builds readings a candle chart cannot show:

- **Delta** — buyer-initiated minus seller-initiated volume in one candle.
- **CVD** (cumulative volume delta) — the running sum of that delta from the
  start of the day (or the session, set by `features.cvdAnchor`). Price
  rising while CVD falls is the classic warning that a move is thin.
- **Footprint** — for the last candle, how much was bought and sold at each
  price, and where the fight was (the point of control).
- **Tape speed** — prints per minute now versus the minute before, so you can
  see the tape accelerate or stall.
- **Large prints** — single orders over `orderflow.bigTradeUsd`, by side.
- **Book imbalance** — resting dollars near price, from the live book.
- **Absorption** — a labelled *heuristic*: heavy one-sided volume that failed
  to move price, so the passive side is holding. The exact rule is fixed in
  its test.

These come only from the stream. The exchange merges each taker order into
one print, so a "large print" is one order, not necessarily one participant.
The moment the stream drops or misses anything, CVD and the footprint are
**hidden** and the block says "windowed snapshot only" — a running total that
skipped trades is a lie, and Mr. Cash will not show one. The book and tape
below are always available over REST, but they are a window, not a count.

### Market state (and `npm run state`)

Uptrend, downtrend or range — with a strength score, a "likely to continue"
score, and every reading that voted: swing structure, the hourly averages,
three-hour momentum, today's sweeps, and the tape. Then **things to watch out
for**: liquidity close ahead, walls, stretched price, high-impact news, quiet
or wild volatility, weekends. It's a description of now, not a forecast, and it
shows its dissenters.

Next to the heading is the **regime** in one word — Trending up, Trending
down, Ranging, Breakout, or Transition — with the volatility (low, normal,
high). It comes from five shared readings: the swing structure, the hourly
averages, momentum, volatility, and cumulative delta when the tape is
trusted. **Breakout** means volatility was compressed and has just expanded
on a fresh break of structure; **Transition** means structure just flipped
(a change of character) but the averages have not confirmed it yet. Hover the
word for the reasons. Like everything else here it only describes the market;
no trade is placed or blocked on the regime yet.

### The Journal tab

A trading journal built to make *you* better. Each entry separates the
**outcome** from your **execution score** (1–5, "did I do what I said I'd
do?"), asks whether you followed the plan, and lets you tag emotions and
habits with one tap. "From current setup" pre-fills what Mr. Cash saw so you
only add how you felt. R is computed for you from entry / stop / exit.

The review finds your **leaks** — emotions, sessions, and habits that cost
money — names **the one thing to fix**, tracks goals (journal daily, follow
the plan 90%, zero revenge trades, execution ≥ 4) with progress, keeps a
streak, and gives you a reflection prompt each day. "Ask Mr. Cash about my
journal" hands the stats to the assistant for a straight conversation.

### The TradingView tab

A live TradingView chart inside the app, and the webhook that lets your
TradingView alerts land in Mr. Cash's bell. See *Connecting TradingView* below
for exactly what is and isn't possible.

### Alerts (the bell)

While the app is open, Mr. Cash re-reads the market every candle and taps
you on the shoulder: an entry window opening in 15 minutes, a level swept, a
full setup (with entry/stop/target), high-impact news about to land, the
trend flipping, a very large trade. Click **Alerts** in the header to get them
as system notifications too. `npm run watch` does the same in a terminal.

### The picture analyzer (Ask tab)

Paste or attach a screenshot of any chart. With the assistant on, Mr. Cash
breaks it down in a fixed order: what it can see, levels and liquidity, gaps,
an entry zone / stop / target with the reasoning, what would invalidate it,
and news to check. It says "I can't read this" rather than guess a price.
Also `npm run picture -- chart.png "your question"`.

---

## Install it as an app — Dell, Mac, iPhone

Mr. Cash is a **progressive web app**: one icon, opens full-screen, no browser
chrome. Nothing to buy and nothing to submit to an app store.

| Device | How |
| --- | --- |
| **Windows (your Dell)** | Start Mr. Cash, open it in Chrome or Edge, click **Install** in the header (or the install icon in the address bar). |
| **Mac** | Same in Chrome/Edge; in Safari: File → *Add to Dock*. |
| **iPhone** | Turn on phone access (below), open the address on the phone in Safari, enter the PIN once, tap Share → **Add to Home Screen**. |

### Phone access — just for you

In `config.ts` set `app.allowPhone: true`. When Mr. Cash starts it prints a
wifi address and a **PIN**. Your phone (same wifi) opens that address, enters
the PIN once, and it's in. Nobody else on your network gets past the PIN, and
nothing is exposed to the internet.

Honest limits on the phone: the engine runs on your computer, so the computer
has to be on. Over plain home wifi the phone shows alerts in the bell but not
as system notifications (browsers need https for those). If you want it from
anywhere, with notifications, install **Tailscale** (free) on both devices —
it gives you a private https address without opening any ports.

### Connecting TradingView

What's possible: TradingView **sends** to Mr. Cash. The Pine indicator's
alerts are written as JSON; create an alert on it with the webhook URL and
secret from the TradingView tab, and it lands in the bell with the price. Two
honest requirements: webhook alerts need a paid TradingView plan (Essential
or above), and TradingView's servers must be able to reach your computer — a
free tunnel (Tailscale Funnel, cloudflared) gives your webhook URL a public
https address.

What's not possible: nothing can read your TradingView charts or layouts
back. That API doesn't exist. The chart in the TradingView tab is
TradingView's own free widget, live, with your symbol and timeframe.

### 24/7 paper trading that learns as it trades

Double-click **`start-24-7.command`** (Mac) or **`start-24-7.bat`** (Windows)
and leave it. Mr. Cash re-reads the market every candle, and when the whole
checklist passes inside a killzone — and risk and memory agree — it opens a
**paper** position, then babysits it candle by candle: stop, target, or time.
When it closes:

1. the outcome goes into **memory**, so a setup that keeps failing gets
   refused next time (and the "was skipping worth it" table stays honest);
2. a **lesson** is written if that exact setup has now lost enough;
3. a **journal entry** is created with what the bot saw — you add how you
   felt when the alert came in.

Equity, open positions with live R, and the full closed-trade history are on
the Today and Memory tabs and in `npm run paper`. You can flatten any paper
position by hand. If the computer sleeps, so does Mr. Cash — set it not to
sleep while plugged in, or run it on a Raspberry Pi or a $5 server. Turn the
auto-trader off with `app.autoPaperTrade: false`; alerts still come.

### Where the prices come from

While the app runs, Mr. Cash holds one **live stream** open to the exchange's
public market-data feed: every trade, the best bid and ask, the order book,
and the candle as it forms. No account, no key — this is the same public feed
everyone sees. The moment a 5-minute candle closes, the stream says so and
Mr. Cash re-reads the market **within a couple of seconds**, instead of
waiting for the next poll. The dot next to the price in the app's header
tells you which path is in use; hover it for the words.

- **Green — live stream.** Prices arrive as they change. The price in the
  header is the mid between the best bid and ask.
- **Amber — polling over REST.** The stream is off (`data.stream: false` in
  `config.ts`), connecting, or down. Mr. Cash then does what it always did:
  asks for closed candles every `app.watchEveryMinutes`. Nothing is missed,
  it is just slower. When the stream comes back, the dot turns green on its
  own — it reconnects by itself, waiting a little longer after each failed
  try (`data.reconnectMinMs` to `data.reconnectMaxMs`) and rotating through
  `data.streamHosts`.
- **Grey — no feed yet.** The app is still starting.

While the stream is up, Mr. Cash also folds every trade on the tape into
**exact** readings: the day's and the session's VWAP (the volume-weighted
average price, the price where most money changed hands) and the day's
**volume profile** (the price with the most volume, the "point of control",
and the band holding 70% of it, the "value area"). When the stream is off or
had a gap, the same readings are built from candles instead and are marked
**approximate** — a candle's volume has no price detail inside it, so that
is a best effort, and every reading says which one it is. They are drawn on
the Chart tab (the "VWAP & volume" toggle) and listed in the brief. They are
inputs the strategies will read; the checklist itself does not use them yet.

Whichever path a candle arrives by, it is written to the store **once** and
acted on **once**; if the stream drops in the middle of a candle, the REST
safety poll fetches what was missed and says so in the terminal ("the stream
missed 2 candle closes; REST filled them in"). A stream that goes quiet for
`data.staleAfterMs` is treated as down. Closed candles live in the database
(`data.keepDays` of them), so restarting the app does not re-download history
it already has, and gaps the exchange itself cannot fill (maintenance
windows) are remembered rather than re-requested forever. `npm run status`
and `/api/system` show the mode, the host, reconnect count and the last gap.

### Ask Claude about Mr. Cash from anywhere (MCP)

```bash
npm run mcp:config
```

That prints the one-line command for Claude Code and the JSON for Claude
Desktop. After that, any Claude chat can ask for the brief, the checklist,
the market state, order flow, news, the paper account, your journal review,
or run the doctor — and can arm today's plan. Fifteen tools, all read-only
except `arm_plan`, none of which can place an order. Zero dependencies: Mr.
Cash speaks the protocol itself.

**Research and backtest from the chat.** `strategies` lists the panel;
`backtest` runs one strategy (or the fused decision) on the stored candles
with the realistic fill model and returns the in-sample, validation and
out-of-sample splits, walk-forward, Monte Carlo and the latest trades with
their entry and exit times and prices, ready to overlay on a chart. Ask
*"Backtest turtle-soup and show me the last ten trades"*. Every result is
labelled BACKTEST · SIMULATED, and every run is counted in the overfitting
registry, so trying twenty strategies and quoting the best is visible.

**Learning to trade with Claude as the tutor.** The `learn` tool hands Claude
the School's course: first the basics in order (what you trade, candles, bid
and ask, order types, position sizing, options, time decay and implied
volatility, leverage, a plan and a journal, psychology), then the concepts the
engine uses. Ask *"Teach me the next Mr. Cash lesson and quiz me"*; Claude
gets the lesson, the common misreads and the quiz with an answer key, and
teaches one concept at a time. The same lessons are in the app under
**More → School**.

### Jarvis mode — his voice, and yours

Click **Voice** in the header and Mr. Cash speaks: alerts as they arrive
("London low swept — watching for displacement up"), answers in the Ask tab,
and **Read it to me** on Today reads the whole brief aloud. Press the **🎙**
in the Ask tab, ask out loud, and he answers out loud. Uses the browser's own
speech engines — free, nothing installed, nothing uploaded. (Voice input
needs Chrome, Edge or Safari; Firefox can still speak but not listen.)

### Skills — the hats he wears

In the Ask tab (or `skill risk` in `npm run talk`), pick a hat:

| Skill | What changes |
| --- | --- |
| 🔍 **Analyst** | Reads the market in order: state → levels → sweeps → gaps → flow → what has to happen for a trade |
| 🛡 **Risk Manager** | Every answer includes size from the stop, worst case in $ and R, limits used, and a yes/no under the plan |
| 🧭 **Coach** | Works from your journal; separates process from outcome; names one habit |
| 📰 **News Desk** | Ranks the calendar and headlines; says when he'll stand aside |
| 🎯 **Execution** | Turns a setup into a numbered plan: enter, abort, manage, journal |
| 🎓 **Teacher** | One concept at a time, with an example from today |

Same brain, same rules, same context; each skill just changes what he pays
attention to. None can place an order.

The repo also ships **Claude Code skills** in `trading-bot/.claude/skills/`
— `/mr-cash-brief`, `/mr-cash-trade-review`, `/mr-cash-journal-coach`,
`/mr-cash-tune`, `/mr-cash-chart-read` — so when you open this folder in
Claude Code, Claude already knows how to run and reason about Mr. Cash.

### Navigation — ⌘K

Press **⌘K** (Ctrl K on Windows) anywhere: type a few letters to jump to any
tab or run any action — refresh, scan, read the brief aloud, talk, journal,
share card, run the test, doctor, arm "longs only" / "sit out", switch skill,
turn voice on. **1–9** switch tabs, **r** refreshes, **?** brings back the
welcome tour.

### The share card

**Share card** on the Today tab renders today's brief as a 1080×1350 image —
market state, bias, ranges, levels, the plan, and a footer that says it's
paper — ready for Instagram. Downloading it is one click.

### Is everything connected?

```bash
npm run doctor
```

Checks Node, the data folder, prices, the order book, the tape, every news
feed, the AI key (with a free ping), TradingView alerts received, phone
access, today's plan and memory — and says exactly what to do about anything
that's off. It also says, plainly, that the three external repos are not part
of Mr. Cash.

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

### Market structure on the chart

The Chart tab also draws the vocabulary you asked for, each with a hover
explanation, and each behind its own toggle:

- **Swing labels.** Every confirmed swing is compared with the previous one
  of its kind: **HH** higher high, **HL** higher low, **LH** lower high,
  **LL** lower low. Higher highs and higher lows are an uptrend; lower
  highs and lower lows a downtrend. Swings are only confirmed a few candles
  after they happen, so a label never appears early.
- **BOS and CHoCH.** A close beyond a swing point is a structure break. When
  it goes *with* the trend the previous breaks set, it is a **break of
  structure (BOS)** — continuation. The *first* break against that trend is a
  **change of character (CHoCH)** — the earliest hint of a turn. The very
  first break of all, with no trend before it, is called a BOS.
- **Order blocks.** When a candle moves with force (a displacement), the
  last candle that went the other way just before it is an **order block**:
  the last red candle before a push up (bullish, support) or the last green
  candle before a push down (bearish, resistance). The zone is the whole
  candle, wick to wick. A block that price closes through becomes a
  **breaker** and flips its role: a broken bullish block is now resistance.
  The hover text says whether the move that made the block also broke
  structure or left a gap — both together is the textbook version.
- **Premium and discount.** The **dealing range** runs from the last swing
  low to the last swing high. Above the middle is premium (expensive, where
  shorts are looked for); below it is discount (cheap, where longs are).
- **Swing sweeps.** Hollow triangles mark a wick that ran the stops past a
  swing point and closed back; filled triangles are raids on session levels.

None of this changes what Mr. Cash trades yet. The session checklist is
unchanged (a regression test pins the baseline day word for word), and
these are readings the next strategies will consume.

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

## Testing

Three gates, and they run on every push in GitHub Actions
(`.github/workflows/bot.yml`):

```
npx tsc --noEmit -p .    # the type check
npm run selftest         # 72 offline checks on hand-written candles
npm test                 # the test suite: node --test, no internet needed
npm run check            # all three, in order
```

The test suite starts the real server on a random port with a throwaway data
folder and a local **stand-in feed** (`test/helpers.ts`) that answers like the
exchange and the news sites with deterministic synthetic numbers. Every API
route, the guard, the kill switch, the replay, memory, the journal, the paper
trader, the watch loop, the news module, the engine on fixture days, and the
MCP server are covered. The synthetic feed exists so the code paths can be
exercised; its prices mean nothing and no performance number ever comes from
it.

A test marked `todo` is a known limitation recorded on purpose, not a broken
test — the message says which phase of `docs/TITAN_IMPLEMENTATION_PLAN.md`
removes it.

## The safety switches

Four things stand between you and an accident, and all four are tested
(`npm test`):

- **The risk engine.** Every candidate order — paper or otherwise — passes
  through `src/riskEngine.ts` before it can become a position, and any rule
  can veto it: the kill switch, stale prices, a wide spread, too much open
  exposure, the daily trade and loss brakes, a drawdown cap, and execution
  protection (a fill already past the stop is rejected). Nothing opens
  without an approval, and every veto comes with a reason. The limits live in
  `config.risk` and are shown on the Today tab and at `/api/risk` and
  `/api/system`. It also does the sizing, respecting exchange step/tick/min
  filters (off by default, so today's sizes are unchanged).
- **The kill switch.** `npm run stop` (or the ⏹ Stop button on the Today tab,
  or ⌘K → "KILL SWITCH") writes a file called `data/STOP`. While it exists,
  Mr. Cash opens **no new positions of any kind**, paper included. Open paper
  positions are still managed to their stop or target, because abandoning one
  is worse than closing it properly. `npm run resume` or the ▶ Resume button
  releases it. It survives restarts, and you can create or delete the file by
  hand.
- **The request guard.** Every button in the app that changes something sends
  a token the server handed only to that page. A request without it, or one
  coming from another website open in your browser, is refused. Nobody can
  wipe your memory or arm a plan from outside the app.
- **The mode ladder.** `src/mode.ts` says which mode the bot is in. This
  version has exactly one: **paper**. The names testnet, shadow and live exist
  so future code has one place to ask, but none of them can be reached.

`npm run status` prints the mode, the kill switch, the store's own
consistency check, today's limits and what memory holds. While the app is
running, `/api/system` answers "what is the current state of my system?" in
one document — including how old the last candle, news reading and
order-flow reading are, each marked fresh, stale or never.

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

## "Can I start with a small $100 account?" — read this first

Technically, yes, at any time. Whether you *should* yet is a different
question, and here is the honest version.

**What $100 can and can't do.** With no leverage, 1% risk is $1 a trade.
Fees at 0.1% a side on a ~$100 position are about 20 cents a round trip —
a fifth of your risk gone before the trade starts. That doesn't make it
pointless; it makes it *tuition*, not income. The value of a $100 account is
learning what a real fill, real slippage and real fear feel like, after the
paper stage has shown you the edge exists at all.

**The gate I'd set, and the bot will help you check it:**

- at least **60 closed paper trades** across **8+ weeks** (`npm run paper`),
- a **process score ≥ 90%** in the journal (you follow your own plan),
- **positive expectancy** in R over that sample, not just a good week,
- and a losing streak you've already lived through on paper without
  changing the rules.

**How to go live when you do:** Mr. Cash stays *advisory*. It alerts, you
place the order by hand on your exchange, you log it in the journal. There
is deliberately no code path from this bot to an exchange, and I'd keep it
that way until the paper record is boringly long. If you're in the US,
Coinbase or Kraken; Binance.com isn't available there.

None of this is financial advice — it's risk management, which is the only
part of trading you fully control.

## The honest part: will it make money?

Nobody can promise that, and anyone who does is selling something. What this
bot *can* do is show you, with real candles and real costs, what the model
would have done over the last month — and it will show you that honestly
whether the answer is flattering or not.

**How orders fill.** Earlier versions filled every order at the price the
signal wanted and every exit at the exact stop or target. That was too kind,
and the Test tab now shows you by how much: the "cost of honesty" table runs
the old perfect-fill model next to the real one on the same candles. The real
one enters at the **next candle's open**, pays half the spread and some
slippage on every market order, fills a stop a little **worse** than the stop
price (and at the open if the market gaps past it), fills a take-profit only
when price trades **through** it, charges taker and maker fees separately,
and gives up on an entry when price has run more than half an ATR away — a
**missed** trade, not a chased one. The paper trader lives by the same rules:
a signal queues an order, and the order fills (or is missed) on the next
candle. Every assumption is a number in `config.ts` under `execution`; set
them from what your exchange actually shows you.

The ICT session model is popular because the story is real: sessions do set
ranges, stops do get run, and reversals do leave gaps. Whether the *edge* is
real, on this symbol, in this month, with these settings, is an empirical
question. `npm run replay:raw` shows the whole month at once — but a number
taken from the same data you fit on is close to worthless.

**The out-of-sample number is the only one worth acting on.** `npm run backtest`
(or the *Backtest* button on the Test tab) splits the history in time: it fits
and chooses on the early part (in-sample and validation) and judges only on the
part it never looked at (out-of-sample). It also rolls a **walk-forward** —
train a window, test the next, roll forward, again and again — and runs a
**Monte Carlo**: reshuffle the trade order thousands of times to show how much
of the result was luck and how bad the drawdown could have been. When the
in-sample number looks great and the out-of-sample number falls apart, that is
curve-fitting, not edge, and the report says so in plain words. Backtest a
single strategy or the fused decision:

```bash
npm run backtest -- --strategy session-ifvg   # any strategy id
npm run backtest -- --strategy fused           # the combined decision
```

One month of one market is a demonstration of the method, not proof of an
edge — twenty out-of-sample setups is the floor before any number means
anything, and the report labels every window that falls short.

**Searching for settings without fooling yourself.** `npm run factory` breeds
variants of a strategy — different stop and target settings — backtests each,
and keeps only the few that survive four gates: enough out-of-sample trades, a
real out-of-sample edge, *parameter stability* (the setting and its neighbours
must both work, so it is a plateau you could stand on, not a spike that
vanishes if a knob slips), and a *deflated Sharpe* that beats the best result
you'd expect from chance given how many settings were tried. That last gate is
the important one: try enough settings and one will look good by luck, so the
more the factory tries, the higher it sets the bar. A campaign is seeded and
resumable, and it enables nothing — a survivor is a candidate for a later step,
never an automatic decision.

**Giving a survivor a life.** `npm run vault` is that later step: every survivor
can be minted into a *passport* — a permanent record of its settings, its
out-of-sample evidence, and every result it gathers as it moves through a
lifecycle (candidate → paper → shadow → live). A passport is watched for
**decay**: if its live expectancy falls below the lower bound of its
out-of-sample edge and a CUSUM confirms the drop is sustained (not just a rough
patch), it is automatically demoted to *watch*. Promotion is
**champion-challenger** — there is one champion per strategy, and a challenger
only takes over when it beats the champion out-of-sample *and* on paper. The
last step, to live money, is never automatic; it is always a human decision.

**Do not put real money behind this because a look-back test looked good** —
and *especially* not because the in-sample number looked good. The skill this
bot teaches — testing an idea without lying to yourself, and trusting only the
data you never touched — is worth far more than any particular set of session
times.

---

## Real money (and why this build won't touch it)

The code to place real orders exists — an order-placing adapter, an order state
machine, reconciliation from the exchange's own fills, and a live trader — but it
is **dormant**, and getting it to run is deliberately hard. Real money is behind
a chain of gates, and **every one** must be open at the same time before a single
order-placing line can execute:

1. the top-level `LIVE_TRADING_ENABLED` flag (ships **false**),
2. `config.live.enabled` (ships false),
3. the `MRCASH_LIVE` environment phrase set exactly,
4. a typed confirmation from you,
5. a testnet track record of reconciled trades,
6. hard caps (notional, trades per day, open positions),
7. the app guard present,
8. the kill switch clear,
9. the market feed healthy.

Run `node scripts/live-arm.ts` to see the chain — in this build it reports
*"Live is NOT armed. Paper only. Nothing can send an order."* The whole live
path is exercised in tests against a **mock** exchange (fills, partial fills, an
OCO leg fill, rejects, a mid-order disconnect, reconciliation after a restart,
the kill switch cancelling open orders), so the machinery is proven without a
key and without risk. Testnet comes before real money; real money starts at the
exchange minimum; spot is long-only and short signals are logged, not traded.

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
npm run state           # uptrend / downtrend / range, and what to watch for
npm run flow            # where the big orders are and what is trading
npm run watch           # stay on, raise alerts, and paper-trade every candle
npm run paper           # the paper account: equity, open and closed trades
npm run mcp:config      # connect Mr. Cash to Claude Desktop / Claude Code
npm run doctor          # check every connection
npm run picture -- chart.png "question"   # analyze a chart screenshot
npm run scan            # one real decision, logged
npm run replay:raw      # the honest look-back test
npm run replay:memory   # the same, with memory allowed to refuse
npm run compare         # both side by side
npm run backtest -- --strategy fused   # in-sample vs out-of-sample, walk-forward, Monte Carlo
npm run factory -- --strategy crossover --method grid   # breed settings, keep only what survives out-of-sample
npm run vault           # passports: the lifecycle, decay watch, champion-challenger
npm run ui:smoke        # Playwright: every tab renders at 1180px and 400px, no console errors
npm run memory:show     # what it remembers
npm run memory:reset    # forget everything
npm run plan:clear      # forget today's armed plan
npm run selftest        # offline logic check
npm run vault:setup     # authenticator secret for the vault and two-factor phone login
npm run security:audit  # keys in tracked files, .env exposure, phone access, 2FA, the live flag
npm test                # the test suite: guard, kill switch, server routes
npm run check           # type check + self-test + test suite
npm run stop            # KILL SWITCH — no new positions until you resume
npm run resume          # release the kill switch
npm run status          # mode, kill switch, store, today's limits at a glance
npm run migrate         # what the store imported from the old flat files
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
  structure.ts           ATR, swings with HH/HL/LH/LL labels, displacement, BOS and CHoCH
  orderblocks.ts         order blocks and breakers, and their lifecycle
  brief.ts               the daily brief and proposed plan
  plan.ts                the plan you arm
  news.ts                calendar + headlines, scoring, blackouts
  ai.ts                  the optional assistant (boxed in)
  risk.ts                sizing from the stop; the part that says no
  riskEngine.ts          the veto engine: every order passes it first
  risk/filters.ts        exchange step/tick/min-notional rounding
  risk/rules/            one file per rule: kill switch, stale data, spread, exposure, daily brakes, drawdown, execution
  execution.ts           pretend orders. No network. No exchange. Ever.
  store.ts               the database everything is kept in (SQLite, built into Node)
  memory.ts              the decision ledger and the lessons, with readable exports
  settings.ts            the few settings you can change while it runs
  systemState.ts         "what is the current state of my system?" in one document
  guard.ts               proof that a request came from the app itself
  mode.ts                paper / testnet / shadow / live — only paper is reachable
  killswitch.ts          the big red button (data/STOP)
  adaptiveFilter.ts      decides whether memory should refuse a setup
  replay.ts              the look-back tests
  backtest/              out-of-sample split, walk-forward, Monte Carlo, honest R metrics
  factory/               breed strategy settings; keep only survivors that hold up out-of-sample
  vault/                 passports: the strategy lifecycle, decay detection, champion-challenger
  ai/                    the market read (narrator), the CIO (decision after risk), the researcher
  paper/metrics.ts       measured paper trading: per-strategy expectancy, observed spread, missed signals, vs OOS
  exchange/              read-only signed venue adapter (HMAC signing, filters) — no order-placing code
  shadow/                builds the order it would send against the live book and scores it — never sends
  exchange/binanceTrade.ts  the order-placing adapter — inert; only the gated live trader can call it
  live/                  the gate chain, order state machine, reconciliation and trader — dormant, tested on a mock
  log.ts                 structured JSON-lines logging with levels and rotation
  recovery.ts            startup recovery: re-adopt open positions after a restart
scripts/
  backup.ts              back up the store (npm run backup) — restorable
  live-arm.ts            show the live gate chain (npm run live:check) — never sends
deploy/                  Dockerfile, docker-compose.yml, pm2 + systemd units, docs/DEPLOY.md
web/
  index.html             the app shell
  css/app.css            the app's styles (extracted; served at /css/app.css)
  js/api.js, state.js    shared frontend helpers (the modular foundation)
  js/replay.js           the replay player: ▶ play through stored candles, evidence per candle
  strategy.ts            the simple crossover strategy
  strategies/            the playbook: one interface, many strategies, each judged alone
    types.ts, registry.ts   the Strategy interface and the list of them
    sessionIfvg.ts, vwapReclaim.ts, breakout.ts, trendPullback.ts, meanReversion.ts, orderFlowMomentum.ts, crossover.ts
  fusion.ts              combines the votes into one decision (LONG/SHORT/WATCH/NO TRADE)
  fusion/weights.ts      how much each strategy family counts in each regime
  market.ts              real prices over REST (and refusing to fake them)
  data/bus.ts            the in-process market-data bus every reading passes through
  data/binanceStream.ts  the live stream: reconnects, order-book stitching, stale watchdog
  data/candleStore.ts    closed candles in the database; gap filling over REST
  data/feed.ts           the one feed: stream when it is up, REST when it is not
  features/              the shared readings every strategy consumes — inputs, never rules
    engine.ts            one FeatureSnapshot per closed candle, same code in replay and live
    vwap.ts, volumeProfile.ts   VWAP and value area: exact from the tape, approximate from candles
    ema.ts, momentum.ts, volatility.ts, atr.ts   the market-state readings
    structure.ts, liquidity.ts, dealingRange.ts  swings, breaks, blocks, premium/discount, nearest liquidity
    regime.ts            one word for the market: trend / range / breakout / transition, from five readings
    trades.ts            the tape folded into candle buckets, and whether it missed anything
    delta.ts, cvd.ts, footprint.ts   who was hitting whom, per candle and cumulatively
    tape.ts, largeTrades.ts, imbalance.ts, absorption.ts   speed, big prints, book lean, and the absorption heuristic
  ui.ts                  makes the terminal readable
  selftest.ts            offline logic checks
  tradingview.ts         TradingView setup steps

web/index.html           the dashboard
pine/ict-sessions.pine   TradingView indicator
pine/ict-strategy.pine   TradingView strategy
pine/strategy.pine       TradingView crossover strategy

data/
  mrcash.db              THE source of truth: every decision, lesson, paper
                         trade, alert, journal entry, goal, plan and setting
  ledger.csv             every decision — a readable copy. Opens in Excel.
  learnings.md           lessons, in plain English — a readable copy
  positions.json         paper positions — a readable copy
  equity.csv             the paper equity curve — a readable copy
  events.jsonl           every alert the bell has shown — a readable copy
  journal.jsonl          your journal — a readable copy
  goals.json, plan.json  your goals and today's armed plan — readable copies
  orderflow.csv          order-flow readings — a readable copy
  STOP                   exists only while the kill switch is on
```

The bot reads from `mrcash.db` and writes the readable copies next to it
after every change. If you had these files before the database existed,
they were imported once, automatically, the first time the new version
started (`npm run migrate` shows what came across); the originals were not
touched. Two copies of the bot — the app and a look-back test, say — can
write at the same time without corrupting anything, and a crash leaves the
database in a consistent state.
