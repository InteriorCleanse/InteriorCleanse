# Gavel redesign — Pass 1: audit, direction, wireframes, plan

Status: **proposal, not built.** Nothing in this document is implemented until
the decisions in section 12 are made. `docs/DESIGN.md` and `docs/BRAND.md`
describe what is live today.

---

## 1. What Gavel actually is (checked in the code, not assumed)

| The brief says | What the code does | Consequence for the design |
|---|---|---|
| "scraping/data ingestion" | **No scraping, by rule.** Live data comes from official APIs (eBay Browse, GSA Auctions, MarketCheck; auto.dev and VinAudit for prices). Every other auction comes in through the member's own Import (paste, CSV, one-click button). | Never design a "scanning the web" theatre. "Scanning" means: reading the connected sources every 10 minutes. |
| "AI analysis" | Scores, estimates and walkthroughs are **rules** (`scoring.ts`, `valuation.ts`, `explain.ts`). Claude rewrites the walkthrough and runs the research desk **only when `ANTHROPIC_API_KEY` is set**. | Label it "Gavel's analysis". Say "written by AI" only where `walkthrough.source === 'ai'`. No sparkles. |
| "database" | Per-member JSON files (`store.ts`, `userFile()`). | No change. |
| "sniper system" | Targets + a 10-minute engine + **paper bids only** (`GAVEL_LIVE_BIDDING` gate; no source can bid). | Sniper must never look like it places bids. |
| "rental: rental price, duration, availability, fees" | Gavel's Rental is **starting a rental business**: which car to buy to rent out, budget fit, the first ten steps; the Garage tracks each car's costs and income. It does not list cars for hire. | Design "Rental business" around what exists. Do not invent rental prices or availability. |
| "best pick: BMW M340i, $28,400, $34,900" | Best pick = top Sniper pick: real listing, current bid, comps estimate (or NOT ENOUGH COMPS), plan's max bid. | Every figure in the new screens maps to a field below. |
| "bid history, engine, accidents, ownership, service" | Not in any source today. Listing has: year, make, model, trim, VIN, mileage, title status, damage, runs/drives, keys, body, transmission, drivetrain, fuel, colour, location, sale type, bid, buy-now, site estimate, ends at, bid count, seller type, photos, description, lot number. NHTSA gives recalls, complaints, safety stars; fueleconomy.gov gives MPG; vPIC decodes the VIN. | Show these as FACT with their source. Everything else is **UNKNOWN**, said out loud, with how to find out (history report on the VIN). |

## 2. Audit of the live app (rendered at 390px light, 1280px night)

### Keep (it works and is distinctive)
- The plan maths and **NEVER BID ABOVE** with every cost itemised (the receipt). No competitor computes a ceiling.
- NOT ENOUGH COMPS as a first-class state; SAMPLE and PAPER honesty.
- Paper-only Sniper with closing-rule advice per auction house.
- Per-member data, owner/member separation, autosaving Settings, Import.
- Motion engine (`motion.js`): settle, count-up, reduced-motion.
- The logo's shape (G + tachometer + gavel).

### Improve
- **Photos carry no weight.** On a phone the photo is 16:7 and the text column is narrower than the score stub; the car is not the hero.
- **The deal score is a 0–100 speedometer on every card.** The brief is right that a number without context means little, and a gauge on every card is "fake speedometers everywhere". The useful context is *where the price sits in the observed market range*, which we have (`low`, `high`, `valueUsd`, bid, max bid) and never draw.
- **"STEAL" is hype** and over-claims; the grade words need to describe evidence ("Well below market range").
- **Fact vs estimate vs interpretation is not visible.** A current bid (fact from the source), the market value (estimate from N comps) and the score (our interpretation) look identical.
- **Unknowns are hidden** unless they are badges ("? Runs: not stated").
- **Countdown urgency is flat.** "Ends in 23h 59m" looks the same as "Ends in 9m".

