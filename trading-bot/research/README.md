# research/ — the Python research bench

Two backtesting libraries, kept **outside** the bot. Nothing in `src/` imports
anything here, Mr. Cash keeps zero runtime dependencies, and every result is
labelled **BACKTEST**. Full guide: `docs/RESEARCH_TOOLS.md`.

| File | What it does |
|---|---|
| `setup.sh` / `setup.ps1` | Builds `.venv-vbt` and `.venv-hbt` and runs both selftests. |
| `requirements-vectorbt.txt` | vectorbt 1.1.0 (plotly held below 6: plotly 6+ breaks vectorbt's import). |
| `requirements-hftbacktest.txt` | hftbacktest 2.4.4. It pins a different NumPy, hence a second venv. |
| `vbt_sweep.py` | Parameter sweep with an in-sample / out-of-sample split, fees and slippage charged. |
| `hbt_mm.py` | Tick-level market-making study: queue position, latency, fees. |
| `data/` | CSVs from `npm run research:export` (gitignored). |
| `out/` | Reports (gitignored). |

```bash
bash research/setup.sh
npm run research:export -- --symbol BTCUSDT --interval 5m
research/.venv-vbt/bin/python research/vbt_sweep.py --csv research/data/BTCUSDT_5m.csv
research/.venv-hbt/bin/python research/hbt_mm.py --selftest
```

Selftests run on SYNTHETIC data to prove the install works; they are not
findings. A result that looks worth pursuing goes through the repository's
pipeline (research → out-of-sample → walk-forward → robustness → human review
→ paper test) and never straight into `src/` or `config.ts`.
