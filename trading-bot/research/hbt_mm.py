"""
MARKET-MAKING STUDY with hftbacktest: queue position, latency and fees
modelled tick by tick. Research only; nothing here trades.

    research/.venv-hbt/bin/python research/hbt_mm.py --selftest
    research/.venv-hbt/bin/python research/hbt_mm.py --data day1.npz --snapshot eod.npz --tick 0.1 --lot 0.001

The quoting logic is hftbacktest's own basic market-making example (quote a
spread around mid, skew away from inventory, cap the position), kept small
so every step can be read. It exists to study HOW market making behaves:
fills, inventory swings, adverse selection, fees and rebates. It is not a
strategy for Mr. Cash, and Mr. Cash does not market-make.

Real data: hftbacktest's own converters produce the .npz files, for example
from Binance's historical market data or its Rust collector (see
docs/RESEARCH_TOOLS.md). Without real depth and trade data a market-making
backtest says nothing, so the selftest runs on a SYNTHETIC order book only
to prove the install works.
"""
import argparse
import sys

import numpy as np
from numba import njit

from hftbacktest import (BUY, BUY_EVENT, DEPTH_EVENT, EXCH_EVENT, GTX, LIMIT, LOCAL_EVENT, SELL, SELL_EVENT, TRADE_EVENT,
                         BacktestAsset, HashMapMarketDepthBacktest, Recorder, event_dtype)
from hftbacktest.stats import LinearAssetRecord


def synthetic_book(n_steps: int = 20_000, tick: float = 0.1, seed: int = 11) -> np.ndarray:
    """SYNTHETIC: a random-walk top of book with random trades. Not market data."""
    rng = np.random.default_rng(seed)
    rows = []
    mid_tick = 1_000_000  # 100,000.0 at tick 0.1
    t = 1_700_000_000_000_000_000  # nanoseconds
    prev_bid = prev_ask = None
    flags = EXCH_EVENT | LOCAL_EVENT
    for _ in range(n_steps):
        t += 100_000_000  # 100 ms
        mid_tick += int(rng.choice([-1, 0, 0, 1]))
        bid, ask = mid_tick - 1, mid_tick + 1
        if prev_bid is not None and prev_bid != bid:
            rows.append((flags | DEPTH_EVENT | BUY_EVENT, t, t + 1_000_000, prev_bid * tick, 0.0, 0, 0, 0.0))
        if prev_ask is not None and prev_ask != ask:
            rows.append((flags | DEPTH_EVENT | SELL_EVENT, t, t + 1_000_000, prev_ask * tick, 0.0, 0, 0, 0.0))
        rows.append((flags | DEPTH_EVENT | BUY_EVENT, t, t + 1_000_000, bid * tick, float(rng.uniform(0.5, 3.0)), 0, 0, 0.0))
        rows.append((flags | DEPTH_EVENT | SELL_EVENT, t, t + 1_000_000, ask * tick, float(rng.uniform(0.5, 3.0)), 0, 0, 0.0))
        if rng.random() < 0.3:
            side = SELL_EVENT if rng.random() < 0.5 else BUY_EVENT  # the aggressor's side
            px = bid if side == SELL_EVENT else ask
            rows.append((flags | TRADE_EVENT | side, t + 50_000_000, t + 51_000_000, px * tick, float(rng.uniform(0.01, 2.0)), 0, 0, 0.0))
        prev_bid, prev_ask = bid, ask
    return np.array(rows, dtype=event_dtype)


