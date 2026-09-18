# FINAL PRODUCTION READINESS — Mr. Cash (TITAN)

An independent pre-production / red-team audit of the whole system, treating the
implementation as something to be *proven*, not assumed. Every verdict below has
file-level evidence. Scope reminder: this build is **paper-only**; live trading
is dormant and unwired (see `LIVE_EXECUTION_AUDIT.md`).

**Overall: READY FOR THE NEXT VALIDATION STAGE (extended paper → shadow →
testnet).** No production blockers were found. "Production ready with real
capital" is explicitly **not** claimed — the remaining gates are *runtime sample
sizes* (weeks of paper, weeks of shadow, ≥20 reconciled testnet trades), which
by design cannot be satisfied inside this audit.

Checks run: `typecheck` (clean), `selftest` (exit 0), full suite
(**494 tests, 494 pass, 0 todo, 0 fail, 0 skipped**), `ui:smoke` (pass at 1180px
and 400px, no console errors). No `lint`/`build` scripts exist — the project runs
TypeScript directly under Node 22; `typecheck` is the type gate and CI (`bot.yml`,
22 green runs) runs typecheck + selftest + the full suite.

| Category | Verdict | Evidence (summary) |
|---|---|---|
| Security | **PASS** | CSRF token + same-origin gate on every `POST /api/*` (`guard.ts`, `server.ts:324`); PIN throttle → 429 (`guard.PinThrottle`, `server.ts:294`); auth gate for non-loopback (`server.ts:310`); per-route body caps 4–256 KB; read-only exchange client; withdrawal-key refusal; forged-cross-origin POST test returns 403 (`test/server.test.ts:123`). |
| Data | **PASS** | SQLite is the source of truth; durability across a reopen is tested (`test/recovery.test.ts`); stale-feed → risk veto; the market bus dedupes and announces each closed candle once (Phase 5); `/api/health` deep-checks the store + feed. |
| Trading logic | **PASS** | No look-ahead (no future-index access in engine/features/replay); entries fill at the **next** candle open; timezone via `toET` (tested); tick/step/min-notional filters (`risk/filters.ts`); the frozen baseline still pins exactly one BUY at the retest candle, quality 85 (`test/engine.test.ts`). |
| Backtesting | **PASS** (with WARNING on sample) | Honest fills: half-spread + slippage on entry, stop fills worse / at a gap open, target needs trade-through, taker/maker fees (`sim/fills.ts`); OOS split, walk-forward, Monte-Carlo; order-flow strategies reported "not backtestable" not approximated. **WARNING:** in-sandbox samples are one symbol / a short window — a real edge is unproven by design. |
| Execution | **PASS** (paper) / **WARNING** (live dormant) | Paper path is an honest simulator with `assertPaperOnly()` that throws off-paper (`execution.ts:15`). Live path is fully tested against a mock (`test/live/*`) but **unwired and dormant**; it has had zero real/testnet fills (by mandate). |
| Risk | **PASS** | `riskEngine.assess` gates every candidate; the paper trader opens **only** in the approved branch (`watch.ts:193`, the single `openPosition` call site in `src/`) — a signal cannot bypass the veto; every rule has a boundary test (`test/riskEngine.test.ts`); kill switch blocks new entries within one candle. |
| Recovery | **PASS** (with WARNING on soak) | Durable store; startup re-adoption of open positions (`recovery.ts`, wired in `watch.ts`); reconciliation from the venue's `myTrades` recovers a position / a flat (`test/live/reconcile.test.ts`). **WARNING:** the 7-day-unattended soak is a deployment-time property, not yet demonstrated. |
| AI | **PASS** | Context is built only from the feature snapshot + fused decision + risk verdict (`ai/context.ts`); a validator rejects a missing section or a number outside the context (`ai/narrator.ts`); a deterministic narration is the offline fallback; the CIO decision is **exactly** the fused decision after risk (`ai/cio.ts`, `test/ai/cio.test.ts`). No fabricated certainty. |
| UI | **PASS** | Smoke passes at desktop and phone widths with zero page/console errors across all 13 tabs; header shows `PAPER · no real money`; panels have loading/error states; no live-order control exists. |
| Testing | **PASS** | 494/494 pass, 0 todo (the stale marker is retired — see below); selftest ≥80 checks incl. the hand-built baseline day; deterministic (seeded) factory/Monte-Carlo/campaign tests; an order-path guard that was verified to fail on a deliberate violation; Playwright UI smoke as a separate `npm run ui:smoke`. |
| Observability | **PASS** | Structured JSON-lines logging with size rotation that never throws (`log.ts`); deep `/api/health` (store, dataDir, feed, kill switch, `healthy` flag); store backups with integrity check (`scripts/backup.ts`). |
| Documentation | **PASS** | README (incl. a "Real money" gate-chain chapter), `docs/DEPLOY.md`, `trading_bot_instructions.md`, `.env.example` all match the current code. Both previously-open recommendations (the CI import-guard and the stale todo marker) are now closed. |

