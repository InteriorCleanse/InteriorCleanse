# Business build plan

How a business idea becomes a named brand, a logo, a professional website,
and a first-dollar launch using the skills and agents already installed in
this repository. Written 2026-09-26 after an inventory of `.claude/` (101
skills, 40 agents, 15 commands) and the user-level skills that load in every
session.

The plan is generic on purpose: it runs the same way for InteriorCleanse and
for the next idea. The idea itself comes from `docs/BUSINESS_BRIEF_TEMPLATE.md`,
filled in by the owner. The command that executes the plan is
`/business-build` in `.claude/commands/business-build.md`.

## What the inventory found

| Need | What is installed and does it | Needs a key? |
| --- | --- | --- |
| Sharpen the idea | `interview-me`, `idea-refine`, `doubt-driven-development` skills | No |
| Strategy and model | **Business Strategist**, **Financial Analyst**, **Offer & Lead Gen Strategist** agents (promoted from the roster in this pass), **Trend Researcher**, `last30days` | `last30days` reads Reddit and Hacker News without keys |
| Brand and voice | `brand` skill, **Brand Guardian** agent, `design-dna` (extract a look from reference URLs or screenshots) | No |
| Logo | `design` skill, logo section: style, colour and industry search, design brief generator. Its image generators want Gemini, Atlas or MuAPI keys, which are not set. **Higgsfield** (connected, 56 credits on the Plus plan at time of writing, roughly a quarter credit per still) generates the raster; the vector is redrawn by hand as SVG | Higgsfield is already connected |
| Design system | `design-system` skill (tokens), `ui-ux-pro-max` (palettes, font pairings, UX rules) | No |
| Website | `design-taste-frontend`, `high-end-visual-design`, `frontend-ui-engineering`, `ui-ux-pro-max`; **UI Designer**, **UX Architect**, **Frontend Developer** agents; motion from `motion-design`, `gsap-*`, `cast`, `paint` | No |
| Website quality gate | **UI Finish-Gate Reviewer**, **web-performance-auditor**, **Persona Walkthrough Specialist**; `npm run check:contrast` pattern; `browser-testing-with-devtools` | No |
| Hosting | **Vercel** tools are connected to this session: create project, env vars, domains, deployments | Vercel is connected |
| Money and measurement | **Tracking & Measurement Specialist**, `observability-and-instrumentation`; Stripe Payment Links for day one (no code) | Owner's Stripe account |
| Search and AI discovery | **SEO Specialist**, **AEO Foundations Architect** (llms.txt, AI-aware robots) | No |
| Launch | `shipping-and-launch` via `/ship` (code-reviewer, security-auditor, test-engineer fan-out), 16 security skills for the site you own | No |
| Demand | **TikTok Strategist**, **Instagram Curator**, **Content Creator**, **Email Marketing Strategist**, **Growth Hacker**, **PR & Communications Manager**, **Reddit Community Builder**, `banner-design`, `slides` | No |
| Paid, later | **PPC**, **Paid Social**, **Ad Creative**, **Paid Media Auditor**, **Search Query Analyst**, **Programmatic** agents | Ad accounts |

Left out on purpose: the `design` skill's `ui-styling` sibling (shadcn and
5 MB of fonts), the full cybersecurity and scientific packs (context cost,
see `docs/AGENT_CAPABILITIES.md`), and the two repositories from the owner's
screenshots (assessed in `docs/REVENUE_TODAY.md`).

## Rules that hold for every business built this way

- Nothing invented: no product, price, review, follower count, partner rate,
  or result that the owner did not state or that a source does not show.
- Placeholders only for credentials. Keys go into Vercel by the owner.
- Nothing is published, posted, purchased, or emailed by an agent. Every
  phase ends in files the owner reads; the owner presses the buttons.
- A new business gets its own repository and Vercel project. This
  storefront is extended, not rebuilt, and is not the host for a second brand.
- Generated imagery shows only things that exist. A logo is an exception
  because it is the thing being created; product photography is not.

## The phases

Each phase names its inputs, the skills and agents that run, its output
files, and the gate that must pass before the next phase starts. Times are
for one owner and one session; they assume the brief is complete.

### Phase 0. Brief and strategy (half a day)

Input: `docs/BUSINESS_BRIEF_TEMPLATE.md` filled in as
`docs/business/<slug>/BRIEF.md`.

1. `interview-me` on any blank line in the brief. One question at a time until
   the offer, the buyer, and the price are stated by the owner.
2. **Business Strategist**: positioning, three competitors read from their
   live sites, the one sentence the site must say, the business model
   (what is sold, how it is fulfilled, what it costs to deliver).
3. **Financial Analyst**: unit economics from the owner's numbers only; a
   break-even table with the arithmetic shown; no projections presented as facts.
4. **Offer & Lead Gen Strategist**: the core offer, the free lead magnet, the
   first channel.
5. `last30days` on the category to hear what buyers said this month.

Output: `docs/business/<slug>/STRATEGY.md`.
Gate: the owner confirms the sentence, the price, and the first channel.

### Phase 1. Name check, brand, and logo (half a day)

1. Domain and handle availability recorded in `STRATEGY.md` (Vercel domain
   tools for the domain; handles checked by the owner).
