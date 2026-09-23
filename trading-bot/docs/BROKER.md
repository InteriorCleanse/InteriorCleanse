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

## Kraken (crypto), read-only

`src/broker/kraken.ts` reads your real Kraken balances and the account's total
value in USD. It can call exactly two endpoints — `Balance` and `TradeBalance` —
and nothing that trades, moves or withdraws. Kraken has no paper account, so a
connected key is your real account: shown, never traded.

**Two locks.** The code can only sign those two reads (a test fails if any
other private endpoint appears), and the key you create can only read, so
Kraken itself refuses anything else.

1. Log in at kraken.com → **Settings → Connections & API → Create API key**
   (Kraken Pro: **Settings → API**).
2. Name it `Mr. Cash read-only`.
3. Tick **Query Funds** and **nothing else**. Leave every Orders & Trades,
   Deposit, Withdraw and Earn permission **off**.
4. Optional but good: under IP allowlist, enter your home IP so the key only
   works from your PC.
5. Create it and copy the **key** and the **private key** (the secret). Kraken
   shows the secret once.
6. On your PC, set them for the session and start the bot:

   ```powershell
   $env:MRCASH_KRAKEN_KEY = "<your API key>"
   $env:MRCASH_KRAKEN_SECRET = "<your private key>"
   npm start
   ```

   To keep them across restarts, use **Windows → Edit environment variables
   for your account** instead of typing them each time. Never put them in a
   file inside the project folder.
7. Open the **Desk**. "Your accounts" shows Kraken's total. `/api/portfolio/kraken`
   has the holdings; `/api/brokers` lists which brokers are linked (yes/no only).

If it says the key needs **Query Funds**, the permission box was not ticked.
If it says the key was rejected, re-copy both values in full. Give Mr. Cash its
**own** key: Kraken rejects a request whose nonce is lower than one another app
already used with the same key.

## Which broker for what

What each of your accounts is good for, checked September 2026. Fees change —
confirm on the broker's own fee page before relying on a number.

| Broker | Good for | API for a bot | Notes |
|---|---|---|---|
| **Kraken Pro** | crypto | yes — built here (read-only) | entry tier 0.25% maker / 0.40% taker |
| **Coinbase Advanced** | crypto | yes | entry tier 0.40% maker / 0.60% taker — pricier than Kraken at small volume |
| **Crypto.com Exchange** | crypto | yes | entry tier 0.25% / 0.50%; the Crypto.com **app** prices by spread, which is where the "lots of fees" usually comes from |
| **tastytrade** | stocks, options, **futures** | yes (official open API) | the strongest of your list for active day trading; futures are the usual scalping market |
| **Robinhood** | stocks, crypto | crypto only (official crypto API) | no official stocks API |
| **Webull** | stocks, options | yes (OpenAPI, by application) | |
| **Alpaca** | stocks, options, crypto | yes — built here (read-only) | free unlimited paper account |

Scalping lives or dies on costs: at 0.40% taker, a round trip costs 0.80%
before the trade has moved. Limit (maker) orders are cheaper than market
(taker) orders everywhere. The $25,000 pattern-day-trader minimum was
eliminated by FINRA effective June 4, 2026, but brokers have until
October 20, 2027 to implement it — check your own broker's status.

## Not built (and why)

- **Placing trades through the broker.** That is real money and the deliberate
  final step. It would go behind the existing live-execution gate, after the
  paper-validation gates pass and you approve it — never bundled into a
  read-only portfolio view.