---

## The one TODO — **now retired** (was: SAFE TO LEAVE)

`test/memory.test.ts` — *"a newline inside a quoted reason splits the row"*, was
marked `{ todo: 'the CSV reader is line-based …' }`.

The marker was **stale, not deferred work**: `readLedger()` reads **SQLite**
(`store().readLedger()`, `memory.ts:50`), which round-trips embedded newlines
correctly, and `data/ledger.csv` is a **write-only** human mirror that nothing
parses back. The flagged line-based CSV parser had not been in any data path
since Phase 3, so the limitation had zero decision/production impact.

It has been converted into a normal passing test with a **stronger** assertion
than the original: the row does not split *and* the reason's content — newline
included — is preserved exactly. The suite now reports **0 todo**.

---

## Cross-source consistency audit — five defects found and fixed

The Phase 22 audit found a bug by asking *"is this concept computed in more than
one place, and do those places agree?"*. Applying the same question to the rest
of the system found a second (win rate), a third (shadow R), a fourth (the fee
knob and a fourth copy of the R formula) and a fifth (two calendars for "the
day") — each in its own section below.

**`sim/trades.ts` opens by promising it is "the one place trade results are
worked out … so a number on one screen can never disagree with the same number
on another."** Two reporting paths had since invented their own thresholds:

| Path | Win rule | Metric |
|---|---|---|
| engine (`sim/trades`, backtest, replay, ledger, memory) | `pnlPercent > 0.001` | percent after fees |
| `paperStats` — the paper account | `rMultiple > 0.05` | R |
| `paperByStrategy` + validation breakdowns | `rMultiple > 0.0001` | R |

A trade closing at **+0.02R** was therefore a **WIN** on the validation panel and
a **FLAT** on the paper account — *inside the same `/api/paper` response*, which
returns both. Demonstrated directly before the fix.

**Fix.** `classifyOutcome()` + `OUTCOME_DEADBAND_PCT` are now the single
definition, used by `tradeMetrics` itself. The engine's verdict is recorded on
each `PaperPosition` at close, and one shared reader (`paperOutcome`) is used by
all three reporting paths. Legacy positions recover the exact percent from
dollars (`pnlUsd = pnlPercent/100 × notional`, so the division back is exact);
the un-classifiable branch is unreachable for real data, since every real close
records `pnlUsd`.

**Behaviour deliberately unchanged:** the ledger outcome, `learnFromLedger` and
memory blocking are byte-identical — the value written is the same one, just
computed once instead of twice. Win rate is not a validation gate input, so no
gate moved. What changed is that the paper account's win/loss counts now match
the engine's, which they previously did not.

Locked by `test/paper/outcomeConsistency.test.ts`, including a guard that fails
if any reporting module compares `rMultiple` against a local numeric threshold
again.

**Also noted, not yet changed:** the spread-percent formula
`((ask − bid) / mid) × 100` is duplicated in 7 places, and the current-drawdown
formula `peak > 0 ? ((peak − eq) / peak) × 100 : 0` (over
`const eq = equity(); const peak = Math.max(equityPeak(), eq)`) in 6. Every copy
of both is currently *byte-identical*, so these are drift risks rather than
defects — recorded here so they are known items rather than surprises later.
(`paper/validation.ts`'s `drawdownPercent` is deliberately a *different*
measure: the worst peak-to-trough of the closed-trade equity curve, which feeds
the `maxDrawdownPercent` gate, versus the risk rule's *current* distance below
the peak.)

### Shadow R was gross where paper R is net

Same question asked of the shadow scorer — *is this concept computed twice, and
do the two agree?* — and it did not. `shadow/scorer.ts` returned a bare price
ratio, `(exit − fill) / risk`, while every other R in the system comes from
`sim/trades.ts`'s `tradeMetrics` and is **net of fees**. Two numbers, one name,
one unit, side by side.

At the configured 0.1% taker / 0.1% maker the gap is not cosmetic. Measured:

| Stop distance | Shadow (gross) | Paper (net) | Overstated by |
|---|---|---|---|
| 0.25% | +2.000R / −1.000R | +1.200R / −1.800R | **0.800R** |
| 0.5%  | +2.000R / −1.000R | +1.600R / −1.400R | **0.400R** |
| 1.0%  | +2.000R / −1.000R | +1.800R / −1.200R | **0.200R** |

It is a uniform upward shift on winners *and* losers, so it moves expectancy,
not just individual scores: a 40%-win, 2R strategy reads **+0.20R** gross and
**−0.20R** net. Shadow is the last checkpoint before real capital, and it was
the optimistic one — the direction that matters.

Fixed by routing the scorer through `tradeMetrics` with `defaultAssumptions()`,
the same call paper makes, mapping the take-profit limit to the maker fee and
the stop-market to the taker fee (the split `exitFeePercent` already encodes).
Shadow is inactive and no gate reads shadow R today, so nothing downstream
moved; what changed is that a shadow R and a paper R now mean the same thing.

The two existing scorer tests asserted only the **sign** of the R, which a
uniform upward shift leaves intact — that is how it survived. Locked now by two
tests in `test/shadow/shadow.test.ts` that pin shadow R to paper R for the
identical trade; both were verified to fail against the old formula while all
seven original tests passed either way.

### A fee knob that moved nothing, and a fourth R formula

The same question, asked of fees: **`config.feePercent` is not the fee your
results are computed with.** Its comment claimed *"Every result the bot shows
you already has fees taken out"*. Demonstrated false — setting it from 0.1 to
0.5:

| | before | after | moved? |
|---|---|---|---|
| engine R (`tradeMetrics` ← `defaultAssumptions()` ← `config.execution.*`) | 1.8000R | 1.8000R | **no** |
| journal R (`journal.computeR` ← `config.feePercent`) | 1.8000R | 1.0000R | yes |

`defaultAssumptions()` returns `{...config.execution}`, so everything the engine
reports — paper, backtest, replay, shadow — reads `execution.takerFeePercent` /
`execution.makerFeePercent`. The top-level `feePercent` reaches only
`IDEAL_ASSUMPTIONS` (the deliberately idealised pre-Phase-4 comparison, correct
by design) and, until now, the journal. A user setting their real venue fee in
the obvious top-level place documented as *"Trading fees"* would have changed
nothing about any reported result.

`journal.computeR` was also a **fourth hand-rolled copy of the R formula**, and
it charged the taker fee on both legs where `tradeMetrics` charges maker on a
take-profit. All three knobs ship at 0.1, so every number agreed exactly and
nothing looked wrong; set a realistic tier (0.075 taker / 0.045 maker) and the
engine says **1.8800R** where the journal says **1.8000R** for the same trade.

**Fix.** `computeR` now calls `tradeMetrics` with `defaultAssumptions()`. A
journal entry does not record *how* the trade exited, so the fee split is
assumed: `time` resolves to the taker fee on the exit leg — what the hand-rolled
version charged on both legs, the conservative choice, and the one that leaves
today's numbers bit-identical. The config comment now states what the knob
actually drives and points at `execution.*`.

**No shipped number moved:** the pre-existing journal test asserting `1.8R` for
100/99/102 passes unchanged. Locked by two more tests in `test/journal.test.ts`
— one pinning journal R to engine R, one asserting the journal *follows the
execution fees*. The second was verified to fail against the old formula; the
first passes either way, which is precisely why the wiring bug was invisible.

### Two calendars for "the day"

The system's day is the **ICT trading day**, which rolls at **18:00 ET**
(`tradingDayKey`, `config.ict.dayStartHour`). Two places cut the day on **UTC
midnight** instead. Measured, hour by hour across a full day:

| | disagreement window | hours/day |
|---|---|---|
| summer (EDT) | 18:00–19:59 ET | 2 of 24 |
| winter (EST) | 18:00–18:59 ET | 1 of 24 |

That window is not arbitrary — it is the gap between the trading-day roll and
UTC midnight, i.e. exactly when an "end of the day" run happens.

1. **`paper/validation.ts` — the daily report header.** Headed with the UTC date
   of `generatedAt` while every trade inside is bucketed by the trading day, so a
   report run at 18:30 ET carried the *previous* day's date over the *current*
   trading day's trades. A label, not a computation — no gate or metric moved —
   but the run is meant to accumulate weeks of dated evidence, and a mislabelled
   day corrupts the record it is there to produce.

2. **`mcp.ts` — the day-plan fallback.** `s.analysis?.dayKey ?? new
   Date().toISOString().slice(0, 10)`. This one is **behavioural**, not
   cosmetic: `planFor` matches by *exact string equality*
   (`plan.ts:48`), so a plan armed through this fallback inside the window gets a
   key that can never match the trading day — the plan is silently ignored, with
   no error. It agrees 22 hours a day, which is why it looked fine.

**Fix.** Both use `tradingDayKey`. The report header now states the calendar
outright: `PAPER VALIDATION REPORT — trading day YYYY-MM-DD (rolls 18:00 ET)`.
The runbook's capture snippet used a *third* calendar — `$(date +%F)`, the
host's local date — for the filename; it now takes the day from the report's own
header, so the name and the contents cannot drift apart, and it warns against
scheduling near 18:00 ET.

Locked by two tests in `test/paper/validation.test.ts`: one pinning the header to
the trading day at 18:30 ET in both DST regimes, and one **class guard** that
fails if any file under `src/` cuts a day with `toISOString().slice(0, 10)`
again. Both were verified to fail against the old code.

---

## Strategy-logic audit — does each strategy do what its doc says?

A different question from the duplicate-concept one, and it needed different
tools. Findings, stated as verified or not:

**Read and checked against their documented ICT definitions — all correct.**
Turtle soup fades the right way (high raided → short), requires a *close* back
inside as documented, and stops beyond the raiding wick. Unicorn maps a broken
*bearish* block to a long and a broken *bullish* one to a short, uses a true
interval intersection for the overlap zone, and stops beyond the breaker. Silver
bullet's window test (`hour ∈ {3, 10, 14}`) matches the documented 03:00–04:00 /
10:00–11:00 / 14:00–15:00 hours.

**The ET/time layer is sound.** Probed at every boundary that usually breaks:
midnight renders `00:00` with the correct date (the `% 24` in `toET` handles the
engines that print midnight as "24"), the 18:00 roll is exact (17:59 → same day,
18:00 → next), spring-forward skips 02:00 → 03:00, and fall-back handles the
repeated hour consistently.

**`atrPlan` does not validate its inputs.** `risk = Math.abs(entry - stop)`, so a
stop on the *wrong side* of the entry yields a positive risk and a target placed
a multiple of it away — a plan that is the wrong way round but passes every type
check and every test that only asserts a vote fired. Seven of the ten strategies
pass an explicit `stopPrice` derived from a *zone* (gap edge, breaker, sweep
wick, VWAP band) rather than from the entry, and `meanReversion` passes an
explicit `targetPrice` too.

Whether those always land correctly is a property of each strategy's own guards,
so it was **exercised rather than reasoned about**:
`test/strategies/planInvariants.test.ts` drives every registered strategy through
the real `IctEngine` over six seeded market shapes — **8,133 plans, all correct**.
Coverage is reported honestly: that sweep fires only five of the ten strategies
(a random walk rarely builds a breaker-plus-gap overlap), so the three
zone-stopped ones are additionally swept by hand across the entire retest
tolerance at ATRs spanning four orders of magnitude.

**What protects them is a margin**: the retest band reaches 0.1 ATR past the
zone, the stop is placed 0.2 ATR past it, so the stop is always 0.1 ATR beyond
the furthest price that can still fire — for any ATR **above zero**.

**The one case that breaks it, and why it cannot matter.** At ATR exactly zero
the margin vanishes: the stop lands on the zone edge and a price sitting there
fires a plan whose stop *equals* its entry (`rr` 0). Contrived — it needs a live
gap in a market whose ATR window is flat — but real. `sizeForStop` refuses a
zero stop distance and returns quantity 0, and `applyFilters` rejects a zero
quantity, so it can never become a position.

That guard is quieter than it looks, which is why it is now pinned by a test.
Deleting the `stopDistance > 0` line does **not** blow up: `wantedRiskUsd / 0` is
Infinity, the position cap clamps it immediately, and what comes out is an
ordinary-looking **0.25 quantity at a reported risk of $0** — a full-size
position on a trade whose stop is its entry, which nothing downstream would
flag. Measured by deleting the line and re-running the test.

---

## Fusion and risk-layer audit — one defect found and fixed

The layer where a defect would be most consequential: how a vote becomes a
position, and whether the veto can be reached around.

**Verified clean, no change needed.** `openPosition` has exactly **one** call
site in `src/` (`watch.ts:193`), nested inside the `else` of
`if (!verdict.approved)` and behind the memory block — a signal cannot reach a
position without a verdict. The rule order in `riskEngine.RULES` puts the kill
switch first as documented, and `checks.find((c) => !c.passed)` makes the first
failure the veto. The engine **fails closed**: a throwing rule produces no
verdict at all rather than an approval, and `roundToStep` guards its zero-step
default (`if (!(step > 0)) return qty`) instead of dividing by it.

### The venue filters were thrown away at fill time

`assess` rounds the approved size to a whole number of the venue's steps. Then
`fillPosition` **re-sizes from the actual fill price** — correct in itself, the
risk percent is owed to the real stop distance — and stored that re-derived size
**raw**, discarding the rounding. Since the filled position is what gets
recorded and reported, the filter was effectively defeated for every number
downstream.

Measured with Binance BTCUSDT's real values (`stepSize` 0.00001, `minNotional`
5):

