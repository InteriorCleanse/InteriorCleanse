# AVANT brand

**Cars worth remembering, from people who care for them.**

AVANT is the same marketplace a guest already knows how to use (search,
favorites, trips, inbox), presented the way a considered car brand presents
itself: quiet, exact, warm. Elegance comes from restraint and from the
people involved, never from decoration.

## Voice

- **Personable.** Greet people by first name ("Good evening, Riley"). Hosts
  are introduced by first name and in their own words. Write the way a good
  concierge speaks: short, warm, specific.
- **Exact.** The whole price, the real rule, the actual number. No "from",
  no asterisks, no hype.
- **Calm.** No exclamation marks, no urgency tricks, no "only 2 left".
- **Plain.** "You'll pay at most $500 if the car is damaged", not
  "deductible". "Typically replies within an hour", not "response rate".

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| White | `#ffffff` | Page and cards |
| Porcelain | `#f5f4f2` | Bands, inputs, quiet surfaces |
| Obsidian | `#121316` | Text, primary buttons, map pins |
| Stone | `#66635d` / `#75716a` | Secondary and tertiary text |
| Champagne | `#b8956a` | Detail only: the coachline under the wordmark, the active tab rule, star ratings, the ring on an active pin, unread dots |
| Bronze | `#8a6a43` | Champagne as text (it passes contrast on white; champagne does not) |

Champagne is jewellery: if more than a few touches of it are visible at
once, remove some. Never champagne text on white; use bronze. No purple,
no gradients behind content.

## Type

Urbanist, one family. Display sizes at weight 300 with slight negative
tracking; reading text at 400; labels at 600. The wordmark is not set in
Urbanist; it is drawn (see The marks).

## The marks

All drawn, not typeset (`components/Logo.tsx`), so no font can change them.

- **Wordmark.** Wide, extended capitals with knife-edge apexes. Both A's
  are open chevrons with no crossbar that mirror the V, so A-V-A reads as
  one sweeping line. The T's crossbar ends are cut at the same angle as
  the A's legs. Beneath the name a gold pinstripe runs full weight under
  the first A and thins to a hair at the T, like a coachline; on first load
  it draws itself in (still for anyone who prefers reduced motion).
  Obsidian on light, platinum on dark.
- **Crest.** A sculpted shield whose top dips in a shallow V (the
  wordmark's V), lacquered obsidian inside a gold double keyline, with the
  open A in platinum crossed by the gold horizon line. Sign-in screens, the
  signature, anywhere the brand introduces itself.
- **Signature.** Crest, a hairline, wordmark. The site header (obsidian),
  the footer (platinum on obsidian) and the phone home screen.
- **Emblem.** The A and horizon on a square obsidian tile: app icon,
  favicon, home-screen icon, where a shield's point would be lost.

## Metals

| Metal | Stops | Use |
| --- | --- | --- |
| Gold | `#f3e2b8` → `#d2aa66` → `#9c7038` → `#d9bb80` | Brushed: pale where light catches it, bronze in the fall-off, a last glint at the edge. Coachline, keylines, horizon line, divider rules, the hairline on the concierge button |
| Platinum | `#ffffff` → `#e9e6df` → `#bdb7ab` | The wordmark and the A on dark |
| Lacquer | `#25272c` → `#141519` → `#0a0b0d` | Inside the crest and emblem |

Metals are for the marks only, never behind or inside running text. Clear
space around any mark: half its height. Minimum sizes: wordmark 14px tall,
crest 24px, emblem 16px.

## Form

- Pill buttons and chips. Obsidian for the one primary action on a screen;
  outlined for everything else.
- Generous white space; hairline (1px) dividers, never heavy rules.
- 20–24px radii on photos and cards.
- A floating, frosted tab bar on phones: Search, Favorites, Trips, Inbox,
  More.
- Motion is short and eased (`--ease`), and it is off under
  `prefers-reduced-motion`.

## Photography

The only pictures of a car are the ones its host took of that car. No
stock, generated, rendered or "illustrative" images of cars, people or
places, anywhere, including marketing pages. Where a host has no photo yet
the UI says so plainly. Marketing uses type, the product's own UI, or
photography the owner supplies and has the rights to.

## What we borrow, and what we don't

The app follows the structure guests already know from car-sharing apps,
because familiarity is a kindness. It never uses another company's name,
logo, colours or copy.
