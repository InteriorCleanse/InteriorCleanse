# Picked operations: the cheapest automated store

**The short version.** Run everything on Shopify Basic at $39 a month, and
use the free tools around it. Pack orders yourself with Pirate Ship until
about 300 orders a month. Then move to a supplement-ready fulfillment
warehouse (3PL). Software only gets more expensive once revenue pays for it.

Prices are as reported in October 2026 by third-party sources (vendor pages
were blocked from the research environment). Check each one on the vendor's
own page before paying. Sources are listed at the end.

## The stack

| Job | Launch (0 to 300 orders a month) | Monthly | At about 500 orders a month | Monthly |
| --- | --- | --- | --- | --- |
| Store, checkout, payments | Shopify Basic with Shopify Payments | $39 ($29 billed yearly) | Same. Grow only pays off above about $33k a month in card sales | $39 |
| Sales tax | Shopify Tax | Free to $100k lifetime US sales | Then 0.35% per order, capped at $0.99 | varies |
| Subscriptions | Shopify Subscriptions | Free | Loop (free to 50 subscribers, then $99 + 1%) once you need failed-payment retries | $99 + 1% |
| Email | Klaviyo free (250 profiles) | Free | Klaviyo, 5,000 profiles | $100 |
| Text messages | Klaviyo SMS credits, opt-in only | from $15 | Postscript, if text becomes a real channel | from $49 |
| Reviews | Judge.me free | Free | Same | Free |
| Customer service | Shopify Inbox | Free | Gorgias Starter, once email volume grows | $10 |
| Automation | Shopify Flow | Free | Same | Free |
| Shipping labels | Pirate Ship | Free | The 3PL's system | Included |
| Accounting | Wave Starter | Free | QuickBooks Simple Start + A2X | $38 + $29 |
| **Software total** | | **$39** | | **about $216 to $315** |

Card fees are 2.9% + 30¢ per order on Basic, about $1.90 on a $54.99 order.
Never switch off Shopify Payments, or Shopify adds a 2.6% fee on top.

## What runs by itself

Build these on day one. Every one is free on Shopify Basic.

1. **Order placed:** Shopify takes payment and calculates tax. Klaviyo sends
   the order confirmation in the brand voice. Shopify Flow tags first orders
   and subscription orders.
2. **Label bought:** Pirate Ship imports the order. You click buy, it marks
   the order fulfilled in Shopify, and the customer gets tracking by email.
3. **Delivered:** Klaviyo's post-purchase flow starts: how to mix (day 1),
   "how's the first pouch?" (day 7), and a Judge.me review request (day 10).
4. **Day 25:** a replenishment email with a one-click subscribe link, for
   customers who bought once.
5. **Subscription renewal:** a reminder email before each charge (required
   by state auto-renewal laws), then automatic charge and a new order.
6. **Failed payment:** a retry, then an email with a card-update link.
   Shopify Subscriptions has no retry settings, which is the main reason to
   move to Loop later.
7. **Low stock:** Flow's free template emails you when any variant drops
   below a set number. Set it at 6 weeks of sales plus the manufacturer's
   lead time.
8. **Wholesale order (Faire):** the Faire channel drops orders into Shopify,
   where they ship like any other order.
9. **Fraud:** Flow holds orders that Shopify rates as high risk, so you can
   review them before shipping.

The only daily manual step at launch is buying labels and packing. That
step is what the 3PL removes.

## Fulfillment

### Stage 1: pack it yourself (0 to about 300 orders a month)

- **Where:** a clean, dry, cool space you control, off the floor, away from
  sunlight and pets. A supplement brand that stores its own stock must follow
  FDA's holding rules (21 CFR 111): proper storage, written procedures, and
  distribution records. Keep a one-page storage procedure and a log.
- **Lot tracking:** a shared sheet listing each lot, its best-by date, the
  quantity received, and the orders it went to. Always ship the oldest lot
  first. A recall depends on this sheet.
- **Mailer:** a 9×12 inch poly mailer. USPS prices soft mailers by size
  ("cubic"), and 9×12 falls in the cheapest tier, below the 2 lb weight rate.
  Pirate Ship picks the cheaper of the two automatically. Test-fit a real
  pouch before ordering mailers.
- **Cost per order:** postage about $8 to $13 at the 2 lb weight rate (less
  if cubic applies), mailer about $0.18 to $0.28, and your time.
- **Supplies:** Uline 10×13 poly mailers cost $0.18 to $0.28 each. Branded
  noissue poly mailers cost about $0.99 each with a minimum of 250. Start
  with plain mailers and a branded sticker.

### Stage 2: a fulfillment warehouse (from about 300 orders a month)

| Option | Minimum | What it costs | Why |
| --- | --- | --- | --- |
| **ShipMonk** (first choice) | $250 a month | Free receiving, about $2.50 first pick, $0.50 each extra item, $25 a pallet | Says its supplement sites are FDA-registered and meet 21 CFR 111. Lot and expiry tracking |
| Red Stag | About 200 orders a month | $1.80 to $2.25 first pick | FDA-registered, lot tracking standard, lowest pick fees found |
| Amazon Multi-Channel Fulfillment | None | $10.64 for a 1-unit order, shipping included | Worth it once you're on Amazon anyway. Unbranded box |

Before signing: get written confirmation of FDA registration, lot and expiry
handling (oldest first), and the shipping markup on their rates. Ask for a
quote at 300 and 1,000 orders.

