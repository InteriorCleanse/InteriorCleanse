# Chart scanner

The **Scanner** tab (More → Markets → Scanner) reads charts in two ways.
Both draw their findings on the chart itself, and both are labelled.
Neither is a signal, and the engine never sees either one.

## 1. Live pattern finder (rules, no AI)

Every watched market's hourly candles are checked by fixed rules in
`src/scanner/patterns.ts`:

| Family | What it finds |
| --- | --- |
| Reversal shapes | Double top and bottom; head and shoulders and the inverse |
| Trendline shapes | Ascending, descending and symmetrical triangles; rising and falling channels; broadening ranges |
| Levels | Support and resistance zones: prices where swings keep turning, grouped within half an ATR |
| Candles | Bullish and bearish engulfing, hammer, shooting star, doji, morning and evening star, inside bar |
| Momentum | Bullish and bearish RSI divergence between the last two swings |
| Volume | A candle trading at least 2× its 20-candle average |

What each pattern reports:

- **The points it was built from.** Swings, necklines and lines are drawn
  from these.
- **Its status:** forming, confirmed, failed, broke out or broke down.
  Failed patterns stay on the board for a while, marked failed, rather than
  quietly disappearing.
- **What it means, what would confirm it, and what would cancel it.**
- **A textbook measured move, where one exists.** It is labelled as a way to
  size the pattern, not a forecast.

The market grid shows each market's trend and a count of bullish, bearish
and neutral shapes. The count describes the chart; it is not a signal. Tap a
market to see the latest 90 candles with every pattern drawn. Tap a pattern
to zoom to it and see its measured move.

No success rates are shown, because Mr. Cash has not tested these patterns.
If there are fewer than 30 candles, it says **NOT ENOUGH DATA**.

## 2. Screenshot scan (AI)

Drop, paste or choose a chart image from any app. Claude reads it through
structured outputs, so the answer always has the same JSON shape
(`src/scanner/picture.ts`). The page then draws on your picture:

- a box around each pattern, in the colour of its bias;
- a line for each support, resistance or liquidity level, and a band for
  each fair value gap;
- a pin on each notable candle.

Alongside the picture it shows the trend, a summary, the plan (entry zone,
stop, target and reward-to-risk, or an honest **no trade**), what would make
it wrong, what it could not read, and how confident it is and why.

- Positions are fractions of the image, clamped to the picture.
- Prices are copied only as the AI **read** them on the axis. Unreadable
  prices are listed, never estimated.
- Every list and string is capped, and any unknown value is replaced before
  the page draws it.
- It uses your `ANTHROPIC_API_KEY`, and the page shows the cost of each scan.
- The upload is a POST to `/api/scanner/picture` with the page's CSRF token,
  like every other state-changing request.

## How this compares with typical app chart analyzers

App chart analyzers, Finelo's AI Chart Analyzer among them, upload a chart
and list the trends, patterns, levels and candlestick formations they see.
This scanner goes further in the following ways:

- **Markup on your picture.** It draws each finding on the screenshot,
  instead of only describing it.
- **A rule-based finder.** It adds a finder that needs no AI and runs on
  real candles, so each result can be checked point by point.
- **Plain rules.** Every pattern carries its confirmation and cancellation
  rules in plain words.
- **Honest limits.** It refuses to guess prices it cannot read, and it shows
  no made-up success rates.

Code: `src/scanner/`. Routes: `GET /api/scanner`,
`GET /api/scanner/market?key=`, `POST /api/scanner/picture`. Tests:
`test/scanner/scanner.test.ts`, with SYNTHETIC candle shapes.
