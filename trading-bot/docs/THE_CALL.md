# The call: up or down, every 15 minutes, scored

The owner showed a "Polymarket-Trading-Bots" terminal, where an agent called
JEV answers the short Bitcoin "Up or Down" markets. It gives a probability,
stays flat below a confidence line, and settles each window as right or
wrong. Mr. Cash now has the same kind of desk. It makes a call every window
and shows its working, with two differences: it keeps an honest score, and
it places nothing.

## What it does

- **When each window opens** (15 minutes, aligned to the clock like the
  Polymarket markets), it reads the bot's own stored 5-minute candles. It
  uses only the candles that had closed by the window's start.
- **It produces a probability that price ends the window higher**, from six
  readings:
  - the hour trend and how straight it was
  - the last 15 minutes
  - stretch from the 20-period average
  - RSI
  - the Scanner's bias score
  - how choppy the tape is
- **It makes a call.** Up at 58% or more, down at 42% or less, otherwise
  "holding flat". Each call comes with a difficulty from 0 to 4 and tags such
  as "chopping tape", "trending up", "stretched" and "momentum turning".
- **It settles the call.** When the candle that closes the window arrives,
  the call is marked RIGHT, WRONG, PASSED (flat) or VOID (no change).
- **It keeps score** with the Brier score, where 0.25 is a coin flip; skill
  is `1 − Brier / 0.25`. It also shows the hit rate over calls, how often the
  price went up anyway, and a calibration table. Every number is labelled NOT
  ENOUGH DATA until 30 calls.
- **The BACKTEST is separate.** The same model is walked over about 330 past
  windows from the stored candles. It is shown apart from the live record and
  never mixed into it.

## Where

- **The call** tab (Markets group): the live call with its gauge, readings and
  countdown, the settled log, the scoreboard, calibration and the backtest.
- **Home**: a compact terminal under the markets strip.
- **Ask → The Call**: Mr. Cash explains his own call and record from the desk's data.
- **API**: `GET /api/forecast` (`?refresh=1` runs a pass now).
- **Code and data**:
  - model: `src/forecast/model.ts`
  - service: `src/forecast/service.ts`
  - record: `forecasts.json` in the data directory
- **Settings**:
  - `MRCASH_CALLS=0` turns the desk off.
  - `MRCASH_CALL_MINUTES` changes the window length.

## Honest limits

- **Untested model.** The weights are set by hand and openly. The first
  backtest on sample data scored slightly *worse* than a coin flip; that is
  what the desk exists to show. Nobody should read a call as advice.
- **No market price.** JEV's terminal also shows the market's price (Up 99¢,
  Down 2¢). A call is only worth money when its probability beats that price
  after fees. The desk does not fetch Polymarket prices. The School's
  prediction-market lesson covers edge and Kelly sizing.
- **No trading.** It places no orders, holds no Polymarket or Kalshi keys and
  has no execution path. Trading those markets from this bot would be live
  trading through a second path, which this repository forbids.
- **No hindsight.** A call is written only while its window is still open, and
  only from candles closed before the window started. If the candles stop
  arriving, the desk says NOT CONNECTED instead of back-filling.
