# LIVE_EXECUTION_AUDIT

**Question this document answers:** *Can any code path, by accident, submit a
real order to an exchange?*

**Method:** traced UI → API → signal → risk → execution → broker, and grepped
the whole repository for every order-submission function, exchange endpoint,
credential, switch, feature flag, debug route and bypass. Evidence (file:line)
is given for each path. Verdicts: **SAFE** / **UNSAFE** / **UNKNOWN**.

**Headline result:** every path is **SAFE**. There is *no* order-submission
route, *no* UI control that places an order, and the only order-placing code in
the tree (`src/exchange/binanceTrade.ts`) is **orphaned** — nothing in the
running application imports it. Multiple independent layers each block live
orders on their own.

---

## 1. The order-placing surface (where real orders could originate)

The ONLY file in the repository with methods that submit/cancel orders is
`src/exchange/binanceTrade.ts` (`marketBuy`, `marketSell`, `ocoSell`,
`cancelAll` → `POST /api/v3/order`, `/api/v3/orderList/oco`, etc.). Confirmed by:

```
grep -rnE "api/v3/order|marketBuy|marketSell|ocoSell|cancelAll" src/
→ only src/exchange/binanceTrade.ts  (+ src/live/trader.ts, which calls it)
```

The read-only client `src/exchange/binanceRest.ts` has **no** write method
(GET-only: `exchangeInfo`, `account`, `openOrders`, `myTrades`).

The only outbound write-capable HTTP call in the whole tree is
`binanceTrade.post()`; `market.ts` and `news.ts` do read-only GET.

| Order-capable code | Reachable from the running app? | Verdict |
|---|---|---|
| `exchange/binanceTrade.ts` (order methods) | **No** — imported only by `live/trader.ts` | **SAFE** |
| `live/trader.ts` (`openLive`, `killAll`) | **No** — imported only by `test/live/trader.test.ts` | **SAFE** |

```
grep -rn "live/trader|exchange/binanceTrade" src/ | grep -v "live/trader.ts|binanceTrade.ts"
→ (no output)  # no production module imports the live order path
```

So the live trader and the trade adapter are **dead code** with respect to the
running application (`server.ts`, `watch.ts`, `execution.ts`, `index.ts`,
`bot.ts`). They exist, fully tested against a mock, for a future gated phase.

---

## 2. UI → API → signal → risk → execution → broker

| Stage | What actually happens | Evidence | Verdict |
|---|---|---|---|
| **UI** | The web app POSTs only: settings, stop/resume, strategies/enable, **paper/close**, memory/reset, plan, journal, chat, picture, tv-alert, factory/run, vault/mint. No order button, no live control. Header shows `PAPER · no real money`. | `web/index.html`; POST routes list below | **SAFE** |
| **API** | No order-submission route exists. `/api/live/status` is **GET, read-only** (returns the gate chain). `/api/paper/close` closes a *paper* position at the current price. | `server.ts` route table | **SAFE** |
| **signal** | Fused/session signal → `paperTrader.openPosition` (paper). `config.fusion.driveTrading` defaults **off**, so the frozen ICT session model is what trades on paper. | `watch.ts:158-191` | **SAFE** |
| **risk** | Every candidate passes `riskEngine.assess` before it can become a paper position; any rule can veto. | `watch.ts:170`, `riskEngine.ts` | **SAFE** |
| **execution** | `execution.simulatePaperOrder` calls `assertPaperOnly()`, which **throws** unless `mode==='paper'` and `LIVE_TRADING_ENABLED===false`. No network, no exchange address. | `execution.ts:15-24` | **SAFE** |
| **broker** | The paper trader never touches an exchange. The only broker write code (`binanceTrade`) is orphaned (row above). | — | **SAFE** |

### State-changing POST routes (all guarded, none place an order)

`server.ts` POST routes: `/api/tv-alert` (own secret), `/api/settings`,
`/api/stop`, `/api/resume`, `/api/strategies/enable`, `/api/paper/close`,
`/api/memory/reset`, `/api/plan`, `/api/plan/clear`, `/api/journal*`,
`/api/chat`, `/api/picture`, `/api/factory/run`, `/api/vault/mint`.

Every `POST /api/*` first passes `checkStateChange` (CSRF token + same-origin),
`server.ts:324-327`. **None of these submits an exchange order.**

---

## 3. Switches, credentials, flags, bypasses

