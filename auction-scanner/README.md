# Gavel

An AI car-auction scanner and business coach. Give it a budget and it finds
clean, lightly-used cars priced well under what similar cars go for, with
every cost counted and the most you should bid. It explains each car in plain
English, walks a beginner through buying it at that auction, keeps the books
for each of your companies, and coaches you day to day: a twelve-step first
car, three tasks a day, and a coach that searches the web and every auction
it reads to answer any question.

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

The first time you sign in, **Setup** asks four questions (your goal, your
state, your budget, the makes you like) and starts your first Sniper target.

- **Home.** The command centre: a budget box that opens Deals, your partner's
  top three, the Sniper's picks with live countdowns, the latest alerts, the
  cars you watch, your paper record, your profit, and the path from first
  sign-in to first car.
- **Deals.** Your budget in, real cars out. Clean title, little or no damage,
  priced against similar cars, with the buyer fee, transport, the materials
  the car will likely need and a cushion all counted. Set a profit floor and
  a model year. Each card shows the estimated profit, the most to bid, a P/L
  estimator, the materials list, and **I bought it**, which puts the car in
  your books. A **deal** rests on sold or asking prices; a **lead** rests on
  bids still running and says so. Every car left out is counted with why.
- **Coach.** The day-to-day coach. A twelve-step first auction car, from
  budget to first sale, with a what-to-look-for checklist (title, VIN,
  history, recalls, photos, flood signs, fees and deadlines); today's three
  tasks and a streak; and a conversation. With an Anthropic key the coach
  searches the web, reads auction pages, searches every live auction, runs
  the deal finder, opens a car's plan, checks recalls, reads your books and
  shows its sources. Without one it answers from the journey and your books,
  and says so.
- **Business.** Your companies' books. Each company (flip, rental or both)
  has its own cars and business costs; profit per company and overall, cash
  flow, what is held in cars, a twelve-month chart, and a partner's ranked
  briefing of what to do next. Each car: every cost in and dollar out, a
  target sale, break-even, a P/L sheet, a materials checklist and Find parts.
  Export the books as a spreadsheet for your accountant.
- **Parts.** Pick a car you bought and a part. eBay's own fitment search with
  live prices when eBay is connected; searches for that exact car at the big
  parts stores and the salvage-yard networks either way; and the recalls a
  dealer fixes free.
- **Import.** Bring in any lot from any auction: drag the Send to Gavel
  button to your bookmarks once, then click it on a Copart, IAA, Bring a
  Trailer or Cars & Bids page. Or paste the lot, or upload a CSV export.
  Click it on a **sold** result too: Gavel keeps sold prices apart and uses
  them first in every estimate for that car.
- **On your phone.** Gavel installs to the home screen like an app (Settings
  shows how). On Android it joins the Share list, so a lot page shared to it
  opens on Import. With no connection it says so plainly.
- **Connect.** The go-live guide with a live tick next to every source, the
  AI, hosting and payments.
- **Feed.** Cars priced under their comparables, searched in plain English
  ("2015+ camry under 8k no damage in tx"). Each lot tag shows the price
  now, what comparable cars list for (or **NOT ENOUGH COMPS**), the deal
  score out of 100 with where the price sits against the market, badges (title, damage, runs and
  drives, time left), three "why" lines, red flags, and the buttons **Plan my
  bid**, **Open the lot** and **Watch**. **Starter mode** is on by default: it
  hides salvage and rebuilt titles, damage beyond minor, cars that do not run,
  and anything over your price, mileage or age caps, and it tells you how many
  it hid and why.
- **Plan.** The number. Resale target − buyer fee − transport − repairs −
  cushion − your margin = **Never bid above**. Change any input and the number
  follows. Below it, a seven-step walkthrough for buying *this* car at *this*
  auction, and the **PAPER bid** box.
- **Sniper.** Saved hunts: pick makes, models and years, set the most you will
  spend, and it watches the auctions, ranks the picks and writes the fire plan
  for each (snipe in the last seconds on eBay, proxy early where the clock
  extends, pre-bid before a live lane). Armed targets fire PAPER bids and
  alert you. See `docs/SNIPER.md`.
- **Intel.** Ask the desk anything (it searches the live web with your
  Anthropic key, or the built-in notes without). Look a car up in the public
  record (NHTSA recalls, complaints, crash stars; fueleconomy.gov mileage).
  Read how every house works, the laws that bite, and the glossary. See
  `docs/KNOWLEDGE.md`.
- **Watch.** Cars you are watching and the paper bids you have practised with,
  with how each one ended. A watched car alerts you once when it is ending
  within two hours, when its price moves, and when it ends.
- **Auctions.** Every house worth knowing: who may buy, what registering
  costs, the fee basis with a verify link, in person or online, and whether
  Gavel reads it live. One click opens their search.
