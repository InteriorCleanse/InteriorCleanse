# Unit economics, Wedge A: "your repo, your database, your key"

Written 2026-09-26 for the wedge recommended in STRATEGY.md. The owner has
stated no numbers. Every input below is one of two kinds:

- **Published**: a vendor list price, with the URL and the date it was read.
  The container's proxy blocks page fetches, so every figure was read from a
  search-engine snippet of the page named, retrieved 2026-09-26. A snippet is
  not the page; confirm each one before quoting it to a customer.
- **Illustration**: a number chosen to make the arithmetic visible. It is not
  a fact and the owner must replace it.

Model cost is the customer's under BYOK, so it appears in Section 2 (what the
customer pays), never in Section 1 (what we pay).

## 1. Cost to serve, per month

| Row | Amount | Kind | Source or note |
| --- | --- | --- | --- |
| Product hosting, Vercel Pro | $20 per seat, includes $20 usage credit; Hobby is free but not for commercial use | Published | vercel.com/docs/plans/hobby and costbench.com/software/developer-tools/vercel, snippets 2026-09-26 |
| Product database, Neon | Free: 100 CU-hours, 0.5 GB, $0. Launch: $0.106 per CU-hour, $0.35 per GB-month, no monthly minimum | Published | neon.com/pricing and neon.com/docs/introduction/plans, snippets 2026-09-26 |
| Product database, Supabase (alternative) | Free: $0, 500 MB, 50k MAU, pauses after 7 idle days. Pro: $25 per project | Published | nocode.mba/articles/supabase-pricing and uibakery.io/blog/supabase-pricing, snippets 2026-09-26 |
| GitHub API | $0 | Published | Standard REST API is free with a token; rate limits apply |
| Stripe, US domestic card | 2.9% + $0.30 per successful charge; no monthly fee; no fee on failed payments | Published | checkoutpage.com/blog/stripe-processing-fees and nerdwallet.com/business/software/learn/stripe-fees, snippets 2026-09-26 |
| Email, Brevo Free | $0, 300 emails per day, Brevo branding on sends | Published | brevo.com/pricing via emailtooltester.com and fastlancer.org snippets, 2026-09-26 |
| Support time | 20 minutes per paying customer per month | Illustration | Owner's hours, not cash. Not priced here; it is what the salary line in Section 3 pays for |

Fixed cash floor, before any customer: Vercel Pro $20 + Neon Free $0 + Brevo
$0 + GitHub $0 = **$20 a month** (published rates, one stack choice). The only
cash cost that scales per customer is the Stripe fee on our own subscription.
The cost that actually scales is support hours; see the capacity check in
Section 3.

## 2. What the customer pays elsewhere because of BYOK

This is the honesty test for the landing page. The customer's total is our
fee plus three bills we never see.

### Anthropic API list prices (published)

Per million tokens, input / output. Read from benchlm.ai/anthropic/api-pricing
and cloudzero.com/blog/claude-pricing snippets, 2026-09-26, which cite the
official page at platform.claude.com (not fetched). Cache reads bill at 10% of
input; Batch halves everything (same snippets).

| Model | Input | Output |
| --- | --- | --- |
| Claude Opus 5 | $5 | $25 |
| Claude Sonnet 5 | $2 | $10 |
| Claude Haiku 4.5 | $1 | $5 |
| Claude Sonnet 4.6 | $3 | $15 |
| Claude Fable 5.1 | $10 | $50 |

### One app build, three sizes (illustration)

Token counts are invented to show the shape. In agentic generation the
context is re-sent every turn, so input dominates. No cache savings assumed;
with cache hits the input line could fall substantially.

| Size | Input tokens | Output tokens | Sonnet 5 | Opus 5 |
| --- | --- | --- | --- | --- |
| Small (5 pages, one table, auth) | 1.5M | 0.15M | 1.5 x 2 + 0.15 x 10 = 3.00 + 1.50 = **$4.50** | 1.5 x 5 + 0.15 x 25 = 7.50 + 3.75 = **$11.25** |
| Medium (12 pages, 5 tables, roles, payments stub) | 6M | 0.5M | 12.00 + 5.00 = **$17.00** | 30.00 + 12.50 = **$42.50** |
| Large (30 pages, 15 tables, admin, imports) | 20M | 1.5M | 40.00 + 15.00 = **$55.00** | 100.00 + 37.50 = **$137.50** |

The owner must replace these with measured `usage` totals from real builds
before any of them appears in copy. A runaway loop on the large case could
exceed the flat fee several times over, which is exactly why the spend cap
from STRATEGY.md Section 3 is not optional.

### Hosting the customer's own app (published)

| Service | Free | Paid |
| --- | --- | --- |
| Vercel | Hobby $0, personal projects only | Pro $20 per seat, $20 usage credit included |
| Neon | Free, 100 CU-hours, 0.5 GB | Launch, usage only, $0.106 per CU-hour, $0.35 per GB-month, no minimum |

Sources as in Section 1. So a customer running a small commercial app pays
roughly $20 (Vercel Pro) plus a few dollars of Neon plus their model bill,
on top of our fee. The landing page should state all four lines.