| | size | placeable? |
|---|---|---|
| risk engine approved | 0.00083 | yes — a whole number of steps |
| `fillPosition` stored | 0.000833017619655484 | **no** |

`filters.ts` states the intent in its own header: *"Even on paper, sizing that
ignores these is a lie about what could actually be filled."* That is exactly
what was happening, and `riskUsd` inherited it too — `assess` returns
`quantity: filt.quantity` (rounded) beside `riskUsd: sizing.riskUsd` (computed
before rounding).

**Dormant today, and that is the point.** Every filter ships at 0, so
`applyFilters` is a no-op and not one recorded number moves — the full suite,
including the pre-existing tests that assert exact fill quantities, passes
unchanged. It wakes up precisely when Phase 20 sets the venue's real values,
which is the run-up to risking money.

**Fix.** `fillPosition` now puts the re-derived size through the same
`applyFilters` the risk engine used, and derives `riskUsd` from the size that
could actually be placed. A size the venue would reject is recorded as a
**MISSED** order rather than a fill — inventing a fill the venue would have
refused is the same lie in a different place — and the manage loop skips it
instead of babysitting a position that does not exist.

Locked by two tests in `test/paperTrader.test.ts` (a filled size is a whole
number of steps and its `riskUsd` matches it; an order under an unreachable
minimum notional is missed, not invented), both verified to fail against the old
`fillPosition`.

