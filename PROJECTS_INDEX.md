# Projects index

A workspace inventory of every project found in the `InteriorCleanse/InteriorCleanse`
repository, written 2026-10-02 from what is actually in git: the default branch,
every remote branch, and each project's own files. No secrets are recorded here.
Session history that is not in the repository was not available and is not
described.

The root `CLAUDE.md` holds the authoritative project map and the rule that a
session works only on the project its title names. This file adds what each
project is built from and where the projects currently touch.

## The one fact that shapes everything

**This is one repository holding many unrelated products, and the storefront owns
the root.** The InteriorCleanse Next.js app lives at the top level, so its
`CLAUDE.md`, its `.claude/` (109 skills, 44 agents, 17 commands), its
`package.json`, `tsconfig.json`, ESLint config and CI apply to every session that
opens the repository, whatever project that session is for. Every other project
lives in a subfolder or on its own branch.

The durable fix is one repository per product (the map already records Kept
moving to its own `kept` repository). Until then, the boundary is held by the
session-title rule, by `tsconfig.json` and `.eslintignore` excluding the other
folders, and by path filters in CI.

## Inventory

| Project | Where it lives | Branch | Last commit | Stack | Own Claude rules | Deploys |
|---|---|---|---|---|---|---|
| InteriorCleanse storefront | repo root (`app/`, `components/`, `lib/`, `content/`) | `claude/interiorcleanse-3d-rebuild-ewspkq` | 2026-10-02 | Next 14, React 18, TypeScript, Babylon.js + three, GSAP, Stripe, Tailwind 3 | root `CLAUDE.md`, root `.claude/` | Vercel `interior-cleanse` (and a second project, see below) |
| Kestrel (paper-trading bot) | `trading-bot/` | `claude/new-session-31dwy7` | 2026-10-01 | Node + TypeScript, no framework, static `web/` UI, Docker | `trading-bot/CLAUDE.md`, `trading-bot/.claude/` | Vercel `trading-bot`, Docker |
| Freehold | `freehold/`, `docs/business/freehold/` | `claude/business-profit-agents-uw913k` | 2026-10-01 | Next 14, React 18, Tailwind 3, GSAP | **none** | Vercel `freehold` (`freehold/vercel.json`) |
| AVANT (car sharing) | `avant/` (on its branch only) | `claude/app-recreation-improvement-gy1qnm` | 2026-10-02 | Next 15, React 19, TypeScript | `avant/CLAUDE.md`, `avant/.claude/` | Vercel `avant` |
| Auction Scanner ("gavel") | `auction-scanner/` (on its branch only) | `claude/ai-car-auction-scanner-hogvls` | 2026-10-02 | Node + TypeScript, static `web/` UI, Docker | `auction-scanner/CLAUDE.md` | Docker |
| AURELIS OS (voice assistant) | **separate, unrelated git history** on `aurelis-base`, `claude/aurelis-os`, `claude/jarvis-voice-assistant-h4hd42` | as listed | 2026-09-27 | Next 16, React 19, Supabase, Vitest, desktop app, browser extension | its own root `CLAUDE.md`, `.claude/`, `.mcp.json` | `aurelis` `vercel.json` |
| Picked (protein brand) | `docs/business/picked/` | `claude/picked-protein-brand` | 2026-10-01 | documents and brand assets only | none | none |
| GCode Keys (vehicle keys) | `gcodekeys/`, `docs/business/auto-keys/` | `claude/gcodekeys-site` (site), `claude/auto-keys-brand` (brand docs) | 2026-10-04 | Next 14, React 18, TypeScript, GSAP | none | Vercel (root dir `gcodekeys`) — pending |
| Get-it (workout app) | docs and assets on its branch | `claude/workout-app-premium-prompt-whe1gh` | 2026-09-13 | Base44 prompts, a design-system HTML page, logo SVGs | none | Base44 (outside this repo) |
| Kept | moving to its own repository | `claude/automation-profit-plan-3fs3lb` | 2026-09-27 | no files beyond `main` on its branch | none | none here |
| Cornerstone Sites | not found | `claude/eloquent-hypatia-jbkqlc` is **not on the remote** | — | — | — | — |
| Security Kit | not found | no branch found | — | — | — | — |

