# Connecting your broker (read-only portfolio)

Custom code that lets Mr. Cash **see** your real brokerage account — balance and
open positions — without being able to trade it. The client (`src/broker/alpaca.ts`)
has no function that can place, change or cancel an order, so connecting real
keys shows your portfolio and nothing more. Live execution stays gated exactly
as before.

## Which broker

Start with **Alpaca** in paper mode: the easiest API to connect, a free
unlimited paper account, and support for stocks, options and crypto. See
`docs/MULTI_MARKET.md` and the chat recommendation for the trade-offs versus
Interactive Brokers (which adds futures and forex but is harder to wire).

## Connect it

1. Make an Alpaca account and generate **paper** API keys (Home → Paper
   Trading → API Keys). Paper keys cannot move real money.
2. Give the bot the keys through the environment, never the repo:

   ```powershell
   $env:MRCASH_ALPACA_KEY = "<your paper key id>"
   $env:MRCASH_ALPACA_SECRET = "<your paper secret>"
   # optional: MRCASH_ALPACA_MODE = "live"   # only when you deliberately want the live account
   npm start
   ```
3. Open `/api/portfolio` or the desk. It shows PAPER, your equity and buying
   power, and each open position with its unrealized profit. If no keys are set
   it says so plainly and shows nothing invented.

## How your information stays safe

- **Keys live only in the environment.** They are never written to the repo,
  the trade record, the ops log, or any HTTP response. `/api/portfolio` returns
  balances and positions, never the keys.
- **Read-only by construction.** The module makes only `GET /v2/account` and
  `GET /v2/positions` calls. There is no orders endpoint and no POST/DELETE; a
  test enforces this so it can't be added by accident.
- **Paper by default.** The live endpoint is used only when you set
  `MRCASH_ALPACA_MODE=live` yourself.
- **Errors are redacted.** Any long token-like string is stripped from messages
  shown in the app.
- Keys are sent only to Alpaca, over HTTPS.

## Not built (and why)

- **Placing trades through the broker.** That is real money and the deliberate
  final step. It would go behind the existing live-execution gate, after the
  paper-validation gates pass and you approve it — never bundled into a
  read-only portfolio view.