---

## TODO / technical-debt scan

`grep -rniE "TODO|FIXME|HACK|XXX" src/` → **1 hit**, and it is a *news keyword
pattern* (`news.ts:30`, classifying "hack/exploit" headlines), not code debt.
Other matches for "fake"/"stub"/"simulated" are descriptive comments about the
**paper** order type and the injectable **test** double — all **SAFE**, none a
production blocker. No `placeholder`/`temp`/`example` shortcuts in production code.

---

## Recommended (non-blocking) hardening — **all three now done**

1. **CI import-guard**: ✅ **implemented** as `test/orderPathGuard.test.ts`. It
   fails the build if any file outside the allow-list imports the order-placing
   path, if an order verb or write-capable endpoint appears outside the trade
   adapter, if a route looks like it could submit an order, or if any of the
   three safety flags stops being `false`. It was verified to **fail** on a
   deliberately introduced violation, not merely to pass. See
   `LIVE_EXECUTION_AUDIT.md` for the full assertion list.
2. Retire the stale `todo` marker in `test/memory.test.ts`: ✅ **done** — replaced
   by a normal passing test with a stronger assertion. The suite reports 0 todo.
3. Keep `LIVE_TRADING_ENABLED === false` in the self-test as a permanent CI gate:
   ✅ already present (`selftest.ts:359`), and now additionally asserted by the
   order-path guard.

