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

Only defensive security skills are vendored: scanning, review and detection.
The offensive-simulation skills in that collection (CSRF, CSP-bypass and API
exploitation tooling) were deliberately left out — the bot already has its own
security test suite and Claude Code's built-in security-review, and attack
tooling does not belong in this repo.

"Anthropic-Cybersecurity-Skills" is a community project. Despite its name it
is not published by Anthropic.

The full collections can be installed at user level with
`scripts/install-agent-skills.sh` or `scripts/install-agent-skills.ps1`.
