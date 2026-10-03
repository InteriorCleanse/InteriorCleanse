# Design and engineering playbook

The workspace reference for how products in this repository are designed and
built. It covers tooling, skills, Figma, the build workflow and the quality bar.
It does not set any product's look: each product keeps its own identity, and
its own rules live in its own folder. Project boundaries are in
`PROJECTS_INDEX.md` and the root `CLAUDE.md` project map.

Written 2026-10-02.

## 1. Product identity stays separate

Every product here already has its own visual language, and that is correct.
Do not let one leak into another.

| Product | Identity as found in its code | Keep / watch |
|---|---|---|
| InteriorCleanse | Warm cream and linen, Fraunces display with Plus Jakarta Sans, a soft per-track accent (sage, slate blue, brass, plum), cinematic 3D objects on a lit studio stage. Brief: `docs/DESIGN_BRIEF.md`. | Keep. The one cyberpunk exception is `/admin/login`, which is scoped and never seen by shoppers. |
| Kestrel | Instrument Serif and Instrument Sans with Geist Mono for figures, a light "Linen" and "Daylight" look. | Keep its own. It must never borrow the storefront's cream or Fraunces. |
| Freehold | Pale paper with a deep cobalt ink, plus a dark mode. | Keep. Needs its own `CLAUDE.md` and brief. |
| AVANT | Archivo on white with a lime accent. | Keep. |
| Auction Scanner | Static web UI with its own icon set. | Needs a written brief. |
| AURELIS OS | Separate history and stack. | Belongs in its own repository. |
| Get-it | Has its own design-system page and logo on its branch. | Move its logo out of the storefront's `public/` before merging. |

A design brief for each product belongs in that product's folder and is written
by that product's own session. A brief written from here would be guesswork
about products this session does not work on.

## 2. Design tooling: what was evaluated and decided

Every tool below was checked at its upstream source. "Installed" means vendored
into `.claude/skills/` with provenance in `.claude/README.md`.

| Tool | Purpose | Source and licence | State | Decision |
|---|---|---|---|---|
| Anthropic `frontend-design` | Distinctive, production-grade UI direction; anti-generic | `anthropics/skills`, Apache-2.0 | Installed | Keep. The default for any new interface. |
| Addy Osmani Agent Skills | 25 lifecycle skills: spec, plan, incremental build, frontend engineering, testing, debugging, review, constraints, simplification, context engineering, source-driven development | `addyosmani/agent-skills`, MIT | Installed. Four skills synced on 2026-10-02 to upstream `9d0c60d` (review, ADRs, security, constraints); no local edits were lost | Keep. Upstream still ships the same 25 skills. |
| Taste Skill | Anti-slop frontend taste | `Leonxlnx/taste-skill` | 3 of 13 installed: `design-taste-frontend`, `high-end-visual-design`, `redesign-existing-projects` | Keep the three. Upstream has moved (`ce26fc2`); re-check those three in a dedicated update. The other ten overlap or pick a direction this storefront has not chosen. |
| UI/UX Pro Max | Searchable styles, palettes, font pairings, UX guidelines | `nextlevelbuilder/ui-ux-pro-max-skill`, MIT | Installed | Keep as a reference library. Upstream moved (`09170ee`); its data files make an update a separate review. |
| Hallmark | Anti-slop audit and redesign: named tells, slop-test gates, macrostructure and footer archetypes | `Nutlope/hallmark`, MIT | Installed 2026-10-03 at `13ac0ec` | Keep. Run `hallmark audit` before calling any page done; it caught the storefront's italic headings, eyebrow overload, card-in-card and four-column footer. |
| Ponytail | Complexity control: reuse, no speculative infrastructure | `DietrichGebert/ponytail`, MIT | Installed, matches upstream `e3ba2aa` | Keep. |
| motion-design, GSAP skills, three.js skills, design-dna, genjutsu `cast` and `paint` | Motion, scroll, WebGL, design extraction | upstream repos listed in `.claude/README.md` | Installed | Keep. Use only where a product already uses that technology. |
| Figma official MCP | Real design context: components, variables, layout, screenshots, Code Connect | Figma, remote server | **Not connected** | Connect through claude.ai connectors (section 3). |
| shadcn/ui, Radix | Accessible primitives | upstream | Not used here | Use only in a product that adopts Tailwind components wholesale. The storefront has its own component set; adding these would duplicate it. |
| React Bits, Aceternity UI, Magic UI | Effect-heavy components | upstream | Not installed | Declined. Effects-first libraries are the fastest route to the template look this playbook forbids. Borrow an idea, never the dependency. |
| `context-mode` MCP | Context compaction | npm | Not installed here | Declined in `docs/AGENT_CAPABILITIES.md` for fabricated social proof. It still appears in AURELIS's `.mcp.json`; see `PROJECTS_INDEX.md`. |

