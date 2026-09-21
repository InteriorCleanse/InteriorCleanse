# Agent capabilities

What is installed in this repository for Claude Code, what was deliberately
left out, and what you would install on your own machine instead.

Everything under `.claude/` is instructions and reference material. None of it
is built, served, linted, or shipped to visitors. It changes how Claude works
on this project; it cannot change how the storefront behaves.

---

## The cost that drives every decision here

Claude Code loads the **name and description of every installed skill into
every session**, before you type anything. The body of a skill is read only
when it is used, but the descriptions are always resident.

Measured on this repository:

| State | Skills | Always-on cost |
| --- | --- | --- |
| Before any of this | 48 | ~4,000 tokens |
| Now | 97 | ~10,800 tokens |
| If the full cybersecurity pack had been installed | 866 | ~112,000 tokens |
| If the full scientific pack had been installed too | 1,032 | ~135,000 tokens |

That last row is the reason two of the seven requested packs were installed in
part or not at all. A 135,000-token preamble would consume most of the context
window before the first question, on every session, forever — including the
sessions where you just want a price changed.

---

## Installed in this repository

### Diagram Design — 40 diagram types

- **Source:** `github.com/cathrynlavery/diagram-design` v2.6.27, MIT
- **Location:** `.claude/skills/diagram-design/`, commands in `.claude/commands/`
- **Invoke:** ask for a diagram in plain words — "draw the checkout flow as a
  sequence diagram", "diagram the catalog pipeline". Or use a command:
  `/doctor`, `/export-diagram`, `/profile`, `/import-drawio`,
  `/import-mermaid`, `/import-excalidraw`.
- **Produces:** a self-contained HTML file with inline SVG. No build step, no
  JavaScript, no external images. Exports to SVG and PNG.
- **Needs:** nothing. Python 3 is used only by its import and export scripts.
- **Fits this project:** the architecture worth drawing is real — catalog to
  Stripe to Printful to webhook, the admin write path through the GitHub API,
  the four merchandising tracks.

### Security — 16 skills for this stack

- **Source:** `github.com/mukul975/Anthropic-Cybersecurity-Skills`, Apache-2.0
- **Location:** `.claude/skills/<skill-name>/`, one directory each
- **Important:** despite the repository name, this is **not an Anthropic
  project**. Its own README states it is independent and unaffiliated. It is
  a community pack of 818 skills; 16 are installed here.

The 16 were chosen against what this site actually runs: Stripe checkout and
webhook, a signed-cookie admin session, API routes under `/api/`, secrets in
Vercel, npm dependencies, and GitHub Actions.

| Skill | Why it is here |
| --- | --- |
| `testing-for-json-web-token-vulnerabilities` | The admin session is a signed token verified in `middleware.ts` |
| `testing-api-authentication-weaknesses` | Every `/api/admin/` route re-checks auth independently |
| `testing-api-security-with-owasp-top-10` | The full API surface before launch |
| `implementing-api-key-security-controls` | Printful, Printify, Brevo, remove.bg, GitHub keys |
| `implementing-api-rate-limiting-and-throttling` | Checkout and subscribe routes are unauthenticated |
| `implementing-api-abuse-detection-with-rate-limiting` | Same, under attack conditions |
| `implementing-api-schema-validation-security` | Admin product writes accept a JSON body |
| `implementing-secret-scanning-with-gitleaks` | Keys must never reach the repository |
| `implementing-secrets-scanning-in-ci-cd` | The CI workflow builds with placeholders |
| `detecting-supply-chain-attacks-in-ci-cd` | Two GitHub Actions workflows |
| `detecting-dependency-confusion` | 21 runtime npm dependencies |
| `analyzing-sbom-for-supply-chain-vulnerabilities` | Dependency CVE review |
| `performing-web-application-penetration-test` | Pre-launch check of your own site |
| `performing-web-application-vulnerability-triage` | Ranking whatever a scan returns |
| `analyzing-web-server-logs-for-intrusion` | Reading Vercel logs after go-live |
| `implementing-web-application-logging-with-modsecurity` | If a WAF is added later |

**Invoke:** describe the task — "review the admin session token for JWT
weaknesses", "check the workflows for supply chain risk", "triage this scan
output". Claude picks the skill.

**Scope note:** several are written for authorised security engagements. Use
them on your own site. They are not a licence to test anyone else's.

### Harness engineering templates

- **Source:** `github.com/ulises-jeremias/awesome-harness-engineering`, CC0
- **Location:** `.claude/references/harness-engineering/`
- **What it is:** four planning templates (`PLAN.md`, `IMPLEMENT.md`,
  `AGENTS.md`, `HARNESS_CHECKLIST.md`), 244 lines total.
- **Not a skill.** The upstream project is a curated reading list, not
  installable capability. Nothing here loads automatically; point Claude at a
  template when you want its structure.

---

## Requested but not installed, and why

### Browser Use

`github.com/browser-use/browser-use` is a Python and TypeScript **framework**
for building browser agents, not a Claude Code skill. There is nothing to
install into `.claude/`.

This session already drives a real browser: Playwright with Chromium is
preinstalled, and it is what produced the accessibility audits, the scroll
profiles, the screenshots, and the print files. Adding Browser Use would
duplicate a capability you already have.

