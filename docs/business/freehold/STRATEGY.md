# Strategy, Phase 0: a challenger to Base44

Written 2026-09-26 from the owner's one line: "This product needs to be better
than Base44." Nothing else is stated. Builder: one founder with Claude Code,
Next.js, Vercel, no funding stated.

**How this was researched.** The container's proxy blocked every page fetch,
including base44.com, Trustpilot, Product Hunt, and all seven third-party
articles named in the brief. Every fact below comes from search-engine
snippets of those pages, retrieved 2026-09-26. A snippet is not the page.
Claims seen in one source only are marked *unverified*; claims seen in two or
more independent sources are marked *corroborated*. No number here was
invented and none should be repeated without opening the source.

## 1. Base44 as it stands (2026)

| Item | What the sources say | Source, date |
| --- | --- | --- |
| What it is | Prompt-to-hosted-web-app builder: database, auth, permissions, hosting handled inside the platform | noloco.io/blog/base44-platform-features, snippet 2026-09-26; corroborated by base44.com/features snippet |
| Owner | Wix, acquired 2025-06-18 for about $80M cash plus earn-outs through 2029; 8 employees at the time | techcrunch.com 2025-06-18; wix.com press room 2025-06-18; corroborated |
| Scale | $150M ARR by May 2026; over 2M users; a further $41M earn-out disclosed in Wix Q2 2026, total consideration past $150M per Calcalist 2026-08-04 | calcalistech.com (three articles), getlatka.com; corroborated on ARR, *unverified* on the 2026-08-04 total |
| Plans, monthly | Free $0 (25 message, 100 integration credits); Starter $20 (100 / 2,000); Builder $50 (250 / 10,000); Pro $100 (500 / 20,000); Elite $200 (1,200 / 50,000); Enterprise custom | jetadmin.io/blog/untitled-41, nocode.mba/articles/base44-pricing, websitebuilderexpert.com; corroborated |
| Plans, annual | Starter $16, Builder $40, Pro $80, Elite $160 per month | same three sources; corroborated |
| Credit model | Message credits for building, integration credits for the live app. Any prompt that edits consumes a message credit; "no set credit amount" per message. One integration credit per LLM call, email, SMS, file upload, image generation, or automation run; a workflow that calls an LLM and sends an email costs about 3 | docs.base44.com/Account-and-billing/Credits, certifiedcode.us, codeconductor.ai; corroborated |
| Errors and credits | Official policy: credits are "non-refundable for tool behavior and AI mistakes" | docs.base44.com/Account-and-billing/Credits snippet; *unverified* wording |
| Native services | Database, auth, hosting, email, SMS, LLM calls, image and video generation, file upload and extraction, push notifications, analytics dashboard, about twenty built-in integrations, payments | noloco.io, docs.base44.com/Integrations/built-in-integrations, base44devs.com; corroborated |
| Mobile | Web apps and PWAs only; no App Store or Play Store submission without a third-party wrapper | newly.app/base44-for-mobile-apps, webtonative.com; corroborated |
| Code export | ZIP, GitHub two-way sync (Builder plan or higher, main branch only), CSV per collection. Frontend comes out; auth, database logic, and hosted runtime stay behind the Base44 SDK; an eject starts with an empty database | perpet.io, axonbuild.com, bringforth.ai, docs.base44.com/developers/app-code/local-development/github; corroborated |
| Custom integrations | New custom integrations not supported after 2026-03-01; must go through backend functions | base44devs.com, docs.base44.com/changelog/developers; *unverified* |
| Reliability | Platform-wide outage 2026-02-03, 2h53m, all published apps returned 502; further incidents 2026-02-17, 2026-02-20, 2026-06-03, 2026-08-20. Status page reports 99.91% uptime over 60 days at an unstated date. No SLA outside Enterprise | community.designtaxi.com (2026-02-03, 2026-08-20), statusgator.com/services/base44, medium.com/@jacobp96, escapebase44.com; corroborated on 2026-02-03, *unverified* on the rest |
| Security | Wiz: auth bypass on private apps via public app_id, disclosed 2025-07-09, fixed within 24h. Imperva: stored XSS on /apps-show and JWT leakage, fixed within 24h, reported 2025-08 | wiz.io/blog/critical-vulnerability-base44, imperva.com blog, thehackernews.com 2025-07; corroborated |
| Support reputation | Trustpilot 2.8/5, 783 to 891 reviews across snapshots, 54% one-star and 34% five-star in one snapshot. Product Hunt 4.4/5, 39 reviews. Response times "from hours to days or weeks" after the acquisition | trustpilot.com/review/base44.com via preuve.ai and fuzen.io snippets; producthunt.com/products/base44/reviews snippet; base44devs.com; Trustpilot score corroborated, response-time claim *unverified* |
| Refunds | Terms: fees "non-cancelable and non-refundable"; no prorated refunds | base44.com/terms-of-service via recurdash.com and escapebase44.com; corroborated |