- **Playbook.** Seven guides written for a beginner with tools and no car
  experience, each with a checklist that remembers your ticks.
- **Rental.** Type a budget and a road (peer-to-peer, own fleet, flip) and get
  a ranked short list of first cars with reasons, plus the first ten steps.
- **Settings.** Starter rules, sample data, fee overrides, your demand-list
  additions, sources, the live-bidding gate, a VIN decoder, browser alerts for
  the Sniper, and a one-file backup and restore of everything you own.
- **Admin** (owner only). Members and their access codes; the Stripe hook-up.

## LIVE, SAMPLE, or NO SOURCE

The chip at the top says where the cars come from. **LIVE** means a connected
source. **SAMPLE** means the demonstration cars: not real, labelled on every
card, never mixed into a live estimate. **NO SOURCE** means nothing is
connected and samples are off; the Feed then shows exactly what to add.

## Connecting the auctions

| Source | How Gavel reads it | Cost |
|---|---|---|
| GSA Auctions | Live, official government Auctions API | Free key from api.data.gov |
| eBay Motors | Live, official Browse API (read-only) | Free developer keyset |
| MarketCheck | Live, official paid API: auction lots, plus dealer prices as comparables | Paid plan |
| Copart, IAA, Bring a Trailer, Cars & Bids, Manheim, GovDeals, dealers | **Import**: the Send to Gavel button on any lot page, a paste, or a CSV export | Free in Gavel |

The **Connect** screen shows which are live and walks through each one.
`docs/GO_LIVE.md` is the full go-live guide, including hosting and payments.
Gavel never scrapes a site: auctions without a public API are read only from
lots you open or export yourself.

## Members and access codes

Every member has their own watchlist, paper bids, Sniper targets, alerts,
settings and garage, in their own folder under `data/users/`. Nobody sees
anyone else's. Shared data is only the member list itself.

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

## The optional AI

Add `ANTHROPIC_API_KEY` to `.env`, run `npm install` once, and three things
switch on: the **Coach** becomes Claude with web search, page reading and
Gavel's own tools (every live auction, the deal finder, a car's plan and
similar cars, recalls, the auction directory, your books); the **Intel** desk
searches the live web with sources; and **Explain it again with AI** on the
Plan screen rewrites the walkthrough for your car. Each is held to the same
rules: no invented price, fee or history, no promise of profit, and anything
read on a web page is information, never an instruction. Without a key every
screen still works from the rules, the journey and your books, and says so.

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
| `npm run find -- --budget 5000 --min-profit 2500` | The deal finder in the terminal (also on GitHub: Actions → Gavel deal finder) |
| `npm run doctor` | What is connected, what is missing, how to fix it |
| `npm run selftest` | Offline logic checks |
| `npm test` | The test suite (`node --test`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | All three |

## Folder map

```
config.ts            tunables: starter rules, scoring, plan defaults, AI model
src/server.ts        the app and its API
src/sources/         eBay, GSA and MarketCheck adapters, the importer, the directory, SAMPLE cars, registry
src/valuation.ts     comps-based estimate        src/scoring.ts   the deal score
src/filters.ts       starter rules               src/fees.ts      published fee schedules
src/bidplan.ts       never-bid-above maths       src/explain.ts   the rules walkthrough
src/finder.ts        the deal finder             src/find.ts      its CLI
src/materials.ts     what a car will need        src/pnl.ts       profit and loss, line by line
src/parts.ts         parts that fit, where to buy src/searchparse.ts plain-English search
src/ai.ts            optional Claude explainer   src/demand.ts    the editable demand list
src/paper.ts         watchlist and paper bids    src/watchalerts.ts ending, price moved, ended
src/settings.ts      per-member settings         src/store.ts     JSON files, scoped per member
src/garage.ts        the cars you own            src/companies.ts your companies and their costs
src/business.ts      profit per company, CSV     src/advisor.ts   the partner's briefing
src/coach/           the journey, today's three, the coach (rules, and Claude with the web)
src/playbook/        the guides                  src/rental.ts    first-car finder
src/knowledge/       policies, regulations, glossary, search
src/research/        car intel (NHTSA, fueleconomy.gov); the web desk (Claude + web search)
src/sniper/          targets, the engine, alerts   src/catalog.ts   makes and models for the pickers
src/security/        CSP, sessions, members, throttle, Stripe verification
web/                 the members' app: index.html, login.html, css/, js/
test/                node --test, offline, temp data directory per run
docs/                DESIGN, BRAND, AUCTIONS, BIDDING, MEMBERS, SECURITY, PLAYBOOK, GO_LIVE
data/                members.json at the top; each member's files in users/<id>/ (git-ignored)
```
