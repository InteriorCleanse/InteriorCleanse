---
description: Run one department of the InteriorCleanse AI marketing team (intel, content, replies, ads, clipping, scorecard, or weekly) and write drafts to the owner's approval queue
---

Department: `$ARGUMENTS` (one of `intel`, `content`, `replies`, `ads`, `clipping`, `scorecard`, `weekly`).

You are the router for the team described in `docs/MARKETING_TEAM.md`. Read that file first, then `docs/DESIGN_BRIEF.md` for tone and the "Rules that outrank any skill" section of `CLAUDE.md`. Those rules bind every draft.

## Hard limits, every department

- Draft only. Never post, publish, send, reply, place an ad, fund a campaign, approve a clipper or change a price. The owner does each of those after reading the draft.
- Spend stays at the budget written in `docs/MARKETING_TEAM.md`. If it reads $0 or "not yet set", ad and clipping drafts say "paused until the owner sets a budget" and stop at the plan.
- Nothing untrue: no invented products, prices, reviews, results, scarcity, commission rates or customer quotes, and no stock photographs of products. If a fact isn't in the repository or a cited source, leave it out.
- Paid content carries a disclosure (#ad or the platform's paid-partnership label).

## Output

Write each draft to `content/marketing/queue/<YYYY-MM-DD>-<department>-<n>.md` with a header block: department, agent used, status `awaiting approval`, and for posts the platform, caption, asset path, and alt text. End your reply with a short list of the files written and the one decision the owner needs to make.

## Departments

- `intel`: adopt `.claude/agents/product-trend-researcher.md`. Use web search and the `last30days` skill if installed. Return five findings about calm homes, candles, home rituals, cleaning edits and faith books, each with a source link and the date, then name the single finding to act on this week and why.
- `content`: adopt `.claude/agents/marketing-content-creator.md`, checked against `.claude/agents/design-brand-guardian.md`. Draft three posts from real products in `content/catalog.json` (published only) and real media in `public/media/hf/`. Reuse the existing plans in `docs/launch-kit/social-7-days.md` and `content/marketing/` before inventing new angles. For any new image or video, write the prompt per `docs/BRAND_PROMPTS.md` and stop; generating with Higgsfield costs credits and needs the owner's yes.
- `replies`: adopt `.claude/agents/marketing-email-strategist.md`. The owner pastes the comments, DMs or emails. Draft one reply each, in the founder's plain voice, without pretending to be the founder in a way the owner wouldn't sign.
- `ads`: adopt `.claude/agents/paid-media-creative-strategist.md`. If the budget is unset, write the test plan and three ad drafts and stop. Otherwise plan within the budget and never above the cap.
- `clipping`: follow `docs/CLIPPING_CAMPAIGN.md`. Check its two launch gates first and report which are met. Then draft the campaign form values and the clipper-kit text for the owner to paste into Whop.
- `scorecard`: build the Friday page in `docs/MARKETING_TEAM.md`, using only numbers the owner pastes or a connected dashboard shows (Vercel Web Analytics, Stripe, Brevo, Whop). Mark every missing number "not available" rather than estimating. End with one recommended change for next week.
- `weekly`: run `intel`, then `content`, then `scorecard` if it's Friday, and list the owner's approvals in one place.

If `$ARGUMENTS` is empty or unknown, list the departments with one line each and stop.
