# Launch week

Seven days, one owner, one site. Each day lists what you do, what is already
done for you, and the check that says the day is finished. Do the days in
order; days 1 and 2 unblock everything after them.

Where things stand on day 0:

- The site is built, deployed, measured (scroll at 16.7 ms frames, contrast
  passing on every route, zero axe violations on the eight main pages).
- Five products are published: candle, mug, tote, hoodie, art print. Their
  photographs are still stock. Their fulfilment is still `manual`.
- Eight more products are in the catalog with real names, copy, and covers,
  waiting only on links: the five books (Amazon) and three downloads (Gumroad).
- Print-ready files for the tote, mug, and hoodie are in `print-files/`. A
  design proposal for the art print is there too.
- No live Stripe keys, no Printful key, no approved affiliate links. All of
  those are yours to paste; none of them are handled by me.

Time budget: about 12 focused hours across the week, most of it on days 1–3.

---

## Day 1 (Mon) — Printful, and make the admin able to save

**You, 90 minutes**

1. Confirm the admin saves. Open `interiorcleanse.com/admin/products/`. The
   banner must say writes go to GitHub. If it does not, Vercel → Settings →
   Environment Variables → `GITHUB_TOKEN` (classic token, `repo` scope) →
   Redeploy. Nothing else this week works without this.
2. Printful → Stores → Add product, four times, using the files in
   `print-files/`:

   | Product | Printful item | File | Retail price |
   | --- | --- | --- | --- |
   | Tote | Eco Tote Bag, natural | `tote-front-3600x4200.png` | $28 |
   | Mug | White Glossy Mug 11 oz | `mug-wrap-2700x1050.png` | $26 |
   | Hoodie | Premium Eco Hoodie, charcoal, sizes S–XL | `hoodie-chest-1500.png` | $58 |
   | Art print | Enhanced Matte Paper Poster 18×24 | `considered-home-print-18x24.png` only if you approve the design | $42 |

   Printful shows its cost next to your retail price. If the margin on any
   item is under 35 percent, raise the price now rather than after launch.
3. Printful → Settings → Stores → API → create a token. Vercel →
   `PRINTFUL_API_KEY` and `PRINTFUL_STORE_ID` → Redeploy.
4. Admin → **Sync from Printful**. Each record picks up its variant ID and
   Printful's mockups. Open each, set the hero image to the mockup you like,
   Save.

**Done when:** the four merch records show `fulfillment: printful` and a
variant ID, and their hero images are Printful mockups, not stock.

**Candle:** stays `manual`. You ship it. Orders arrive in Stripe and the admin.

---

## Day 2 (Tue) — Photographs and links

**You, 2 hours**

1. Photograph the candle. Daylight, near a window, plain surface, three
   frames: straight on, three-quarter, lit at dusk. Phone is fine. Upload
   through the admin's image field on `ic-signature-candle`; the admin runs
   background removal for the pedestal view.
2. If you have physical stock of anything else (books on a shelf, a mug in
   hand), shoot it now. Real photographs outsell renders.
3. Amazon links. For each of the five books, open its Amazon page, copy the
   URL, paste it into `amazonUrl` in the admin, set the list price, and move
   the status to `approved`. If a book is not on Amazon yet, leave it.
4. Gumroad. Confirm the store handle (`interiorcleanse.gumroad.com` is what
   the site assumes; Vercel `NEXT_PUBLIC_GUMROAD_STORE` overrides it). For
   each download, click **Validate Gumroad** in the admin; a green result
   fills the URL. The checklist is free; that is allowed through the gate.

**Me, once photographs exist:** the product imagery pass (Higgsfield
Marketing Studio against your real photographs, not invented products),
delivered as gallery images on each record for your approval.

**Done when:** every book and download shows a real channel URL, and the
candle has a real photograph.

---

## Day 3 (Wed) — Money, in test mode, end to end

**You, 60 minutes**

1. Admin → each Stripe product → **Create Stripe Price** (test mode).
2. Buy the mug with Stripe's test card `4242 4242 4242 4242`. Check three
   places: Stripe → Payments (paid), Printful → Orders (a draft order),
   admin → Orders.
3. Buy the candle the same way. It should appear in Stripe and the admin
   only.
4. Send a test email through the guest book on the homepage. Confirm the
   contact lands in Brevo if `BREVO_API_KEY` is set; if it is not set, set it
   today or accept that launch emails are manual.

**Done when:** two test orders exist in the right systems and you have
refunded both in Stripe.

---

## Day 4 (Thu) — Affiliate calls

**You, 90 minutes, phone and email**

The scripts, the per-partner table, and the rules are in
`docs/FINISH_PLAN.md`, Step 5. In short:

| Partner | Ask | Known terms |
| --- | --- | --- |
| Sweaty Yeti | Join the program, get the link | Flat $1,500 per sauna |
| Sauna Kit Co | Join the program | $385–$550 per sale typical |
| Select Saunas | Join the program | 5 percent |
| Plunge | Ask for the rate in writing | Not public. Do not quote one |
| Castlery | Ask for the rate in writing | Not public. Do not quote one |