Other branches: seven Dependabot branches (one dependency each, against the
storefront and Kestrel), `claude/jarvis-voice-assistant-v2` (one commit,
August), and `feat/spline-hero-scene` (no commits ahead of `main`).

## Where the projects touch

Ranked by risk. Nothing below was changed by this audit; each needs the owning
project's session or an owner decision.

1. **Five Vercel projects build from this one repository.** Every push to any
   branch starts builds for `interior-cleanse`, `interior-cleanse-cr2t`,
   `avant`, `freehold` and `trading-bot`. On recent storefront pull requests,
   four of the five were refused with "Deployment rate limited — retry in 24
   hours". One project's busy day can stop another project's deploys. Fix:
   in each Vercel project, set an Ignored Build Step that skips the build unless
   that project's own folder changed, or give each product its own repository.
2. **Two Vercel projects deploy the storefront:** `interior-cleanse` and
   `interior-cleanse-cr2t`. Only one should own interiorcleanse.com. The
   connector available to this session cannot read either project, so which
   one is live is unverified. The owner should delete or disconnect the spare.
3. **AURELIS shares the repository with unrelated history.** Its branches have
   their own root `app/`, `package.json` and `CLAUDE.md`. A merge into `main`
   would collide with the storefront at the top level. It should live in its own
   repository.
4. **AURELIS's project MCP config runs unpinned third-party code.** Its
   `.mcp.json` starts `context-mode` and `@askjo/camofox-browser-mcp` with
   `npx -y` and no version, so whatever is newest on npm executes on approval,
   and it points a third server, `NotFair`, at a remote HTTP endpoint. This
   repository's own audit declined `context-mode` for fabricated social proof
   (`docs/AGENT_CAPABILITIES.md`). Pin versions and review each server before
   approving them.
5. **The Get-it branch writes into the storefront's `public/`.** It adds
   `public/brand/get-it-logo.svg` and `get-it-wordmark.svg`. If merged, Get-it's
   logo would be served from interiorcleanse.com. Move those assets under a
   Get-it folder before that branch merges.
6. **The storefront's skills and rules load in every session.** Root
   `.claude/` and root `CLAUDE.md` reach Kestrel, Freehold, AVANT and the
   others, which pay about 11,000 tokens of skill descriptions each session and
   see storefront-specific rules. The project map at the top of `CLAUDE.md`
   limits the harm; separate repositories remove it.
7. **The storefront CI runs on every pull request.** `.github/workflows/ci.yml`
   triggers on all pull requests, so Kestrel or Freehold PRs wait on a
   storefront build that tests nothing they changed. Kestrel's own workflow is
   correctly path-filtered.
8. **AVANT's CI never runs.** `avant/.github/workflows/ci.yml` sits in a
   subfolder, and GitHub only runs workflows from the repository root.
9. **Freehold has no `CLAUDE.md`.** Its sessions inherit the storefront's root
   rules and nothing of their own.
10. **Business documents share the storefront's `docs/`.** Freehold, Picked
    and GCode Keys documents live under `docs/business/`, next to storefront
    documents. That is labelled and low risk, but it is the same pattern as
    item 6.

Checked and clean:

- The only tracked environment files are `.env.example` templates (root,
  `freehold/`, `trading-bot/`). No real `.env` file is tracked, and the CI
  secret scan (gitleaks) passes.
- No npm, pnpm or yarn workspace joins the projects. Each `package.json` is
  independent.
- `tsconfig.json` and `.eslintignore` at the root exclude `trading-bot/` and
  `freehold/`, so the storefront build does not compile them.
- There are no symlinks, git worktrees, or shared upload or database paths.

## Keeping this file current

Update the inventory table when a project is added, moved to its own
repository, or retired. Keep the root `CLAUDE.md` project map and this file in
agreement; the map is the one sessions are told to read first.