### Redesign
- **Home** → a command centre: one top opportunity with its evidence, then what is ending, then what changed.
- **Plan** → the **Vehicle** page (keeps the plan; adds valuation, spec sheet, known/unknown, recalls, comparables, auction rules).
- **Sniper** → a focused watch desk (time-ordered board), not a settings page with cards.
- **Feed** → **Discover**: photo-led cards, quick filters as removable chips, a search box that understands simple phrases.

### Consolidate
- **Saved searches = Sniper targets.** "Save this search" on Discover creates a target; one concept, not two.
- **Watch + paper-bid record** stays one screen: **Watchlist**.
- **Alerts** move out of Sniper into one place reachable from everywhere (a bell in the top bar).
- **Intel** (recalls, complaints, safety, MPG, research desk) feeds the Vehicle page's Research section instead of living only on its own screen.

### Remove
- Per-card gauges (one instrument on the Vehicle page only).
- Duplicate explanations of the score ("How the score works…" as a reason line).
- Repeated SAMPLE copy beyond the band and header chip (done), and any section that renders only to say it is empty when another module already covers it (partly done; finish everywhere).

## 3. Design direction

### The self-challenge
*Would yesterday's "Purple Sector" look right on another product?* Partly yes: near-black with neon purple, green and yellow, mono numbers and a gauge on every card reads as a crypto or esports dashboard as much as an automotive one. The timing-tower idea is right; the palette and the gauge-everywhere are not premium enough for a buying decision.

### Recommended: **"Spec Sheet"** — the inspection report, engineered
A buyer at auction trusts three documents: the **window sticker**, the **inspection report** and the **auction sheet**. They are calm, dense, precisely ruled, and every line says where it came from. Gavel's screens become those documents, set on a graphite instrument panel.

- **Graphite** foundations (night) and **warm chalk** paper (day, and every *report* surface in both modes).
- **One accent: Brass** — the colour of badge enamel and auction-house plaques. It marks the brand, where you are, and the primary action. Never data.
- **Data colours carry meaning only**: green = below the observed market range; amber = needs verification / unknown; red = risk. Facts are plain ink.
- **The instrument is the market-range bar**, not a speedometer: the observed range of similar cars, the estimate, the current bid and your ceiling on one ruled scale.
- **The car is the hero**: photos at 4:3 / 16:10, full-bleed on phones.
- **Evidence marks** on every number: FACT · ESTIMATE · ANALYSIS · UNKNOWN.

It fails the "random SaaS" test because its parts come from car documents — VIN-plate typography, ruled spec tables, window-sticker blocks, auction-sheet countdowns — and its one instrument shows a car price inside a car market.

### Alternative: keep Purple Sector, toned down
Same layouts as above, keep the current palette, replace per-card gauges with the range bar, drop "STEAL". Cheaper (less churn, brand already published) but keeps the crypto/esports risk.

## 4. Design system (Spec Sheet)

### Colour tokens

| Token | Night | Day | Role |
|---|---|---|---|
| `--bg` | `#0E1012` graphite | `#F4F2EE` chalk | page |
| `--surface` | `#16191C` | `#FFFFFF` | panels, cards |
| `--raised` | `#1D2125` | `#FAF9F6` | menus, sheets |
| `--report` | `#F4F2EE` | `#FFFFFF` | inspection-report and receipt surfaces (always light) |
| `--ink` | `#EEECE7` | `#141618` | text |
| `--ink-2` | `#A3A7AC` | `#5B5F64` | secondary text |
| `--rule` | ink 10% | ink 12% | hairlines |
| `--brass` | `#C9A45C` | `#8A6A2C` (text) / `#C9A45C` (fills) | brand, current nav, primary action, focus |
| `--below` | `#45C07F` | `#13784A` | below the observed market range |
| `--verify` | `#E3A63E` | `#8C5E00` | needs verification, unknown, ending today |
| `--risk` | `#EA5A50` | `#B42318` | red flags, over your ceiling, ending in minutes |

