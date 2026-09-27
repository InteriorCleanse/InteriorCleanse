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

Deeds are paper and ink, so the palette is paper, graphite, and one accent:
signature ink, a cobalt. Cream-and-oxblood was the first draft and was
dropped because it is the default reach for anything called luxury; a private
firm should not look like a template for one. Contrast checked in
`freehold/scripts/check-contrast.mjs` in both modes.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--paper` | `#F2F3F0` | `#0F1115` | Page background |
| `--plate` | `#E9EBE6` | `#171A20` | Raised surfaces, the plat's sheet |
| `--graphite` | `#15171C` | `#ECEDE9` | Text, the mark, primary button |
| `--stone` | `#5C616B` | `#A2A7B1` | Secondary text |
| `--ink` | `#1E3FAE` | `#8AA4FF` | The one accent: links, the seal, the signature, focus rings |
| `--hairline` | `#D3D6D0` | `#272B33` | Rules and borders |

No gradients, no glass, no glow. A fixed paper-grain overlay at 4 percent.

## Type

- Display: **Instrument Serif**, regular, at very large sizes. Justification,
  because a serif is the lazy choice for anything premium: Freehold sells
  ownership under law to buyers who read contracts; the serif is the face of
  the deed, not a mood. Headlines are sentences under eight words.
- Body: **Instrument Sans**, variable, 17px, 1.6 line height.
- Technical: **JetBrains Mono** for survey labels, small captions, and step
  numbers. It is the ledger voice.
- Wordmark: FREEHOLD in the serif, letter-spaced 0.18em, never bold.

All three are self-hosted from `@fontsource`; nothing is fetched from Google
at runtime.

## The signature visual

The plat: a survey drawing of a plot, which is what a freehold is. Boundary,
monuments at the corners, bearings and distances in the mono, a hatched
residence, a north arrow, a title block, and a signature in ink with the
seal. It server-renders complete; with JavaScript it draws itself once and
tilts a few degrees toward the pointer. Under reduced motion it is static.
It stands in for stock photography, which the brand forbids, and for
generated imagery, which this environment could not download; the owner can
add editorial stills later.

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