| Item | Where read | Effect | Verdict |
|---|---|---|---|
| `LIVE_TRADING_ENABLED` | `config.ts:641` (`= false` constant) | Read by `mode.isPaperOnly`, `execution.assertPaperOnly`, `live/gates` (Hard-flag gate), and asserted false by the self-test (`selftest.ts:359`). A literal `false` const. | **SAFE** |
| `config.live.enabled` | `config.ts` (`false`) | One gate among many; `live/gates.ts`. | **SAFE** |
| `config.shadow.enabled` | `config.ts` (`false`) | Enables **read-only** shadow recording only; the shadow recorder has no send path. | **SAFE** |
| `MRCASH_LIVE` (env) | `live/gates.gateInputFromEnv` | Only feeds the (closed) gate chain; nothing calls the trader regardless. | **SAFE** |
| `EXCHANGE_API_KEY` / `_SECRET` (env) | `doctor.ts:105` (read-only key check), `mode.shadowEnabled` | Passed **only** to the read-only `ReadOnlyExchange`; never to `binanceTrade`. The doctor **refuses** a key that can withdraw (`assessKeyPermissions`). | **SAFE** |
| Debug / bypass routes | — | None found. No `/debug`, no order shortcut, no test-only route in `server.ts`. | **SAFE** |
| WebSocket order channel | — | The stream (`binanceStream.ts`) is **inbound market data only** (trades, book, klines). No order channel. | **SAFE** |

Env vars referenced anywhere in `src/`: `ANTHROPIC_API_KEY`,
`EXCHANGE_API_KEY`, `EXCHANGE_API_SECRET`, `MRCASH_DATA_DIR`, `MRCASH_LIVE`,
`MRCASH_PIN`, `MRCASH_PORT`, `MRCASH_STREAM`, `MRCASH_STREAM_URL`, `NO_BROWSER`,
`NO_COLOR`. None enables live trading on its own.

---

## 4. Defense-in-depth summary

A real order requires **all** of the following to be true at once. Today, layers
(a) and (b) alone make it impossible, and each of (c)–(f) would independently
block it:

- (a) **No wiring** — no production module imports `openLive`/`binanceTrade`.
- (b) **No route/UI** — there is no order endpoint or UI control to invoke.
- (c) `openLive` refuses unless `liveArmed(gate)` is true (`live/trader.ts:47`).
- (d) `liveArmed` requires `LIVE_TRADING_ENABLED===true`, a `false` constant.
- (e) plus config.live.enabled, the `MRCASH_LIVE` phrase, a typed confirmation,
      a testnet track record, the guard, kill switch clear and a healthy feed.
- (f) the paper `execution.ts` throws if `mode!=='paper'`; the self-test fails
      CI if the flag is ever flipped.

---

## 5. Residual risk (documented, not a current defect)

The order-placing code **exists** in the tree (by design — Phase 20, dormant).
The safety rests on it being **unwired** and on `LIVE_TRADING_ENABLED` being a
`false` constant. A future developer who (1) imports `openLive` into `watch.ts`,
(2) flips the flag, (3) sets the env phrase and (4) opens every gate could trade.
That is the intended, human-gated activation path — but it means the tree is not
*incapable* of live trading, only *not currently wired for it*.

**Recommendations (both now implemented):**
- Keep the self-test assertion `LIVE_TRADING_ENABLED === false` as a CI gate
  (present: `selftest.ts:359`). ✅
- A CI guard that fails if any file outside the allow-list imports the order
  path — turning "unwired" into an **enforced invariant** rather than a property
  that merely happens to hold today. ✅ **Implemented:**
  `test/orderPathGuard.test.ts`.

### The order-path guard (`test/orderPathGuard.test.ts`)

Six assertions, run on every CI build:

1. **Nothing in the running application imports the order path.** Any file
   outside `src/live/{trader,orders,reconcile}.ts` and
   `src/exchange/binanceTrade.ts` that imports it fails the build, naming the
   offending file.
2. Order-placing methods (`marketBuy`/`marketSell`/`ocoSell`/`cancelAll`) appear
   in exactly two files and nowhere else.
3. The write-capable endpoints (`/api/v3/order`, `/api/v3/orderList`) stay inside
   the trade adapter.
4. No HTTP route the server registers looks like it could submit an order, and
   `/api/live/status` does not accept POST.
5. `LIVE_TRADING_ENABLED`, `config.live.enabled` and `config.shadow.enabled` are
   all still `false`.
6. This audit document still describes the tree it audited.

The guard was **verified to fail**, not merely to pass: importing `openLive` into
`src/watch.ts` makes assertion 1 fail and print the offending path with an
explanation. A guard that has never been seen to fire is not evidence of
anything.

---

## Verdict

**Every enumerated live-order path is SAFE.** No accidental real-order path
exists in the current tree. The system is paper-only in practice and in
principle for the running application; activating live trading is a deliberate,
multi-gate, human action that is not wired up.