All text pairs to be checked to WCAG AA (4.5:1) before build; the table will carry ratios.

### Type
- **Archivo** (variable width): wordmark and screen titles at width 125; car names at width 100, weight 750, sentence case on cards ("2017 Toyota Corolla LE"), uppercase only in labels.
- **Geist**: sentences.
- **Geist Mono**: all numbers and VIN-plate labels, tabular.
- Scale: 12 / 13 / 15 / 17 / 21 / 28 / 40 / 56.

### Space, shape, depth
- 4px grid; card padding 16 (phone) / 20 (desktop); section gap 32 / 48.
- Radius: 14 cards, 10 controls, 6 chips, 2 evidence marks.
- Depth by surface tone, not shadow; one shadow for things that float (sheet, menu, sticky action bar).
- Rules: hairline between rows; double rule above a total (window-sticker style).

### Evidence marks (new, used everywhere a number appears)
```
●  FACT       from the source or a public database, with its name
◐  ESTIMATE   worked out by Gavel, with what it rests on ("from 4 similar cars")
◇  ANALYSIS   Gavel's interpretation (rules, or AI when the explainer is on)
○  UNKNOWN    not stated anywhere; says how to find out
```
Shape + word, never colour alone.

### Assessment language (replaces STEAL / GOOD DEAL / FAIR / PASS on screen)
| Score grade (unchanged in the engine) | Shown as |
|---|---|
| steal | **Well below market range** |
| good deal | **Below market range** |
| fair | **Near market range** |
| pass | **At or above market** |
| unpriced | **Not enough similar cars to price** |

The 0–100 score stays as a small secondary figure with its explanation one tap away.

### Countdown states
| Time left | Shown | Treatment |
|---|---|---|
| > 24h | `Ends Sat 4:42 PM` | plain |
| 3–24h | `Ends today 4:42 PM` / `Ends in 6h 10m` | ink, amber dot |
| 15 min–3h | `Ends in 1h 42m` | amber, live (updates every minute) |
| < 15 min | `Ends in 9m` | red, updates every 15s while visible |
| ended | `Ended 2h ago` | muted, struck from urgent lists |
| date only (GSA) | `Closes Oct 1` | plain, never a countdown |

### Motion (keeps motion.js; retuned)
Fast and mechanical: 120 / 200 / 320ms, one curve, no overshoot except a card landing (2%). The range bar's markers slide into place; numbers count up once; countdown digits change without animation (precision, not theatre). Reduced motion: everything at rest.

## 5. Navigation

```
DESKTOP (≥ 1024)                          PHONE
┌──────────┬───────────────────────────┐  ┌─────────────────────────┐
│ ◖G GAVEL │  [ Search cars…        ] 🔔│  │ ◖G GAVEL      🔔  (O)   │
│          │                           │  ├─────────────────────────┤
│ Home     │                           │  │                         │
│ Discover │      screen               │  │        screen           │
│ Sniper   │                           │  │                         │
│ Watchlist│                           │  │                         │
│ ──────── │                           │  ├─────────────────────────┤
│ Rental*  │                           │  │ Home Discover Sniper    │
│ Playbook │                           │  │ Watchlist More          │
│ Import   │                           │  └─────────────────────────┘
│ Auctions │
│ Settings │       * Rental and Garage move up for the rental goal
└──────────┘
```
- Feed is renamed **Discover**; Alerts become the bell (badge) in the top bar on every size; search lives in the top bar on desktop and at the top of Discover/Home on phones.
- Five phone tabs maximum. Garage, Intel, Auctions, Playbook, Import, Settings live in More.

## 6. Home — the command centre

