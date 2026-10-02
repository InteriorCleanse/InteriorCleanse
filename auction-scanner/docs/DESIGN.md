# Gavel — design spec ("Purple Sector")

The brand behind it (story, voice, logo rules) is in `docs/BRAND.md`.

## Thesis

A motorsport timing wall already shows what a car buyer at auction needs to
see: many cars ranked, a number for each, a gap, a clock, and colours that mean
the same thing every time. Gavel uses that language. The screens are the pit
wall at night: near-black, dense with numbers that never jitter, and coloured
only where the colour carries meaning.

- **Purple** = the best in the session: a STEAL, P1 on the feed, the screen you
  are on.
- **Green** = good: a GOOD DEAL, under market, starter rules met.
- **Yellow** = caution: FAIR, things not stated, the next step.
- **Red** = stop: red flags, SAMPLE, PAPER, a price over your number.

Every colour also carries its word, so nothing depends on colour alone.

One surface is not the pit wall: the Plan's numbers print on a paper receipt,
because hidden fees are the niche's top complaint and a receipt is the
universal sign that every dollar is listed.

Chosen over two other directions (a stamped auction-ticket look, the last
theme, and a racing-green concours look) after studying Copart, IAA, Bring a
Trailer, Cars & Bids, PCARMARKET, Collecting Cars, CarGurus, Classic.com,
Hagerty, ACV, Manheim and Carvana. Each of those owns one hue on white; none
owns performance data, none computes a number to bid, and none admits low
confidence. Gavel does all three.

## What we refuse to do

