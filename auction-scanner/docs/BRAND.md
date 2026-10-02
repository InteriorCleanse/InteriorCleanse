# Gavel — brand book

How Gavel looks, sounds and shows itself. The screen-by-screen rules are in
`docs/DESIGN.md`; this is the identity they come from.

## The idea in one line

**Gavel is the pit wall for car auctions:** every car on the tower, one number
for how good the deal is, one number you must never bid above, and the clock.

## Why this, not what the others do

Every auction house owns one colour on white: Copart yellow and blue, IAA red,
Bring a Trailer red, ACV orange, Manheim navy and gold, Carvana cyan. Their
screens are built for the house, not the buyer. What buyers say about them,
again and again:

- **The fees are a surprise.** A $5,000 Copart bid costs about $6,000 all in;
  even CarGurus' "Great Deal" badge leaves dealer fees out.
- **Nobody says what to pay.** Values are a seller's estimate, a paywalled
  chart, or a dealer-only number.
- **Nobody admits when they do not know.** No site says "not enough similar
  cars to price this".
- **The apps are slow, cluttered and built for pros.**

Gavel answers each one, and the brand says so before a word is read: dark,
calm, dense with numbers that mean something, and honest about every dollar.

## Personality

| Gavel is | Gavel is not |
|---|---|
| A calm crew chief on the radio | A hype man |
| Precise: the number, then the reason | Vague: "great deal!" |
| Plain English, short sentences | Jargon, codes, acronyms |
| Honest about doubt ("not enough comps") | Falsely sure |
| On the buyer's side | On the auction's side |

## Voice

- Lead with the number or the instruction, then why. "Never bid above $10,900.
  The plan shows where every dollar goes."
- Explain a term the first time it appears.
- Never promise money. No "guaranteed", "risk-free", "proven profitable",
  "get rich", "best investment".
- Say SAMPLE and PAPER plainly; never pretend a car is real or a bid was sent.
- Tagline: **Clean cars, dumb cheap, explained.** (one place: `src/brand.ts`)

## The logo

**The mark** is three ideas in one shape:

- a **G** for Gavel,
- drawn as a **tachometer**, with the three timing sectors where the redline
  would be: yellow, green, purple, the same colours that grade every deal;
- and a **gavel** for its crossbar, tilted 14° as it strikes.

**The wordmark** is GAVEL in Archivo at its widest (width 125), weight 900,
letter-spaced .06em: wide and planted, like a badge on a boot lid.

### Files

| File | Use |
|---|---|
| `web/brand/mark.svg` | The mark for dark backgrounds (light ink) |
| `web/brand/mark-dark.svg` | The mark for light backgrounds (night ink, deeper sector colours) |
| `web/icon.svg` | App icon and favicon: the mark on a night rounded square |
| `web/brand/maskable.svg` | Full-bleed square for Android's maskable icon (mark inside the 80% safe zone) |
| `web/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png` | Rendered from the SVGs above |
| Inline in `web/index.html` and `web/login.html` | The mark drawn in `currentColor`, so it follows night and day |

### Rules

- **Clear space**: at least the height of the gavel head on every side.
- **Smallest size**: 16px for the mark alone (the sectors still read); 120px
  wide for the mark with the wordmark.
- **Lockup**: mark left, wordmark right, wordmark cap height about 45% of the
  mark, gap one third of the mark.
- **Colour**: the ink is the surface's text colour; the three sectors are always
  yellow, green, purple, in that order towards the top. In one colour (a stamp,
  an engraving), the sectors go the ink colour.
- **Never**: stretch it, rotate it, outline it, put it on a photo without a
  dark plate, change the sector order or colours, add a glow or shadow, or put
  the wordmark in another typeface.

## Colour

Night is the brand; Day is the same system for bright screens. The full table
with contrast ratios is in `docs/DESIGN.md`.

| Name | Night | Means |
|---|---|---|
| **Pit wall** | `#0B0D0F` | the background |
| **Carbon** | `#15181C` | cards and panels |
| **Chalk** | `#F2F2F0` | text, the logo's ink |
| **Sector purple** | `#B65CFF` | the best in the session: a STEAL, P1, where you are |
| **Sector green** | `#00D26A` | good: a GOOD DEAL, under market |
| **Sector yellow** | `#FFD60A` | caution: FAIR, not stated, the next step |
| **Flag red** | `#FF453A` | stop: red flags, SAMPLE, PAPER, over your number |
| **Receipt** | `#F5F3EE` | the one paper surface: the itemised plan |

Colour is never decoration and never the only signal: every coloured thing
carries its word.

## Type

| Face | Role |
|---|---|
| **Archivo** (variable width) | The voice: wordmark and headlines wide (125), car names at normal width |
| **Geist** | Every sentence a person reads |
| **Geist Mono** | Every number: prices, scores, gaps, clocks; tabular so nothing jitters |

All three are free on Google Fonts.

## Signature moves

1. **The deal-score gauge**: a 240° tachometer that sweeps to the score in the
   grade's colour.
2. **The timing tower**: the feed ranked P1, P2, P3 by deal score; P1 in purple.
3. **Gap to market**: "−$6,569", read like a lap interval.
4. **The receipt**: the plan's numbers itemised on paper, totalled to NEVER BID
   ABOVE between two heavy rules.
5. **Sector lights**: the logo's three sectors light in turn when you sign in.

## In the wild

- **App icon**: the mark on night, rounded square.
- **Social avatar**: the mark alone, night background, centred, the sectors
  never cropped.
- **Shared cars or plans**: night background, the car's name in Archivo, the
  gauge, the gap, NEVER BID ABOVE; the SAMPLE band whenever it is a sample.