```
PHONE (390)
┌─────────────────────────────────────┐
│ Good evening, Dee                    │
│ 2 sources live · read 4 min ago      │  ← ANALYSIS strip: scan status
│ [ Search: "Corolla under 10k" …   ] │
├─────────────────────────────────────┤
│ TOP OPPORTUNITY                      │
│ ┌─────────────────────────────────┐ │
│ │        [ photo 16:10 ]          │ │
│ │ ENDS IN 1H 42M                  │ │  ← countdown chip on photo
│ └─────────────────────────────────┘ │
│ 2017 Toyota Corolla LE               │
│ 58,400 mi · Atlanta, GA · eBay       │
│                                     │
│ Current bid ●     Market range ◐    │
│ $8,900            $11.9k–$14.2k     │
│ ├────●───────[░░░░▓░░░░]──────┤     │  ← range bar: bid · range · est.
│ Your ceiling ◐ $10,900              │
│                                     │
│ ◇ Well below market range           │
│  • Priced 34% under 3 similar cars  │
│  • Clean title stated by seller     │
│ ○ Unknown: service history, keys    │
│ ▲ Risk: buyer fee not yet known     │
│                                     │
│ [ View vehicle ]  [ Watch ]         │
├─────────────────────────────────────┤
│ NEEDS ATTENTION                      │  ← only cars ending <24h, not the top pick
│ ▪ 2019 Camry SE   $12,400  2h 10m ● │
│ ▪ 2018 Accord     $14,600  5h 02m   │
├─────────────────────────────────────┤
│ WHAT CHANGED                         │  ← alerts: new match, price moved
│ New match · 2018 Honda Accord EX-L   │
│ Price moved · Camry +$400 · 12m ago  │
├─────────────────────────────────────┤
│ YOUR PATH · 2 of 9 done (folded)     │
└─────────────────────────────────────┘
```
Rules: a section renders only when it has something the sections above do not already show. With no live source, the top strip says so and the top opportunity carries the SAMPLE band.

DESKTOP: two columns: left = top opportunity (large photo, range bar, analysis); right = Needs attention timeline + What changed; Your path below the fold.

## 7. Discover (was Feed)

```
┌─────────────────────────────────────┐
│ [ Search: make, model, "under 25k" ]│
│ Ending today ✕  Under $15k ✕  Clean │  ← removable quick filters
│ title ✕   + More filters            │
│ 23 cars · sorted by deal · Save ★   │  ← "Save this search" = Sniper target
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │        [ photo 4:3 ]            │ │
│ │ #1                ENDS 1H 42M   │ │
│ └─────────────────────────────────┘ │
│ 2017 Toyota Corolla LE · 58,400 mi  │
│ Atlanta, GA · eBay · Clean title ●  │
│ $8,900 ●   range $11.9k–$14.2k ◐    │
│ ├───●────[░░▓░░]────┤               │
│ ◇ Well below market range · 99      │
│ [ View vehicle ]           [Watch]  │
└─────────────────────────────────────┘
```
- Desktop: 3 columns ≥ 1280, 2 at 1024, list/table toggle for dense scanning (photo thumb, car, miles, bid, range bar, ends, assessment).
- Search understands (rules, not AI; the help text lists exactly what): make/model words, "under $25k", "under 60k miles", "ending today", "clean title", a state ("in GA"), a year range ("2018-2021"). Anything else is plain text search, and the screen says which words it understood.
- No photo: a ruled plate with the make's initial and "No photo from eBay" (source named).

## 8. Vehicle page (was Plan; route `#plan/<id>` kept, `#car/<id>` added)

