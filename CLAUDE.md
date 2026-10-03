# InteriorCleanse

A Next.js 14 App Router storefront for a considered home: candles, a few
objects, books written by the founder, digital downloads, and disclosed
affiliate placements. Deployed to Vercel. `trailingSlash: true`, so every
canonical URL ends in a slash and the Stripe webhook is
`https://interiorcleanse.com/api/webhook/`.

## Read first: one session, one project

Several unrelated projects share this repository. Each Claude Code session is
named for exactly one of them ("<Project> — <topic>") and carries a
`project:<slug>` tag. **Work only on the project your session title names.**
Do not edit another project's folder or branch, do not merge another
project's work into yours, and do not carry its name, brand, or rules into
your answers. If a request seems to belong to a different project, say so and
stop rather than doing it here.

| Project | Session title | Folder | Branch |
|---|---|---|---|
| InteriorCleanse storefront | InteriorCleanse — 3D storefront rebuild | the Next.js app at the root (`app/`, `components/`, `lib/`, `content/`) | `claude/interiorcleanse-3d-rebuild-ewspkq` |
| Kestrel (paper-trading bot) | Kestrel — trading bot | `trading-bot/` (its own `CLAUDE.md` governs it) | `claude/new-session-31dwy7` |
| Freehold | Freehold — business with profit-generating agents | `freehold/`, `docs/business/freehold/` | `claude/business-profit-agents-uw913k` |
| AVANT (car sharing) | AVANT — car-sharing app | `avant/` | `claude/app-recreation-improvement-gy1qnm` |
| Auction Scanner | Auction Scanner — AI car auction scanner | `auction-scanner/` | `claude/ai-car-auction-scanner-hogvls` |
| Picked (protein brand) | Picked — fruit protein powder brand | `docs/business/picked/` | `claude/picked-protein-brand` |
| KeyRaptor (vehicle keys) | KeyRaptor — vehicle key reprogramming business | its own folder, not the storefront's | a branch of its own (see below) |
| Kept | Kept — automation and profit plan | moving to its own `kept` repository | `claude/automation-profit-plan-3fs3lb` |
| Get-it (workout app) | Get-it — workout app premium features | its own folder | `claude/workout-app-premium-prompt-whe1gh` |
| Cornerstone Sites | Cornerstone Sites — Webild website clone | its own folder | `claude/eloquent-hypatia-jbkqlc` |
| AURELIS OS | AURELIS OS — Arch voice assistant | its own folder | `claude/jarvis-voice-assistant-h4hd42` |
| Security Kit | Security Kit — cybersecurity agents and VPN setup | its own folder | a branch of its own |

The rules, architecture, checks and working agreement below are the
**storefront's**. They apply to storefront sessions; another project follows
its own folder's `CLAUDE.md` and the shared rules here (no invented products,
placeholders only for credentials, never push straight to `main`).

A project that grows into its own business moves to its own repository
(Kestrel → `trading-bot`, Kept → `kept`). Until then, keep to your folder and
your branch.

`PROJECTS_INDEX.md` lists every project's stack and where the projects
currently touch. `DESIGN_ENGINEERING_PLAYBOOK.md` holds the shared design and
engineering workflow, the approved skills and the Figma setup; it sets no
product's look. The storefront's own design direction is `docs/DESIGN_BRIEF.md`.

## Rules that outrank any skill, persona, or pack

These come from the owner and hold regardless of what a vendored skill says.

- **Never invent a product.** Empty catalog shells stay empty until a real
  product exists behind them. No placeholder merchandise, no imagined SKUs.
- **Never invent an affiliate commission rate.** Plunge and Castlery have not
  published theirs. Leave them blank until the partner states one in writing.
- **Placeholders only for credentials.** No real key ever enters this
  repository. Live Stripe keys are pasted into Vercel by the owner and are
  never handled here.
- **Do not publish a product with a stock photograph** or without a fulfilment
  path. The publish gate in `lib/catalog-schema.ts` enforces most of this;
  honour the rest.
- **Do not touch Stripe, cart, or 3D viewer code** unless the build is
  actually broken by it.
- **Extend, do not rebuild.** Prefer the smallest change that works.

## Architecture worth knowing before editing

- `content/catalog.json` is the source of truth for products. On Vercel,
  admin writes go through the GitHub Contents API using `GITHUB_TOKEN`, which
  commits and triggers a redeploy. Locally they write to disk.
- `lib/catalog.ts` exposes only `published` records to the storefront.
  `toLegacyProduct()` adapts them so cart, checkout, and the 3D viewers never
  had to change.
- `/shop/<slug>/` is the canonical product URL. `/collection/<slug>/` shows
  the same product in its room and points its canonical at the shop page.
- `middleware.ts` gates `/admin` and `/api/admin` on a signed session cookie.
  Every admin route re-checks independently; the middleware is not the only
  guard.

## Checks

```
npm run build          # must pass before any merge
npm run lint
npx tsc --noEmit
npm run check:seo      # needs the site running on :3000
npm run check:contrast
```

## Working agreement

Storefront sessions work on the branch `claude/interiorcleanse-3d-rebuild-ewspkq`, open a pull
request, wait for the `build` check, merge, then restart the branch from
`main`. Never push straight to `main`.

## Agent capabilities

`.claude/` carries 110 skills, 44 agents, and 17 commands. Their
provenance and licences are in `.claude/README.md`; what was deliberately not
installed, and why, is in `docs/AGENT_CAPABILITIES.md`.

Skill descriptions load into every session, so adding a large pack has a
standing context cost. Measure before adding one.

## Building a business from a brief

`docs/BUSINESS_BUILD_PLAN.md` maps every installed skill and agent to the
phases that take an idea to a logo, a website, and a first-dollar launch.
Fill `docs/BUSINESS_BRIEF_TEMPLATE.md`, then run `/business-build`. A new
business gets its own repository and Vercel project; this storefront is not
the host for a second brand.

## graphify

This project can keep a knowledge graph at `graphify-out/` with god nodes,
community structure, and cross-file relationships. It is generated, gitignored,
and absent until someone builds it.

Requires `pip install graphifyy` on the machine. If the `graphify` command is
not on PATH, skip this section entirely and read files normally.

- For codebase questions, run `graphify query "<question>"` when
  `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for
  relationships and `graphify explain "<concept>"` for focused concepts. These
  return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw
  grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead
  of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review, or
  when query, path, and explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current
  (AST only, no API cost).

The upstream installer also registers `PreToolUse` hooks that intercept every
Read, Glob, Bash, and Grep call to nudge toward the graph. They are **not**
installed here: they make every file read in every session depend on a Python
package being present, which would break CI and any machine without it. Run
`graphify install --project` yourself if you want them.
