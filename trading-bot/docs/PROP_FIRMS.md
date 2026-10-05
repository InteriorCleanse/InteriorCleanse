# Prop Firm Academy

School → **Prop firms**. It covers how funded-trader challenges work, from
choosing a firm to a payout, using your firm's exact rules.

**Kestrel teaches and tracks prop challenges. It does not trade them.** It has
no connection to any prop firm, broker or trading platform, and this feature
adds none. You place every order on your firm's platform yourself.

## Why Kestrel does not trade the challenge

- Kestrel is a paper-trading research bot; the live-execution path stays
  behind its gate chain (`docs/LIVE_READINESS.md`) and is not wired to any prop
  platform.
- Many firms restrict or ban expert advisors, bots, copy trading and
  third-party signals. Using one against the rules can void a paid challenge or
  a payout.
- There is no real paper track record yet (NOT ENOUGH REAL PAPER DATA), so
  nothing supports risking a fee on Kestrel's signals.

## What it does

| View | What it shows |
|---|---|
| Challenge replay | Replays closed trades through the rules, phase by phase. For each phase it shows the balance, the loss floor, progress to the target, how much of the daily limit the worst day used, and the best day's share of the profit. It names the trade and the rule that ended the account. |
| My rules | Holds your firm's exact numbers: account size, the day-reset hour and time zone, and up to three phases. Saved in the app's own store. |
| Risk room | At your risk per trade: how many full losses the daily limit and the max loss allow, and how many 1R winners the target needs. Arithmetic, not a forecast. |
| Practice odds | Plays the first phase many times using the win rate and reward **you** type in. Labelled SIMULATED. It describes how the rules treat those numbers, not what Kestrel or the market will do. |
| The journey | Ten steps from "understand what you are buying" to payouts, tax and what to do after a failure. Each step says what you do, what Kestrel helps with, and the traps. |

The "Today" strip shows how much room is left before a limit today, and says
**Stop for today** when one more full loss would breach one.

The Concepts view has a **Prop firms** track with three lessons and quizzes:
- the rules that fail challenges;
- static and trailing drawdown;
- sizing for a challenge.

## Trades it can replay

- **Kestrel paper record (PAPER).** Either at Kestrel's own sizing, scaled from
  its paper account to the challenge account, or re-sized to a fixed risk % per
  1R. A thin record is labelled NOT ENOUGH DATA.
- **My journal (JOURNAL).** Your own logged trades with an R-multiple, re-sized
  to your risk %. Use the From date to start at your challenge's first day.
  Kestrel cannot check these against a broker.

## Rule shapes supported

- Profit target per phase; a funded phase has none.
- Daily loss limit as a % of the starting balance, measured from the balance at
  the firm's reset hour in its time zone.
- Max loss as one of three types:
  - fixed;
  - **trailing, end of day** (follows each day's closing high);
  - **trailing, intraday** (follows the highest balance including open profit).

  Either trailing type can lock at the starting balance.
- Minimum trading days, an optional time limit, and an optional consistency
  rule (best day ≤ a set % of total profit).

The four built-in templates are **EXAMPLE** shapes. They use numbers in the
range the industry commonly uses, but they are not any named firm's rules.
Copy your firm's current rulebook into My rules before relying on a result.

## Known approximations (shown on the page)

- **Closed trades only.** A firm that checks live equity can close an account
  during an open losing trade that later recovers.
- **Intraday trailing** needs each trade's open-profit peak. Without it, the
  trailing high comes from closed balances, which is kinder than the real rule.

## API

| Route | |
|---|---|
| `GET /api/school/prop?template=&source=paper\|journal&sizing=as-traded\|risk&risk=&since=` | Templates, rules, replay, risk room, today, journey, policy. |
| `POST /api/school/prop/rules` | Saves `{ rules }` (sanitised and clamped) or `{ reset: true }`. Needs the app token, like every POST. |
| `GET /api/school/prop/simulate?template=&win=&rr=&risk=&perDay=` | Seeded Monte Carlo of phase 1. SIMULATED. |

Code: `src/school/propFirm.ts` (pure functions), handlers in
`src/learning/api.ts`, view in `web/js/prop.js`. Tests:
`test/school/propFirm.test.ts` and `test/learningRoutes.test.ts`.

Nothing here is read by the engine, fusion, risk, sizing, any strategy or the
live gate.
