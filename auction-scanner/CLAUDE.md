# Gavel — the standing brief for any session in `auction-scanner/`

Gavel is an AI car-auction scanner: it reads auctions, finds clean cars priced
under their comparables, scores and explains each one in plain English, works
out the most a person should bid, and teaches a beginner how to buy, flip,
fix and rent cars. It is a members-only web app with paper bidding by default.
It is a stand-alone product inside this repository and shares nothing with any
other folder.

`BRIEF.md` holds the owner's ask in their words, the product rules, the file
ownership map and the API contract. Read it first.

## The owner's goal

Nice cars, dumb cheap, all makes; supercars and cars that flip well favoured;
no salvage to begin with; explained so someone with no car experience can act;
a rental car company as the first business, starting with one car.

## Rules that do not bend

- **Never invent a car or a number.** Data is LIVE (a connected source) or
  SAMPLE (labelled on every card, VIN `SAMPLE…`, URL `#sample`). SAMPLE never
  enters a LIVE estimate. Fees come from published schedules with a verify
  link; sliding scales are called sliding scales, never a made-up percent. An
  estimate needs `config.scoring.minComps` comparables or the card says NOT
  ENOUGH COMPS. State laws vary by state and the text says so.
- **No promise words**: guaranteed, proven profitable, risk-free, best
  investment, get rich. The demand list is a starting watchlist with reasons.
- **Paper bidding by default, gated twice.** A bid is PAPER unless
  `GAVEL_LIVE_BIDDING=1` and the source's `capabilities.bid` is true. No
  source has it. Never pretend a bid was placed; never add a second bidding
  path.
- **Starter mode on by default**, and every hidden car says why.
- **Plain English**: short sentences, explain a term the first time.
- **Placeholders only for credentials.** No real key ever enters the repo.
- **Zero runtime dependencies.** Node 22 runs the TypeScript directly:
  imports end in `.ts`, `import type` for types, no enums, ESM, `node:` built-ins.
- **Do not borrow** code, design or voice from any other folder in the
  repository. Do not read them for patterns.

## Layout

`src/server.ts` (node:http app + API) · `src/sources/` (eBay, GSA and
MarketCheck adapters, the importer, directory, SAMPLE, registry) · `src/valuation.ts` `scoring.ts` `filters.ts`
`fees.ts` `bidplan.ts` `demand.ts` (the engine) · `src/explain.ts` `ai.ts`
(walkthrough, optional Claude) · `src/paper.ts` `settings.ts` `garage.ts` `store.ts`
(JSON stores; personal files resolve through `userFile()` into the
member's folder while a request runs in `withUser()`) · `src/playbook/content.ts` `rental.ts` (the
teaching) · `src/knowledge/` (policies, regulations, glossary, search) ·
`src/research/` (car intel from public databases; the web desk) ·
`src/sniper/` (targets, engine, alerts; paper fires only) · `src/security/` (CSP nonce, sessions, members, throttle, Stripe
signature) · `web/` (vanilla ES modules, no build; `docs/DESIGN.md` is the
design spec) · `test/` (`node --test`, offline; `test/setup.ts` puts the data
dir in a temp folder) · `scan.ts` `doctor.ts` `selftest.ts` (CLIs).

## Per-member data

Every signed-in API call runs inside `withUser(session.email)`. Anything a
member owns must be read and written through `userFile(name)`, never a bare
file name, or it leaks between members. Shared files (members, Stripe
events) use bare names on purpose. The Sniper runs once per member scope.

## Verify before you push

```
npm run typecheck     # zero errors; no `any`, no ts-ignore
npm run selftest      # all PASS
npm test              # all pass, offline
npm start             # boots, prints the PIN; sign in; the feed shows SAMPLE cars
```

For UI work, drive the app in Chromium at 390×844 and 1280×800 and look at the
screenshots. Data for a test run goes in a temp `GAVEL_DATA_DIR`, never `data/`.

## Not built yet (truthfully)

- No live bidding adapter: no auction publishes one to the public. The
  Sniper therefore fires on paper and hands the person the number and the time.
- Live sources: eBay Motors, GSA Auctions, MarketCheck (official APIs only).
  Copart, IAA, Manheim, ADESA, ACV, Cars & Bids, Bring a Trailer, GovDeals
  and the collector houses have no public API; members bring their lots in
  through the importer (button, paste, CSV). Never add a scraper.
- No email sending: the owner sends access codes.
- No paid value guide: estimates are medians of the comparables in the scan.
- No two-factor login; no rate limit on the feed beyond the scan cache.
