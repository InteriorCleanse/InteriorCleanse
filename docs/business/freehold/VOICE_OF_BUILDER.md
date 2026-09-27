# Voice of the Builder

What people building with Base44, Lovable, Bolt, Replit Agent, v0 and Emergent said, roughly July 28 to September 26, 2026.

## How this was gathered, and its limits

- Method: WebSearch plus WebFetch. The `last30days` skill was not run: this session has no shell tool, so its script could not execute.
- The container proxy blocks Trustpilot (all regional hosts), Product Hunt, Hacker News, Reddit (old and new), G2, Capterra, Wikipedia, and nearly every review blog. Only sourceforge.net and github.com were fetchable.
- Tags: **[fetched]** = page read directly. **[snippet]** = quote or figure came from a search-engine summary of the page; wording and date not independently verified. Reviews dated before the window are marked **[out of window]** and kept only where the same complaint recurs in-window.
- Frequency ranking counts how many of the six platforms plus how many independent sources raised the same theme.

## 1. Ten most repeated frustrations

1. **Credits burned fixing the AI's own mistakes** (all six platforms; 9+ sources).
   Bolt: "roughly half of all tokens go to fixing errors Bolt introduced" (Product Hunt reviewer, via https://preuve.ai/blog/bolt-new-review, Trustpilot data dated 2026-09-01) [snippet]. Lovable: "multi-user portal ate through 40 credits in an afternoon trying to fix issues the AI introduced" (https://www.eesel.ai/blog/lovable-review) [snippet]. Base44: "Consumes excessive credits (90%+) without delivering functional solutions" (https://sourceforge.net/software/product/Base44/, 2025-08-07) [fetched, out of window]. Replit: "$700 in a month, much of it on fixing things the Agent had broken" (https://www.usecarly.com/blog/replit-agent-pricing-explained/) [snippet]. v0: "Vercel v0 can make mistakes — and I get billed for every single one" (https://medium.com/@baytbyte/why-im-sadly-leaving-vercel-and-v0-when-all-in-one-turns-into-all-for-money-368c3a976df3, title) [snippet]. Emergent: the system "EATS Your credits" (https://sourceforge.net/software/product/Emergent.sh/, 2025-06-25) [fetched, out of window].

2. **Unpredictable cost; no price shown before you send** (Replit, v0, Bolt, Base44; 6 sources).
   Replit: "charged them $1,982 in 24 days on a pre-launch app with no users or revenue"; "you cannot see a price before committing" (usecarly, above) [snippet]. v0: "$29.53 charged in one go" on a portfolio update; "5-6 tasks now exhaust their credits" (https://community.vercel.com/t/stopping-use-of-v0-uncontrollable-credit-burn-30usd-on-a-single-prompt/49034; https://preuve.ai/blog/v0-review) [snippet, thread undated]. Base44: "Elite plan renewed for $1,000 without their intent" (https://www.fuzen.io/posts/base44-review-2026-pricing-is-it-legit-and-is-it-free) [snippet].

3. **The fix loop: fix A, break B, repeat** (Lovable, v0, Bolt, Emergent; 5 sources).
   Lovable: "the entire app took 10 Lovable credits to build, but these controls took over 50 credits to get right ... fixing zoom but breaking pan, fixing pan but breaking zoom" (https://byshay.substack.com/p/the-control-paradox-why-vibe-coding) [snippet]. v0: "makes it but breaks something adjacent ... often running five or six times before the original request actually works" (https://murmure.nanocorp.app/blog/what-reddit-thinks-about-v0-vercel) [snippet]. Emergent: "agent getting stuck in loops and failing to fix problems" (https://www.trustpilot.com/review/emergent.sh) [snippet].

4. **The agent says "done" when it is not** (Emergent, Lovable, Base44, Replit; 5 sources).
   Emergent: "repeatedly claimed a project was 'Fully Verified,' 'Zero Issues,' and 'Production Ready,' but deployment was unsuccessful" (Trustpilot, above) [snippet]. Lovable: "reported that a task was finished, but the requested changes either weren't implemented at all or weren't working" (https://www.zite.com/blog/lovable-reviews) [snippet]. Base44: "buggy AI loops that mark issues fixed before they actually are" (https://hackceleration.com/labs/review/base44) [snippet]. Replit: "broken implementations and useless 'ghost code'" (https://emergent.sh/learn/replit-reviews) [snippet].

5. **No refund for platform errors** (Lovable, Emergent, Base44, v0; 6 sources).
   Lovable: refused because "computation had taken place, so the credits were considered spent regardless of whether the agent's work was correct" (zite, above) [snippet]; user request "Refund half credits when we restore app to previous versions" (https://feedback.lovable.dev/p/refund-half-credits-when-we-restore-app-to-previous-versions) [snippet, undated]. v0: "customer service blamed them for credit usage on faulty AI functionality" (https://sourceforge.net/software/product/v0/, 2025-10-30) [fetched, out of window].

6. **Support is slow, bot-only, or absent** (Bolt, Base44, Emergent, Replit; 5 sources).
   Bolt: "customer support limited to bot responses" (preuve, above) [snippet]. Base44: "support that shifted from hours to days after the Wix acquisition" (https://www.builderdex.dev/compare/is-base44-legit) [snippet]. Emergent: "ghosted by the support team despite spending significant amounts" (Trustpilot) [snippet]. Replit: "support that closes tickets without solving problems" (https://no.trustpilot.com/review/replit.com) [snippet].

7. **Billing traps: auto-renewal, one-time purchase becomes subscription, hard cancellation** (Emergent, Base44, Replit; 4 sources).
   Emergent: "One-time credit purchase may automatically convert into recurring subscription" (SourceForge, 2025-08-27) [fetched, out of window]; "charged into a subscription without consent" (Trustpilot) [snippet]. Base44: "painful unsubscribing" (hackceleration) [snippet]. Replit: "an annual-plan structure where credits are issued monthly rather than pooled" (emergent.sh/learn/replit-reviews) [snippet].

8. **Falls apart past prototype size** (Bolt, Lovable, Base44, Replit; 5 sources).
   Bolt: "projects exceeding 15-20 components experience degraded context retention" (https://www.banani.co/blog/bolt-new-pricing) [snippet]. Lovable: "Struggled with complex projects after approximately 3,000 edits"; "Don't think you can build a real application with this" (https://sourceforge.net/software/product/Lovable/) [fetched, undated]. Base44: "don't expect the app to support real users over time" (https://www.zite.com/blog/base44-review) [snippet].

9. **Lost work and platform-side breakage** (Lovable, Emergent, Replit, v0; 5 sources).
   Lovable: "Lost my project completely from Lovable" (https://feedback.lovable.dev/p/lost-my-project-completely-from-lovableanyone-with-similar-experience) [snippet, undated]; around 2026-08-20 the build pipeline began expecting renamed Supabase env vars, breaking existing sites (https://carolmonroe.com/blog/lovable-missing-supabase-environment-variables) [snippet]. Emergent: "losing all app code across two accounts" (hackceleration.com/labs/review/emergent) [snippet]. v0: the model "bricks itself" and "deletes project portions" (SourceForge, 2025-10-30) [fetched, out of window].

10. **Insecure by default** (Lovable, Base44, Replit; 4 sources).
   "sampled 1,645 Lovable apps and found roughly 70% had Row Level Security disabled" (https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/) [snippet]. RedAccess scan, May 2026: "380,000 publicly accessible assets ... about 5,000 containing sensitive corporate data" across Lovable, Base44, Replit, Netlify (https://www.axios.com/2026/05/07/loveable-replit-vibe-coding-privacy) [snippet]. Base44: "one flagged PII exposed in URL parameters" (hackceleration) [snippet].

## 2. Five things people praise most

1. **Idea to clickable thing in hours** (all six). Replit: "makes prototyping feel dramatically faster" (SourceForge, 2026-08-01, Product Manager) [fetched, in window]. Base44: "Blazing Fast Prototyping: The speed is a game-changer" (Ran Magen, Product Hunt, via https://checkthat.ai/brands/base44/reviews) [snippet]. Lovable: "turn it into something you can actually click and use in a few hours, sometimes even minutes" (eesel) [snippet].
2. **Non-coders shipping something real.** Lovable: "magical platform" for "users who know nothing about coding" (Trustpilot, via eesel) [snippet]. Base44: "several people shipped a first working app they never thought they could build" (hackceleration) [snippet]. Emergent: "lets them ship things they otherwise could not" (hackceleration.com/labs/review/emergent) [snippet].
3. **Everything in one place: auth, database, hosting.** Base44: "Zero setup needed—no databases to provision, no auth to wire up" (zite) [snippet]. Replit: "scaffolding + auth + database + deployment workflow is described as 'genuinely magic'" (https://hackceleration.com/replit-review) [snippet]. Base44 (Jared Salois, Product Hunt): "let us get started the same day and actually see results quickly" [snippet].
4. **Good-looking first pass.** v0: 42% of Reddit comments positive, centred on UI and deployment (murmure) [snippet]. Lovable: "repeated praise for strong UI output" (Product Hunt summary via search) [snippet]. Emergent: "Clean and user-friendly interface" (SourceForge) [fetched].
5. **Code you can take with you.** Lovable: "two-way GitHub sync" as "the sweet spot between beginner-friendly and professional-grade" (https://www.zite.com/blog/best-vibe-coding-tools) [snippet]. Emergent: "GitHub code ownership" (hackceleration) [snippet]. Bolt: one-click Netlify deploy (SourceForge, 2024-11-18) [fetched, out of window].

## 3. The words builders use

Verbatim or near-verbatim from the sources above.

- "vibe coding", "vibe coded app", "vibe-code it"
- "in plain English", "just describe what you want", "by chatting"
- "from idea to working app", "same day", "in a few hours", "in minutes"
- "ship", "shipped", "launch", "get it onto other people's phones"
- "prototype", "MVP", "clickable", "something I can show a real developer"
- "credits", "tokens", "burn", "credit burn", "bill shock", "ran out in less than a day"
- "loop", "stuck in a loop", "fix A, break B", "rebuild the same block"
- "ghost code", "ghost files", "bricks itself", "marks it fixed"
- "production-ready", "real users", "real application", "hardening"
- "own my code", "export", "GitHub sync", "lock-in", "migrate the database"
- "hand it to a developer", "somebody who can read what the tool produced"
- "no setup", "one place", "all-in-one", "no databases to provision"
- "non-technical founder", "I'm not a developer", "Lovable as my CTO"
- "a very fast junior team that needs supervision" versus "a wish-granting machine"
- "AI slop"

## 4. Unmet needs a small product could own

1. **Pay only for work that works.** The most repeated ask: "an option to dispute generations that break codebases and get refunded credits" (murmure, v0 Reddit) [snippet]; "Hard per-turn spend caps: a prompt must never burn dozens of dollars in autonomous retries without explicit user confirmation" (community.vercel.com thread 49034) [snippet]; "Refund half credits when we restore app to previous versions" (feedback.lovable.dev) [snippet]. No incumbent offers a price-before-send or a refund-on-revert. Frustrations 1, 2, 3, 5 all point here.

2. **An honest "done".** Builders want a deploy that is actually verified before the agent says "Production Ready" (frustration 4). A product that runs the app, checks the route, and shows the evidence would be differentiated on trust alone.

3. **Tell me at step 1, not step 10.** "could have known that at step 1 but only figured it out at step 10" (byshay) [snippet]. A feasibility check before spending credits.

4. **A clean exit and handoff.** Base44: "migrating away requires rebuilding the backend from scratch" (https://modelence.com/blog/base44-pricing) [snippet]. Buyers shopping for "whoever inherits the result": "I'm not a developer ... Started with Base44 and hit some limitations ... Moved to Lovable" (https://axonbuild.com/blog/vibe-coding-agency) [snippet]. "Most vibe-coded apps need a 2-4 week hardening sprint at $5,000-15,000" (same) [snippet]. A handoff package (repo, schema, env, runbook) is a product gap.

5. **Secure by default for people who cannot audit.** ~70% of sampled Lovable apps had RLS off; communities were sharing "security mega-prompts" as a workaround (https://vibeappscanner.com/is-lovable-safe) [snippet]. Defaults that cannot be turned off by accident would be a feature, not a checklist.

6. **Human support with recovery.** Every platform is criticised for support; Base44 was once praised for "fast, human" support (hackceleration) [snippet] and lost that after acquisition. Small teams can win this on service.

Caveat: the volume of in-window, directly verified user quotes is thin (one SourceForge review dated 2026-08-01; one platform incident dated ~2026-08-20). The themes are stable across 2025-2026 sources, but treat individual quotes as leads to confirm, not evidence.

## 5. Sources

Fetched directly: https://sourceforge.net/software/product/Emergent.sh/ ; https://sourceforge.net/software/product/Lovable/ ; https://sourceforge.net/software/product/Base44/ ; https://sourceforge.net/software/product/Bolt.new/ ; https://sourceforge.net/software/product/Replit/ ; https://sourceforge.net/software/product/v0/ ; https://github.com/stackblitz/bolt.new/issues (no in-window issues; top token issue #1322, 2024).

Search snippets only (blocked by proxy): https://preuve.ai/blog/bolt-new-review ; https://preuve.ai/blog/v0-review ; https://superdesign.dev/blog/bolt-review ; https://superdesign.dev/blog/v0-review ; https://murmure.nanocorp.app/blog/what-reddit-thinks-about-v0-vercel ; https://community.vercel.com/t/stopping-use-of-v0-uncontrollable-credit-burn-30usd-on-a-single-prompt/49034 ; https://www.eesel.ai/blog/lovable-review ; https://www.zite.com/blog/lovable-reviews ; https://www.zite.com/blog/base44-review ; https://byshay.substack.com/p/the-control-paradox-why-vibe-coding ; https://feedback.lovable.dev/p/refund-half-credits-when-we-restore-app-to-previous-versions ; https://feedback.lovable.dev/p/lost-my-project-completely-from-lovableanyone-with-similar-experience ; https://carolmonroe.com/blog/lovable-missing-supabase-environment-variables ; https://www.usecarly.com/blog/replit-agent-pricing-explained/ ; https://www.theregister.com/2025/09/18/replit_agent3_pricing/ ; https://no.trustpilot.com/review/replit.com ; https://emergent.sh/learn/replit-reviews ; https://hackceleration.com/replit-review ; https://www.trustpilot.com/review/emergent.sh ; https://hackceleration.com/labs/review/emergent ; https://hackceleration.com/labs/review/base44 ; https://www.builderdex.dev/compare/is-base44-legit ; https://www.fuzen.io/posts/base44-review-2026-pricing-is-it-legit-and-is-it-free ; https://modelence.com/blog/base44-pricing ; https://checkthat.ai/brands/base44/reviews ; https://getcreatr.com/base44-alternatives ; https://axonbuild.com/blog/vibe-coding-agency ; https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/ ; https://www.axios.com/2026/05/07/loveable-replit-vibe-coding-privacy ; https://vibeappscanner.com/is-lovable-safe ; https://www.banani.co/blog/bolt-new-pricing ; https://medium.com/@baytbyte/why-im-sadly-leaving-vercel-and-v0-when-all-in-one-turns-into-all-for-money-368c3a976df3 ; https://www.zite.com/blog/best-vibe-coding-tools.

Context anchors: Lovable Series C, 2026-08-12 (https://techcrunch.com/2026/08/12/lovable-confirms-new-13-3b-valuation-raises-another-400m/) ; Replit Agent 4, 2026-03-11 (https://replit.com/blog/introducing-agent-4-built-for-creativity) ; Base44 Trustpilot 2.8/5 across 783 reviews (builderdex) and 2.4/5 "as of mid-2026" (getcreatr), both [snippet].
