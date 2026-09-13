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

Nothing in here touches Aurelis OS's code, data, or tenants. These are
instructions for the assistant that builds the product, not part of the
product.