```
┌─────────────────────────────────────┐
│ ← Discover                           │
│ [ photo gallery, swipe, 1/12 ]       │
│ ENDS IN 1H 42M · eBay · Lot 2231     │
│ 2017 Toyota Corolla LE               │
│ 58,400 mi ● · VIN …H000020 ●         │
│ [ Watch ] [ Open auction ↗ ] [Alert]│  ← sticky action bar on phone
├─────────────────────────────────────┤
│ SUMMARY                     ◇ ANALYSIS
│ Well below market range.             │
│ What we found · Why it matters ·     │
│ What could go wrong · What we don't  │
│ know · What to do next   (expand)    │
├─────────────────────────────────────┤
│ VALUATION                            │
│ Current bid ●          $8,900        │
│ Market range ◐ (3 cars) $11.9–14.2k  │
│ Estimate ◐              $13,433      │
│ Gap to estimate ◐      −$4,533       │
│ ├───●─────[░░▓░░]──│──┤             │
│        bid    range   ceiling        │
├─────────────────────────────────────┤
│ THE NUMBER (receipt, kept)           │
│ … every cost … ══ NEVER BID ABOVE ══ │
├─────────────────────────────────────┤
│ SPEC SHEET            (VIN-plate)    │
│ Engine ○ decode VIN · Trans ● auto   │
│ Drive ● FWD · Fuel ● gas · Body ●    │
│ Title ● clean (seller) · Seller ●    │
├─────────────────────────────────────┤
│ HISTORY                              │
│ Accidents ○ · Owners ○ · Service ○   │
│ → Run a history report on this VIN   │
│ Recalls ● NHTSA: 2 open campaigns    │
├─────────────────────────────────────┤
│ AUCTION                              │
│ Closing rule ● hard end (eBay)       │
│ Buyer fee ● none on vehicles (eBay)  │
│ How to bid ◇ snipe at 8s, at $10,900 │
├─────────────────────────────────────┤
│ RISKS   ▲ …    UNKNOWN  ○ …          │
├─────────────────────────────────────┤
│ COMPARABLE CARS (the 3 used)         │
│ 2018 Corolla LE · 61k mi · $13,100 ●│
├─────────────────────────────────────┤
│ HOW TO BUY (walkthrough, kept)       │
│ PAPER BID box                         │
└─────────────────────────────────────┘
```
Desktop: gallery + summary + valuation left (8 columns); a sticky right rail (4 columns) holds the countdown, the receipt total, and the actions.

## 9. Sniper — the watch desk

```
┌─────────────────────────────────────┐
│ SNIPER · watching 3 searches         │
│ Paper only: Gavel never bids for you │
├─────────────────────────────────────┤
│ CLOSING NEXT                         │  ← one board, time-ordered
│ 9m  ● 2019 Camry SE   $12,400 → max $14,300  READY │
│ 1h  ● 2017 Corolla    $8,900  → max $10,900  ARMED │
│ 6h  ○ 2018 Accord     $14,600 → max $17,000  WATCH │
├─────────────────────────────────────┤
│ SEARCHES (targets)                   │
│ My first rental car  · Toyota, Honda │
│ ≤ $12,000 · 3 matches · scanned 4m   │
│ [Edit] [Pause]                       │
└─────────────────────────────────────┘
```
States: WATCHING · MATCH FOUND · READY (in the bidding window) · ARMED (records a paper bid) · PAPER BID RECORDED · ENDED. "Armed" always says "paper".

## 10. Watchlist & alerts

