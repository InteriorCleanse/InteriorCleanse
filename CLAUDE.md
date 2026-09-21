# InteriorCleanse

A Next.js 14 App Router storefront for a considered home: candles, a few
objects, books written by the founder, digital downloads, and disclosed
affiliate placements. Deployed to Vercel. `trailingSlash: true`, so every
canonical URL ends in a slash and the Stripe webhook is
`https://interiorcleanse.com/api/webhook/`.

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

Work on the branch `claude/interiorcleanse-3d-rebuild-ewspkq`, open a pull
request, wait for the `build` check, merge, then restart the branch from
`main`. Never push straight to `main`.

## Agent capabilities

`.claude/` carries 97 vendored skills, 36 agents, and 15 commands. Their
provenance and licences are in `.claude/README.md`; what was deliberately not
installed, and why, is in `docs/AGENT_CAPABILITIES.md`.

Skill descriptions load into every session, so adding a large pack has a
standing context cost. Measure before adding one.

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
