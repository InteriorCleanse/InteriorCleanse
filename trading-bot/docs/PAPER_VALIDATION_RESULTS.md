# PAPER VALIDATION RESULTS — Mr. Cash (TITAN)

The living record of the extended paper-validation run. It is **data, not
opinion**: every number here comes from `GET /api/validation` over the real
paper record, and nothing is edited to look better than it is. Until every gate
in `docs/PAPER_VALIDATION_PLAN.md` is met, the verdict is **INSUFFICIENT
SAMPLE** — and that is the correct, honest state, not a failure.

**Do not tune any parameter to anything on this page.** Paper is validation
data. Findings here inform deliberate vault actions (demote/retire) and the
go/no-go into shadow; they never authorise curve-fitting.

---

## Current verdict

**INSUFFICIENT SAMPLE** — the run has not yet accumulated the sample the gates
require. This is expected at the start of the stage. Fill in the snapshot below
from the daily report as the run progresses (see the runbook §4).

### Baseline snapshot (stage set-up, zero trades)

Captured from `renderDailyReport` over an empty record, to show the starting
point and prove the tool refuses to invent data:

```
PAPER VALIDATION REPORT — <date>
Profile PAPER_VALIDATION-1 · BTCUSDT 5m · live trading disabled

VERDICT: INSUFFICIENT SAMPLE  (0/9 gates, 0%)
  [ ] Total taken trades: 0 trades / 40
  [ ] Trades per strategy: — trades / 20        (no strategy has traded yet)
  [ ] Calendar span: 0 weeks / 4
  [ ] Regimes covered: 0 regimes / 2
  [ ] Sessions covered: 0 sessions / 2
  [ ] Data quality: — % / 95                     (no signals seen yet)
  [ ] Paper vs out-of-sample: — R shortfall / 0.1
  [ ] Max drawdown: — % / 25                      (no closed trades yet)
  [ ] System soak: 0 hours / 168

SHADOW: NOT_READY (0 scored orders)
  blocker: Paper gates not met yet (0/9)
  blocker: No read-only exchange key is present

Reminder: paper is validation data. Do not tune any parameter to these results.
```

Every `—` and every unchecked box is a number the system will not fake. As the
run gathers real trades, the boxes fill from real data only.

---

## How to update this page

1. Once a day, save the report: `curl -s "localhost:4173/api/validation?format=text"`.
2. Paste the latest **VERDICT** block and the per-strategy / regime / session
   tables under a dated heading below.
3. Note anything that crossed a threshold, any DECAYING strategy, any redundant
   cluster, and any gap between paper and out-of-sample.
4. When (if) the verdict reads **GATES MET**, record it here, then review before
   *preparing* shadow — activation remains a separate, deliberate step.

---

## Log

### <date> — stage set up

- Validation engine, gates, journals, breakdowns, decay, correlation, AI-consistency,
  soak and shadow-readiness wired and tested. Verdict: **INSUFFICIENT SAMPLE (0/9)** —
  the run has just begun. No findings yet; nothing tuned.

<!-- Add dated entries above this line as the run progresses. -->

---

## Findings & actions (deliberate, recorded)

None yet. When a *sufficient* sample surfaces a real issue (decay, redundancy,
paper materially below out-of-sample), record the finding and the deliberate
action here — demotion, retirement, or a go/no-go — with the date and the
evidence. Parameter tuning is never a valid action at this stage.
