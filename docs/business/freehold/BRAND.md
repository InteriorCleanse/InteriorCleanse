# Freehold brand

Written 2026-09-27 from `NAME.md` and the Phase 0 documents. This is the
contract the site, the mark, and every piece of copy follow.

## The idea in one line

Software you own outright.

## Voice

Freehold speaks like a good solicitor: plain, exact, unhurried, never
selling. Short sentences. No exclamation marks, no emojis, no superlatives,
no "revolutionary". It says what it does and what it does not do in the same
breath. It states prices without apology and limits without embarrassment.
It never claims a client, a number, or a result it cannot show.

Three words: **plain, exact, discreet.**

What it never says: "game-changing", "unlock", "supercharge", "seamless",
"10x", "AI-powered" as a virtue, "trusted by" without a name that agreed to
be named, any commission rate, any uptime figure, any client's name.

## Two lines of business, one name

| Line | Buyer | What it is |
| --- | --- | --- |
| **Freehold Build** | People burned by hosted app builders | Describe the app; it is generated as a Next.js repository in your GitHub, a Postgres database in your account, a deployment on your Vercel, on your own API key. You are never charged for a build the AI could not finish. Not launched yet: a waitlist. |
| **Freehold Private** | Family offices, wealth advisors, chiefs of staff, and the founders they serve | An entry engagement (a fixed-fee digital-footprint and email-security gap review, two weeks) and an anchor engagement (bespoke private software delivered into the client's own infrastructure). Fees quoted after a twenty-minute call; no price is published until the owner sets the floor. |

## Palette

Named after the deed and the vault. Contrast checked in `freehold/scripts/check-contrast.mjs`.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--deed` | `#F4EFE4` | `#0E1524` | Page background |
| `--paper` | `#FBF8F1` | `#151D2E` | Raised surfaces, cards |
| `--vault` | `#0E1524` | `#F4EFE4` | Text, the mark |
| `--stone` | `#5B5F6B` | `#A9AEBA` | Secondary text |
| `--seal` | `#7C2D2D` | `#D0716B` | The one accent: links, the seal dot, focus rings |
| `--hairline` | `#D9D2C3` | `#263041` | Rules and borders |

No gradients, no glass, no glow. One accent, used sparingly, like a wax
seal on a page.

## Type

- Display: **Instrument Serif**, regular, tight tracking, large. Headlines
  are sentences, not labels.
- Body: **Instrument Sans**, variable, 17px base, 1.6 line height.
- Wordmark: FREEHOLD in Instrument Serif, small caps feel via letter-spacing
  of 0.18em, never bold.
- Numbers and section markers set as `01`, `02` in the sans, stone colour.

Both fonts are self-hosted from `@fontsource`, not fetched from Google at
runtime.

## The mark

A single unbroken square outline, stroke 1.5 units on a 24 grid, with a
small filled seal dot at the lower right corner outside the square. The
square is the boundary of a plot you own; the dot is the seal on the deed.
It reads at 16 px as a favicon and at 3000 px on a letterhead. Files in
`freehold/public/brand/`: `mark.svg`, `wordmark.svg`, `lockup.svg`,
`favicon.svg`, and the OG image is rendered by the site from the same
geometry.

## Layout

Wide margins, a 72 rem page, a 38 rem measure for prose. Sections numbered
like a document. Hairline rules, not boxes. Motion limited to a 300 ms fade
and a 4 px rise on reveal, disabled under `prefers-reduced-motion`.

## What the site must never do

Publish a price the owner has not set. Show a testimonial. Claim a client.
Quote a partner's rate. Collect a form without saying where it goes. Use a
stock photograph of a person or an office.
