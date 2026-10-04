# GCode Keys — design system

The visual language. The live source of truth is `app/globals.css` (CSS
variables); these tokens map 1:1 and import cleanly into Figma variables.

## Color tokens

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#020604` | Page background (near-black teal) |
| `--panel` | `#04100b` | Panels, cards |
| `--panel2` | `#071c13` | Raised surfaces |
| `--line` | `rgba(21,227,122,.22)` | Hairline borders |
| `--neon` | `#15e37a` | Primary / brand (signal green) |
| `--bright` | `#6bffbb` | Highlights, prices |
| `--cyan` | `#38f0ff` | Secondary accent |
| `--violet` | `#b14dff` | Tertiary accent |
| `--ink` | `#eafff4` | Primary text |
| `--muted` | `rgba(215,255,240,.56)` | Secondary text |
| `--amber` | `#ffcf4d` | Example-pricing / caution |
| `--alert` | `#ff2e88` | Errors, the "one rule" |

**Holographic gradient** (`--holo`): `104deg, #15e37a → #38f0ff → #b14dff`.
Used on the hero headline, primary CTAs, and the success state. Single dark
theme by design (a neon terminal), so there is no light variant.

## Typography

- **Display:** Chakra Petch 600/700 — headings, wordmark. Tight tracking.
- **Utility / data:** JetBrains Mono 400/500/700 — labels, codes, prices,
  eyebrows, nav.
- **Scale:** h1 `clamp(2.3rem, 6.6vw, 4.1rem)`; h2 `clamp(1.5rem, 3.6vw,
  2.15rem)`; body `1rem`; eyebrow/label `9–12px`, letter-spacing `.2–.32em`,
  uppercase.

## Motion

- **Signature easing:** `cubic-bezier(.32,.72,0,1)` (UI), `expo.out` (GSAP
  reveals). No `linear`/`ease-in-out`.
- **Durations:** press `180ms`, hover `300ms`, reveals `900ms`.
- **Patterns:** staggered blur-in hero, scroll reveals (blur + rise), ambient
  key float, button press `scale(.97)`, button-in-button arrow translate.
- Honors `prefers-reduced-motion` (rain stills, animations off).

## Components

- **Island nav** — floating glass pill, hairline border, backdrop blur;
  morphing hamburger to a full-screen staggered menu under 880px.
- **Double-bezel cards** — inset top highlight + outer ring + soft deep
  shadow so panels read as machined hardware.
- **Buttons** — `.btn` (outline neon), `.btn.glow` (holographic gradient),
  `.btn.ghost`. Button-in-button arrow in a nested circle.
- **Custom dropdowns** — searchable, keyboard-navigable; neon focus, holo
  active row. Never native selects.
- **Key models** — per-manufacturer SVG fobs, finish/color/engraving aware.

## Logo

`app/icon.svg` (favicon/app icon), `app/apple-icon.png` (180),
`app/opengraph-image.png` (1200×630). Brand asset sources are in
`docs/business/auto-keys/brand/` on the `claude/auto-keys-brand` branch.

## Importing to Figma

The tokens above map to Figma variables (color, number, string). Create a
collection `GCode/Core` with the color tokens, a `Type` collection for the
scale, and an `Effects` set for the holo gradient and the double-bezel
shadow. Code Connect can then bind these to the React components in
`components/`.
