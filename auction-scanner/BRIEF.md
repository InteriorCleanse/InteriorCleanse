# Gavel — project brief (the shared memory for everyone building this)

Gavel is an **AI car-auction scanner**. It is a brand-new product in this
repository. It shares nothing with any other app here: not code, not design,
not voice. Build it from this brief and from the user's ask below, and from
nothing else. Do not read or copy from any other folder in this repository.

Working name: **Gavel**. The name lives in one constant (`src/brand.ts`, `BRAND`)
so the owner can rename it in one line.

## What the owner asked for, in their words (lightly tidied)

> An AI car auction scanner that finds the best car pricing and explains to me
> how to go about buying the cars I like. A compilation of the best choices; I
> can scroll through a feed of minimal-to-no-damage, clean-record cars at
> prices that almost seem like a steal. I want the vehicles all to be in good
> condition. I just want to get nice cars for dumb cheap. All different makes
> and models. Supercars are highly favoured, and cars that are proven to be
> good investments to flip. I would prefer to stay away from salvaged cars
> starting out, until we get some good profit coming in and I have more room to
> invest.
>
> This can be used by anyone who pays for my subscription. It needs the best
> of the best features, graphics, design, quality and layout, and be super
> dumbed down and easy to understand when it gives feedback. I want to be able
> to bid on auctions directly from this website/app.
>
> It needs to be connected to the best car auctions. I would like to learn how
> to start going to auctions in person as well. Dumb down for me the steps I
> need to take to buy, resell and make minor fixes. I have tools but no
> automobile experience; I don't mind ordering parts or hiring cheap labour
> for minor fixes. I know I may need a licence to attend certain auctions.
> I would like to start a rental car company and find my first car — that is
> my goal right now.

## The product, in one screen each

1. **Feed** — a scrollable feed of cars. Each card: photo, year/make/model,
   price now vs. what comparable cars are listed for, a **Steal score**
   (0–100) with a plain-English grade, badges (Clean title · No damage ·
   Runs & drives · ends in 2d), "Why it scores this" in three short lines,
   red flags if any, and three buttons: **Plan my bid**, **Open the lot**,
   **Watch**. Filters: budget, make, distance/state, supercar/enthusiast
   tiers, and a **Starter mode** switch that is ON by default (clean title
   only, no more than minor damage, runs and drives, price and mileage caps).
2. **Plan** — for one car: the max-bid calculator (resale − fees − transport −
   repairs − cushion − your margin = **never bid above this**), and a
   numbered walkthrough of how to buy *this* car at *this* auction, written
   for someone who has never done it.
3. **Watchlist & paper bids** — cars you're watching, and **PAPER** bids you
   placed to practise. Paper means nothing was sent anywhere.
4. **Auctions** — every auction house worth knowing: who can buy there, what
   registering costs, fees, whether Gavel reads it live, in-person or online,
   and a one-click search on their site.
5. **Playbook** — the dumbed-down guides: buying your first auction car step
   by step, going to an auction in person, getting a dealer licence (why and
   how, state by state varies), flipping (buy → inspect → minor fixes →
   detail → list → sell, and the laws: title jumping, per-year sale limits),
   minor fixes you can do or hire cheaply, and **starting a rental car
   company** (entity, insurance, Turo vs. own fleet, first-car choice).
6. **Rental** — the first-car finder: given a budget and a use (peer-to-peer
   rental, own fleet, flip), a ranked short list of makes/models with the
   reasons, and a checklist to the first rental.
7. **Settings / Account** — starter rules, sample data toggle, your
   membership, connected sources, and the live-bidding gate.

## Non-negotiable product rules

- **Never invent a car.** Data is LIVE (from a connected source) or SAMPLE
  (clearly labelled on the card, VIN begins `SAMPLE`, URL `#sample`). SAMPLE
  never mixes with LIVE in an estimate. With no source connected and samples
  off, the feed says exactly how to connect a source. It never fills the
  screen with fake cars pretending to be real.