```
WATCHLIST                     ALERTS (bell)
2017 Corolla  $8,900 · 1h 42m  New match · Accord EX-L · 12m
 saved at $8,400 ▲ $500        → why: matches "My first rental car"
 [View] [Remove]               → [View vehicle] [Dismiss]
PAPER BIDS: 3 · won 1 · lost 1
```
Alert kinds: **NEW MATCH** (exists), **PAPER BID RECORDED** (exists), **ENDING SOON** (new: a watched car under 2h), **PRICE MOVED** (new: watched car's price differs from its saved snapshot). Each says what happened, why it matters, and one action.

## 11. Rental business

```
RENTAL BUSINESS · your road: rent it on an app like Turo
Cash for one car $12,000 · ceiling about $10,980 ◐
┌ In budget ───────────────────────┐
│ Toyota Corolla 2015–2022  ◐ $9–20k│  rough band, labelled estimate
│ Why ◇ cheap to run …  Watch out ▲ │
│ [ Find one in Discover ]          │
└──────────────────────────────────┘
2 more over budget (folded)
THE FIRST TEN STEPS (numbered: it is a real sequence)
GARAGE: per-car ledger — costs in, income out, net ●
```
No rental prices or availability are shown: Gavel does not have them.

## 12. Decisions needed before building

1. **Direction**: Spec Sheet (recommended: graphite + chalk + brass, the logo's three sectors become one brass redline) or keep Purple Sector toned down.
2. **Grade words**: replace STEAL / GOOD DEAL / FAIR / PASS on screen with the market-range language above (engine unchanged).
3. **Small backend additions** (each read-only or additive, each tested):
   - a. return the comparable cars behind an estimate with `/api/listing`;
   - b. ENDING SOON and PRICE MOVED alerts for watched cars;
   - c. a rule-based search parser for Discover ("under 25k", "ending today"…);
   - d. alert bodies say "Well below market range" instead of "(steal)".

## 13. Implementation phases (each: build → render → screenshot at 320/390/768/1024/1440 → critique → fix → tests → commit)

| Phase | Scope | Main files |
|---|---|---|
| 1 | Tokens, type, evidence marks, assessment words, countdown component | `web/css/app.css`, `web/js/ui.js`, `web/js/api.js` |
| 2 | Shell: nav rename, bell + alerts sheet, top-bar search, logo recolour | `web/index.html`, `web/js/app.js`, `web/brand/*` |
| 3 | Range bar + vehicle card (photo-led); Discover grid/list, quick filters, save search | `web/js/ui.js`, `web/js/feed.js` |
| 4 | Home command centre | `web/js/home.js`, `src/server.ts` (`/api/home` only if needed) |
| 5 | Vehicle page: gallery, summary, valuation, spec sheet, history, auction, risks, comparables | `web/js/plan.js`, `src/server.ts` (decision 3a) |
| 6 | Sniper watch desk; Watchlist + alerts | `web/js/sniper.js`, `web/js/watch.js`, `src/sniper/*` (3b) |
| 7 | Rental business + Garage alignment | `web/js/rental.js`, `web/js/garage.js` |
| 8 | Search parser + skeleton/empty/error states everywhere | `src/search.ts` (new, 3c), `web/js/*` |
| 9 | Responsive pass 320–1920, accessibility pass, final visual QA, docs | all; `docs/DESIGN.md`, `docs/BRAND.md` |

## 14. Skills

| Skill | Why |
|---|---|
| `redesign-existing-projects` | Audit-first upgrade of a working app without breaking it (used for section 2). |
| `design-taste-frontend` | Anti-template pre-flight on every screen. |
| `high-end-visual-design` | Premium spacing, type and surface decisions. |
| `ux-designer`, `ui-ux-pro-max` | Information hierarchy, mobile patterns, accessibility rules. |
| `motion-design` | Retuning motion to "precise, not theatrical". |
| `dataviz` | The market-range bar and any chart: to scale, labelled, readable in both themes. |
| `brand`, `design-system` | Updating BRAND.md and the token layers. |
| `frontend-ui-engineering` | Responsive and WCAG implementation discipline. |
| `anthropic-skills:skill-creator` | Turn the render → screenshot → critique loop into a project skill (`gavel-visual-qa`) so later sessions repeat it. |

Not available in this environment: Anthropic's `frontend-design`, `webapp-testing`, `canvas-design`, `theme-factory`, `brand-guidelines`. Their jobs are covered above, and Playwright (already used for every screenshot so far) does the webapp-testing work. **No new third-party skills are installed**: the vendored set is already provenance-checked in `.claude/README.md`.

## 15. Rules that hold throughout
No invented car, price, time, history or comparable; SAMPLE and PAPER always labelled; no scraper; no bidding path; NOT ENOUGH COMPS stays; no promise words; reduced motion respected; every phase keeps `npm run check` green.
