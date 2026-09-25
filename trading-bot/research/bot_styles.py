"""
BACKTEST the two bot styles the big retail platforms sell most (3Commas,
Pionex, Cryptohopper, Bitsgap): the GRID bot and the DCA bot, on candles
Mr. Cash recorded. Research only; Mr. Cash does not run either.

    npm run research:export -- --symbol BTCUSDT --interval 1h
    research/.venv-vbt/bin/python research/bot_styles.py --csv research/data/BTCUSDT_1h.csv

Both are simulated candle by candle with fees charged on every fill, next to
simply buying at the start and holding, so each is compared with doing
nothing clever. The point is to see how each behaves: a grid collects small
swings in a range and is left holding coins in a fall; a DCA bot averages
down and is only as good as the recovery it waits for.

Assumptions (printed with the result): fills at the grid price when a
candle's range crosses it, no slippage beyond the fee, no funding, no
exchange minimums. Real bots differ in all of these.

`--selftest` runs on a SYNTHETIC random walk to prove the script works.
"""
import argparse
import datetime as dt
import json
import pathlib
import sys

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent


def load(path: pathlib.Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    need = {"open_time_ms", "high", "low", "close"}
    if not need.issubset(df.columns):
        sys.exit(f"{path} is missing columns {need - set(df.columns)}; export it with `npm run research:export`.")
    return df


def synthetic(n: int = 2000, seed: int = 9) -> pd.DataFrame:
    """SYNTHETIC: a seeded random walk with wicks. Not market data."""
    rng = np.random.default_rng(seed)
    close = 100 * np.exp(np.cumsum(rng.normal(0, 0.006, n)))
    wick = np.abs(rng.normal(0, 0.003, n)) * close
    return pd.DataFrame({"open_time_ms": np.arange(n) * 3_600_000, "high": close + wick, "low": close - wick, "close": close})


def grid_bot(df: pd.DataFrame, levels: int, width: float, capital: float, fee: float) -> dict:
    """A spot grid centred on the first close: buy one slot at each level below, sell it one level up."""
    p0 = float(df["close"].iloc[0])
    lo, hi = p0 * (1 - width), p0 * (1 + width)
    grid = np.linspace(lo, hi, levels)
    slot = capital / levels
    cash, coins, fills = capital, 0.0, 0
    holding = np.zeros(levels, dtype=bool)  # a slot bought at grid[i] waits to sell at grid[i+1]
    # Start: slots above the price are pre-bought (as real grids do), so they can sell on the way up.
    for i, g in enumerate(grid[:-1]):
        if g >= p0:
            qty = slot / p0
            cash -= slot * (1 + fee); coins += qty; holding[i] = True
    for hi_c, lo_c in zip(df["high"].to_numpy(), df["low"].to_numpy()):
        for i in range(levels - 1):
            if not holding[i] and lo_c <= grid[i] and cash >= slot:
                cash -= slot * (1 + fee); coins += slot / grid[i]; holding[i] = True; fills += 1
            elif holding[i] and hi_c >= grid[i + 1]:
                qty = slot / grid[i]
                cash += qty * grid[i + 1] * (1 - fee); coins -= qty; holding[i] = False; fills += 1
    last = float(df["close"].iloc[-1])
    value = cash + coins * last
    return {"final_value": round(value, 2), "return_pct": round((value / capital - 1) * 100, 3), "fills": fills,
            "coins_left": round(coins, 6), "grid": {"low": round(lo, 4), "high": round(hi, 4), "levels": levels},
            "left_the_grid": bool(df["low"].min() < lo or df["high"].max() > hi)}


def dca_bot(df: pd.DataFrame, base: float, safety: float, step: float, scale: float, max_safety: int, take_profit: float, fee: float) -> dict:
    """The classic DCA deal: a base buy, safety buys each `step` lower (scaled up), sell everything at `take_profit` above the average."""
    cash_used = peak_used = 0.0
    realised = 0.0
    deals = 0
    qty = cost = 0.0
    n_safety = 0
    next_buy = None
    for close, hi_c, lo_c in zip(df["close"].to_numpy(), df["high"].to_numpy(), df["low"].to_numpy()):
        if qty == 0:
            qty = base / close; cost = base * (1 + fee); cash_used += cost; n_safety = 0
            next_buy = close * (1 - step)
            peak_used = max(peak_used, cash_used)
            continue
        avg = cost / qty
        if hi_c >= avg * (1 + take_profit):
            proceeds = qty * avg * (1 + take_profit) * (1 - fee)
            realised += proceeds - cost; cash_used -= cost; qty = cost = 0.0; deals += 1
            continue
        if n_safety < max_safety and lo_c <= next_buy:
            amount = safety * (scale ** n_safety)
            qty += amount / next_buy; cost += amount * (1 + fee); cash_used += amount * (1 + fee)
            n_safety += 1; next_buy = next_buy * (1 - step)
            peak_used = max(peak_used, cash_used)
    last = float(df["close"].iloc[-1])
    open_value = qty * last - cost if qty else 0.0
    total = realised + open_value
    return {"closed_deals": deals, "realised_pnl": round(realised, 2), "open_deal_pnl": round(open_value, 2), "total_pnl": round(total, 2),
            "peak_capital_tied_up": round(peak_used, 2), "return_on_peak_pct": round(total / peak_used * 100, 3) if peak_used else None,
            "stuck_in_open_deal": bool(qty > 0)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", type=pathlib.Path)
    ap.add_argument("--selftest", action="store_true", help="run on a SYNTHETIC random walk")
    ap.add_argument("--capital", type=float, default=1000.0)
    ap.add_argument("--fee", type=float, default=0.001, help="per fill, as a fraction (0.001 = 0.1%%)")
    ap.add_argument("--grid-levels", type=int, default=20)
    ap.add_argument("--grid-width", type=float, default=0.10, help="grid spans this fraction above and below the start price")
    ap.add_argument("--dca-base", type=float, default=50.0)
    ap.add_argument("--dca-safety", type=float, default=50.0)
    ap.add_argument("--dca-step", type=float, default=0.02)
    ap.add_argument("--dca-scale", type=float, default=1.5)
    ap.add_argument("--dca-max-safety", type=int, default=5)
    ap.add_argument("--dca-tp", type=float, default=0.015)
    a = ap.parse_args()

    if a.selftest:
        df, source = synthetic(), "SYNTHETIC random walk (selftest)"
    elif a.csv:
        df, source = load(a.csv), str(a.csv)
    else:
        ap.error("pass --csv FILE or --selftest")
    if len(df) < 200:
        print(f"NOT ENOUGH DATA: {len(df)} candles. Needs at least 200 for either bot to show its behaviour.")
        return 2

    first, last = float(df["close"].iloc[0]), float(df["close"].iloc[-1])
    hold = {"return_pct": round((last * (1 - a.fee) / (first * (1 + a.fee)) - 1) * 100, 3)}
    grid = grid_bot(df, a.grid_levels, a.grid_width, a.capital, a.fee)
    dca = dca_bot(df, a.dca_base, a.dca_safety, a.dca_step, a.dca_scale, a.dca_max_safety, a.dca_tp, a.fee)
    report = {
        "label": "BACKTEST",
        "data": {"source": source, "candles": len(df)},
        "assumptions": {"fee_per_fill": a.fee, "fills": "at the grid or safety price when a candle's range crosses it", "slippage": "none beyond the fee", "funding": "none"},
        "buy_and_hold": hold, "grid_bot": grid, "dca_bot": dca,
        "caveat": "One history, one set of settings. Grid results depend on the price staying inside the grid; DCA results depend on the price coming back. This is a BACKTEST of behaviour, not evidence either style works live.",
    }
    out_dir = HERE / "out"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"bot_styles_{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}.json"
    out.write_text(json.dumps(report, indent=2))
    print(f"BACKTEST · {source} · {len(df)} candles · fee {a.fee} per fill")
    print(f"  buy and hold : {hold['return_pct']}%")
    print(f"  grid bot     : {grid['return_pct']}% · {grid['fills']} fills · left the grid: {grid['left_the_grid']}")
    print(f"  dca bot      : {dca['total_pnl']} on {dca['peak_capital_tied_up']} peak capital · {dca['closed_deals']} deals closed · stuck in a deal: {dca['stuck_in_open_deal']}")
    print(f"Report: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
