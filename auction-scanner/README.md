# Gavel

An AI car-auction scanner. It reads car auctions, finds clean, lightly-used
cars priced under what similar cars list for, scores each one and says why in
plain English, works out the most you should bid, and walks you through buying
the car at that auction. It also teaches: going to auctions in person, the
dealer licence, flipping, minor fixes, and starting a rental car company.

Members sign in with an access code. Bidding is **paper by default**: Gavel
records your practice bid and opens the lot with your number; the real bid
happens on the auction's own site.

## Start here (5 minutes)

1. **Install Node 22.18 or newer** from [nodejs.org](https://nodejs.org) (the LTS button).
2. Open a terminal in this folder (`auction-scanner`).
3. `npm install` — this only installs TypeScript for the typecheck and the
   optional AI library. The app itself has no dependencies.
4. `npm run selftest` — about fifty PASS lines prove the install and the logic.
5. `npm start` — the terminal prints the address (`http://127.0.0.1:8790`) and
   the **owner PIN**. Open the address, choose the **Owner** tab, type the PIN.

You will see the Feed with **SAMPLE** cars: they are not real, every card says
so, and they exist only so you can see the app before a source is connected.

## What you are looking at

- **Feed.** Cars priced under their comparables. Each lot tag shows the price
  now, what comparable cars list for (or **NOT ENOUGH COMPS**), the Steal
  score out of 100 with a one-word grade, badges (title, damage, runs and
  drives, time left), three "why" lines, red flags, and the buttons **Plan my
  bid**, **Open the lot** and **Watch**. **Starter mode** is on by default: it
  hides salvage and rebuilt titles, damage beyond minor, cars that do not run,
  and anything over your price, mileage or age caps, and it tells you how many
  it hid and why.
- **Plan.** The number. Resale target − buyer fee − transport − repairs −
  cushion − your margin = **Never bid above**. Change any input and the number
  follows. Below it, a seven-step walkthrough for buying *this* car at *this*
  auction, and the **PAPER bid** box.
- **Watch.** Cars you are watching and the paper bids you have practised with,
  with how each one ended.
- **Auctions.** Every house worth knowing: who may buy, what registering
  costs, the fee basis with a verify link, in person or online, and whether
  Gavel reads it live. One click opens their search.
- **Playbook.** Seven guides written for a beginner with tools and no car
  experience, each with a checklist that remembers your ticks.
- **Rental.** Type a budget and a road (peer-to-peer, own fleet, flip) and get
  a ranked short list of first cars with reasons, plus the first ten steps.
- **Settings.** Starter rules, sample data, fee overrides, your demand-list
  additions, sources, the live-bidding gate, a VIN decoder.
- **Admin** (owner only). Members and their access codes; the Stripe hook-up.

## LIVE, SAMPLE, or NO SOURCE

The chip at the top says where the cars come from. **LIVE** means a connected
source. **SAMPLE** means the demonstration cars: not real, labelled on every
card, never mixed into a live estimate. **NO SOURCE** means nothing is
connected and samples are off; the Feed then shows exactly what to add.

## Connecting eBay Motors (the live source)

eBay is the one big auction site with an official, free developer API.

1. Go to [developer.ebay.com](https://developer.ebay.com), sign in with your
   eBay account, open **Application Keys**, and create a **Production**
   keyset.
2. Copy the **App ID** (client ID) and the **Cert ID** (client secret).
3. Copy `.env.example` to `.env` and fill in:
   ```
   GAVEL_EBAY_CLIENT_ID=...
   GAVEL_EBAY_CLIENT_SECRET=...
   ```
4. Restart the app. The chip turns **LIVE · eBay Motors**.

Gavel uses the Browse API with a read-only token. It can search and read
listings. It cannot bid, buy or touch your eBay account.

Every other house (Copart, IAA, Manheim, ADESA, ACV, Cars & Bids, Bring a
Trailer, GovDeals, Mecum and Barrett-Jackson, local public auctions) publishes
no API. Gavel lists them in **Auctions** with how to register and opens their
search for you. See `docs/AUCTIONS.md`.

## Members and access codes

- The **owner** signs in with the PIN. Set `GAVEL_PIN` in `.env` to keep it
  fixed; otherwise a random PIN is printed each start.
- A **member** signs in with email + access code. Issue codes on the Admin
  page (**Add and make a code**): the code is shown once, you send it, only
  its hash is stored. Or set `GAVEL_MEMBER_CODES=code1,code2` for shared codes
  that work with any email.
- **Stripe subscriptions.** Create a subscription product and a Payment Link
  or Checkout in Stripe. Add a webhook endpoint at
  `https://<your host>/api/stripe/webhook` with the events
  `checkout.session.completed`, `customer.subscription.updated` and
  `customer.subscription.deleted`. Paste the endpoint's signing secret into
  your host's environment as `GAVEL_STRIPE_WEBHOOK_SECRET`, never into the
  repository. A paid checkout creates the member; you issue their code on the
  Admin page and send it; a cancelled or unpaid subscription switches them
  off. Gavel does not send email. See `docs/MEMBERS.md`.

## Bidding, honestly

Every bid is **PAPER** unless two things are true at once: `GAVEL_LIVE_BIDDING=1`
is set on the server, **and** the listing's source can take a bid through an
API. No connected source can today. eBay's public API is read-only, and the
other houses publish no API at all. So the Bid button records a paper bid,
shows the honest message, and offers **Open the lot with this number**. You
place the real bid on the auction's own site, and you never go above the
number. Live bidding becomes possible only when an auction hands out a bidding
API, or a licensed dealer account with one; the gate is already in the code.
See `docs/BIDDING.md`.

## The optional AI explainer

Add `ANTHROPIC_API_KEY` to `.env` and **Explain it again with AI** on the Plan
screen asks Claude to rewrite the walkthrough for your car, starting from the
rules version and forbidden from inventing prices, fees or history. Without a
key, the rules walkthrough is what you get, and it is complete on its own.

## Putting it on the internet

Gavel is built to run on a laptop, a home server, or a small VPS.

- Set `GAVEL_HOST=0.0.0.0` to listen on all interfaces, and put an HTTPS
  reverse proxy (Caddy, nginx) in front. Set `GAVEL_SECURE_COOKIES=1` behind
  the proxy, or rely on the `X-Forwarded-Proto: https` header it sends.
- Set `GAVEL_SESSION_SECRET` to 32+ random characters so members stay signed
  in across restarts.
- Set `GAVEL_PIN`, and paste every secret into the host's environment, not
  the code.
- Gavel does **not** send email, take payments itself, or place bids. Stripe
  takes payment; you send codes.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Run the app on `GAVEL_PORT` (default 8790) |
| `npm run scan -- corvette --max 30000` | Scan in the terminal; `--all` shows what starter mode hid |
| `npm run doctor` | What is connected, what is missing, how to fix it |
| `npm run selftest` | Offline logic checks |
| `npm test` | The test suite (`node --test`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | All three |

## Folder map

```
config.ts            tunables: starter rules, scoring, plan defaults, AI model
src/server.ts        the app and its API
src/sources/         eBay adapter, the auction directory, SAMPLE cars, registry
src/valuation.ts     comps-based estimate        src/scoring.ts   the Steal score
src/filters.ts       starter rules               src/fees.ts      published fee schedules
src/bidplan.ts       never-bid-above maths       src/explain.ts   the rules walkthrough
src/ai.ts            optional Claude explainer   src/demand.ts    the editable demand list
src/paper.ts         watchlist and paper bids    src/settings.ts  per-install settings
src/playbook/        the guides                  src/rental.ts    first-car finder
src/security/        CSP, sessions, members, throttle, Stripe verification
web/                 the members' app: index.html, login.html, css/, js/
test/                node --test, offline, temp data directory per run
docs/                DESIGN, AUCTIONS, BIDDING, MEMBERS, SECURITY, PLAYBOOK
data/                your files: settings, watchlist, paper bids, members (git-ignored)
```
