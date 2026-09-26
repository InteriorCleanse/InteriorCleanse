# Other trading bots, and what Mr. Cash took from them

The owner asked for a deep look at the leading trading bots and for their
features to be built in. This is the list, checked in September 2026, with
what Mr. Cash has, what was added now, and what was deliberately left out.

Which bot makes the most money is not something any of these products can show. Vendors
publish marketing, not audited live records, and 2026 saw regulators pursue
"AI-washing". This page compares **features**.

## The field

| Product | Known for |
|---|---|
| Trade Ideas (Holly AI) | Overnight backtests of 60–70 strategies, and a morning list of intraday entries, exits and stops. |
| TrendSpider | Automatic trendlines, support and resistance, 150+ candle patterns, multi-timeframe charts, point-and-click backtests. |
| 3Commas | DCA, grid and signal bots, and the SmartTrade terminal (trailing take-profit and stop). Paper trading, an AI helper for bot settings, and a marketplace. |
| Pionex | 16 free built-in bots (grid, DCA, rebalancing) on its own exchange. |
| Cryptohopper | Strategy designer, backtesting, trailing features, copy trading and a marketplace. |
| TradingPilotAI | A TradingView "6-in-1" indicator that folds six readings into one −6 to +6 bias score (look long, short or sit), plus volume confirmation. Simple to read. |
| Composer, Tickeron, ChartingLens | No-code strategy builders, libraries of AI signals, chat assistants. |

## Feature by feature

| Feature | Seen in | Mr. Cash |
|---|---|---|
| Many strategies researched overnight | Trade Ideas | **Has**: strategy factory, research scheduler, Research tab, and deflated-Sharpe overfitting check. |
| One plain lean per market | TradingPilotAI | **Added**: bias score −6..+6 on the Scanner and Home. |
| Automatic trendlines, levels, chart patterns | TrendSpider | **Has**: the Scanner's rule-based pattern finder. |
| Large candle-pattern library | TrendSpider | **Added**: 20+ candle signals and a trend · level · signal grade (docs/PRICE_ACTION.md). |
| Backtest a pattern before trusting it | TrendSpider, Trade Ideas | **Added**: evidence table per market (BACKTEST, no look-ahead). |
| Chart screenshot reader | several | **Has**: the Scanner's AI screenshot scan. |
| Paper trading | 3Commas, Cryptohopper | **Has**: the core of Mr. Cash, with a realistic fill model. |
| Alerts and a morning brief | all | **Has**: bell, morning filings brief, daily brief. |
| AI assistant | 3Commas, ChartingLens | **Has**: Ask, with skills (hats). |
| Congress, insider and dark-pool flows | Quiver, Unusual Whales | **Has**: Big money tab. |
| Grid bot | 3Commas, Pionex | **Added as research only**: `research/bot_styles.py` backtests a grid against buy-and-hold. |
| DCA bot | 3Commas, Pionex, Cryptohopper | **Added as research only**: same script, the classic base and safety-order deal. |
| Trailing take-profit and stop | 3Commas SmartTrade | **Not added.** Changing exits is a strategy change. It would go through research → out-of-sample → walk-forward → review → paper. |
| Running grid, DCA or signal bots live | all | **Not added.** A second way to place orders is forbidden here, and live trading is not armed (see below). |
| Copy trading and marketplaces | 3Commas, Cryptohopper | **Not added.** Copying someone's live orders is live execution; their published results are unaudited. |
| Market making | HftBacktest, Kalshi bots | **Study only**: `/market-making-study`. |

## How close is live trading?

Not close, on purpose; see `docs/LIVE_READINESS.md`. The live machinery is
built and dormant, and five of its eight gates are closed by design. The
biggest gap is evidence: the paper-validation gates need a real PAPER record
with enough closed trades across sessions and regimes. After that come
first-fill acceptance, a funded account with keys in `.env`, 20 reconciled
testnet trades, a security review and your own sign-off. Until the paper
record exists, the honest answer to "is it making money?" is NOT ENOUGH REAL
PAPER DATA.

## Sources

- finder.com/stock-trading/ai-trading-bot
- stockbrokers.com/guides/ai-stock-trading-bots
- liberatedstocktrader.com/trade-ideas-vs-trendspider/
- cryptoaitools.org/blog/3commas-vs-cryptohopper-vs-pionex-2026
- bagengine.com/articles/3commas-review
- brokerlistings.com/scams/tradingpilotai
