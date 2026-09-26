# Automated and selling by tonight — the plan

Written 2026-09-26 against `main` at `7ead07a`. This covers what can
honestly be finished today, who does each step, and what happens after.

## What "automated" means here

The code already runs the whole path: order → Stripe → Printful → email.
It isn't switched on yet. Four facts in the repo explain why:

| Fact (verified in `content/catalog.json` and the code) | Effect today |
| --- | --- |
| The 5 published products use Stripe **test-mode** Price IDs | No real money can move |
| All 5 have `fulfillment: manual` and `printfulVariantId: null` | A paid order stops at Stripe and nobody is notified to make or ship it |
| Every affiliate link is `PENDING_APPROVAL` | `/partners` earns nothing |
| The books and downloads have no Price ID (`needs-assets`) | These have the best margins, and none of them can be bought |

The webhook (`app/api/webhook/route.ts`) already sends orders to Printful and
Brevo once the keys and variant IDs exist. So nearly every step below is
account setup that only the owner can do. There's very little code to write.

**Profit today is possible but not guaranteed.** Once these steps are done, any
visitor can buy and the order fulfils itself. Whether someone does buy today
depends on traffic, and traffic is Step 5.

## Today, in order (about 3–4 hours, mostly you)

### 1. Admin can save — 10 min, you
`GITHUB_TOKEN` in Vercel → redeploy → the `/admin/products` banner reads
"Edits commit to …@main". (Full steps: `docs/FINISH_PLAN.md` Step 1.)

### 2. Printful: hands-off fulfilment for tote, mug, hoodie, print — 60–90 min, you
- Create the four products in Printful from the ready files in `print-files/`
  (FINISH_PLAN Step 2a has the product type for each).
- Set `PRINTFUL_API_KEY` and `PRINTFUL_STORE_ID` in Vercel and redeploy.
- `/admin/products` → **Sync from Printful**. Each record should then show
  `fulfillment: printful` and a variant ID.
- **Candle:** Printful doesn't make candles. Either you ship candles by hand
  (orders appear in Stripe and in the admin Orders tab) or you **unpublish
  the candle** until you have a fulfiller. It can't be hands-off today.
- **Art print:** its design is still a proposal. Approve it or unpublish it.

### 3. Sell the downloads you already own — 30 min, you
The downloads (`room-reset-checklist`, `the-considered-pantry`,
`the-calm-room-workbook`) and the five books cost nothing per sale and deliver
instantly, so they are the fastest way to be fully automated. For each one
that has a **real finished file**: attach the file or Gumroad link, set the
price, click **Create Stripe Price**, then Publish. Skip any that aren't
written yet. Don't publish an empty product.

### 4. Go live with money — 30 min, you
FINISH_PLAN Step 6, exactly:
1. Paste the live `sk_live_…` / `pk_live_…` into **Vercel only**, never into this repo.
2. Create live Price IDs (admin **Create Stripe Price** on each product).
3. Add the Stripe webhook at `https://interiorcleanse.com/api/webhook/`
   **with the trailing slash**. Without it every event fails silently.
   Put the signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Enable Stripe Tax, or turn off `automatic_tax`.
5. Redeploy. Buy the cheapest item with a real card, confirm a Printful
   order appears, then refund.

The first real sale can only happen after this step.

### 5. Traffic — the rest of the day, you + me
A live store with no visitors earns nothing. Ranked by what's likely to pay
back today:
1. **Your own list and network.** One launch email through Brevo and a
   personal post. Copy is drafted in `docs/LAUNCH_WEEK.md` Day 5.
2. **Short-form video.** The room films in `public/video/` are ready to cut
   into 9:16 clips for TikTok, Reels, and Pinterest. I can script and
   generate these.
3. **Paid ads: hold off.** Only after one test purchase proves the funnel
   works, and then with a small daily cap ($10–20). Paid traffic sent to an
   unproven checkout wastes money.

## What then runs by itself

| Event | Handled by | You do |
| --- | --- | --- |
| Merch order | Stripe → webhook → Printful prints and ships | Nothing |
| Download or book order | Stripe → delivery link | Nothing |
| New buyer or subscriber | Brevo contact and email (if `BREVO_API_KEY` set) | Nothing |
| Candle order | Stripe + admin Orders tab | Pack and post |
| Refunds and disputes | Stripe | Answer them. No store can fully automate this |

## Not part of this plan, on purpose

- **Mr. Cash (`trading-bot/`) stays on paper.** It's a prediction and
  trading simulator. Pointing it at real money to hit a same-day profit
  target is the easiest way in this repo to *lose* money.
  Its own gate, `trading-bot/docs/LIVE_READINESS.md`, has not been met.
- **No invented products** to make the shop look fuller, and **no invented
  commission rates** for Plunge or Castlery (CLAUDE.md).
- **No edits to Stripe, cart, or viewer code.** None are needed.

## After today

- Week 1: affiliate outreach (FINISH_PLAN Step 5), one clip per day, fill
  the drafts that correspond to real products.
- Measure: Vercel analytics pageviews → checkout starts → paid orders. The
  first number to improve is whichever of those drops off hardest.
