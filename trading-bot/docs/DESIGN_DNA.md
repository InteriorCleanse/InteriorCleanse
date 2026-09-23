# Mr. Cash — design DNA

The app's design identity, written down in the three dimensions of the
`design-dna` skill so every new screen starts from the same rules. Tokens
live in `web/css/app.css` (`:root`); this file says what they are for.

## 1. Design system (measurable)

**Colour — current (dark, "Mint").** Measured from a Desk screenshot with the
skill's `measure-colors.mjs`:

| Role | Hex | Coverage | Token |
|---|---|---|---|
| Background | `#131c27` (rendered) / `#080b11` (base) | 67% | `--bg` |
| Panels | `#182833` (rendered) / `#121722` (base) | 29% | `--panel`, `--panel2` |
| Text | `#e3eaf0` | 1.3% | `--text` |
| Secondary text | `#8f9aa5` | 0.9% | `--dim` |
| Accent (brand) | `#34d399` | **0.3%** | `--brand` |
| Semantic | green `#3fb950`, red `#f85149`, amber `#d29922` | — | `--green`, `--red`, `--amber` |

The accent covers 0.3% of the screen: it is used for the one main action and
the current step, and should stay rare. Red and green are reserved for loss
and win and never used as decoration.

**Colour — reference the owner shared (light, "Paper"),** measured from two
slides of the AI-trader carousel:

| Role | Hex | Coverage |
|---|---|---|
| Background | `#faf8f4` warm off-white | 76–81% |
| Ink | `#151518` / `#0a1015` | 4–13% |
| Accent | `#152d9e` deep cobalt | 4–6% |
| Rules and chips | `#d1d1d8`, `#67666c` | 2–3% |

If the owner chooses Paper, these are the values to use, measured rather than
estimated.

**Type.** Instrument Sans for the interface, Geist Mono for prices and
numbers (self-hosted WOFF2, SIL OFL). Section titles are sentence case at
14.5px/600; body 15px/1.55; secondary text 12–13px. Numbers use tabular
figures everywhere they line up.

**Shape.** Radius 14px on cards and steps, 8–11px on controls and icon tiles,
999px only on status pills. Hairline borders (`--edge`), soft shadows tinted
to the background.

**Motion** (from `motion-design`: the *Corporate* archetype, suited to a
dashboard):

| Token | Value | Use |
|---|---|---|
| `--ease` | `cubic-bezier(.2,0,0,1)` | signature curve, on-screen changes |
| `--ease-enter` | `cubic-bezier(.05,.7,.1,1)` | entrances decelerate |
| `--dur-quick` | 150ms | hover, press |
| `--dur-std` | 250ms | cards, state changes |
| `--dur-slow` | 420ms | tab entrance |

One entrance: fade and an 8px rise, staggered 45ms, capped at five steps.
It plays when a tab opens, never on a data refresh. One ambient loop: the
pipeline's current step breathes (2.8s). Everything stops under
`prefers-reduced-motion`.

**Icons.** One set of line drawings on a 24px grid at a 1.6 stroke, drawn in
the text colour. No emoji in navigation.

## 2. Design style (qualitative)

- **Mood:** a calm trading desk at night: quiet surfaces, one light source,
  nothing shouting.
- **Voice:** first person, plain, honest. He says "I can't see the order book"
  rather than guessing. There is no hype and no profit language anywhere.
- **Composition:** a hero sentence first (what he thinks right now), then the
  pipeline (where he is), then the evidence. Detail is folded away.
- **Hierarchy through weight and size**, not capitals or colour.

## 3. Visual effects

| Effect | Where | Technique |
|---|---|---|
| Signal-core orb | Desk | 2D canvas with hand-written 3D projection; deterministic star dust; paused off-screen and under reduced motion |
| Grain | page background | SVG noise as a data URI, 3.5% overlay |
| Glass | header, nav, bottom bar | `backdrop-filter`, switched off under reduced transparency |
| Mascot | header | SMIL-animated SVG |

No WebGL, GSAP or Three.js in the app. Any of them would be a new runtime
dependency, and adding one needs a stated reason.

## Rules that do not bend

Every surface labels its data (MOCK, REPLAY, BACKTEST, PAPER, LIVE). A step
or number with no reading says so instead of estimating. The Stop button is
always red.