- **Never invent a number.** Fees come from the house's published schedule
  with a "verify" link; sliding scales are called sliding scales. A value
  estimate is shown only with enough comparables (config `minComps`);
  otherwise the card says **NOT ENOUGH COMPS**. No claim that anything is
  "guaranteed", "proven profitable" or "risk-free" anywhere in code, UI or
  docs. "Proven flippers" in the owner's words becomes an editable
  **demand list** with the reason each car is on it.
- **Paper bidding by default. Live bidding is gated twice.** A bid is PAPER
  unless `GAVEL_LIVE_BIDDING=1` **and** the listing's source has a bidding
  API. No connected source has one today (eBay's Browse API is read-only;
  Copart/IAA/Manheim/ADESA/Cars & Bids/BaT have no public API). So the
  **Bid** button always prepares the exact max bid and opens the lot on the
  auction's own site with the number in front of you. The UI never pretends
  a bid went through.
- **Starter mode is on by default** and says why it hid a car.
- **Plain English everywhere.** Short sentences. Explain a term the first
  time it appears. A beginner with no car experience must be able to act on
  every screen.
- **Members only.** Everything behind a sign-in. Owner signs in with a PIN;
  members with email + access code. Access codes come from the owner
  (admin page) or from Stripe subscription webhooks. Placeholders only for
  every credential; no real key in the repository.
- **Extend, don't rebuild.** Node 22, TypeScript run directly by Node (no
  build step), zero runtime dependencies (`@anthropic-ai/sdk` optional).

## Layout and file ownership

```
auction-scanner/
  config.ts                 tunables (exists)
  BRIEF.md                  this file
  CLAUDE.md                 the standing brief for future sessions (docs agent)
  README.md                 start here in 5 minutes (docs agent)
  .env.example              (exists)
  src/
    brand.ts                BRAND constant, tagline
    types.ts                shared shapes (exists — read first)
    env.ts store.ts ui.ts version.ts   (exist)
    sources/                normalize.ts directory.ts ebay.ts sample.ts (exist), registry.ts
    vin.ts                  NHTSA vPIC decode (free, no key)
    valuation.ts            comps-based estimate → Estimate
    demand.ts               the editable demand list
    filters.ts              starter rules → blocks[]
    scoring.ts              Steal score → Score
    fees.ts                 published fee schedules → buyer fee for a house & price
    bidplan.ts              max-bid math → BidPlan
    paper.ts                watchlist + PAPER bids + outcomes (JSON store)
    settings.ts             per-install settings (starter rules, sample toggle, demand edits)
    explain.ts              rule-based "how to buy this car" walkthrough
    ai.ts                   optional Claude explainer (claude-opus-5, adaptive thinking, fallbacks default, streaming); falls back to explain.ts
    playbook/content.ts     the guides as structured data
    rental.ts               first-car finder + rental startup checklist
    security/harden.ts      CSP with nonce, security headers, constant-time compare
    security/session.ts     HMAC-signed session cookie, CSRF token
    security/members.ts     owner PIN, access codes, member store, Stripe webhook signature verify + event handling
    security/throttle.ts    login throttle per client
    server.ts               the app + API (node:http only)
    scan.ts                 CLI: scan and print the top cards
    doctor.ts               CLI: what is connected, what is missing, why
    selftest.ts             offline logic checks, PASS/FAIL lines
  web/
    index.html  login.html  css/app.css  js/*.js  manifest.json  icon.svg
  test/
    setup.ts                isolates GAVEL_DATA_DIR into a temp dir per test process
    *.test.ts               node --test
  docs/
    DESIGN.md AUCTIONS.md BIDDING.md PLAYBOOK.md MEMBERS.md SECURITY.md
```

## Coding rules (tsconfig is strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`)

- Import with `.ts` extensions: `import { x } from './foo.ts'`; `import type` for types.
- No `enum`, no parameter properties, no decorators, no namespaces (Node strips types only).
- ESM only. `import.meta.url` for paths, never `__dirname`.
- Node built-ins only: `node:http`, `node:crypto`, `node:fs`, `node:path`, global `fetch`.
- Every network call takes an injectable `fetchImpl` so tests never touch the internet.
- Every file starts with a comment that says what it is for, in plain English.
- Tests: `node --test`, files in `test/`, import `../src/x.ts`. Fixtures are labelled TEST FIXTURE.
- Web: vanilla ES modules in `web/js`, no framework, no bundler. External scripts only (CSP nonce; no inline handlers). Fonts from Google Fonts or a system stack.

