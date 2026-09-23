# The Quant Lab

Four research tools, each one a view on the Research tab and a read-only
route. They came from a set of "AI × quant projects" the owner wanted in the
bot. Three were already built in an earlier phase; this page says where each
one lives, what it runs on, and what it does not do. None of them changes a
strategy. Research reads the record and writes proposals; a proposal still
needs a human; nothing here reaches the engine.

| Project as pitched | In Mr. Cash | Runs on | Route |
|---|---|---|---|
| Backtest overfitting detector: deflated Sharpe over the number of trials | Research → **Overfitting**. The trial registry counts every variant tried (sandbox runs, factory grids, hand-registered trials); the deflated Sharpe is computed against that count, the track length, skew and kurtosis. | trial registry, backtests | `/api/research/overfitting` |
| AI strategy search lab: generate variants, backtest them, map survivors by regime | Research → **Sandbox** (variants: filter, session, regime, parameter; each registered as a trial before it runs) and Research → **Regime atlas** (strategy family by volatility band and regime, PAPER and BACKTEST in separate tables). The Factory tab does the generate-and-breed step with out-of-sample survival and a deflated-Sharpe bar. | backtests, trial registry, the paper record | `/api/research/sandbox`, `/api/research/atlas`, `/api/factory/*` |
| News-to-price diffusion: a Hawkes fit of headlines exciting price | Research → **News diffusion**. Scheduled releases from the calendar memory against price events from stored candles; exogenous (news → price) and endogenous (price → price) kernels with half-lives. Labelled HISTORICAL. | calendar memory, candles | `/api/research/diffusion` |
| Prediction-market arbitrage: YES + NO under a dollar, cross-venue divergence, Kelly | School → **Other markets**. The arithmetic, taught with SIMULATED numbers you can change. Mr. Cash is **not connected** to Polymarket or Kalshi and does not trade them; a live order-book feed would be a new data source and is listed below as a candidate, not a feature. | worked examples | `/api/school/prediction-market` |

The Research overview now carries a "Quant lab" card that names the four and
opens each view.

## What each one says when the record is thin

Every view reports NOT ENOUGH DATA, INSUFFICIENT SAMPLE or LIKELY LUCK rather
than a number it cannot support. With zero paper trades the atlas is empty on
the PAPER side, the questions list is empty until a cohort reaches fifty
trades with an interval clear of zero, and the overfitting detector reports
on backtests only. That is the intended state of a young record.

## Candidates, not built

- A read-only prediction-market feed (Polymarket CLOB and Kalshi public
  books) that computes the single-venue and cross-venue figures from live
  quotes. It would be an observation panel with provenance, never an order
  path. Not built: it is a new external data source, it needs network access
  the development container does not have to test against, and the bot's
  instrument is BTCUSDT.
- Automatic hypothesis drafting from the diffusion fit (for example, "London
  entries within 30 minutes of a high-impact release under-perform"). The
  question generator already drafts from cohorts; wiring the diffusion output
  into it is a research-side change that should wait for a paper record large
  enough to test against.