2. `brand` skill with **Brand Guardian**: voice, three words, what the brand
   never says, palette and type. `ui-ux-pro-max` supplies candidate palettes
   and font pairings for the industry; `design-dna` extracts tokens from the
   reference sites in the brief.
3. `design` skill, logo section: run the style, colour and industry search and
   generate the design brief for the company name.
4. Three logo directions as Higgsfield stills (white background, no text
   other than the name if a wordmark is wanted), each also described in words.
   The owner picks one. The pick is redrawn as a clean SVG by hand (geometry,
   not a trace), exported to PNG at 512, 1024 and 3000, plus a favicon and an
   OG image.
5. `design-system`: `assets/design-tokens.json` and CSS variables.

Output: `docs/business/<slug>/BRAND.md`, `public/brand/<slug>/` in the new
repository, tokens file.
Gate: contrast of every text colour on every background passes 4.5:1; the
logo reads at 32 px; the owner approves the direction.

### Phase 2. Website (one to two days)

Built as a new Next.js App Router project in its own repository, deployed to
a new Vercel project through the connected Vercel tools. Pages for day one:
home, offer or product, about, contact, privacy, terms. A shop or booking
flow only if the brief sells something that needs one.

1. `design-taste-frontend` writes the one-line design read from the brief,
   then **UX Architect** sets the CSS foundation and page structure.
2. **UI Designer** with `high-end-visual-design` and `ui-ux-pro-max` designs
   the pages; `frontend-ui-engineering` builds them; **Frontend Developer**
   agent for components; `motion-design` and `gsap-*` for restrained motion
   with `prefers-reduced-motion` honoured.
3. **Content Creator** writes the copy from `STRATEGY.md` in the brand voice.
   Nothing on the page claims what the owner has not stated.
4. **AEO Foundations Architect** and **SEO Specialist**: metadata, sitemap,
   robots, llms.txt, structured data, canonical URLs.
5. **Tracking & Measurement Specialist**: Plausible or GA4, one conversion
   event per goal, Stripe Payment Link for the first product, email capture to
   Brevo or the tool in the brief.

Output: the repository, a preview deployment URL, `docs/business/<slug>/SITE.md`
listing every page, every env var placeholder, and every owner action.
Gate: **UI Finish-Gate Reviewer** passes; **web-performance-auditor** reports
LCP under 2.5 s and CLS under 0.1 on the preview; zero axe violations;
contrast check passes; **Persona Walkthrough Specialist** walks the page as
the buyer from the brief and finds no dead end.

### Phase 3. Money, legal, and launch (half a day)

1. Owner: domain to Vercel, Stripe live keys, email tool key. Placeholders
   only in the repository.
2. `/ship`: code-reviewer, security-auditor, test-engineer fan-out; go or
   no-go with a rollback plan. The 16 security skills are available for the
   site you own.
3. Legal pages reviewed by the owner or a professional before the domain
   points at the site.
4. One real purchase or signup by the owner, refunded, checked in Stripe and
   the email tool.

Output: production URL, `docs/business/<slug>/LAUNCH.md`.
Gate: green build, green `/ship`, one refunded real transaction.

### Phase 4. Demand (one afternoon, then weekly)

The same pattern that produced `content/marketing/` for InteriorCleanse:
**TikTok Strategist** thirty scripts, **Instagram Curator** launch pack,
**Email Marketing Strategist** sequence, **Growth Hacker** first-dollar plan
with ten zero-cost experiments, **PR & Communications Manager** one launch
note. **Reddit Community Builder** only where the brief's buyers are on
Reddit. `banner-design` for the social headers. Paid media agents only after
two weeks of organic data.

Output: `content/marketing/` in the new repository, `docs/FIRST_DOLLAR_PLAN.md`.
Gate: every file audited against the rules above (no invented numbers, no
undisclosed rates, only URLs that exist).

### Phase 5. The weekly loop

Sunday, 45 minutes: five numbers (visitors, signups, orders, revenue,
refunds), one experiment kept, one killed, one started. `ponytail-gain` and
`ponytail-debt` for the codebase; **Feedback Synthesizer** on every reply and
DM; **Sprint Prioritizer** for the week's three tasks.

## Where InteriorCleanse stands against this plan

| Phase | Status |
| --- | --- |
| 0 Strategy | Done: `docs/REVENUE_TODAY.md`, `docs/FIRST_DOLLAR_PLAN.md` |
| 1 Brand and logo | Done: `public/brand/` (master, monogram SVG and PNG), locked palette, `FloatingMark` monogram in the header |
| 2 Website | Done and measured: `docs/LAUNCH_PLAN.md` |
| 3 Money | Blocked on four owner actions, listed in `docs/REVENUE_TODAY.md` |
| 4 Demand | Done: `content/marketing/` |
| 5 Loop | Written, starts the first Sunday after Phase 3 |

## Running it for the next idea

1. Copy `docs/BUSINESS_BRIEF_TEMPLATE.md` to `docs/business/<slug>/BRIEF.md`
   and fill it in.
2. Type `/business-build docs/business/<slug>/BRIEF.md`.
3. Read each phase's output file and answer the gate question before the
   next phase runs.
