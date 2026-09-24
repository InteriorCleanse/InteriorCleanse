# Mr. Cash — design DNA

The app's design identity, written down in the three dimensions of the
`design-dna` skill so every new screen starts from the same rules. Tokens
live in `web/css/app.css` (`:root`); this file says what they are for.

## 1. Design system (measurable)

**Colour — current (dark, "Night Lab", September 2026).** It replaced the
earlier mint-on-black palette, which the `frontend-design` skill names as one
of the commonest generated-looking defaults (near-black with one acid-green
accent), and which also made the accent and "up" the same colour.

| Role | Hex | Token |
|---|---|---|
| Background (abyss) | `#080B16` | `--bg` |
| Surfaces | `#0F1426`, `#161C33` | `--panel`, `--panel2` |
| Text | `#EEF1FB` | `--text` |
| Secondary text | `#9AA3C2`, faint `#646D8C` | `--dim`, `--faint` |
| Accent: the AI and the one main action | `#8B93FF` iris | `--brand`, `--brand-rgb` |
| Reading live | `#5CE1E6` aqua | `--aqua` |
| Up / buy / win only | `#4ADE9A` mint | `--green` |
| Down / sell / loss only | `#FF6B7A` coral | `--red` |
| Waiting / estimate | `#FFC061` amber | `--amber` |

Mint and coral mean up and down and are never decoration; iris is the
accent. Iris on the background is about 7:1; the primary button puts dark
ink on iris for the same contrast.

**The previous palette ("Mint")** was measured from a Desk screenshot with the
skill's `measure-colors.mjs`: background `#131c27`, panels `#182833`, text
`#e3eaf0`, accent `#34d399` at 0.3% coverage.

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

**Type.** Instrument Sans for everything on the page, with tabular figures so
numbers line up; Geist Mono only for code and the chart's price axis
(self-hosted WOFF2, SIL OFL). No monospace labels and no all-caps labels.
Section titles are sentence case at 15px/600; body 15px/1.55; secondary text
12–13px.

**Shape.** Radius 20–24px on heroes and cards, 12–14px on tiles and rows,
999px on buttons, tabs and status pills. Hairline borders (`--edge`), soft
shadows tinted to the background. No clipped corners, corner brackets or
scan lines.

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
It plays when a tab opens, never on a data refresh. The one bold motion is
the core on Home (below). Everything stops under `prefers-reduced-motion`;
the core then draws one still frame with each pulse parked on its beam,
and turns only while you drag it.

**Icons.** One set of line drawings on a 24px grid at a 1.6 stroke, drawn in
the text colour. No emoji in navigation.

## 2. Design style (qualitative)

- **Mood:** a calm trading desk at night: quiet surfaces, one light source,
  nothing shouting.
- **Voice:** first person, plain, honest. He says "I can't see the order book"
  rather than guessing. There is no hype and no profit language anywhere.
- **Composition:** on Home, the core and one sentence of what he thinks;
  then every model running, one row each; then the pipeline. Everything else
  (charts, the track record, each model's notes; on Today the vote list and
  the written brief) is folded away.
- **Navigation:** five places — Home, Today, Chart, Ask, More. Journal, the
  school and the lab live under More, in plainly named groups.
- **Hierarchy through weight and size**, not capitals or colour.

## 3. Visual effects

| Effect | Where | Technique |
|---|---|---|
| The core | Home | A sci-fi reactor drawn on a 2D canvas (`web/js/core.js`, no library). The eye in the middle holds the agreement score, with its arc and the act-at tick, inside a plasma corona in the fused direction's colour. Around it, a 3D gimbal of three tilted rings spins in perspective, and each strategy rides a ring as a satellite, coloured by its vote, sized by its confidence and hollow when the regime switches it off, firing pulses into the core. The desk agents are hexagonal ports round the edge, feeding conduits coloured by what they can see. An outer gauge repeats the score at room scale. Dressing: plasma filaments and flares, an accretion disk spiralling inward, shockwaves as votes land, graduated HUD rings and a radar sweep. Drag to turn the gimbal (it keeps a little momentum), point at a satellite or port for a card, click to jump to its row. Seeded; paused off-screen and still under reduced motion. Pointing at a model in the list lights its satellite, and pointing at a satellite lights its row |
| Ambient light | page background | four slow colour fields in the palette's own hues (`web/js/bg.js`), plus 3.5% SVG grain |
| Glass | header, nav, bottom bar | `backdrop-filter`, switched off under reduced transparency |
| Mascot | header | SMIL-animated SVG |

No WebGL, GSAP or Three.js in the app. Any of them would be a new runtime
dependency, and adding one needs a stated reason.

## Rules that do not bend

Every surface labels its data (MOCK, REPLAY, BACKTEST, PAPER, LIVE). A step
or number with no reading says so instead of estimating. The Stop button is
always red (coral). A model that cannot see never pulses.
