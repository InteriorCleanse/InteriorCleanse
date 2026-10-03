# Kestrel — visual audit and roadmap (October 2026)

This is the first step of the design phase. It covers presentation only: no
strategy, risk, sizing, fusion, regime, veto, validation, live-gate, security
or data code changes because of anything here.

**How this was made.**
- Screens were captured from a running copy (mock feed, scratch data) at 1440 px
  and 390 px in Linen, plus Home in Midnight.
- The CSS was inventoried with grep.
- The reference sites (Messari, Finviz, Invo, transitions.dev) could not be
  opened: the environment's network policy refuses them. The notes on them below
  come from how those products are widely known to work, not from a fresh visit.
- The screenshots and video mentioned in the brief did not reach this session.

## A. What already works

- **The voice.** Copy is plain and honest. "Can't see", "standing by" and
  "NOT ENOUGH DATA" are labels a serious research tool should use.
- **Data labelling** is everywhere: PAPER, MOCK, BACKTEST, REAL. The PAPER pill
  is always in the header.
- **The core on Home**, a 2D-canvas reactor, encodes real state: agreement score,
  strategy votes, which agents can see. It is the app's one memorable element.
- **The six-step trade pipeline** ("How a trade happens here") already tells the
  decision story as a sequence.
- **The type choices are right for the subject.** Instrument Serif speaks in the
  core's one sentence, Instrument Sans carries the UI, and Geist Mono is
  self-hosted.
- **Accessibility groundwork.** There are reduced-motion fallbacks in about 20
  places and a reduced-transparency fallback. Every tab is keyboard reachable.

## B. What reads as generic

- **The "Where to?" launcher.** Six identical rounded cards, each with a coloured
  icon tile and a blurred colour blob in the corner, are the SaaS card kit. They
  also duplicate the More panel.
- **The call terminal** wears fake macOS traffic-light dots. That is decoration
  borrowed from someone else's window chrome.
- **Rounded card wrappers around every section**, with the same soft shadow under
  each, regardless of importance.
- **Ambient colour fields** behind every page. There are four radial gradients,
  and the brief's anti-slop list names exactly this.
- **Icon-only header buttons.** Six identical squares (search, voice, install,
  alerts, screenshot, inbox) with nothing to tell them apart at a glance.

## C. What is inconsistent

- **Token sprawl.** `:root` is redefined about eight times in `app.css` as layers
  were added: Mint, Night Lab, the motion layer, themes, Linen. The last
  definition wins, so the file's top half describes values that no longer apply.
- **Twelve different corner radii** (3, 4, 6, 8, 9, 10, 12, 14, 16, 18, 20 and
  24 px) plus 54 pill shapes. There is no relationship between radius and
  hierarchy.
- **Figures are not monospaced.** A later rule sets
  `--font-mono: var(--font-sans)`, so prices and percentages fall back to
  Instrument Sans. `DESIGN_DNA.md` says Geist Mono is for code and the price axis
  only. The brief now asks for terminal-grade tables, where aligned figures
  matter.
- **Six themes** (Linen, Daylight, Midnight, Plum, Slate, Onyx). Four dark rooms
  differ only in hue, and none is designed as a command center.
- **`DESIGN_DNA.md` is out of date.** It describes the dark Night Lab palette as
  current; Linen has been the default since PR #78.

## D. Where the hierarchy is weak (Home)

1. **The largest number on Home is the least informative.** The Stock desk is
   not connected, so its $10,000.00 is the untouched starting balance. Yet it is
   set at 52 px in the top hero.
2. **The system's own state is scattered.** Health, data freshness, the live gate
   and alerts live in Operations, Validation and the bell. Nothing on Home says
   at a glance that Kestrel is healthy, its data is three minutes old, and live
   is closed.
3. **Three desks get three different treatments:** one hero, two cards and a
   bullet list for their schedules. They are peers and should read as rows of
   one table.
4. **Navigation sits above the work.** The launcher is the second thing on the
   page, ahead of what Kestrel is doing now.