## 2. What users complain about, ranked by frequency across sources

Rank is by how many independent sources raised the theme (count in brackets).

1. **Credits consumed by the AI's own errors, with no spend cap (7).** "If it takes five extra prompts to fix it, you spend five additional credits fixing something that wasn't your fault" (shipper.now/base44-errors). A Trustpilot reviewer: a broken function "kept retrying itself and burned through tens of thousands of integration credits in minutes, once over 20,000, another time over 50,000, with no spend cap"; compensation offered was 20 message credits (trustpilot.com/review/base44.com?page=5 snippet). Also feedback.base44.com "Get your credits back when reverting a message", G2, aol.com "tried 3 biggest vibe coding", medium.com/predict, docs.base44.com policy.
2. **Lock-in: backend and database do not leave with you (6).** "Frontend comes out, backend stays behind Base44's SDK" (perpet.io). "None delivers the authentication system, database logic, or hosted runtime that makes your app function independently" (bringforth.ai). Also axonbuild.com, escapebase44.com, G2 ("unclear how you'd migrate the database"), Product Hunt ("export lock-in").
3. **Support slow, or an AI answering the ticket (5).** "The helpdesk is again the same AI responding, again without offering any solution" (Trustpilot page 5 snippet). Pro users at $100 to $200 a month "report difficulty reaching humans" (fuzen.io). Also base44devs.com, Product Hunt, G2.
4. **Billing: hard-to-find cancellation, charges after cancelling, refused refunds (5).** "Cancelled their subscription but Base44 continued to charge them $29" (recurdash.com). Base44's reply on Trustpilot disputes that post-cancellation charges are possible. Also feedback.base44.com "REFUND", escapebase44.com, G2, Trustpilot one-star pattern per preuve.ai.
5. **The AI breaks its own code and cannot repair it (5).** "Base44 AI constantly breaks its own code and is not capable of fixing it" (Trustpilot page 5 snippet). "Stalling on payment logic, repeating mistakes and spending credits on fixes that didn't stick" (aol.com). Layouts "rigid" once users want control (hackceleration.com). Also Product Hunt, G2.
6. **Outages with no SLA and no recourse (4).** "Because there is no SLA at any tier, the affected apps had no recourse but to wait" (medium.com/@jacobp96 on 2026-02-03). Also designtaxi.com, escapebase44.com, base44devs.com.
7. **Security defaults (3).** The Wiz and Imperva findings above, plus one Trustpilot reviewer whose "website was deleted overnight" after another user gained access, compensated with 20 credits (Trustpilot page 5 snippet, *unverified*).
8. **No native mobile (2).** newly.app, webtonative.com.

Themes 1, 2, 4, and 6 share one root: the customer does not own the runtime or the meter. That is the list "better" is measured against.

## 3. What "better than Base44" can and cannot mean in year one

**Cannot mean:**

- Matching breadth. Twenty built-in integrations, email, SMS, image generation, push, analytics, payments, plus a proprietary model ("Base1", calcalistech.com 2026, *unverified*). A solo founder cannot rebuild that surface and should not try.
- Matching distribution. Wix App Market listing, a Wix connector, and a reported 1,000 new paying subscribers a day at Q3 2025 (certifiedcode.us citing Wix results, *unverified*). No organic channel available to one founder compares.
- Winning a price war. Entry is $16 to $20 a month (Section 1); Lovable Pro is $25 for 100 credits (buttondown.com, flowith.io, corroborated), Bolt Pro $25 for 10M tokens (jetadmin.io, nocode.mba, corroborated), Replit Core $20 on annual billing with $20 usage credit (superblocks.com, replit.com/blog/pro-plan, corroborated). Dyad is free, open source, local, bring-your-own-key (dyad.sh, github.com/dyad-sh/dyad, corroborated). The floor is zero.

**Can mean, decisively:**

- Never charging for the AI's own failure, and a hard spend cap the customer sets (complaint 1).
- The whole app, backend and schema included, in the customer's own GitHub, database, and Vercel account from the first prompt, so leaving costs nothing (complaint 2).
- The builder's outage is not the customer's outage, because the customer's app never runs on the builder's servers (complaint 6, without needing an SLA organisation).
- A human answers, because the customer count is small enough that one founder can (complaint 3).
- Cancellation in one click and a refund policy written in one sentence (complaint 4).

These are cheap for a small product and expensive for Base44, whose integration-credit revenue and hosted runtime depend on the opposite.

## 4. Three wedge options

### Wedge A: "Your repo, your database, your key"