When a link arrives: admin → the partner record → `affiliateUrl` → replace
`PENDING_APPROVAL` → status `approved`. The partner page shows only approved
partners; everything else stays a placeholder.

**Done when:** every partner has been contacted once and the date is in
the record's notes.

---

## Day 5 (Fri) — Copy, email, and the announcement

**You, 60 minutes** to read and edit what follows; **me** for anything you
want changed.

**Welcome email** (goes to every guest-book signup; paste into Brevo as the
first automation step, subject line first):

> **Subject:** The next edit, quietly delivered
>
> You are on the list. Thank you.
>
> InteriorCleanse is a small storefront for a considered home: hand-poured
> candles, a few objects we actually use, books written by the founder, and
> the cleaning finds that earned their shelf space. Nothing sponsored is
> presented as anything else.
>
> This week we open the doors. Expect one email when we do, and after that
> one a month at most. When we have nothing worth saying, you will not hear
> from us.
>
> Until then, the room-reset checklist is free: [link to the download page].
>
> — InteriorCleanse

**Launch email** (send on day 7):

> **Subject:** We are open
>
> The shop is live at interiorcleanse.com.
>
> Five objects to start: the signature candle, hand-poured in small batches;
> a stoneware mug; a heavyweight canvas tote; a charcoal hoodie; and a print.
> Everything ships from us or from our print partner within the week.
>
> The library has five books and three downloads, one of them free.
>
> The prices are the prices; there is no launch discount to wait for.
>
> — InteriorCleanse

(Checkout does not take promotion codes today. If you want an opening
discount, say so and it is a one-line change to the checkout route; the
Stripe coupon itself you create in Stripe → Coupons.)

**Five social posts** (Instagram and TikTok captions; the visuals are your
photographs from day 2):

1. The candle, unlit, on a bare surface. *"Designed as an object first. It
   earns the shelf before it is lit."*
2. The tote on a hook by a door. *"Carry the edit. Heavyweight natural
   canvas, one mark, nothing else."*
3. A stack of the books. *"Five books for a home that works. Written for
   real rooms, not photographed ones."*
4. The checklist on a phone screen. *"The room reset we actually use. Free,
   one page per room. Link in bio."*
5. Launch day: the doorway of your own home, or the hero video still.
   *"We are open. interiorcleanse.com."*

Schedule them: posts 1–4 on days 5, 6, 7, 7 (morning); post 5 the moment the
switch flips.

**Done when:** the welcome email is live in Brevo and the five posts are
scheduled with your own images.

---

## Day 6 (Sat) — Go live with money

**You, one sitting, 45 minutes.** Do not split this across days.

1. Stripe → switch to live → Developers → API keys.
2. Vercel → `STRIPE_SECRET_KEY` = `sk_live_…`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_…`. Paste them there and
   nowhere else.
3. Admin → each Stripe product → **Create Stripe Price** again (this writes
   live Price IDs; the test ones are ignored).
4. Stripe → Webhooks → add endpoint `https://interiorcleanse.com/api/webhook/`
   **with the trailing slash**, event `checkout.session.completed`. Copy the
   signing secret into Vercel as `STRIPE_WEBHOOK_SECRET`.
5. Stripe Tax → enable, set your origin address.
6. Redeploy. Buy the mug with your own card. Confirm Stripe, Printful, and
   the admin all show it. Refund it.

**Done when:** a real card bought a real product and every system agreed.

---

## Day 7 (Sun) — Open

**You, 30 minutes in the morning, then watch.**

1. Admin → confirm every product you intend to sell is `published` and
   nothing with a stock photograph is. Anything not ready goes to
   `needs-assets`; the storefront hides it.
2. Post the launch caption. Send the launch email.
3. Watch Plausible (if `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set) and Stripe for
   the first hour. The first order is the one to fulfil by hand and
   personally; write the note that goes in the box.

**Done when:** the first order is packed.

---

## What is not in this week, on purpose

- The twelve remaining draft shells (merch 1–5, cleaning 1–5, downloads 4–5).
  They are empty because there is no real product behind them. They fill as
  you source products, in the admin, one at a time.
- Affiliate commission numbers for Plunge and Castlery. Only they can give
  those.
- Paid ads. Nothing here needs spend to launch. The paid-media personas in
  `.claude/agents/` are there when you want a plan.
- A launch discount. Launch pricing sets the anchor; add one deliberately, later, if ever.

## If something breaks

- Checkout fails: check the Vercel function logs for `/api/checkout/`. Nine
  times out of ten it is a missing or test-mode key.
- Webhook does not fire: the endpoint URL is missing its trailing slash.
- Printful order did not create: the product's `printfulVariantId` is empty.
  Re-run Sync.
- Admin will not save: `GITHUB_TOKEN` is missing or lacks `repo` scope.