## Selling beyond the store

| Channel | When | How it runs |
| --- | --- | --- |
| Faire | From launch | Shopify channel. 0% commission on stores you bring with your Faire Direct link, 15% plus $10 on stores Faire finds |
| Amazon | Month 3 to 4 | Needs a pending trademark, GS1 barcodes, and Amazon's 2026 third-party supplement verification. Professional plan $39.99 a month, referral 8% up to $10 and 15% above. Fulfillment by Amazon (FBA) stock can also fill Shopify orders through Multi-Channel Fulfillment |
| TikTok Shop | After an organic audience exists | Supplements are invite-only. Fulfilled by TikTok from $3.58 per unit, referral fee 6% in Health and Wellness, creator affiliate commissions 15 to 25% |

## Money and tax

- **Bank:** a separate business account and card from day one. Shopify
  payouts go there.
- **Sales tax:** register for a sales tax permit in your home state before
  the first sale. Shopify Tax calculates the rate and shows when you are
  close to another state's economic threshold (often $100k in sales). Register
  in that state before you cross it. See `LEGAL.md` for which products are
  taxable.
- **Books:** Wave (free) until about 200 orders a month, then QuickBooks plus
  A2X, which turns each Shopify payout into clean entries. A bookkeeper costs
  about $200 to $600 a month when you'd rather not do it.
- **Weekly numbers:** the five in `LAUNCH_GUIDE.md`, plus cash on hand and
  units of stock left.

## Shopify setup checklist

- [ ] Shopify Basic. Store name Picked. Domain pickedprotein.com.
- [ ] Shopify Payments on. Payouts to the business account.
- [ ] Shopify Tax on. Register your home-state permit and enter it.
- [ ] Shipping: one US zone, free over $[50], flat rate under it. Pirate Ship
      connected.
- [ ] Policies: paste the drafts from `legal/` after lawyer review: terms,
      privacy, shipping and returns, subscription terms. Link them in the
      footer and at checkout.
- [ ] Checkout: age confirmation if any product requires it (see `LEGAL.md`).
      Marketing consent checkbox unchecked by default. Text consent with the
      required wording.
- [ ] Theme: a free Shopify theme in the brand colors and fonts, with the
      pages from `site/` rebuilt as sections, or the static site kept as the
      home page with "Shop" pointing to Shopify.
- [ ] Apps: Shopify Subscriptions, Klaviyo, Judge.me, Faire, Shopify Flow,
      Shopify Inbox, Pirate Ship.
- [ ] Flows: the nine automations above.
- [ ] One test order with a real card, refunded, before announcing.

**Create products only when they're real.** Add each product to Shopify once
its final label, photos of the real pack, barcode, weight, and lot-tracking
setup exist. Until then, the waitlist is the store.

## Sources

Shopify plans and card rates: [2hatslogic](https://www.2hatslogic.com/blog/shopify-pricing/),
[shopexperts](https://shopexperts.com/help/pricing/shopify-plans-pricing).
Shopify Flow on Basic: [Shopify changelog](https://changelog.shopify.com/posts/shopify-flow-now-available-to-basic-plan).
Shopify Tax: [Numeral](https://www.numeral.com/blog/does-shopify-collect-and-remit-sales-tax).
Subscription apps: [Joy](https://www.joysubscription.com/blog/best-shopify-subscription-apps),
[Loop](https://www.loopwork.co/blog/best-shopify-subscription-apps).
3PL switch point: [Selery](https://www.seleryfulfillment.com/when-to-switch-to-3pl-revenue-order-volume-benchmarks/).
Pirate Ship and cubic pricing: [Pirate Ship](https://www.pirateship.com/usps/ground-advantage-cubic).
USPS 2026 commercial rates: [usps.com rate file](https://www.usps.com/business/prices/2026/s-ground-advantage-com.csv).
Holding rules for supplements: [FDA small entity guide](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/small-entity-compliance-guide-current-good-manufacturing-practice-manufacturing-packaging-labeling).
ShipMonk: [ShipMonk supplements](https://www.shipmonk.com/supplement-fulfillment-services).
Red Stag: [eCommerceCEO](https://www.ecommerceceo.com/reviews/red-stag-fulfillment/).
Amazon MCF: [Easyship](https://www.easyship.com/blog/amazon-multi-channel-fulfillment).
Mailers: [Uline](https://www.uline.com/Product/Detail/S-21880BL/Poly-Mailers/Poly-Mailers-10-x-13-Black),
[noissue](https://noissue.co/shop/mailers/poly-mailers/custom-poly-mailers/).
Klaviyo: [Email Tool Tester](https://www.emailtooltester.com/en/reviews/klaviyo/pricing/).
Low-stock Flow template and Stocky shutdown: [MESA](https://www.getmesa.com/blog/shopify-flow-templates),
[Sensible](https://sensible.tools/blog/stocky-deprecated-shopify-inventory-forecasting-alternatives).
Accounting: [NerdWallet](https://www.nerdwallet.com/business/software/learn/quickbooks-pricing),
[ERP Research](https://www.erpresearch.com/pricing/wave-accounting), [G2 A2X](https://www.g2.com/products/a2x/pricing).
Amazon fees: [Feedvisor](https://feedvisor.com/university/referral-fee/).
TikTok Shop fees: [Podbase](https://www.podbase.com/blogs/tiktok-shop-fees).
Faire fees: [Craftybase](https://craftybase.com/blog/how-much-does-faire-charge).