If you want it for your own scripts: `pip install browser-use`. It needs a
model API key of its own.

### Agent Memory

`github.com/OctavianTocan/agent-memory` v0.5.0, MIT. A real tool, and a good
one: a SQLite database at `~/.agent-memory/memory.db`, a `mem` CLI, and a
`UserPromptSubmit` hook that injects recalled context.

It is **machine-global by design** — one database shared by every agent on
your computer. This session runs in a container that is destroyed when the
session ends, so nothing it wrote would survive, and its install writes to
`~/.claude` and `~/.local/bin`, which your instructions asked me to avoid.

On your own machine:

```
npm install -g @octavian-tocan/agent-memory
```

That one command initialises the database, installs its skill, and wires the
hook. Python 3.9+ and SQLite only, no API key.

### Scientific Agent Skills

`github.com/K-Dense-AI/scientific-agent-skills`, MIT, 166 skills, 276 MB.

Genuinely impressive and entirely wrong for this repository. The skills are
cancer genomics, drug-target binding, molecular dynamics, RNA velocity,
single-cell analysis, quantum circuits. There is no biology in a storefront.
The cost would be ~23,000 tokens of always-on context to describe capabilities
that would never fire.

If you want it in a research project of its own:

```
npx skills add K-Dense-AI/scientific-agent-skills
```

### The cybersecurity pack in full

818 skills, ~108,000 tokens of always-on context. Sixteen are installed; the
other 802 cover Active Directory attacks, malware reverse engineering, mobile
forensics, cloud SIEM, and ransomware analysis — none of which touch a
Next.js storefront on Vercel.

To add more later, copy the directory you want from the upstream repository
into `.claude/skills/`. Each skill is self-contained.

### OpenViking

`github.com/volcengine/OpenViking` (ByteDance). A context **database service**
that agents talk to over a `viking://` filesystem protocol. It is server
infrastructure you run and keep running, not a skill file. It would need a
persistent host, which this ephemeral container is not, and it overlaps
heavily with Agent Memory.

---

### Ponytail — six skills

- **Source:** `github.com/DietrichGebert/ponytail` v4.10.0, MIT
- **Location:** `.claude/skills/ponytail*/`
- **Invoke:** say "ponytail", "be lazy", "simplest solution", "yagni", or
  complain about over-engineering. Also routed automatically on coding tasks.
  `ponytail lite|full|ultra` sets intensity; "stop ponytail" turns it off.
- **The other five:** `ponytail-review` (review a diff for over-engineering),
  `ponytail-audit` (scan the whole repo), `ponytail-debt` (collect deferred
  shortcuts), `ponytail-gain` (its benchmark numbers), `ponytail-help`.
- **Not installed:** its `.toml` commands are Codex's format, and its three
  hooks resolve through a plugin-only path variable and fire on every prompt.

### Graphify — codebase knowledge graph

- **Source:** PyPI `graphifyy` 0.9.65, `github.com/Graphify-Labs/graphify`,
  Apache-2.0 with MIT components
- **Location:** `.claude/skills/graphify/`, output in gitignored `graphify-out/`
- **Needs:** `pip install graphifyy`, Python 3.10+
- **Build it:** `graphify . --code-only` needs no API key. The full pass over
  docs, PDFs, and images needs `ANTHROPIC_API_KEY` or another model key.
- **Measured here:** 365 code files became 6,247 nodes, 13,975 edges, 251
  communities. A query for the publish path correctly returned
  `publishedProducts()`, `lib/catalog.ts`, both product routes, the admin
  import route, the sitemap, and the structured-data component.
- **Not installed:** the `PreToolUse` hooks its installer registers. They
  intercept every Read, Glob, Bash, and Grep call and hard-require the
  `graphify` binary on PATH, which would break CI and any machine without it.

### Agent Skills — 25 lifecycle skills, 4 agents, 9 commands

- **Source:** `github.com/addyosmani/agent-skills` v0.6.9, MIT — the one you
  chose over `sanjay3290/ai-skills`, which needed a Google Workspace account
  and roughly a dozen API keys
- **Location:** `.claude/skills/`, `.claude/agents/`, `.claude/commands/`
- **Commands:** `/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship`,
  `/constraints`, `/code-simplify`, `/webperf`
- **Agents:** `code-reviewer`, `security-auditor`, `test-engineer`,
  `web-performance-auditor` — the first non-persona agents in this repo
- **Not installed:** its SessionStart hook, on the author's own advice. Its
  header says hosts that route skills from descriptions, Claude Code among
  them, would end up running a second router over the native one.

## Still open

`OmniRoute` re-routes the Claude Code model endpoint machine-wide and cannot
be installed from here. Steps for your own machine are in the conversation.

---

## How to use what is now installed

```
Draw the checkout flow as a sequence diagram: cart → /api/checkout →
Stripe → /api/webhook/ → Printful order.

Diagram the catalog pipeline — content/catalog.json through the admin,
the GitHub Contents API, and Vercel's redeploy.

Review middleware.ts and lib/admin-auth.ts for token weaknesses before
we go live.

Audit .github/workflows for supply chain risk — unpinned actions,
script injection, secret exposure.

Check package.json for dependency confusion exposure.

Triage this scan output and rank it by what actually matters for a
storefront.
```
