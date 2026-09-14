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

`/watch <video-url-or-path> [question]` lets Claude watch a video: it pulls
captions and frames and answers from them. It runs Python scripts that need
`ffmpeg`, `ffprobe`, and `yt-dlp` on the machine running Claude Code (run
`python3 .claude/skills/watch/scripts/setup.py` once; on Linux it prints the
install commands). A Groq or OpenAI key in `~/.config/watch/.env` is optional
and only used to transcribe videos that have no captions. The upstream plugin
also ships a SessionStart hook that prints setup status; it is not installed
here, since `/watch` runs the same check itself. Its dev-only
`build-skill.sh` was left out.

Genjutsu's `cast` and `paint` orchestrators load their sub-skills from
`genjutsu/_jutsu`, which is where its resolver probes for a skills-directory
install (`*/.claude/skills/*/_jutsu`). Upstream docs, screenshots, tests, and
other-language READMEs were left out.

To remove a set, delete its folders and the row above. To update, re-copy from
the upstream commit you want and change the commit here.
