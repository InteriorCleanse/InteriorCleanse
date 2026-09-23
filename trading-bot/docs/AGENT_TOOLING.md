# Agent tooling around Mr. Cash

The owner asked for seven agent-infrastructure projects to be brought into the
bot. They are tools for the *agent that works on the bot* (Claude Code), not
features of the bot itself, so they live in `.claude/`, `scripts/` and this
page rather than in `src/`. Nothing here changes what Mr. Cash does.

## What was installed

A curated subset of three of the seven is vendored under `.claude/skills/`,
where Claude Code loads it automatically for this project. Each folder keeps
its upstream licence; sources and commits are in
`.claude/skills/THIRD_PARTY_SKILLS.md`.

| Project as listed | What it actually is | Installed here |
|---|---|---|
| Diagram Design | A Claude Code skill (MIT) that draws architecture, sequence, flow, data-flow and other diagrams as self-contained HTML/SVG. | Yes: `.claude/skills/diagram-design`. Use it for the system map and runbook figures. |
| Scientific Agent Skills | A 165-skill research library (MIT), mostly biology, chemistry and medicine. | Three skills that fit the research lab: `statistical-analysis`, `statistical-power`, `hypothesis-generation`. They help phrase and check a hypothesis; the lab's own gates still decide. |
| "Anthropic" Cybersecurity Skills | A community collection of 818 security skills (Apache 2.0). Despite the name it is not published by Anthropic. | Four defensive skills only: secret scanning, dependency confusion, SBOM review, and indirect prompt-injection detection. The offensive-simulation skills (CSRF, CSP bypass, API exploitation) were left out; the bot already has its own security test suite and Claude Code's built-in security-review, and attack tooling does not belong in this repo. |
| Awesome Harness Engineering | A reading list of harness patterns, evals, memory, permissions and orchestration. | Not a skill. The repo's own harness is `CLAUDE.md` plus the six `mr-cash-*` skills. |
| Agent Memory | A family of persistent-memory servers for coding agents. | Not installed. Mr. Cash has its own memory: the knowledge vault, case studies and digests, all versioned and read-only to the engine. Adding a second memory would violate the one-store rule. |
| Browser Use | A Python framework that lets an agent drive a real browser. | Not installed. It is a Python runtime, and the bot has zero dependencies by design. The Playwright-based UI smoke test already drives the app for verification. |
| Open Viking | ByteDance's context database for agents (Python, MCP server, virtual filesystem). | Not installed, same reasons. The bot already exposes itself to Claude over MCP (`npm run mcp`). |

## Installing the full collections

`scripts/install-agent-skills.sh` (macOS, Linux) and
`scripts/install-agent-skills.ps1` (Windows) clone the three skill
collections in full into `~/.claude/skills`, the user-level location that
applies to every project on the machine. They are large, and every skill is a
set of instructions an agent will follow, written by someone else. Read what
you install. The scripts never touch the bot, its data or its configuration.

## Rules that still apply

The skills advise; they do not act on the bot. Anything they suggest that
would change strategies, risk, sizing, gates or config goes through the same
path as every other change: research, out-of-sample, walk-forward,
robustness, human review, paper test. See `CLAUDE.md`.
