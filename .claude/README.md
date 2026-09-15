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

Genjutsu's `cast` and `paint` orchestrators load their sub-skills from
`genjutsu/_jutsu`, which is where its resolver probes for a skills-directory
install (`*/.claude/skills/*/_jutsu`). Upstream docs, screenshots, tests, and
other-language READMEs were left out.

To remove a set, delete its folders and the row above. To update, re-copy from
the upstream commit you want and change the commit here.