- **Buyer.** A non-developer or semi-technical founder who has already been burned by a hosted builder and wants a real app they own. Evidence of the segment: Fiverr and Upwork gigs to "fix vibe coding errors lovable dev base44" (fiverr.com, upwork.com, 2026-09-26); escapebase44.com exists as a migration guide; Trustpilot one-star reviewers.
- **One sentence.** Describe the app, and within the session it exists as a Next.js repository in your GitHub, a Postgres database in your account, a deployment on your Vercel, generated by Claude on your own API key.
- **Deliberately left out.** No hosted runtime, no built-in email or SMS, no native mobile, no integration marketplace, no proprietary model. The product is the orchestration, the templates, and the migration path.
- **Pricing shape.** Flat monthly fee for the builder; model cost passes through to the customer's Anthropic bill, visible to them. Anchor: Dyad charges nothing for BYOK and sells a Pro tier for hosted credits (dyad.sh, 2026-09-26); Lovable's Pro is $25 with a fixed credit quota (flowith.io, 2026-09-26). The fee should sit in that band and the model cost should be the customer's, not ours.
- **Why Base44 cannot easily copy it.** Its revenue is the hosted runtime and integration credits; giving the backend away unwinds the business it was bought for. Its export is documented as frontend-only (Section 1).
- **Biggest risk.** Dyad already does BYOK, free, open source, with Supabase and Neon integration. Lovable already does GitHub sync and own-Supabase. The difference must be hosted convenience plus full backend generation plus a Base44 import path, or it is not a difference.
- **First ten customers.** People posting "fix my Base44 app" on Fiverr and Upwork, the Trustpilot one-star reviewers, r/vibecoding, and readers of escapebase44.com.

### Wedge B: "Pay for what works"

- **Buyer.** Any current Lovable, Bolt, or Base44 user whose bill is dominated by retries. The "credit death-spiral" is named across tools (medium.com/predict, 2026-09-26).
- **One sentence.** Every change is metered only when you accept it; failed generations, reverts, and the AI's own bug fixes cost nothing, and you set a hard monthly cap.
- **Deliberately left out.** No hosted app runtime (or the meter cannot be honest). No integration credits at all.
- **Pricing shape.** Per accepted change, with a monthly cap set by the customer, plus a small base fee. Anchor: Base44 Starter is $20 for 100 message credits (Section 1); the promise is that our accepted-change count for the same app is lower than their message count, provable on a public page.
- **Why Base44 cannot easily copy it.** Its written policy is that AI mistakes are non-refundable (docs.base44.com snippet); reversing it on 2M users would cut revenue directly.
- **Biggest risk.** We absorb the cost of every failed generation. On a solo budget one runaway loop is a real loss; this only works with BYOK (Wedge A) or with strict per-session limits.
- **First ten customers.** Same pool as A; the offer is simpler to say.

### Wedge C: one vertical, one buyer

- **Buyer.** Not stated by the owner. Candidates the sources point at: small service businesses that Base44's Wix pitch targets with "a staff scheduler, a content calendar, a client history view" (certifiedcode.us, 2026-09-26). The owner would pick one of these buyers and the product would build only that class of app.
- **One sentence.** The app builder for [one buyer], with the data model, auth, and pages that buyer needs already correct before the first prompt.
- **Deliberately left out.** Every app type outside the vertical.
- **Pricing shape.** Flat monthly, priced as software for that trade rather than as an AI tool; anchored to whatever that trade already pays for its incumbent tool, which is not researched here.
- **Why Base44 cannot easily copy it.** It can. Its templates and Wix data connector already point at small businesses. The defence is depth and a name the trade recognises, not technology.
- **Biggest risk.** Choosing the wrong vertical costs the year, and the owner has not named one.
- **First ten customers.** Wherever that trade gathers; unknown until the buyer is chosen.

## 5. Recommendation

Wedge A, with Wedge B's "no charge for the AI's own errors" folded in as its billing rule.

First, it is the only wedge where the founder's stack (Claude Code, Next.js, Vercel) is the product rather than a means to it, so year one is spent on the thing customers pay for. Second, it answers complaints 1, 2, 4, and 6 at their shared root, ownership of the runtime and the meter, instead of one at a time. Third, Base44 cannot follow without dismantling the hosted-runtime and integration-credit revenue that justified its purchase. Fourth, the first ten customers are visible today on Fiverr, Upwork, Trustpilot, and escapebase44.com, which no other wedge can say. Fifth, the Dyad and Lovable overlap is real but they sell a local tool and a hosted runtime respectively; the gap between them, hosted convenience with nothing hosted, is empty, and it stays a gap only if the Base44 import path ships early.

Three decisions the owner must make before Phase 1:

1. **The name.** Not stated. The owner said one is coming.
2. **The buyer.** Escapees from hosted builders (Wedge A as written) or first-time builders who have never used one. The copy, the import feature, and the first channel differ completely.
3. **The price.** Flat fee with BYOK pass-through, or a bundled fee that includes model cost. The sources anchor the band ($20 to $25 a month at Base44 Starter, Lovable Pro, Bolt Pro, Replit Core; zero at Dyad); the owner picks the point and whether the model bill is theirs or the customer's.