@njit
def quote(hbt, recorder, half_spread_ticks, skew, max_position, order_qty):
    """hftbacktest's basic market-making loop: quote around mid, lean against inventory, respect a position cap."""
    asset_no = 0
    while hbt.elapse(100_000_000) == 0:  # every 100 ms
        hbt.clear_inactive_orders(asset_no)
        depth = hbt.depth(asset_no)
        tick = depth.tick_size
        if depth.best_bid_tick <= 0 or depth.best_ask_tick <= 0:
            recorder.record(hbt)
            continue
        position = hbt.position(asset_no)
        mid = (depth.best_bid + depth.best_ask) / 2.0
        reservation = mid - skew * position * tick
        bid_tick = min(np.round((reservation - half_spread_ticks * tick) / tick), depth.best_bid_tick)
        ask_tick = max(np.round((reservation + half_spread_ticks * tick) / tick), depth.best_ask_tick)
        orders = hbt.orders(asset_no)
        values = orders.values()
        update_bid, update_ask = True, True
        while values.has_next():
            o = values.get()
            if o.side == BUY:
                if o.price_tick == bid_tick:
                    update_bid = False
                elif o.cancellable:
                    hbt.cancel(asset_no, o.order_id, False)
            elif o.side == SELL:
                if o.price_tick == ask_tick:
                    update_ask = False
                elif o.cancellable:
                    hbt.cancel(asset_no, o.order_id, False)
        if update_bid and position < max_position:
            hbt.submit_buy_order(asset_no, bid_tick, bid_tick * tick, order_qty, GTX, LIMIT, False)
        if update_ask and position > -max_position:
            hbt.submit_sell_order(asset_no, ask_tick, ask_tick * tick, order_qty, GTX, LIMIT, False)
        recorder.record(hbt)
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--selftest", action="store_true", help="run on a SYNTHETIC order book")
    ap.add_argument("--data", nargs="*", help="hftbacktest .npz event files, in time order")
    ap.add_argument("--snapshot", help="optional .npz end-of-day snapshot to start the book from")
    ap.add_argument("--tick", type=float, default=0.1)
    ap.add_argument("--lot", type=float, default=0.001)
    ap.add_argument("--latency-ms", type=float, default=10.0, help="constant order entry and response latency")
    ap.add_argument("--maker-fee", type=float, default=0.0002, help="as a fraction; negative means a rebate")
    ap.add_argument("--taker-fee", type=float, default=0.0005)
    ap.add_argument("--half-spread", type=float, default=2, help="half spread, in ticks")
    ap.add_argument("--skew", type=float, default=1.0, help="ticks of skew per unit of inventory")
    ap.add_argument("--max-position", type=float, default=0.05)
    ap.add_argument("--qty", type=float, default=0.01)
    a = ap.parse_args()

    if a.selftest:
        data, label = [synthetic_book(tick=a.tick)], "SYNTHETIC order book (selftest)"
    elif a.data:
        data, label = a.data, ", ".join(a.data)
    else:
        ap.error("pass --data FILE.npz ... or --selftest")

    lat = int(a.latency_ms * 1_000_000)
    asset = (BacktestAsset().data(data).linear_asset(1.0).constant_order_latency(lat, lat)
             .risk_adverse_queue_model().no_partial_fill_exchange()
             .trading_value_fee_model(a.maker_fee, a.taker_fee).tick_size(a.tick).lot_size(a.lot).last_trades_capacity(0))
    if a.snapshot:
        asset = asset.initial_snapshot(a.snapshot)
    hbt = HashMapMarketDepthBacktest([asset])
    recorder = Recorder(hbt.num_assets, 5_000_000)
    quote(hbt, recorder.recorder, a.half_spread, a.skew, a.max_position, a.qty)
    hbt.close()

    stats = LinearAssetRecord(recorder.get(0)).stats()
    print(f"BACKTEST · market-making study · {label}")
    print(f"Assumptions: {a.latency_ms} ms order latency, risk-averse queue model, maker {a.maker_fee}, taker {a.taker_fee}.")
    summary = stats.summary()  # a one-row polars DataFrame
    for col in summary.columns:
        print(f"  {col:>22}: {summary[col][0]}")
    print("A study of mechanics, not evidence. Queue and latency models are assumptions; real fills depend on who else is quoting.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
