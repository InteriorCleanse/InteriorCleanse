# Gavel — design spec ("Lot Tag")

## Thesis

An auction yard is already a design system: manila lot tags wired to
windscreens, black ink, one red rubber stamp, and numbers you can read from ten
feet. Gavel borrows it literally, so a beginner meets things they already
understand — a tag, a stub with a big number, a stamp, a checklist — instead of
a dashboard. Plain English sits in a plain sans; only the numbers shout.

Three judged directions fed this spec. Lot Tag won for beginner legibility and
for making the honesty labels (SAMPLE, PAPER) the most memorable element. Two
grafts were taken: from "Pit Wall", every number wears its label above and its
receipt below (source, comps count, verify link); from "Showroom", word tabs
instead of icon soup and a feed whose colour grows with the quality of the deals.

## What we refuse to do

No gradients, no glassmorphism, no blur shadows, no purple, no 16px-radius white
cards floating on grey, no Inter/Roboto, no icon library, no emoji, no AI
sparkle, no hero illustrations, no stock car photographs (a missing photo is a
plate that says so), no donut gauges, no skeleton shimmer, no blinking
countdowns, no distressed "vintage" texture, no truncated model names, no
success confetti. Red is never decorative.

## Tokens

| Variable | Light (default) | Night (`prefers-color-scheme: dark`) | Use |
|---|---|---|---|
| `--paper` | `#EDE4CF` | `#15130F` | page background |
| `--tag` | `#F8F3E7` | `#F8F3E7` | card, sheet, input surface (cards stay cream at night) |
| `--ink` | `#1C1A16` | `#1C1A16` on tag; `#EDE4CF` for text on paper | primary text, borders, primary button |
| `--ink-2` | `#5A554B` | `#5A554B` on tag; `#B8AE9A` on paper | secondary text (6.69:1 on tag) |
| `--ink-3` | `#B8AE9A` | `#B8AE9A` | hairlines, perforations, unfilled ticks — never text |
| `--hot` | `#B3261E` | `#B3261E` | SAMPLE, PAPER, red flags, ending soon (5.90:1 on tag as text; cream on hot 5.90:1) |
| `--hot-deep` | `#8E1B14` | `#8E1B14` | pressed hot |
| `--go` | `#1F6B3A` | `#1F6B3A` | STEAL and GOOD DEAL stamps, "in budget" (5.9:1 on tag) |
| `--wait` | `#8A5A00` | `#8A5A00` | FAIR stamp, cautions, "over budget" (5.7:1 on tag) |
| `--focus` | `#1C1A16` | `#EDE4CF` | 2px focus ring, offset 2px |

Colour is never the only signal: every stamp carries its word; every badge is a
word; go/wait/stop words accompany the colours.

## Type (Google Fonts, one `<link>`, `display=swap`)

- **Barlow Condensed 700/800** — tag numerals and headlines. Steal numeral 56px
  phone / 72px desktop, weight 800, line-height 0.9. Card title 22/26px, 700,
  uppercase, two lines max, never truncated. Price now 28/32px, 800. Section
  heads 18px, 700, uppercase, letter-spacing .06em. Stamp words 14/16px, 800,
  uppercase, .14em. NEVER BID ABOVE figure 40/56px, 800.
- **IBM Plex Sans 400/600** — every plain-English sentence. Body 16/24 phone,
  17/26 desktop. "Why it scores this" 15/22. Buttons 15px 600. Form labels
  14px 600.
- **IBM Plex Mono 500** — data and small labels, 12–13px uppercase, .08em:
  VIN, source, ENDS 2D 4H, STEAL SCORE, comps count, timestamps, ledger columns.

Fallbacks: "Arial Narrow", Arial, sans-serif · system-ui, sans-serif · ui-monospace, Menlo, monospace.

## Spacing and shape

4px grid: 4/8/12/16/24/32/48. Radius 6px on tags, 4px on chips, 0 on stamps.
Borders 1px ink. A tag lying on another: `box-shadow: 2px 2px 0 rgba(28,26,22,.12)` — hard, no blur.

## Shell

**Phone (< 960px).** Top strip 52px on paper, 1px ink rule below: eyelet ring +
GAVEL wordmark left; data-kind chip centre-right ("LIVE · eBay" ink outline, or
a solid hot band "SAMPLE DATA", or "NO SOURCE"); account ring right. Feed only:
a sticky filter rail of ink-outline chips, Starter mode first as a slide switch;
under it one mono line "Starter hid 7 cars — why?". Bottom bar 64px + safe
area, ink background, paper text, five WORD tabs: Feed · Watch · Auctions ·
Playbook · Rental. Settings and Admin live behind the account ring. Plan is a
full-screen route `#plan/<id>` with a back arrow.

