# Claude Code project skills

Installed here so every Claude Code session on this branch loads them, rather
than into a home directory that an ephemeral container forgets.

## Claude Ads (`/ads`)

Paid-media operations across twelve advertising platforms — audits, plans,
creative briefs, monitoring, reports — from
[AgriciDaniel/claude-ads](https://github.com/AgriciDaniel/claude-ads), MIT
licensed (`skills/ads/LICENSE`). Read-only by default: account changes stop at
a draft unless every gate passes.

Installed with the project's own installer, skill-only:

```bash
bash install.sh --source=local --no-deps \
  --skill-dir=<repo>/.claude/skills --agent-dir=<repo>/.claude/agents
```

`--no-deps` leaves out the managed Python virtual environment the optional
report-rendering scripts need; those scripts are present under
`skills/ads/scripts` and can be given an environment later. The ownership
manifest `skills/.claude-ads-claude.manifest` is what `uninstall.sh` reads.

## NotFair (`/seo-analysis`, `/google-ads-audit`, `/paid-ads-x`, …)

Forty-five SEO, GEO, analytics and paid-media skills from
[nowork-studio/notfair-plugin](https://github.com/nowork-studio/notfair-plugin)
(MIT, `notfair/LICENSE`). The plugin's own wrapper skills sit in `skills/`
and forward to the canonical sources, which live beside them exactly as they
do in the plugin — `seo/`, `google-ads/`, `meta-ads/`, `analytics/`,
`paid-ads/`, `gemini/`, `notfair-upgrade-skill/`, `docs/`, `bin/` — so every
relative reference resolves unchanged. `notfair/AGENTS.md` is the intent →
skill routing table. Evaluation fixtures and screenshots were left out.

The plugin needs one hosted MCP connection for live account data, registered
in the repository's `.mcp.json` as `NotFair` (`https://notfair.co/api/mcp/notfair`).
Claude Code asks before enabling a project MCP server, and the connection
does nothing until a person completes its browser sign-in and picks a NotFair
workspace. Google Ads, Meta, X, LinkedIn, Search Console and GA4 are then
capabilities of that one connection. No credential is stored in this
repository.

## HyperFrames (`/hyperframes`)

The core skill set from [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)
(Apache-2.0, `hyperframes/LICENSE`): the `/hyperframes` router plus the
`hyperframes-*` domain skills and `media-use`, copied from the plugin's
`core-skills` manifest. The router installs each creation workflow on demand
with `npx hyperframes skills update <workflow>`. Rendering needs Node 22 and
FFmpeg on the machine that renders; the skills load without them. One sound
effect over 300 KB and the skills' own test files were left out.

## context-mode (`/context-mode`, `/ctx-stats`, `/ctx-search`, …)

[mksglu/context-mode](https://github.com/mksglu/context-mode), Elastic
License 2.0 (`context-mode/LICENSE` — free to use, not to resell as a
service). Installed the MCP-only way its README documents: `.mcp.json` runs
`npx -y context-mode`, which gives the eleven `ctx_*` tools and the skills
here nudge the assistant to route large output through them. The hook-based
routing, status line and `/ctx-doctor` self-checks need the marketplace
install on a person's own machine.

## camofox-browser (MCP adapter)

[jo-inc/camofox-browser](https://github.com/jo-inc/camofox-browser), MIT
(`camofox-LICENSE`): a Firefox-based browser server for agents, exposed as
MCP tools. `.mcp.json` registers only the thin stdio adapter
(`@askjo/camofox-browser-mcp`); it talks to a REST server that must already
be running at `CAMOFOX_BASE_URL`. Start one with `npx @askjo/camofox-browser`
(downloads a ~300 MB browser on first run) or deploy it with the repo's
Docker, Fly or Railway files, and set `CAMOFOX_ACCESS_KEY` on anything
reachable beyond localhost. Until a server is up, the tools return
connection errors and nothing else happens.

## Not installable here: two standalone applications

- **[cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox)**
  is a self-hosted email client on Cloudflare Workers (Durable Objects, R2,
  Workers AI, Email Routing) behind Cloudflare Access. It is deployed to a
  Cloudflare account with a domain, not copied into a repository. Once
  deployed it exposes an MCP endpoint at `/mcp` behind the same Access
  policy, which can be added to `.mcp.json` with an Access service token.
- **[Anil-matcha/Open-Higgsfield-AI](https://github.com/Anil-matcha/Open-Higgsfield-AI)**
  (now "Open Generative AI") is a full Next.js and Electron studio for image
  and video generation over the paid MuAPI service. It runs as its own app
  with its own API key and three git submodules; it has no plugin or MCP
  surface to install into a Claude Code project.

Nothing in here touches Aurelis OS's code, data, or tenants. These are
instructions for the assistant that builds the product, not part of the
product.