No colour gradients on surfaces or the logo (the login's single faint purple
glow and the receipt's torn edge are the only soft shapes), no glassmorphism, no
colour used as decoration, no stock car photographs (a missing photo is a ruled
plate that says so), no emoji, no AI sparkle, no skeleton shimmer, no blinking
countdowns, no confetti, no truncated model names, and no promise words.

## Tokens (`web/css/app.css` `:root`)

| Variable | Night (default) | Day (`prefers-color-scheme: light`) | Use |
|---|---|---|---|
| `--paper` | `#0B0D0F` | `#EEEFF1` | page background |
| `--paper-2` | `#111418` | `#E3E5E8` | wells, inputs, photo plates |
| `--tag` | `#15181C` | `#FFFFFF` | cards, panels, sheets |
| `--tag-2` | `#1B1F24` | `#F6F7F8` | raised: menu, tiles inside panels, save bar |
| `--ink` | `#F2F2F0` | `#0B0D0F` | text and primary button fill |
| `--ink-2` | `#9BA3AD` (7.0:1 on tag) | `#545B66` (6.9:1) | secondary text |
| `--ink-3` | `#2C3138` | `#D3D7DD` | gauge track, hairlines — never text |
| `--edge` | ink at 9% | ink at 10% | every surface's 1px edge |
| `--best` | `#B65CFF` (5.1:1) | `#7A2BD9` (6.6:1) | purple: STEAL, P1, current screen |
| `--go` | `#00D26A` (8.8:1) | `#007A38` | green: GOOD DEAL, under market |
| `--wait` | `#FFD60A` (12.6:1) | `#7A5C00` | yellow: FAIR, caution, next step |
| `--hot` | `#FF453A` (5.2:1) | `#D70015` | red: flags, SAMPLE, PAPER |
| `--*-fill` | as above | the bright night values | solid chips; text on them is `--on-signal` `#0B0D0F` |

The rail and phone tab bar stay night-dark in both modes: they are the brand's
anchor. The receipt sets its own light tokens inside `.receipt-paper`.

## Type (Google Fonts, one `<link>`, `display=swap`)

- **Archivo** (variable width): headlines and the wordmark at width 125, weight
  850–900, uppercase (h1 `clamp(28px, 4.4vw, 46px)`); section heads at width
  112, 14px, .1em; car names at width 100, 800, 21/23px, never truncated, and
  hyphenated model names never break.
- **Geist** 400–600: every plain-English sentence, 15.5/16px, line-height 1.55.
- **Geist Mono** 500–600: every figure — prices, scores, gaps, clocks, counts,
  the ledger — with tabular numbers, so nothing jitters as it changes. Small
  labels 11.5px uppercase .06em.

Fallbacks: "Arial Narrow", Arial · system-ui · ui-monospace, Menlo.

## Shape

4px grid. Radius 12px on cards and panels, 9px on buttons and inputs, 7px on
chips, 5px on grade chips and badges. Surfaces have a 1px `--edge` and one
`--shadow` (a hairline ring plus a deep soft fall-off); hover lifts 3px onto
`--shadow-lift`.

## Shell

**Phone (< 960px).** Top strip 52px: the logo mark and GAVEL wordmark left; the
data chip ("LIVE · eBay", a red "SAMPLE DATA", or "NO SOURCE") and the account
ring right. Bottom bar 64px + safe area, night-dark, word tabs; the current tab
carries a purple bar that grows from the centre.

**Desktop (≥ 960px).** A 220px night rail: the mark and wordmark at its head,
then word tabs; the current screen is a lit row with a purple sector bar, like
the leader on a timing tower. Content max 1120px; the feed is two columns.

**Login.** One card on the night page under a faint purple glow: the mark (its
three sectors light in turn, yellow, green, purple), GAVEL, the tagline, a
segmented Member/Owner control, one button.

## The card

1. **SAMPLE band** (only `kind === 'SAMPLE'`): 24px red band, "SAMPLE. NOT A
   REAL CAR.", dark text. With the header chip, the card's one SAMPLE label.
2. **Photo** 16:10 (16:7 when there is none: a ruled plate with the make's
   initial outlined and "No photo"). Bottom-left a dark chip "eBay · Ends 2d
   4h"; top-left the **position** "P1", "P2"… when the feed is sorted by deal
   score — P1 in purple, like the fastest car on the tower.
3. **Body**: the car's name; a mono line of miles, state, VIN; the money row —
   CURRENT BID, SIMILAR CARS SELL FOR (with "$18.7k–$21.4k · 3 cars", or NOT
   ENOUGH COMPS in yellow), and **GAP TO MARKET** "−$6,569" in green (or "+$…"
   in red), read like a lap interval; facts as words with a mark (✓ Clean
   title, ? not stated, ✕ salvage title); at most two reasons that the facts do
   not already say, with every reason behind "N more reasons"; red flags; Plan
   my bid · Open the lot ↗ (absent on SAMPLE) · Watch.
4. **Stub**: "DEAL SCORE", the **gauge**, the grade chip, "29% under similar
   cars".

## The gauge

A 240° tachometer: a `--ink-3` track and a value arc in the grade's colour
(purple STEAL, green GOOD DEAL, yellow FAIR, grey PASS; UNPRICED is a dotted
empty track with an em dash). The number sits in the middle in Geist Mono,
"/100" under it. Screen readers hear one sentence: "Deal score 84 out of 100,
Steal, 28 percent under comparable listings."

## Grade chips

Four grade words — STEAL, GOOD DEAL, FAIR, PASS — plus UNPRICED, SAMPLE and
PAPER. Solid timing-colour chips with dark text (UNPRICED is an outline),
Archivo 800 width 112, .12em, no rotation.

## Plan screen

The car with its gauge; "Why it scores" folded to its main reason; then **the
receipt**: a light paper card headed "THE NUMBER · ITEMISED · EVERY DOLLAR",
each line in mono with its input, dotted rules between, and the total between
two heavy rules — NEVER BID ABOVE $X in Geist Mono 40–58px — with a torn
bottom edge. One line says what is still to type. The Bid box: "Before you
bid: do the first four checks", the max-bid input, **Place a PAPER bid** (red).
The walkthrough on the right (below on a phone).

## States

- **Loading**: a dashed outline with "Reading eBay Motors…" in mono (static).
- **Empty (no source, samples off)**: for the owner the exact lines to add and a
  Connect button; for a member, that the owner has not connected one, and Import.
- **Error**: a red-edged strip with the server's sentence; never a blank page.
- **Starter hid N**: mono line with "why?" that lists each hidden car's reason.

## Motion

Paper being handled, never UI flying. One signature curve and three durations:

| Token | Value | Use |
|---|---|---|
| `--ease` | `cubic-bezier(.2, 0, 0, 1)` | everything on screen: hovers, presses, colour |
| `--ease-emph` | `cubic-bezier(.05, .7, .1, 1)` | entrances: headers, sheets, toasts, menus, the gauge |
| `--ease-in` | `cubic-bezier(.3, 0, 1, 1)` | exits |
| `--ease-paper` | `cubic-bezier(.34, 1.26, .64, 1)` | a card landing: about 3% overshoot |
| `--t-quick` / `--t-std` / `--t-slow` | 140 / 260 / 480ms | press / state change / entrance |

`web/js/motion.js` watches `<main>`, so screens only render HTML:

- **Cards settle.** New cards rise 16px and settle, 45ms apart, at most seven
  staggered (under 350ms in all). Only cards on screen move; a card already
  shown on this visit does not move again when a screen re-renders.
- **The gauge sweeps** from zero to the score (900ms) as its card lands, and the
  grade chip flashes in 280ms later.
- **Numbers count up** to their value (scores, prices, tile figures) in 720ms;
  the text at rest is exactly what the server sent.
- **NEVER BID ABOVE** counts from the old number to the new one when the plan
  changes, with a brief green wash.
- **Sheets** rise (phone) or pop (desktop) over a fading scrim and slide away
  before they close; **toasts** rise in and drop out; the **menu** drops from
  its corner.
- **Hover** lifts a card 3px; **press** puts it back. Buttons rise 1px on
  hover and sink on press.
- **Login**: the mark's three sectors light in turn, once.

Countdowns update once a minute; nothing blinks. `prefers-reduced-motion:
reduce` turns every animation off and motion.js does not start: cards, gauges
and numbers appear at rest, sheets close at once.

## Icon

The mark (see `docs/BRAND.md`) on a night-dark rounded square: `web/icon.svg`,
`web/icons/icon-192.png`, `icon-512.png`, a full-bleed `maskable-512.png`, and
`apple-touch-icon.png`. Sources in `web/brand/`.