## 6. Sources

All retrieved 2026-09-26 as search snippets; none fetched in full. The seven URLs the brief named are listed first; all were blocked.

- https://www.jetadmin.io/blog/base44-pricing-2026-guide-to-plans-credits-and-real-total-cost/ (blocked; snippet via https://www.jetadmin.io/blog/untitled-41/)
- https://www.nocode.mba/articles/base44-pricing (blocked)
- https://www.morphllm.com/base44-review (blocked)
- https://www.zite.com/blog/base44-review (blocked)
- https://www.producthunt.com/products/base44/reviews (blocked)
- https://altar.io/lovable-vs-bolt-vs-v0-vs-replit-vs-base44/ (blocked, no snippet obtained)
- https://www.banani.co/blog/base44-vs-lovable-comparison (blocked, no snippet obtained)
- https://www.trustpilot.com/review/base44.com and ?page=5 (blocked; via https://preuve.ai/blog/base44-review and https://www.fuzen.io/posts/base44-review-2026-pricing-is-it-legit-and-is-it-free)
- https://techcrunch.com/2025/06/18/6-month-old-solo-owned-vibe-coder-base44-sells-to-wix-for-80m-cash/
- https://www.wix.com/press-room/home/post/wix-further-expands-into-vibe-coding-with-acquisition-of-base44-a-hyper-growth-startup-that-simplif
- https://www.calcalistech.com/ctechnews/article/n4je37x0k ; /bkqq0pry11e ; /sy194qsg11g ; /syw900pvdzg ; /5gj9agi67 ; /bjf0qgx7mg
- https://getlatka.com/blog/base44-revenue-acquired-wix
- https://docs.base44.com/Account-and-billing/Credits
- https://docs.base44.com/developers/app-code/local-development/github
- https://docs.base44.com/Integrations/built-in-integrations
- https://www.certifiedcode.us/resources/article/what-are-integration-credits-in-base44-and-how-do-they-work
- https://codeconductor.ai/blog/base44-integrations/
- https://noloco.io/blog/base44-platform-features
- https://newly.app/base44-for-mobile-apps ; https://www.webtonative.com/blog/convert-base44-web-app-to-native-app
- https://perpet.io/blog/base44-export-code/ ; https://axonbuild.com/blog/base44-export-code ; https://bringforth.ai/blog/the-honest-teardown-title-we-tested-every-base44-export-path-here-s-what-you-act
- https://escapebase44.com/base44-export-code ; /base44-production-ready ; /cancel-base44-subscription
- https://www.base44devs.com/blog/base44-after-wix-acquisition-changes
- https://medium.com/@jacobp96/should-you-migrate-off-base44-ecc38cf0f949
- https://community.designtaxi.com/topic/23012-is-base44-down-february-3-2026/ ; /topic/36199-is-base44-down-august-20-2026/
- https://statusgator.com/services/base44 ; https://status.base44.com/
- https://www.wiz.io/blog/critical-vulnerability-base44 ; https://thehackernews.com/2025/07/wiz-uncovers-critical-access-bypass.html
- https://www.imperva.com/blog/critical-flaws-in-base44-exposed-sensitive-data-and-allowed-account-takeovers/
- https://shipper.now/base44-errors/ ; https://feedback.base44.com/p/get-your-credits-back-when-reverting-a-message ; https://feedback.base44.com/p/refund
- https://recurdash.com/guides/how-to-cancel-base44 ; https://base44.com/terms-of-service
- https://hackceleration.com/labs/review/base44 ; https://www.g2.com/products/base44/reviews
- https://www.aol.com/news/tried-3-biggest-vibe-coding-040101435.html ; https://medium.com/predict/best-vibe-coding-tools-in-2026-for-people-whove-never-written-a-line-of-code-8ce9d18443bf
- https://www.fiverr.com/micheladavies/fix-vibe-coding-errors-lovable-dev-base44-webapp ; https://www.upwork.com/services/product/development-it-vibe-coding-lovable-dev-bolt-new-base44-and-replit-ai-app-bugs-1978068229056061377
- https://flowith.io/blog/lovable-pricing-2026-free-vs-starter-vs-pro/ ; https://buttondown.com/deaihobbist/archive/lovable-pricing-2026-cost-of-plans-credits-read/
- https://www.superblocks.com/blog/replit-pricing ; https://replit.com/blog/pro-plan
- https://www.dyad.sh/ ; https://github.com/dyad-sh/dyad
- https://base44.com/enterprise ; https://www.lowcode.agency/blog/base44-pricing
- https://www.certifiedcode.us/resources/article/what-is-base44-app-builder-and-how-does-it-work-with-wix
