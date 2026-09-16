# PAPER VALIDATION RUNBOOK — Mr. Cash (TITAN)

Operational steps to run the extended paper-validation stage and read its
output. Paper only — nothing here can place a real order. Pair with
`docs/PAPER_VALIDATION_PLAN.md` (the what/why) and
`docs/PAPER_VALIDATION_RESULTS.md` (the living record).

---

## 0. Before you start — confirm the safety posture

```bash
npm run typecheck        # type gate (no build step in this project)
npm run selftest         # asserts LIVE_TRADING_ENABLED === false, among ~80 checks
npm test                 # full suite incl. test/paper/validation.test.ts
```

All three must pass. The self-test refuses to pass if the live flag is ever
flipped, so a green self-test is your proof the run is paper-only.

---

## 1. Freeze the profile

The profile is already frozen in `config.ts` under `paperValidation` and the
blocks it references (`symbol`, `interval`, `strategy`, `execution`, `risk`,
`ict`, `data`). **Do not edit these during a run.** If you must change one,
that is a deliberate reset: bump `config.paperValidation.profile` (e.g.
`PAPER_VALIDATION-1` → `-2`) and start the sample over. The frozen snapshot is
visible at the top of the daily report and in `GET /api/validation` →
`data.profile`.

---

## 2. Run it 24/7

Either the app (dashboard + loop) or the headless loop:

```bash
npm start        # the web app on :4173, watch loop running, Validation tab live
# or
npm run watch    # headless 24/7 loop in a terminal
```

The loop reacts to every closed candle (with a safety poll every
`app.watchEveryMinutes`), takes only setups that pass the full checklist **and**
the risk engine, fills them on the honest simulator, records the observed book
spread at decision time, and captures the **regime** the engine read. Refused
real setups are recorded in the no-trade journal with the reason. On restart it
re-adopts open positions (`recovery.ts`), so soak survives a bounce — but note
that the soak *clock* measures **continuous** uptime and resets on restart.

Keep the data directory (`MRCASH_DATA_DIR`, default `./data`) on durable
storage. The store (SQLite) is the source of truth; `data/positions.json`,
`data/equity.csv` and `data/ledger.csv` are readable mirrors.

---

## 3. Watch the validation

**Dashboard:** open the **Validation** tab (✅). It shows, top to bottom:

- the **gate progress bar** and the verdict badge (INSUFFICIENT SAMPLE until
  every gate is met), with each gate's current value vs its threshold;
- per-strategy performance vs the backtest;
- breakdowns by regime and by session;
- the decay monitor;
- strategy correlation / redundancy;
- order-flow honesty (REAL / ESTIMATED / UNAVAILABLE) and data quality;
- system soak, AI ↔ engine consistency, and shadow readiness;
- the frozen profile line.

**API:**

```bash
curl -s localhost:4173/api/validation | jq .data.gates.verdict
curl -s "localhost:4173/api/validation?format=text"      # the daily report as text
```

---

## 4. The daily report

`GET /api/validation?format=text` renders the full **PAPER VALIDATION REPORT**:
profile, verdict + gate checklist, per-strategy numbers, paper-vs-OOS, regime and
session breakdowns, decay, correlation, order-flow, data quality, soak, AI
consistency, shadow readiness, and the standing reminder that *paper is
validation data — do not tune to it*.

To capture it daily, save the text output on a schedule (cron, a systemd timer,
or a scheduled session):

```bash
mkdir -p data/validation-reports
curl -s "localhost:4173/api/validation?format=text" \
  > "data/validation-reports/$(date +%F).txt"
```

Append the day's verdict line and anything notable to
`docs/PAPER_VALIDATION_RESULTS.md`.

---

## 5. What to do about findings — and what NOT to do

- **A strategy looks weak on a thin sample** → do nothing but wait. The gate
  will read INSUFFICIENT SAMPLE for a reason. **Do not tune it.**
- **A strategy is DECAYING on a sufficient sample** → this is a deliberate
  vault action (demote to `watch` / `retired`), not a parameter tweak.
- **Two strategies are in a redundant cluster** → note it; it means their votes
  double-count. A decision to drop one is deliberate and recorded — again, not a
  parameter change mid-sample.
- **Order flow is mostly UNAVAILABLE** → the tape wasn't trusted; investigate the
  feed/stream, not the strategy. Never relabel UNAVAILABLE as REAL.
- **Data quality < 95%** → a feed problem. Fix the connection; do not lower the
  gate to pass.
- **Paper materially below OOS on a sufficient sample** → the backtest was
  flattering; record it. This is exactly the outcome paper validation exists to
  catch. It informs whether the strategy proceeds — it does not authorise
  curve-fitting.

The single forbidden move is changing a rule or parameter *because of a paper
result*. If the profile genuinely must change, reset the sample (§1).

---

## 6. Preparing shadow (do NOT activate here)

When the paper gates read GATES MET and a **read-only** exchange key is present,
`GET /api/validation` → `data.shadow.status` becomes `SHADOW_READY`. That is a
signal, not an action. To actually begin shadow (a separate stage):

1. Add a **read-only** `EXCHANGE_API_KEY` / `EXCHANGE_API_SECRET` to `.env`
   (the doctor refuses a key that can withdraw).
2. Set `config.shadow.enabled = true`.
3. Run `npm run doctor` to confirm the key is read-only and reachable.

Nothing in the validation stage flips these. Shadow still sends no orders; it
builds the order it *would* send and scores it from real trades.

---

## 7. Rollback / stop

- **Kill switch:** the app's stop button (or `npm run stop`) blocks new entries
  immediately; open paper positions are still managed to stop/target.
- **Full stop:** Ctrl-C the loop. State is durable; restarting re-adopts open
  positions. The soak clock restarts.