5. **No event history on Home.** Events reach the bell, but there is no visible
   record of what happened and when.
6. **On mobile the page is 5,400 px tall.** Status, decisions and warnings sit
   below a full-height launcher and the core.

## E. Weak interactions

- Hash links do not re-route inside an open page. There is no `hashchange`
  handler, so back and forward do not move between tabs.
- Tab navigation is wired per container (nav, bottom bar, More, launcher, crumb)
  instead of by one delegated handler, so new surfaces must remember to wire
  themselves.
- Hover and focus states exist but differ by component. There is no shared
  focus-ring token.

## F. Can improve without touching business logic

Everything in this list reads existing endpoints and changes only `web/`:

- one token file;
- a Home status rail from `/api/health`, `/api/system` and `/api/live/status`;
- the desks as one dense table from `/api/overview`;
- an event timeline from `/api/events`;
- a compact launcher;
- removing decorative chrome;
- figure alignment;
- the motion scale.

## G. Needs architectural work (later, in its own PR)

- **Splitting the 1,400-line inline script in `index.html`** into modules, the
  shape the rest of `web/js/` already has.
- **A real dark command-center theme** that is designed, not hue-shifted. It
  should replace the four dark rooms. Removing themes removes a feature the owner
  uses, so the owner decides first.
- **Retiring the `:root` layers in `app.css`** into the token file one component
  family at a time, with screenshots per step.
- **A decision timeline view** joining one decision to its paper fill, outcome
  and post-trade review. The pieces are spread across Today, Evidence and
  Observer and need a read-only joining endpoint.

## H. Do not change

- The core's state encoding.
- Data labels.
- The red Stop button.
- The PAPER pill.
- Reduced-motion behaviour.
- The voice.
- The CSP: no inline style injection from JavaScript beyond what exists, and no
  inline scripts.
- Anything under `src/` beyond read-only routes.

## Principles taken from the references, not their layouts

- **Messari:** research first. Every number sits beside its source and time, and
  a persistent left index keeps a large product navigable.
- **Finviz:** density without cards. Compact rows, strong colour signals reserved
  for state, and many small multiples in one screen.
- **Invo:** live activity as a stream. A time-ordered feed makes a system feel
  alive without animation.
- **The self-improving agent reference (as described in the brief):** a visible
  timeline of observations, hypotheses and outcomes, so progress is history
  rather than decoration.

## The direction

**An instrument that hovers.** The brand's own idea, from `BRAND.md`: a kestrel
holds still in the wind, watches, and drops only when the target is clear.

- **Hierarchy.** Kestrel's screens are still by default. One bold element per
  screen; on Home that is the core. Everything around it is quiet, ruled and
  dense.
- **State.** Colour means state only. Every state is also a word and a shape, so
  colour is never the only signal.
- **Motion.** Motion answers a change of state with one decisive move and never
  drifts on its own.
- **Type.** Figures sit in tabular columns. Serif type is reserved for the one
  sentence saying what Kestrel thinks.

## Roadmap

| Phase | What | State |
|---|---|---|
| 1 | This audit | done |
| 2 | Token file: colour roles, state, type, space, radius, motion, chart, density, z, breakpoints | this PR |
| 3 | Shell: `hashchange` routing (done here); labelled header actions and one delegated tab handler | partly this PR |
| 4 | Home command center: status rail, desks table, events timeline, compact launcher, chrome removed | this PR |
| 5 | Agent cards with the neutral state vocabulary; decision timeline (needs a read-only joining endpoint) | next |
| 6 | Charts and research: event, regime and entry markers on the chart; hypothesis history as a timeline | next |
| 7 | Terminal-grade tables: one table component, sticky headers, sortable where useful, mobile rows that stay rows | next |
| 8 | Motion: apply the scale to tabs, panels and data refresh; remove the remaining idle animation | next |
| 9 | Mobile: primary / secondary / optional per screen, status first | partly here (Home) |
| 10 | Visual QA at 1440 and 390 px in each theme, smoke, accessibility pass | each PR |
