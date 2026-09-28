---
description: Take a filled business brief through strategy, brand and logo, website, launch, and demand, one gated phase at a time, using the installed agents and skills
argument-hint: "[path to a filled BRIEF.md, default docs/business/<slug>/BRIEF.md] [phase to run, default next]"
---

Read `docs/BUSINESS_BUILD_PLAN.md` first. It is the plan; this command runs it.

Then read the brief at `$ARGUMENTS` (first argument; if absent, find the newest
`docs/business/*/BRIEF.md`; if none exists, copy
`docs/BUSINESS_BRIEF_TEMPLATE.md` to `docs/business/<slug>/BRIEF.md` and stop
with a request to fill it in).

## Rules that override every persona and skill

- Never invent a product, price, review, follower count, partner rate, or
  result. If the brief does not state it and no source shows it, write
  "not stated" and carry on.
- Placeholders only for credentials. No real key enters any repository.
- Do not publish, post, purchase, or send anything. Every phase ends in files
  and, for the website, a preview deployment. The owner presses every button.
- A new business gets its own repository and its own Vercel project. Do not
  add a second brand to this storefront.
- Generated images: a logo may be generated because it is the thing being
  made. Product photography is generated only from a reference of the real
  product, never invented.

## Phase selection

Determine the phase from the second argument, or from what already exists:

| Exists | Next phase |
| --- | --- |
| Only `BRIEF.md` | 0, strategy |
| `STRATEGY.md` confirmed by the owner | 1, brand and logo |
| `BRAND.md` and brand files approved | 2, website |
| `SITE.md` and the finish gate passed | 3, launch |
| `LAUNCH.md` with a refunded real transaction | 4, demand |
| `content/marketing/` audited | 5, the weekly loop |

Run exactly one phase per invocation. End by stating the gate question the
owner must answer and the file they should read.

## Phase 0, strategy

1. If any line of the brief is blank, use the `interview-me` skill on that
   line only. One question at a time. Do not fill the blank yourself.
2. Spawn in parallel, each with the brief and the rules above:
   `Business Strategist` (positioning, three competitors read from their live
   sites, the one sentence, the business model), `Financial Analyst` (unit
   economics from the owner's numbers only, break-even arithmetic shown,
   nothing presented as a projection of fact), `Offer & Lead Gen Strategist`
   (core offer, free lead magnet, first channel), `Trend Researcher` (what
   buyers in this category said in the last thirty days; use the `last30days`
   skill where it runs without keys).
3. Merge into `docs/business/<slug>/STRATEGY.md`: the sentence, the buyer,
   the price, the first channel, the competitor table, the unit economics
   table, the offer and lead magnet, open questions.

Gate: the owner confirms the sentence, the price, and the first channel.

## Phase 1, brand and logo

1. Domain: check availability with the Vercel domain tools and record the
   result; do not buy. Handles are checked by the owner.
2. `brand` skill with the `Brand Guardian` agent: voice, three words, the
   never-say list, palette, type. Pull candidates from `ui-ux-pro-max`
   (`--domain color` and font pairings for the industry) and, if the brief
   lists reference sites, from `design-dna`.
3. `design` skill, logo section: run
   `python3 .claude/skills/design/scripts/logo/search.py "<industry words>" --design-brief -p "<Company>"`
   and the style, colour, and industry searches. Save the brief into
   `BRAND.md`.
4. Three logo directions. Generate each as a still with the Higgsfield
   `generate_image` tool (white background, the mark alone; a wordmark only
   if the brief asks for one; no other text). Describe each direction in
   words next to the image URL. Ask the owner to pick with `AskUserQuestion`.
5. Redraw the pick as a clean SVG by hand from its geometry, export PNG at
   512, 1024, and 3000, a favicon, and a 1200 by 630 OG image. Place them
   under `public/brand/<slug>/` in the new repository, or in
   `docs/business/<slug>/brand/` if the repository does not exist yet.
6. `design-system` skill: `assets/design-tokens.json` and CSS variables.

Output: `docs/business/<slug>/BRAND.md`.
Gate: every text colour passes 4.5:1 on every background it sits on; the
mark reads at 32 px; the owner approves the direction.

## Phase 2, website

1. Create the repository (GitHub tools) and the Vercel project (Vercel
   tools) named for the company. Next.js App Router, TypeScript, Tailwind,
   `trailingSlash` off unless the brief needs it. No database until a
   feature needs one.
2. `design-taste-frontend`: write the one-line design read from the brief
   before any code. `UX Architect`: CSS foundation and page structure.
3. `UI Designer` with `high-end-visual-design` and `ui-ux-pro-max`; build
   with `frontend-ui-engineering` and the `Frontend Developer` agent. Motion
   through `motion-design` and `gsap-*`, honouring `prefers-reduced-motion`.
4. `Content Creator` writes every page's copy from `STRATEGY.md` in the brand
   voice. No claim the owner did not state.
5. `AEO Foundations Architect` and `SEO Specialist`: metadata, sitemap,
   robots, llms.txt, structured data, canonicals.
6. `Tracking & Measurement Specialist`: analytics with one event per goal,
   a Stripe Payment Link placeholder for the first product, email capture
   wired to the tool in the brief with a placeholder key.
7. Pages for day one: home, offer or product, about, contact, privacy,
   terms. Legal pages carry a banner for the owner to review with a
   professional.
8. Deploy a preview. Run the gate: `UI Finish-Gate Reviewer`,
   `web-performance-auditor` (LCP under 2.5 s, CLS under 0.1), axe with zero
   violations, contrast check, `Persona Walkthrough Specialist` as the
   buyer from the brief.

Output: `docs/business/<slug>/SITE.md` listing every page, every env var
placeholder, and every owner action, plus the preview URL.
Gate: all five reviewers pass.

## Phase 3, launch

1. List the owner's actions: domain to Vercel, live keys into Vercel, email
   tool key, legal review. Do not perform them.
2. Run `/ship` on the new repository and record the go or no-go and the
   rollback plan.
3. Ask the owner to make one real purchase or signup and refund it, then
   confirm it in Stripe and the email tool.

Output: `docs/business/<slug>/LAUNCH.md`.
Gate: green build, green `/ship`, one refunded real transaction.

## Phase 4, demand

Spawn in parallel with a brief written from `STRATEGY.md` and `BRAND.md`
(follow the structure of the appendix in `docs/REVENUE_TODAY.md`):
`TikTok Strategist` (thirty scripts), `Instagram Curator` (launch pack),
`Email Marketing Strategist` (sequence), `Growth Hacker` (first-dollar plan
with ten zero-cost experiments), `PR & Communications Manager` (one launch
note). Then audit every file: no exclamation marks or emojis if the voice
forbids them, no invented numbers, no undisclosed rates, only URLs that
exist, anything dependent on a missing link tagged HOLD-UNTIL-LIVE.

Output: `content/marketing/` and `docs/FIRST_DOLLAR_PLAN.md` in the new
repository.

## Phase 5, the weekly loop

Write `docs/business/<slug>/WEEKLY.md` with the five numbers to record each
Sunday, and run `ponytail-gain` and `ponytail-debt` on the codebase. Suggest,
do not create, a Routine for the Sunday review; the owner decides.