The always-on cost matters: every installed skill's description loads into
every session in this repository, about 11,000 tokens today. Add a skill only
when it does something none of the installed ones do, and measure first.

## 3. Figma

**Status:** Figma's official connector exists in the claude.ai directory
("Figma — Generate diagrams and better code from Figma context") and is not
connected to this account. It cannot be connected from inside a session,
because it needs a sign-in.

**To connect:** claude.ai → Settings → Connectors → Figma → Connect, then sign
in to Figma. It then appears in cloud sessions as Figma tools, including design
context, screenshots, variable definitions and Code Connect mappings.

**When to use it, per product:**

| Product | Figma role |
|---|---|
| InteriorCleanse | Code-to-Figma. The design system already exists in code (`app/globals.css` tokens, the components). Mirror the tokens as Figma variables so new pages are designed against the real system, not redrawn. |
| Kestrel, AVANT, Freehold | A Figma file per product for screens before large UI changes, using that product's own tokens. |
| Picked, KeyRaptor, Get-it | Brand and packaging boards. |
| Auction Scanner, AURELIS | Only if a UI redesign is planned. |

When a Figma file exists, read its components, variables, spacing and type
before writing code, and reuse existing production components rather than
recreating the frame pixel for pixel.

## 4. Which skill, when

| Task | Use |
|---|---|
| New interface or major page | `frontend-design`, then `design-taste-frontend` |
| Improving an existing page | `hallmark audit`, then `hallmark redesign` or `redesign-existing-projects`, then `high-end-visual-design` |
| Motion | `motion-design`, plus `gsap-*` where the product already uses GSAP |
| 3D | `threejs-*` or the product's existing engine (the storefront uses Babylon.js) |
| Palettes, type pairings, UX rules | `ui-ux-pro-max` |
| Anything larger than one file | `spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation` |
| Before merging | `code-review-and-quality`, `security-and-hardening` where input or auth is involved |
| Keeping it simple | `ponytail`, `code-simplification` |
| Quality bar for a product | `constraint-driven-development` |
| Watching a reference video | `see-video` for long videos, `watch` for short clips |

## 5. The build workflow

1. Name the product the work belongs to; stop if it is not this session's.
2. Read that product's `CLAUDE.md` and design brief.
3. Decide whether Figma or references are needed.
4. Pick the skills from section 4.
5. Look at current references (Awwwards, Godly, Land-book, Mobbin, Figma
   Community, relevant competitors) and write down the principles, not the
   layout.
6. Write the design direction in a few sentences before coding.
7. Build in small, verifiable slices.
8. Test the function: build, types, lint, the product's own tests.
9. Visual QA in a real browser at 1440px and 390px, with screenshots.
10. Run the quality gate (section 6).
11. Accessibility pass: axe, keyboard, focus, reduced motion, contrast.
12. Report exactly what changed and what could not be verified.

## 6. The quality gate

Before any interface work is called done, each answer must be yes:

- Would a professional designer read this as a deliberate product, not a template?
- Is the type, spacing and colour each a stated choice from the brief?
- Is there one clear hierarchy per screen?
- Does every animation explain something, and stop for reduced motion?
- Are cards, gradients, glass, glows and rounded boxes absent unless they earn their place?
- Are mobile and desktop equally considered?
- Does it hold up beside a top-tier product in the same category?

And the engineering bar matches the design bar: types pass, tests pass,
accessibility checks pass, no new dependency without a reason, no secret in
the code, and existing behaviour preserved.

## 7. Security for tooling

Before installing any skill, plugin or MCP server: read its source, look for
install scripts and `curl | sh` patterns, pin the version, and prefer the
official upstream over forks. Never approve an MCP server that runs `npx -y`
on an unpinned package without reading it first.
