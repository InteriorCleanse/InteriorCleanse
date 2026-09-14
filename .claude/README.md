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

Genjutsu's `cast` and `paint` orchestrators load their sub-skills from
`genjutsu/_jutsu`, which is where its resolver probes for a skills-directory
install (`*/.claude/skills/*/_jutsu`). Upstream docs, screenshots, tests, and
other-language READMEs were left out.

To remove a set, delete its folders and the row above. To update, re-copy from
the upstream commit you want and change the commit here.
