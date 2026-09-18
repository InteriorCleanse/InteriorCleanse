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
(**486 tests, 486 pass, 0 todo, 0 fail, 0 skipped**), `ui:smoke` (pass at 1180px
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
| Risk | **PASS** | `riskEngine.assess` gates every candidate; the paper trader opens **only** in the approved branch (`watch.ts:182`) — a signal cannot bypass the veto; every rule has a boundary test (`test/riskEngine.test.ts`); kill switch blocks new entries within one candle. |
| Recovery | **PASS** (with WARNING on soak) | Durable store; startup re-adoption of open positions (`recovery.ts`, wired in `watch.ts`); reconciliation from the venue's `myTrades` recovers a position / a flat (`test/live/reconcile.test.ts`). **WARNING:** the 7-day-unattended soak is a deployment-time property, not yet demonstrated. |
| AI | **PASS** | Context is built only from the feature snapshot + fused decision + risk verdict (`ai/context.ts`); a validator rejects a missing section or a number outside the context (`ai/narrator.ts`); a deterministic narration is the offline fallback; the CIO decision is **exactly** the fused decision after risk (`ai/cio.ts`, `test/ai/cio.test.ts`). No fabricated certainty. |
| UI | **PASS** | Smoke passes at desktop and phone widths with zero page/console errors across all 13 tabs; header shows `PAPER · no real money`; panels have loading/error states; no live-order control exists. |
| Testing | **PASS** | 486/486 pass, 0 todo (the stale marker is retired — see below); selftest ≥80 checks incl. the hand-built baseline day; deterministic (seeded) factory/Monte-Carlo/campaign tests; an order-path guard that was verified to fail on a deliberate violation; Playwright UI smoke as a separate `npm run ui:smoke`. |
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

## Cross-source consistency audit — three defects found and fixed

The Phase 22 audit found a bug by asking *"is this concept computed in more than
one place, and do those places agree?"*. Applying the same question to the rest
of the system found a second one (win rate, below) and then a third (shadow R,
further below).

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

## Next validation stage

Proceed to **extended paper trading** (≥ `minSetupsForConfidence` fused trades
over ≥ 4 weeks), then **read-only shadow** (≥ 2 weeks, updating the slippage
assumptions from observed spreads), then **testnet** (≥ 20 reconciled trades)
— all before any real-money consideration, and each behind the existing gate
chain. Do **not** enable live, add credentials, or deploy capital until those
samples exist and are reviewed.