**Desktop (≥ 960px).** A 220px ink rail on the left with the same word tabs
plus Settings; content max 1120px; the feed is a two-column grid of tags. Plan
is its own route on every size; on desktop it lays out in two columns, the
car, the ledger and the bid box on the left, the walkthrough on the right.

**Login.** One giant tag on a string: eyelet, wordmark, tagline, two segmented
tabs (Member: email + access code; Owner: PIN), one primary button, the server's
error text in hot beneath. One sentence says where a code comes from.

## The card (a lot tag)

1. **SAMPLE band** (only `kind === 'SAMPLE'`): 24px full-width hot band inside
   the top edge: "SAMPLE — NOT A REAL CAR", cream, Barlow 800 13px .14em. Also a
   second rotated (−6°) SAMPLE stamp on a cream plate over the photo area.
2. **Photo** 16:10, object-fit cover, 1px ink rule beneath, mono chip bottom-left
   "LOT · eBay · 2d 4h". No photo → cream plate "No photo from the source"
   (mono); for SAMPLE the plate shows the make's initials large in ink-3.
3. **Tag structure**: eyelet ring top-left of the paper region; a vertical
   perforation (2px dashed ink-3) with a 124px STUB on the right of the BODY.
4. **Body**: title (uppercase Barlow), mono sub-line "41,200 MI · CLEAN TITLE ·
   ATLANTA, GA"; money row "NOW $58,500" (label above: CURRENT BID or BUY NOW)
   beside "COMPS $74,000" with mono receipt "$70k–$78k · 6 comps" or the words
   **NOT ENOUGH COMPS** in wait colour; badge row (words): Clean title · Minor
   damage · Runs & drives · Keys · Ends in 2d 4h; "Why it scores this": three
   Plex Sans lines with "more"; RED FLAGS block (hot rule, ink text, warning
   glyph) when any; three buttons: **Plan my bid** (primary, ink), **Open the
   lot ↗** (outline; disabled with reason on SAMPLE), **Watch** (pin toggle).
5. **Stub**: mono "STEAL SCORE"; discount line "28% UNDER COMPS"; numeral
   Barlow 800 56/72px ink; "/100" mono; a ten-tick ruler (ticks filled ink up to
   score); the grade stamp (double rule, −3°): STEAL/GOOD DEAL in go, FAIR in
   wait, PASS in ink, UNPRICED hollow with an em dash numeral.

Screen readers hear one sentence: "Steal score 84 out of 100, steal, 28 percent
under comparable listings."

## Plan screen

Stub at the top (same component). Ledger calculator in mono columns: Resale
target − Buyer fee − Transport − Repairs − Cushion − Your margin = **NEVER BID
ABOVE $X** (Barlow 800 40/56px, ink, in a double-rule box). Inputs beside each
row. When the fee basis is unknown the row shows "sliding scale — enter the fee
from <house> calculator" in wait colour. Below: the walkthrough as numbered
Plex Sans steps with a mono line "EXPLAINED BY: rules" or "EXPLAINED BY: AI ·
checked against rules"; warnings in a hot-ruled block. The Bid box: max bid
input, **Place a PAPER bid** (hot button), the sentence "Paper means nothing
was sent to the auction. Practise here, then place the real bid on the
auction's own site." After placing: a PAPER stamp presses onto the receipt and
**Open the lot with this number ↗** appears.

## Stamps

Three stamp words only: SAMPLE, PAPER, and the grade. Double rule (2px outer,
1px inner), rotation ≤ 6°, uppercase Barlow 800. No distressing.

## States

- **Loading**: a dashed tag outline with "Reading eBay Motors…" (static).
- **Empty (no source, samples off)**: one tag: "No source connected" and the
  exact .env lines to add, plus the "Show sample cars" switch.
- **Error**: a hot-ruled strip with the server's sentence; never a blank page.
- **Starter hid N**: mono line with "why?" that lists each hidden car's reason.

## Motion

Paper being handled, never UI flying. Card settle 120ms (first six only);
stamp press 180ms scale 1.12→1; watch pin 80ms; sheets 220ms ease-out.
Countdowns update once a minute. `prefers-reduced-motion: reduce` sets every
duration to 0.01ms and removes transforms; JS reads matchMedia and skips the
stamp press.

## Icon

The eyelet ring: a 2px ink circle with a hole, on a cream tag square with a
notched corner. `web/icon.svg`.
