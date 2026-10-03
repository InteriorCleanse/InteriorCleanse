# InteriorCleanse — design brief

The storefront's design direction, written down so new work extends it instead
of drifting. This applies to the InteriorCleanse storefront only. Tokens named
here are the live ones in `app/globals.css`.

## Product and person

A considered-home store: a candle, a few printed objects, the founder's books,
and disclosed partner picks. The shopper wants a calmer house and is wary of
being sold to. The site has to feel like walking into a quiet, well-lit room,
and then make buying simple.

**Emotional direction:** calm, warm, assured. Luxury through restraint and
light, never through gold everywhere or noise.

## Visual identity

- **Surface:** warm linen and cream. `--black` is the page cream `#F2ECE0`;
  `--ink` `#FAF6EE` is the raised surface. Text is near-black ink at
  `rgb(var(--fg-rgb))`, with `--text-dim` for secondary copy.
- **Accent:** one quiet accent per track, never mixed on one screen. Mind
  `--mind-accent` sage, Home `--home-accent` slate blue, Body `--body-accent`
  brass, Spirit `--spirit-accent` plum. `--gold` is for small marks only.
- **Type:** Fraunces for display, always roman. Emphasis inside a heading is
  carried by the track's accent colour, never by italic (Hallmark gate 38a).
  Plus Jakarta Sans for body and labels. Prices use the body face at a
  readable size.
- **Labels:** eyebrows only where they help wayfinding, at most one per
  section. No ghost numerals, no "Object 05" counters, no repeated card labels.
- **Shape:** one pill for the primary action on a screen; secondary actions
  are typographic links with a drawn rule. Thin hairline rules (`--line`).
  Product tiles are a single surface with print-like corners (2-4px), one
  hover effect. No heavy shadows, no glass panels, no animated aurora.
- **Footer:** a letter close (Hallmark Ft6), not a four-column link grid.
- **Hallmark stamp:** the first line of `app/globals.css` records the genre,
  macrostructure and archetypes. Run `hallmark audit` before shipping UI.
- **3D:** products sit on a lit studio sweep in the packshot's own cream, so
  poster, model and page read as one surface. Models turn slowly until touched.
  Books and the print are built from their real artwork (`ObjectStage`); other
  products use scanned models (`GlbStage`).
- **Imagery:** real product photography and the generated room films. No stock
  photographs on any product (an owner rule).
- **Iconography:** fine single-weight line icons. No diamonds.

## Motion

One easing for the whole site, `--ease-lux`. Lenis smooth scroll and GSAP
reveals: lines rise behind a mask, images lift out of a soft blur. One intro
veil per visit. Hover is a small lift or an arrow nudge, never a bounce. All
motion stops under `prefers-reduced-motion`.

## Layout and responsive behaviour

Generous whitespace and editorial measure on desktop. On a phone the buying
decision comes first: on product pages the name, price, button and reassurance
appear before the story. Collection pages sit on their track's tint. There must
be no horizontal scroll at 390px.

## Accessibility

Text at 4.5:1 or better on every tint (axe-checked per route). Visible focus.
Real headings in order. Keyboard can reach and operate the bag and checkout.

## References and anti-patterns

Benchmarks: quiet luxury retail and editorial sites (Aesop, Le Labo, Kinfolk)
for restraint, warmth and type-led hierarchy; Awwwards and Godly for motion
craft. Principles taken, layouts not copied.

Avoid: card grids for their own sake, purple or neon gradients, glassmorphism,
glow borders, generic sans-only typography, stock lifestyle photography, a
second accent colour on one screen, and animation without meaning. The admin
login's cyberpunk theme is a deliberate back-office exception and must not
spread into the shop.
