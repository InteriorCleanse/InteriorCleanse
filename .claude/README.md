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

Nothing in here touches Aurelis OS's code, data, or tenants. These are
instructions for the assistant that builds the product, not part of the
product.
