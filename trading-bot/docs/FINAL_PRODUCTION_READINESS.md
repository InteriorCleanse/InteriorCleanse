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
(**339 tests, 338 pass, 1 todo, 0 fail, 0 skipped**), `ui:smoke` (pass at 1180px
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
| Testing | **PASS** | 338/339 pass; the 1 todo is stale-but-passing (see below); selftest ≥80 checks incl. the hand-built baseline day; deterministic (seeded) factory/Monte-Carlo/campaign tests; Playwright UI smoke as a separate `npm run ui:smoke`. |
| Observability | **PASS** | Structured JSON-lines logging with size rotation that never throws (`log.ts`); deep `/api/health` (store, dataDir, feed, kill switch, `healthy` flag); store backups with integrity check (`scripts/backup.ts`). |
| Documentation | **PASS** (with minor WARNING) | README (incl. a "Real money" gate-chain chapter), `docs/DEPLOY.md`, `trading_bot_instructions.md`, `.env.example` all match the current code. **WARNING:** recommend adding a CI import-guard (below) and, optionally, retiring the stale todo marker. |

---

## The one TODO — verdict: **SAFE TO LEAVE**

`test/memory.test.ts:29` — *"a newline inside a quoted reason splits the row"*,
marked `{ todo: 'the CSV reader is line-based …' }`.

- The test **currently passes** (`ok … # TODO`): `readLedger()` reads **SQLite**
  (`store().readLedger()`, `memory.ts:50`), which round-trips embedded newlines
  correctly. The flagged line-based CSV parser is **no longer in any data path**.
- `data/ledger.csv` is a **write-only** human mirror; nothing parses it back
  (all `readLedger` consumers go through the store).
- Therefore the limitation has **zero decision/production impact**. It is a stale
  documentation marker. *Optional* cleanup: convert it to a normal passing test.

**Not a production blocker.**

---

## TODO / technical-debt scan

`grep -rniE "TODO|FIXME|HACK|XXX" src/` → **1 hit**, and it is a *news keyword
pattern* (`news.ts:30`, classifying "hack/exploit" headlines), not code debt.
Other matches for "fake"/"stub"/"simulated" are descriptive comments about the
**paper** order type and the injectable **test** double — all **SAFE**, none a
production blocker. No `placeholder`/`temp`/`example` shortcuts in production code.

---

## Recommended (non-blocking) hardening

1. **CI import-guard**: fail the build if any file outside `src/live/` or
   `src/exchange/binanceTrade.ts` imports the order-placing path — this turns
   today's "unwired" property into an enforced invariant. *(Not yet present.)*
2. Retire the stale `todo` marker in `test/memory.test.ts` (cosmetic).
3. Keep `LIVE_TRADING_ENABLED === false` in the self-test as a permanent CI gate
   (already present, `selftest.ts:359`).

---

## Next validation stage

Proceed to **extended paper trading** (≥ `minSetupsForConfidence` fused trades
over ≥ 4 weeks), then **read-only shadow** (≥ 2 weeks, updating the slippage
assumptions from observed spreads), then **testnet** (≥ 20 reconciled trades)
— all before any real-money consideration, and each behind the existing gate
chain. Do **not** enable live, add credentials, or deploy capital until those
samples exist and are reviewed.
