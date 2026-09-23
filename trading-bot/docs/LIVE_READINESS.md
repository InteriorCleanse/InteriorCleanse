# Live-trading readiness

**Status today: NOT READY. Paper only. This is correct, not a bug.**

The live-execution machinery is built and dormant (Phase 20). Making it ready
is not a code step — the code is done — it is an evidence-and-review process.
This page is the honest, complete list of what must be true before one real
dollar, why each item exists, and how to check it. Nothing here enables live
trading; enabling is deliberately manual and multi-key.

## The gate chain (run it yourself)

```bash
npm run live:check
```

Every gate must pass at once before any order-placing code can run. Current
state:

| Gate | Now | What it means |
|---|---|---|
| Hard flag `LIVE_TRADING_ENABLED` | ✗ false | The top-level switch ships false and blocks all live code. |
| `config.live.enabled` | ✗ false | The config block is off. |
| Env phrase `MRCASH_LIVE` | ✗ unset | Must equal `I_UNDERSTAND_REAL_MONEY`. |
| Typed confirmation | ✗ | A human must type `ARM LIVE TRADING`. |
| Testnet track record | ✗ 0/20 | 20 reconciled testnet trades required first. |
| Guard | ✓ | The app guard is present. |
| Kill switch | ✓ | Clear. |
| Feed health | ✓ | The market feed is fresh. |

Five of eight are closed by design. Two of the five (the flag and the config)
are code you must change on purpose; the other three are a phrase, a typed
confirmation, and a testnet record that does not yet exist.

## The remaining steps, in order

These are prerequisites, not switches to flip early. Do them in sequence.

1. **Real paper evidence.** Run the soak until the validation gates pass:
   `/api/validation` must read all gates met, on a real PAPER record (not
   MOCK), with enough closed trades across enough sessions and regimes. Today
   that is 0 of 9. This is the single biggest gap. See
   `docs/PAPER_VALIDATION_PLAN.md` and `docs/PAPER_SOAK_RUNBOOK.md`.
2. **First-fill acceptance and checkpoints reviewed.** Operations → First fill
   ACCEPTED, and the paper checkpoints (10/25/50/100/200) marked reviewed by
   you. See `docs/FIRST_FILL_ACCEPTANCE.md`.
3. **A broker/exchange account with API keys**, funded only with money you can
   lose. Keys go in the environment, never the repo (`docs/BROKER.md`).
4. **Testnet first.** Point live at the venue's testnet (`config.live.venue`
   stays `testnet`) and run until there are at least 20 reconciled testnet
   trades with zero mismatches (`/api/ops/reconciliation`).
5. **Security review of the diff** that turns anything on: run the vendored
   secret-scanning and dependency checks and Claude Code's `/security-review`.
   Confirm keys never enter the repo, the record, or the logs.
6. **Human sign-off.** Read the caps below and accept them. Nobody but you
   arms this.
7. **Arm, at the smallest size.** Only then set the flag, the config, the env
   phrase, and type the confirmation — all four — and start with the caps at
   their floor.

## The hard caps once (if ever) armed

From `config.live`, enforced on top of the risk engine:
- `maxNotionalUsd: 25` — a trade risks at most $25 of notional.
- `maxTradesPerDay: 3`.
- `maxOpenPositions: 1`.
- `venue: testnet` until you change it by hand.

Start here. Do not raise a cap until a live record justifies it, the same way
paper had to.

## What will not be done automatically

- The bot will never arm itself. No research result, no green gate, no
  schedule flips it to live. Arming is a manual, multi-key human act.
- No profitability is promised. Passing the gates is a passed validation
  stage, not proof of an edge, and never a guarantee of a return.
- Real money is the last step. Everything shipped so far — the desk, the
  brain, the fleet, the read-only portfolio — is look, not touch.

## Honest bottom line

The software is ready to be *evaluated*. It is not ready to *trade live*,
because it has no real track record yet. The remaining work is time on the
paper soak and your review, not more code.
