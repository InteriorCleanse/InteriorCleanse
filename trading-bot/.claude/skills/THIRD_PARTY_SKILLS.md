# Third-party skills vendored here

Each folder below was copied from an upstream repository at the commit shown
and carries that repository's licence as `LICENSE` inside the folder. They
are instructions for the agent working on this repo (Claude Code); none of
them is loaded or executed by Mr. Cash. The six `mr-cash-*` folders are the
bot's own and are not listed.

Review note: every vendored SKILL.md was skimmed at import for instructions
that would fetch remote code, send data out, or touch credentials. None found
beyond the tools each skill plainly describes (gitleaks, Snyk-style scanners,
Playwright-style browsers), which are run only if you choose to run them.

| Folder | Upstream | Commit | Licence | Why it is here |
|---|---|---|---|---|
| `diagram-design` | github.com/cathrynlavery/diagram-design (`skills/diagram-design`) | dc1ace4 (2026-09-19) | MIT | System maps and runbook figures as self-contained HTML/SVG. |
| `statistical-analysis` | github.com/k-dense-ai/scientific-agent-skills (`skills/statistical-analysis`) | 49c6e97 (2026-09-21) | MIT | Test selection, assumptions, effect sizes for research-lab questions. |
| `statistical-power` | same | 49c6e97 | MIT | Sample sizes: what a cohort needs before a question is worth asking. |
| `hypothesis-generation` | same | 49c6e97 | MIT | Phrasing falsifiable hypotheses and their nulls for the lab. |
| `implementing-secret-scanning-with-gitleaks` | github.com/mukul975/Anthropic-Cybersecurity-Skills (`skills/…`) | 54a7988 (2026-08-31) | Apache 2.0 | Keep secrets out of the repo. |
| `detecting-dependency-confusion` | same | 54a7988 | Apache 2.0 | Guard the zero-dependency posture. |
| `analyzing-sbom-for-supply-chain-vulnerabilities` | same | 54a7988 | Apache 2.0 | Review what the repo would pull in. |
| `detecting-indirect-prompt-injection` | same | 54a7988 | Apache 2.0 | The assistant reads headlines; know the attack. |

### Design and presentation skills (added 2026-09-23)

For the app's look and for presenting it: interface critique, anti-generic
design direction, static art, launch videos. Each SKILL.md and every bundled
script was read at import; the scripts install ordinary npm packages
(web-artifacts-builder, app-store-screenshots' Next.js template) or analyse
audio (brag), and run only when you choose to run them.

| Folder | Upstream | Commit | Licence | Why it is here |
|---|---|---|---|---|
| `design-taste-frontend` | github.com/Leonxlnx/taste-skill (`skills/taste-skill`) | c184364 | MIT | Anti-generic design direction — the one that stops a UI looking AI-made. |
| `redesign-existing-projects` | same (`skills/redesign-skill`) | c184364 | MIT | Audit an existing UI for generic patterns and upgrade it without breaking it. |
| `high-end-visual-design` | same (`skills/soft-skill`) | c184364 | MIT | Fonts, spacing, shadows and card structure that read as premium. |
| `minimalist-ui` | same (`skills/minimalist-skill`) | c184364 | MIT | Clean editorial layouts, restrained colour. |
| `ux-designer` | github.com/szilu/ux-designer-skill | da9e9d0 | MIT | Accessibility, microcopy, forms, navigation, onboarding critique. |
| `canvas-design` | github.com/anthropics/skills (`skills/canvas-design`) | 34040c9 | Apache 2.0 | Posters and static visual pieces as PNG/PDF. |
| `web-artifacts-builder` | same (`skills/web-artifacts-builder`) | 34040c9 | Apache 2.0 | Multi-component HTML artifacts (React, Tailwind, shadcn/ui). |
| `app-store-screenshots` | github.com/ParthJadhav/app-store-screenshots (`skills/app-store-screenshots`) | 18951dd | MIT | Marketing screenshot pages, if Mr. Cash ever ships as a store app. |
| `brag` | github.com/latent-spaces/brag (`skills/brag`) | 57ce4c9 | MIT (code); SFX CC0 | A short launch video from the project. The five music tracks were **not** vendored — see `brag/assets/music/NOT_VENDORED.md`. |

The rest of the taste-skill collection (image-generation boards, a Codex-only
image-to-code flow, a "full output" override, a v1 copy and others) was left
out to keep the standing list of skill descriptions short; install it at user
level from upstream if wanted.

**Considered and not vendored:**

- **transitions.dev** (github.com/Jakubantalik/transitions.dev) ships no
  licence, so it cannot be redistributed here. Install it on your own machine
  with its CLI (`npx transitions-dev add --free`), under the author's terms.
- **Context Mode** (github.com/mksglu/context-mode) is an MCP server with hooks
  that sit in front of every tool call, not a skill; it is licensed ELv2
  (source-available, not open source). Wiring it into this repo would make every
  agent session here route its tool output through third-party code, which is the
  same trade the repo already declined for graphify's hooks. If you want it, install
  it for yourself at user level from its README.

Only defensive security skills are vendored: scanning, review and detection.
The offensive-simulation skills in that collection (CSRF, CSP-bypass and API
exploitation tooling) were deliberately left out — the bot already has its own
security test suite and Claude Code's built-in security-review, and attack
tooling does not belong in this repo.

"Anthropic-Cybersecurity-Skills" is a community project. Despite its name it
is not published by Anthropic.

The full collections can be installed at user level with
`scripts/install-agent-skills.sh` or `scripts/install-agent-skills.ps1`.