---

## The news brain's own caveat — closed, and what it cost

The news brain shipped with a limitation written into its own output:

> "The window study measures the CLOCK, not the event: it is what this symbol
> usually does at that time of day, across all days in the history — not what it
> did on past instances of this specific release."

That was a real gap, not a disclaimer. *"08:30 ET is usually busy"* and *"CPI
moves this instrument"* are different claims, and only the second is about the
event. The module could only make the first because **nothing stored what the
calendar said yesterday**: the feed carries the current week and is overwritten
on every refresh, so the moment CPI printed, the fact that it had ever printed
was gone.

**What was added.** `src/news/history.ts` — a per-release record folded in on
every successful calendar fetch (`getNews`), keyed by a normalised series id.
`src/news/brain.ts` gained `eventStudy()`, which measures realised range in the
window after each past instance of one specific release against an ordinary
window of the same length **on those same days** (same-day, so the yardstick is
not contaminated by the market being generally louder in the months a release
happened to fall in). `newsRead` takes an optional `pastInstances` lookup and
leans on the release study whenever it clears the sample bar, saying so; the
clock study is demoted, never discarded, and is quoted alongside when the two
disagree. Routes: `/api/news/read` supplies the lookup, `/api/news/history`
reports what the memory actually holds.

**What it does not buy you yet.** The memory starts empty and fills one calendar
refresh at a time, so a monthly release needs roughly **five months** before
anything is claimed about it. `minSamples` is 5 — the same bar as the clock
study and as the attribution layer — and was deliberately *not* lowered to make
the feature look alive sooner. Until then every event study reads `TOO FEW` and
the read falls back to the clock, visibly. That is the honest state and it looks
like it.