## 3. Price points to test

Anchors already cited in STRATEGY.md: Base44 Starter $20 ($16 annual), Lovable
Pro $25, Bolt Pro $25, Replit Core $20, Dyad $0 for BYOK. Three candidates:
$15 (under every hosted builder), $25 (parity with Lovable and Bolt), $39
(above the band, justified only if the Base44 import path works).

Contribution per customer = fee minus Stripe (2.9% + $0.30):

| Fee | Stripe fee | Contribution |
| --- | --- | --- |
| $15 | 0.435 + 0.30 = $0.735 | $14.27 |
| $25 | 0.725 + 0.30 = $1.025 | $23.98 |
| $39 | 1.131 + 0.30 = $1.431 | $37.57 |

Paying customers needed = (fixed $20 + owner salary) / contribution, rounded
up. Salary figures are illustrations.

| Fee | Salary $0 | Salary $2,000 | Salary $5,000 |
| --- | --- | --- | --- |
| $15 | 20 / 14.27 = 1.4, so **2** | 2,020 / 14.27 = 141.6, so **142** | 5,020 / 14.27 = 351.9, so **352** |
| $25 | 20 / 23.98 = 0.8, so **1** | 2,020 / 23.98 = 84.2, so **85** | 5,020 / 23.98 = 209.4, so **210** |
| $39 | 20 / 37.57 = 0.5, so **1** | 2,020 / 37.57 = 53.8, so **54** | 5,020 / 37.57 = 133.6, so **134** |

Capacity check (illustration): at 20 minutes of support per customer per
month, 352 customers is 117 hours a month and 134 customers is 45 hours. The
"a human answers" promise in STRATEGY.md holds at $39 and breaks at $15
before the $5,000 salary is reached. Price and the support promise are one
decision, not two.

Sensitivity: the conclusion does not move with Stripe or hosting inputs; it
moves entirely with support minutes per customer and churn, neither of which
is known. If support runs at 60 minutes, halve every customer count above as
the practical ceiling.

## 4. Free tier plus one paid tier versus paid-only

Under BYOK a free user costs us no model spend, which is the structural
reason a free tier is even thinkable here. It still costs database rows,
email, and support.

| Assumption | Value | Kind |
| --- | --- | --- |
| Paid fee | $25, contribution $23.98 | From Section 3 |
| Fixed cash | $20 | Published stack, Section 1 |
| Free-to-paid conversion | 3% | Illustration |
| Cash cost per free user per month | $0.10 (Neon usage past Free, email overage) | Illustration |
| Support on free users | none; free tier gets docs only | Owner's decision, not modelled |

With free tier: each paying customer needs 1 / 0.03 = 33.3 free users, costing
33.3 x $0.10 = $3.33, so net contribution is 23.98 - 3.33 = $20.65.

| Salary | Paid-only | Free + paid |
| --- | --- | --- |
| $0 | 20 / 23.98, so **1** | 20 / 20.65, so **1** |
| $2,000 | 2,020 / 23.98, so **85** | 2,020 / 20.65, so **98** |
| $5,000 | 5,020 / 23.98, so **210** | 5,020 / 20.65, so **244** |

At 98 paying customers the free tier holds about 3,270 registered users, past
Neon Free's 0.5 GB and near Brevo's 300 emails a day on sign-up bursts, so
both move to paid usage; that is what the $0.10 stands in for. Paid-only
needs fewer customers but needs a way to be tried; a trial with the refund
sentence from STRATEGY.md Section 3 is the cheaper experiment to run first.

## 5. Five numbers to record weekly

1. Paying subscriptions at week end, and how many started and cancelled.
2. Support hours spent, total and per paying customer.
3. Builds completed and builds failed, so the "never charged for our
   errors" promise has a denominator.
4. Median model spend per build reported by customers (from their usage
   totals), so the landing page's cost claim stays true.
5. Cash cost of the stack that week: Vercel, Neon, Brevo, Stripe fees.

## 6. Sources

All read as search snippets on 2026-09-26; no page was fetched.

- https://benchlm.ai/anthropic/api-pricing ; https://www.cloudzero.com/blog/claude-pricing/ ; https://www.finout.io/blog/anthropic-api-pricing (Anthropic list prices; official page platform.claude.com not fetched)
- https://vercel.com/docs/plans/hobby ; https://costbench.com/software/developer-tools/vercel/ ; https://schematichq.com/blog/vercel-pricing
- https://neon.com/pricing ; https://neon.com/docs/introduction/plans ; https://comparedge.com/tools/neon-db/pricing
- https://www.nocode.mba/articles/supabase-pricing ; https://uibakery.io/blog/supabase-pricing
- https://checkoutpage.com/blog/stripe-processing-fees ; https://www.nerdwallet.com/business/software/learn/stripe-fees
- https://www.brevo.com/pricing/ ; https://www.emailtooltester.com/en/reviews/brevo/pricing/ ; https://www.fastlancer.org/en/fastlancer-blog/brevo-review/
- Competitor prices: STRATEGY.md Section 6 in this folder.
