# Project skills

Third-party Claude Code skills vendored into this repository so every session
on it loads them. They are instructions and reference material, not site code;
nothing under `.claude/` is built, served, or linted.

| Skill(s) | Source | Commit | Licence |
| --- | --- | --- | --- |
| gsap-core, gsap-timeline, gsap-scrolltrigger, gsap-performance, gsap-react, gsap-frameworks, gsap-plugins, gsap-utils | github.com/greensock/gsap-skills | aed9cfd | MIT |
| threejs-fundamentals, -geometry, -materials, -textures, -lighting, -animation, -interaction, -loaders, -shaders, -postprocessing | github.com/CloudAI-X/threejs-skills | b1c6230 | MIT (stated in its README; no LICENSE file upstream) |
| design-dna | github.com/zanwei/design-dna | 593e39b | MIT |
| motion-design | github.com/lottiefiles/motion-design-skill | f9a8a04 | MIT |
| cast, paint, genjutsu/_jutsu/* | github.com/AThevon/genjutsu | 94a260a | MIT |
| watch | github.com/bradautomates/claude-video (`skills/watch`) | 83da59f | MIT |
| caveman | github.com/JuliusBrussee/caveman (`skills/caveman`) | 15581d1 | MIT (the skill; that repo's engine and Go binaries are BSL-1.1 and are not included) |
| ui-ux-pro-max, design, design-system, brand, banner-design, slides | github.com/nextlevelbuilder/ui-ux-pro-max-skill (`.claude/skills/*`) | 7f69fed | MIT |
| last30days | github.com/mvanhorn/last30days-skill (`skills/last30days`) | ac0ed3b | MIT |
| agency-agents (roster) + 32 project agents in `.claude/agents/` | github.com/msitarzewski/agency-agents | ad9264e | MIT |
| prompt-master | github.com/nidhinjs/prompt-master | 2bd9251 | MIT |
| diagram-design (+ 6 commands) | github.com/cathrynlavery/diagram-design | 9874ad7 | MIT |
| 16 security skills (of 818) | github.com/mukul975/Anthropic-Cybersecurity-Skills | 54a7988 | Apache-2.0 |
| harness-engineering templates (references, not skills) | github.com/ulises-jeremias/awesome-harness-engineering | 1e12fda | CC0 |
| ponytail, -audit, -debt, -gain, -help, -review | github.com/DietrichGebert/ponytail | e3ba2aa | MIT |
| graphify | pypi `graphifyy` 0.9.65 / github.com/Graphify-Labs/graphify | 0.9.65 | Apache-2.0 + MIT |
| 25 lifecycle skills + 4 agents + 9 commands | github.com/addyosmani/agent-skills | dc27a9c | MIT |

`/watch <video-url-or-path> [question]` lets Claude watch a video: it pulls
captions and frames and answers from them. It runs Python scripts that need
`ffmpeg`, `ffprobe`, and `yt-dlp` on the machine running Claude Code (run
`python3 .claude/skills/watch/scripts/setup.py` once; on Linux it prints the
install commands). A Groq or OpenAI key in `~/.config/watch/.env` is optional
and only used to transcribe videos that have no captions. The upstream plugin
also ships a SessionStart hook that prints setup status; it is not installed
here, since `/watch` runs the same check itself. Its dev-only
`build-skill.sh` was left out.

`/caveman` switches Claude to a terse output style for the session (`/caveman
off` restores normal). Only the skill itself is vendored; the upstream repo's
compression engine, proxy, browser extension, and agent packs are separate
products and were not copied.

`ui-ux-pro-max` is a searchable design database (styles, palettes, font
pairings, UX rules, per-stack guidance) driven by a Python script that needs
only Python 3. Its SKILL.md was patched in one place so the script path
resolves from the project root when the plugin-root variable is unset
(`${CLAUDE_PLUGIN_ROOT:-.}`). The sibling `ui-styling` skill was left out: it
is shadcn/Tailwind guidance plus 5.5 MB of canvas fonts, and this site uses
neither.

`/last30days <topic>` researches what people said about a topic in the last 30
days across Reddit, X, YouTube, Hacker News, and the web. Its engine needs
Python 3.12 or newer on the machine (its setup can provision one through uv).
Reddit, Hacker News, and GitHub work with no keys; other sources are unlocked
by its setup wizard, which writes to `~/.config/last30days/`, never to this
repository. The upstream `assets/` folder (14 MB of demo media) and its
SessionStart hook were left out.

Agency Agents: the whole roster (300+ persona files) lives under
`.claude/skills/agency-agents/roster/`, with a small SKILL.md explaining how to
use or promote one. Thirty-two personas relevant to this storefront (all of
design, paid-media, and product, plus ten marketing roles) are installed as
project subagents in `.claude/agents/`. Everything in `.claude/agents/` is
loaded into every session, so add more from the roster deliberately rather
than copying all of them.

`prompt-master` activates only when asked to write, fix, or adapt a prompt for
a specific AI tool (Claude, Cursor, Midjourney, video models, coding agents).
It is instructions plus two reference files; no scripts, no network.

Every installed skill's name and description is loaded into **every** session
before you type. This repository now carries 97 skills at roughly 10,800
tokens of always-on context, up from 48 at ~4,000 before any of this. That
budget is why the cybersecurity pack is installed at 16 skills of its 818
(the full pack costs ~108,000 tokens per session) and why the 166-skill
scientific pack was not installed at all. Before adding a large pack,
measure it.

Ponytail is vendored as its six skills only. Its slash commands upstream are
`.toml`, which is Codex's format, not Claude Code's, so they were left out —
the skills carry the same behaviour and are routed by description. Its three
hooks (SessionStart, SubagentStart, UserPromptSubmit) were also left out:
they resolve paths through `${CLAUDE_PLUGIN_ROOT}`, which only exists for
plugin installs, and they would fire on every prompt.

agent-skills ships a SessionStart hook whose own header says not to wire it
on Claude Code, because the host already routes skills from their
descriptions and a second router would sit on top of the native one. Left
out on the author's advice. Its four agents are the first non-persona agents
here: `code-reviewer`, `security-auditor`, `test-engineer`,
`web-performance-auditor`.

graphify needs `pip install graphifyy` on the machine. Its `--project`
installer also registers `PreToolUse` hooks that intercept every Read, Glob,
Bash, and Grep call; those were removed. They would make every file read in
every session depend on a Python package being installed, which breaks CI and
any machine without it. The skill itself is routed by description and needs
no hook. The graph output lives in `graphify-out/`, which is gitignored.
Build it with `graphify . --code-only` (no API key). The full multimodal pass
over docs and images needs a model key.

`diagram-design` is the first skill here to ship slash commands; they live in
`.claude/commands/` and are project-scoped. Its `doctor` and `profile`
commands have generic names — if a future pack adds its own, rename one.

The security skills are written for authorised engagements. They are here to
test this site, which you own. Despite its repository name, that pack is a
community project and is not affiliated with Anthropic; its own README says
so.

`.claude/references/` holds material that is deliberately **not** a skill, so
nothing in it loads automatically.

What was requested and not installed, and how to install it on your own
machine instead, is recorded in `docs/AGENT_CAPABILITIES.md`.

Genjutsu's `cast` and `paint` orchestrators load their sub-skills from
`genjutsu/_jutsu`, which is where its resolver probes for a skills-directory
install (`*/.claude/skills/*/_jutsu`). Upstream docs, screenshots, tests, and
other-language READMEs were left out.

To remove a set, delete its folders and the row above. To update, re-copy from
the upstream commit you want and change the commit here.
