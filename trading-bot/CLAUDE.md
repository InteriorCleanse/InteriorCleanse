# Mr. Cash — working in this repository

Mr. Cash is a paper-trading bot: live BTCUSDT prices, simulated fills, no
exchange account, no real money. Node 22+, TypeScript run directly, zero
runtime dependencies, SQLite through `node:sqlite`. This file is the standing
brief for any Claude Code session in `trading-bot/`; the project skills in
`.claude/skills/mr-cash-*` are the bot's own hats.

## Rules that do not bend

- **Do not change how Mr. Cash decides to trade.** No edits to strategies,
  entry or exit logic, risk, sizing, fusion, regime rules, strategy parameters,
  validation thresholds, execution assumptions, the frozen paper-validation
  profile, or `config.ts`. If a task seems to need one, stop and report the
  conflict. A strategy change happens only through research → out-of-sample →
  walk-forward → robustness → human review → paper test.
- **Never enable live or shadow trading**, touch the live-execution gate, loosen
  an execution gate, or add a second execution path.
- **Never manufacture data**: no fake trades, fills, signals, observations,
  prices, timestamps or outcomes. Test fixtures are labelled TEST FIXTURE /
  SYNTHETIC and stay in temporary data directories.
- **Every surface labels its data**: MOCK, REPLAY, BACKTEST, PAPER, LIVE. Thin
  records say NOT ENOUGH DATA or INSUFFICIENT SAMPLE, never an estimate.
- **No profitability language** anywhere in code, UI or docs: not profitable,
  proven, guaranteed, best, superior, edge established, expected return.
- **No hindsight**: decision-time knowledge and outcomes are never mixed.
- **Security stays as it is**: CSP with nonces, PIN and throttling, CSRF,
  constant-time comparisons, security headers. Secrets are never printed into
  code or docs. No new dependencies without a stated reason.
- Learning stays read-only over the record; reuse existing stores and the
  research scheduler rather than adding another.

## Data directories

`MRCASH_DATA_DIR` selects the data directory. The owner's real paper record
lives in `data-soak/` on their Windows PC. **Never run `npm test` in a shell
where `MRCASH_DATA_DIR` points at a real data directory**; the test setup
refuses a preset directory outside the OS temp folder, but keep the habit.
One process per data directory: the lock refuses a second one.

## Verify before you push

```bash
npm run typecheck        # tsc --noEmit; expect no "error TS" lines
npm run selftest         # 80 checks, no network
npm test                 # node --test; ~890 tests
npm run ui:smoke         # needs the app running on BASE_URL; 22 tabs at 1180 and 400 px
```

The development container cannot reach the exchange or news hosts. Run the
app against the mock feed for UI work (`MRCASH_MARKET_URL` and
`MRCASH_NEWS_URL` pointing at a local mock, `MRCASH_STREAM=0`) on a scratch
data directory, never against `data/`.

## Layout

- `src/` engine: `watch.ts` loop, `paperTrader.ts` record, `fusion.ts`,
  `riskEngine.ts`, `strategies/`, `features/`, `data/` feed and candle store,
  `ops/` heartbeat, lock, integrity, reconciliation, checkpoints, day report,
  first-fill verifier, `desk/` the six agents and the signal core, `learning/`,
  `research/`, `knowledge/`, `school/`, `observer/`, `security/`.
- `web/` the app: `index.html` plus `js/*.js` (one file per tab family) and
  `css/app.css`. External scripts only; the CSP has no `unsafe-inline` for
  script.
- `test/` mirrors `src/`; `test/setup.ts` isolates the data directory.
- `docs/` runbooks and contracts. Start with `PAPER_SOAK_RUNBOOK.md`,
  `FIRST_FILL_ACCEPTANCE.md`, `SIGNAL_CORE.md`, `QUANT_LAB.md`, `SECURITY.md`.

## Reporting

Separate what the software verified from what the market has shown. With
zero real paper trades the honest line is NOT ENOUGH REAL PAPER DATA. Commit
messages carry no model identifiers.
