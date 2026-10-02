# Development tools for working on Kestrel

These are tools for the agent (Claude Code) that works on Kestrel. None of
them is loaded or run by Kestrel itself, none of them can trade, and none of
them outranks the rules in `trading-bot/CLAUDE.md`.

Checked on 2026-10-02 against the upstream repositories.

## What is available, and where it comes from

All three are vendored in the repository's shared `.claude/` folder (added in
commit `d70225c`). They load in every session started at the repository root.

| Tool | Upstream (verified live) | Pinned | Upstream now | Licence |
|---|---|---|---|---|
| Ponytail, six skills | github.com/DietrichGebert/ponytail | `e3ba2aa` (v4.10.0) | `e3ba2aa`, current | MIT |
| Agent Skills, 25 skills + 4 agents + 9 commands | github.com/addyosmani/agent-skills | `dc27a9c` (v0.6.9) | `9d0c60d`, wording fixes in 4 skills, no new skills | MIT |
| Graphify skill | github.com/Graphify-Labs/graphify, PyPI `graphifyy` | 0.9.65 | 0.9.73 | Apache-2.0 + MIT |

Hooks were deliberately left out for all three; the reasons are in
`.claude/README.md`. No tool here changes any Kestrel file, setting or
behaviour.

**When Kestrel moves to its own repository**, these shared skills do not move
with it. Copy the ones listed under "Use on Kestrel" into
`trading-bot/.claude/skills/` at that point, with their licences, and record
them in `.claude/skills/THIRD_PARTY_SKILLS.md`.

## Ponytail: the smallest change that works

There is no settings file; intensity is per session. **On Kestrel use
`/ponytail lite`**: it builds what you ask and names a lazier alternative in
one line for you to choose. Do not use `ultra` here ("deletion before
addition").

- `ponytail-review` reviews a diff for over-engineering; `ponytail-audit`
  scans the repo. Both write a report and apply nothing.
- A finding never changes these on its own: strategies, risk, sizing, fusion,
  regime, the paper engine, `config.ts`, the live and shadow gates, PIN,
  CSRF, CSP, constant-time comparisons, the lock, or any test. Those follow
  the rules in `CLAUDE.md`; a simplification there needs the owner.

## Graphify: a map of the code

The graph is generated, gitignored (`graphify-out/`), and has to be built on
each machine. `trading-bot/.graphifyignore` keeps the vendored skill docs out
so the graph is Kestrel's code and docs only.

```bash
pip install graphifyy==0.9.65         # once; Python 3.10+
cd trading-bot
graphify update .                     # AST only: no model, no API key, no network
graphify query "where is the live trading gate checked"
graphify path "server.ts" "gates.ts"   # file to file; add --undirected if none found
graphify explain "liveGates"
```

Built here on 2026-10-02: 5,075 nodes, 15,419 edges, 253 communities. The
query above returned `liveGates()` in `src/live/gates.ts`, and "how does the
stock desk enforce stops" returned `src/stocks/desk.ts`,
`src/stocks/rules.ts` and `docs/STOCK_DESK.md`.

Do not run `graphify install --project`: it adds hooks that intercept every
file read and require the binary on every machine and in CI. The optional
model pass over docs and images needs an API key and sends content to a
model provider; it is not needed for code navigation.

## Agent Skills: use on Kestrel

Routed automatically from their descriptions; you can also name them.

| Skill or command | Use it when |
|---|---|
| `context-engineering` | starting a large task or after a long session |
| `planning-and-task-breakdown`, `/plan` | a change touches more than one area |
| `incremental-implementation`, `/build` | landing work in small, tested slices |
| `debugging-and-error-recovery` | a test fails or behaviour is wrong; root cause first |
| `test-driven-development`, `/test` | any behaviour change: a failing test first |
| `code-review-and-quality`, `/review`, agent `code-reviewer` | before merging |
| `security-and-hardening`, agent `security-auditor` | anything near auth, CSRF, CSP, secrets |
| `source-driven-development` | an external API (Alpaca, Polymarket, Kalshi) or library |
| `constraint-driven-development`, `/constraints` | keeping the quality bar from slipping |
| `frontend-ui-engineering` | changes under `web/` |

The rest of the 25 stay available and harmless; they cost a little context
per session, nothing more.

## Not installed

- **OmniRoute.** `github.com/stevewithington/omniroute` is a copy of
  `github.com/diegosouzapw/OmniRoute` (its licence names diegosouzapw) and
  trails it. It is an AI gateway: it would re-point Claude Code at a local
  proxy that forwards every request, with your code in it, across up to 339
  providers, some of which it flags for terms-of-service risk. Kestrel has no
  model-routing need (its optional AI features call one provider with your
  own key), and the proxy would sit between you and Claude Code on your
  machine. Not installed. Revisit only if you want provider fallback for
  your own Claude Code use, on your own machine, with the original repository.
- **Upgrading the pins.** The agent-skills changes since `dc27a9c` are wording
  fixes; graphify 0.9.73 was not reviewed. Both stay on the reviewed versions.