**Two defects found while building it**, both by rendering the output rather
than by reasoning about it:

- **A refusal with a number beside it.** Both studies computed a multiple and
  returned it even when the verdict was `TOO FEW`, so a rendering printed
  `TOO FEW 6.00×` — the word that declines to characterise the window, next to
  the characterisation. A ratio off three days is not a measurement and a reader
  takes the number. The raw medians stay (those *are* measurements); the ratio is
  now `null` below the bar. **This was pre-existing in `clockWindowStudy`.**
- **A hardcoded candle interval in the coverage rule.** A window counted as
  measurable on `floor(minutes / 5) - 1` candles whatever the interval really
  was. On 5m data that is correct; on 1m data a 30-minute window was "covered" by
  five candles — six minutes of data measured as if it were thirty, which reads
  as calm for entirely the wrong reason and biases every study toward `ORDINARY`.
  The step is now derived from the data.

**Unchanged:** the module still calls no direction, in any state, at any memory
depth — asserted across loudness × print × memory-depth combinations. Nothing
here reaches the engine; `news.isBlackout` remains the only thing risk consults.

---

## Next validation stage

Proceed to **extended paper trading** (≥ `minSetupsForConfidence` fused trades
over ≥ 4 weeks), then **read-only shadow** (≥ 2 weeks, updating the slippage
assumptions from observed spreads), then **testnet** (≥ 20 reconciled trades)
— all before any real-money consideration, and each behind the existing gate
chain. Do **not** enable live, add credentials, or deploy capital until those
samples exist and are reviewed.
