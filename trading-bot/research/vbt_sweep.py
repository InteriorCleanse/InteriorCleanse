"""
BACKTEST research with vectorbt on candles Mr. Cash recorded.

    npm run research:export -- --symbol BTCUSDT --interval 5m
    research/.venv-vbt/bin/python research/vbt_sweep.py --csv research/data/BTCUSDT_5m.csv

A moving-average crossover sweep, used as a TEXTBOOK example to show the
method; it is not Mr. Cash's strategy. The method is what matters:
  1. split the history: the first part (in-sample) is where parameters are
     chosen, the rest (out-of-sample) is never looked at until the end;
  2. try a grid of parameters in-sample, with fees and slippage charged;
  3. carry only the top few to out-of-sample and report both, side by side,
     with how many combinations were tried (more tries, more luck).

Everything written is labelled BACKTEST. Nothing here changes how Mr. Cash
trades: a result becomes a strategy change only through the repository's
research -> out-of-sample -> walk-forward -> robustness -> human review ->
paper test pipeline (see trading-bot/CLAUDE.md).

`--selftest` runs on a SYNTHETIC random walk to prove the install works.
"""
import argparse
import datetime as dt
import json
import pathlib
import sys

import numpy as np
import pandas as pd
import vectorbt as vbt

HERE = pathlib.Path(__file__).resolve().parent


def load(path: pathlib.Path) -> pd.Series:
    df = pd.read_csv(path)
    need = {"open_time_ms", "close"}
    if not need.issubset(df.columns):
        sys.exit(f"{path} is missing columns {need - set(df.columns)}; export it with `npm run research:export`.")
    idx = pd.to_datetime(df["open_time_ms"], unit="ms", utc=True)
    return pd.Series(df["close"].astype(float).values, index=idx, name="close")


def synthetic(n: int = 3000, seed: int = 7) -> pd.Series:
    """SYNTHETIC: a seeded random walk. Not market data."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2026-01-01", periods=n, freq="5min", tz="UTC")
    return pd.Series(100 * np.exp(np.cumsum(rng.normal(0, 0.002, n))), index=idx, name="close")


def run(close: pd.Series, pairs, fees: float, slippage: float, freq: str):
    fast = vbt.MA.run(close, window=[f for f, _ in pairs], short_name="fast")
    slow = vbt.MA.run(close, window=[s for _, s in pairs], short_name="slow")
    entries = fast.ma_crossed_above(slow)
    exits = fast.ma_crossed_below(slow)
    return vbt.Portfolio.from_signals(close, entries, exits, fees=fees, slippage=slippage, freq=freq)


def rows(pf, pairs):
    ret, sharpe, dd, trades = pf.total_return(), pf.sharpe_ratio(), pf.max_drawdown(), pf.trades.count()
    out = []
    for k, (f, s) in enumerate(pairs):
        out.append({
            "fast": f, "slow": s,
            "total_return_pct": round(float(ret.iloc[k]) * 100, 3),
            "sharpe": None if not np.isfinite(sharpe.iloc[k]) else round(float(sharpe.iloc[k]), 3),
            "max_drawdown_pct": round(float(dd.iloc[k]) * 100, 3),
            "trades": int(trades.iloc[k]),
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", type=pathlib.Path)
    ap.add_argument("--selftest", action="store_true", help="run on a SYNTHETIC random walk")
    ap.add_argument("--fast", default="5,10,20,30", help="fast MA windows")
    ap.add_argument("--slow", default="50,100,150,200", help="slow MA windows")
    ap.add_argument("--fees", type=float, default=0.001, help="fee per side as a fraction (0.001 = 0.1%%)")
    ap.add_argument("--slippage", type=float, default=0.0005, help="slippage per side as a fraction")
    ap.add_argument("--split", type=float, default=0.7, help="share of history used in-sample")
    ap.add_argument("--top", type=int, default=3, help="how many in-sample picks to carry out-of-sample")
    ap.add_argument("--min-trades", type=int, default=5)
    a = ap.parse_args()

    if a.selftest:
        close, source = synthetic(), "SYNTHETIC random walk (selftest)"
    elif a.csv:
        close, source = load(a.csv), str(a.csv)
    else:
        ap.error("pass --csv FILE or --selftest")

    step = close.index.to_series().diff().median()
    freq = f"{int(step.total_seconds() // 60)}min" if step.total_seconds() < 86400 else "1D"
    cut = int(len(close) * a.split)
    if cut < 300 or len(close) - cut < 150:
        print(f"NOT ENOUGH DATA: {len(close)} candles. Needs at least ~450 so both halves mean something.")
        return 2

    pairs = [(f, s) for f in map(int, a.fast.split(",")) for s in map(int, a.slow.split(",")) if f < s]
    ins, oos = close.iloc[:cut], close.iloc[cut:]
    ins_rows = rows(run(ins, pairs, a.fees, a.slippage, freq), pairs)
    eligible = [r for r in ins_rows if r["trades"] >= a.min_trades and r["sharpe"] is not None]
    picks = sorted(eligible, key=lambda r: r["sharpe"], reverse=True)[: a.top]
    oos_rows = rows(run(oos, [(r["fast"], r["slow"]) for r in picks], a.fees, a.slippage, freq), [(r["fast"], r["slow"]) for r in picks]) if picks else []

    report = {
        "label": "BACKTEST",
        "method": "moving-average crossover sweep (textbook example, not Mr. Cash's strategy)",
        "data": {"source": source, "candles": len(close), "from": str(close.index[0]), "to": str(close.index[-1]), "freq": freq},
        "costs": {"fee_per_side": a.fees, "slippage_per_side": a.slippage},
        "split": {"in_sample_candles": cut, "out_of_sample_candles": len(close) - cut},
        "combinations_tried": len(pairs),
        "in_sample_picks": picks,
        "out_of_sample": oos_rows,
        "caveat": "Chosen in-sample from %d combinations; the more combinations tried, the more a good in-sample number can be luck. "
                  "Read the out-of-sample column, and treat even that as one sample. This is a BACKTEST, not evidence the method works live." % len(pairs),
    }
    out_dir = HERE / "out"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"vbt_sweep_{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}.json"
    out.write_text(json.dumps(report, indent=2))

    print(f"BACKTEST · {source} · {len(close)} candles · {len(pairs)} combinations tried")
    print(f"{'pair':>9}  {'in-sample ret%':>14} {'sharpe':>7} {'trades':>6}  |  {'out-of-sample ret%':>18} {'sharpe':>7} {'trades':>6}")
    for i, p in enumerate(picks):
        o = oos_rows[i] if i < len(oos_rows) else {}
        print(f"{p['fast']:>4}/{p['slow']:<4}  {p['total_return_pct']:>14} {str(p['sharpe']):>7} {p['trades']:>6}  |  {str(o.get('total_return_pct')):>18} {str(o.get('sharpe')):>7} {str(o.get('trades')):>6}")
    if not picks:
        print(f"No combination made {a.min_trades}+ trades in-sample: NOT ENOUGH DATA to pick anything.")
    print(f"Report: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
