# How InteriorCleanse runs: the AI marketing team

The operating framework for growing the storefront, adopted 2026-10-16 from
two reels the owner chose:

- **ReStructure AI, "AI Social Media Team That Runs Your Marketing."** Eight
  departments run by agents, summed up as "Claude writes, an orchestrator
  decides, a voice tool talks, you just approve," with a hard weekly spending
  limit. It is published as a diagram with no code, so it is rebuilt here from
  what this repository already has.
- **Jack Neel on clipping.** Brands post a campaign on Whop's Content Rewards,
  and independent clippers earn a set rate per 1,000 views for short clips they
  cut from the brand's material. Higgsfield is used to edit them. The brand-side
  playbook is in `docs/CLIPPING_CAMPAIGN.md`.

Run it with `/marketing-team <department>` or `/marketing-team weekly`.

## The one rule: Claude drafts, the owner approves

Nothing leaves this repository without the owner's yes: no post, ad, email
blast, reply, payout or price. Every department writes drafts into
`content/marketing/queue/` (one file per item, dated), and the owner approves,
edits or bins each one. Three things are never automated:

1. **Spending money.** The ad budget is **$0** until the owner sets a weekly
   number in writing below. No agent raises it, and no campaign runs past it.
2. **Saying something untrue.** The storefront rules in `CLAUDE.md` apply to
   every caption and ad: no invented products, prices, reviews, results,
   scarcity or commission rates, and no stock photographs of products.
3. **Talking to a customer as a person.** No AI voice calls and no replies
   that pretend to be the founder. Drafted replies are sent by the owner.

| Setting | Value | Set by |
|---|---|---|
| Weekly ad budget | $0 (not yet set) | owner |
| Hard weekly cap, ads and clipping combined | not yet set | owner |
| Posts that need approval | all, for the first 30 days; then the owner may approve a weekly batch | owner |

## The departments

Each row names who does the work today. "Agent" means a persona in
`.claude/agents/`; "connector" means a claude.ai connector this account has.

| # | Department | What it does for InteriorCleanse | Who does it | Cadence | Output |
|---|---|---|---|---|---|
| 1 | Market intelligence | Rising searches and conversations about calm homes, candles, cleaning rituals and faith books; what competitors' ads and posts are doing | Agents `product-trend-researcher`, `marketing-seo-specialist`; skill `last30days`; web search | Weekly, Monday | `queue/<date>-intel.md`: five findings, each with a source link, and the one to act on |
| 2 | Content studio | Scripts, captions, carousels and short videos from real products and the room films | Agents `marketing-content-creator`, `marketing-instagram-curator`, `marketing-tiktok-strategist`, `design-brand-guardian`; skills `brand`, `banner-design`, `reel-export`, `loop-cover`, `launch-video`; Higgsfield connector (prompts in `docs/BRAND_PROMPTS.md`); media in `public/media/hf/` | 3 drafts a week | Draft posts with caption, asset and alt text |
| 3 | Publishing | Posts approved items to TikTok, Instagram, YouTube Shorts and Pinterest | Owner posts. The Higgsfield connector can publish to a connected TikTok account, only after the owner approves that exact post | After approval | Posted links logged in the scorecard |
| 4 | Clipping (creator distribution) | Pays independent clippers per 1,000 views to spread approved clips | Whop Content Rewards, run by the owner from `docs/CLIPPING_CAMPAIGN.md` | Campaign by campaign | Campaign brief; weekly view and spend check |
| 5 | Paid ads | Meta and TikTok ads, once a budget exists | Agents `paid-media-creative-strategist`, `paid-media-paid-social-strategist`, `paid-media-auditor` | Paused until budget is set | Ad drafts and a test plan; no account access |
| 6 | Lead capture | Turns visitors into guest-book subscribers | Already built: the footer guest book posts to `/api/subscribe` and Brevo. The free Room Reset Checklist is the lead magnet (it lives in the downloads project) | Always on | Subscriber count in the scorecard |
| 7 | Sales response | Answers DMs, comments and order emails quickly | Agent `marketing-email-strategist` drafts; owner sends from hello@interiorcleanse.com | Daily check | Drafted replies |
| 8 | Nurture and retargeting | Welcome, abandoned-cart, post-purchase, review-request and win-back emails | Already built: `lib/ai-email.ts` writes them with Claude and sends through Brevo; the sequence is in `content/marketing/email-launch-sequence.md`. Ad retargeting waits for a budget, and adding a pixel changes the privacy policy and the CSP | Always on | Brevo reports |
| 9 | Reputation | Collects and answers genuine reviews | Review-request email (built); owner replies to every review. Never a fake, paid or incentivised review | As orders arrive | Review log |
| 10 | Data and observability | One weekly scorecard | `lib/analytics.ts` events, Vercel Web Analytics (connector), Stripe, Brevo | Weekly, Friday | `queue/<date>-scorecard.md` |

The reel's orchestrator ("Jev decides") is `/marketing-team` here: it picks the
department, loads the right agent, and writes to the queue. ElevenLabs is not
connected. Voiceovers for videos can be made with the Higgsfield connector's
audio tools, with the owner's approval of the voice and script.

## The weekly loop

| Day | Run | The owner's part |
|---|---|---|
| Monday | `/marketing-team intel`, then `/marketing-team content` | Pick the finding to act on; approve or bin the drafts (10 min) |
| Wednesday | `/marketing-team content` | Approve; post (15 min) |
| Daily | `/marketing-team replies` | Send the drafted replies (5 min) |
| Friday | `/marketing-team scorecard` | Read one page; decide one change for next week (10 min) |

## The scorecard (Friday)

Only numbers that exist in a dashboard, never estimates presented as facts:

- Visitors, product views, add-to-carts, checkouts started, orders, revenue
- Guest-book subscribers gained; welcome-email open rate
- Posts published and the best post's views
- Clipping: views paid for, spend, cost per 1,000 views, orders traced to clips
- Ad spend against budget (stays $0 until a budget is set)

## What is not set up, and is the owner's choice

- A social scheduler (Buffer, Later or Metricool) so approved posts go out on
  a timetable.
- Comment-keyword auto-DMs (ManyChat). If added, the DM text must be approved
  like any post.
- An ad account connector. Until then, ads are drafted here and placed by the
  owner.
- An AI phone agent. Not recommended: call consent rules differ by state, and
  a shop this size answers faster by text.