## The API contract (server and UI both build to this)

Auth: cookie `gavel_session` (HttpOnly, SameSite=Strict). State-changing
requests carry header `x-gavel-csrf` matching the token from `/api/me`.
Unauthenticated `/` and `/api/*` → login page / `401 {error}`.

```
GET  /                         app shell (index.html) when signed in, else 302 /login
GET  /login                    login.html
POST /api/login                {pin} → owner  |  {email, code} → member.  Sets cookie. 401 on failure, 429 when throttled.
POST /api/logout
GET  /api/me                   {email, role:'owner'|'member', csrf, version, brand, liveBidding:boolean, sources:SourceStatus[]}

GET  /api/feed?q=&make=&maxPrice=&state=&tier=&starter=1|0&sample=1|0&sort=score|ending|price
                               → {kind:'LIVE'|'SAMPLE'|'EMPTY', scannedAt, errors:string[], hidden:number, cards:Card[]}
                               Card = {listing:Listing, estimate:Estimate, score:Score, demand?:{tier,why}}
GET  /api/listing/:id          → Card & {plan:BidPlan (defaults), walkthrough:Walkthrough}
                               Walkthrough = {source:'rules'|'ai', title, steps:[{n, title, body}], warnings:string[]}
POST /api/plan                 {listingId, resaleUsd?, repairsUsd?, distanceMiles?, feePct?, margin?} → BidPlan
POST /api/explain              {listingId, question?} → Walkthrough (AI when configured, else rules; never errors out)
POST /api/bid                  {listingId, maxBidUsd, note?} → {mode:'PAPER', paperBid:PaperBid, openUrl, message}
                               | when live would be possible: {mode:'LIVE', ...} — today always PAPER; 409 {error} if listing is SAMPLE and mode would be live.
GET  /api/watchlist            → WatchItem[]        POST /api/watchlist {listingId}     DELETE /api/watchlist/:listingId
GET  /api/paper                → PaperBid[]         POST /api/paper/:id/outcome {outcome:'won'|'lost'|'withdrawn'}
GET  /api/auctions             → {houses:AuctionHouse-ish[], sources:SourceStatus[]}  (functions stripped; include searchUrl for the current query via ?q=)
GET  /api/playbook             → {guides:Guide[]}   Guide = {id, title, tagline, level:'start'|'next'|'later', sections:[{title, steps:string[] | body:string, tip?, warning?}], checklist?:string[]}
GET  /api/rental?budget=&use=p2p|fleet|flip → {picks:[{make, model, years, whyPlain, watchOut, budgetFit}], steps:string[], notes:string[]}
GET  /api/vin/:vin             → VinDecode | 400
GET  /api/settings             → Settings           POST /api/settings {…partial} → Settings
GET  /api/admin/members        owner only → Member[] (codes never echoed in full; show last 4)
POST /api/admin/members        {email} → {member, code}  (the only time the full code is shown)
DELETE /api/admin/members/:email
POST /api/stripe/webhook       raw body; header stripe-signature; verifies HMAC-SHA256 over `${t}.${body}` with GAVEL_STRIPE_WEBHOOK_SECRET; handles checkout.session.completed, customer.subscription.updated, customer.subscription.deleted; 400 on bad signature; idempotent on event id.
```

Feed scoring pipeline (server): `scanAll()` → for each listing `estimateValue(l, pool)` →
`scoreListing(l, estimate, demand)` → `starterCheck(l)` → hide blocked cards when
`starter=1` (count them in `hidden`) → sort → cards.

## How to verify

```
npm run typecheck     # tsc --noEmit; zero errors
npm run selftest      # offline PASS lines
npm test              # node --test
npm start             # http://127.0.0.1:8790 — owner PIN printed at start
```
