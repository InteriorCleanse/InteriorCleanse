# First-dollar plan

> **Update 2026-09-28.** The three printable downloads, including the free
> Room Reset Checklist, left this repository on `main` (#60) and now live in
> a separate project. Where this file says `assets/downloads/`, use that
> project's copy. The steps are otherwise unchanged.

Written 2026-09-26. One goal: the first real dollars, then a loop that
repeats every week without a plan being rewritten.

The blunt version first. Nothing in this business earns money today. The
site is built, five products are published, the emails and captions are
drafted, the checklist PDF is typeset, the affiliate applications are in.
But:

- Stripe is in test mode. A visitor who tries to buy gets a test checkout.
- The five published products still carry stock photographs and
  `fulfillment: manual`. The owner's own rule says a product with a stock
  photograph does not get sold. The candle can be photographed in twenty
  minutes; the merch needs Printful mockups.
- The five books have no Amazon links, so `/library/` shows nothing to buy.
- The three downloads, including the free checklist, are not on Gumroad, so
  the lead magnet does not exist yet.
- Every affiliate link is `PENDING_APPROVAL`, so `/partners/` shows "Coming
  soon" on every card.
- There is no traffic. No video has been posted.

Every one of those is an owner action. No agent can paste a live key, upload
to Gumroad, copy an Amazon URL, or film the owner's home. So this plan puts
the owner's actions first, ranks them, and only then talks about growth.

Assets this plan refers to, with paths where they are confirmed to exist:

| Asset | Where |
| --- | --- |
| The free checklist PDF | The separate downloads project (moved out of this repo in #60), 12 pages |
| The paid downloads | The separate downloads project: The Considered Pantry, The Calm Room Workbook |
| Welcome email, launch email, five launch captions | `docs/LAUNCH_WEEK.md`, Day 5 |
| Affiliate follow-up email and phone script | `docs/FINISH_PLAN.md`, Step 5 |
| Partner records | `content/partners.json`; public page `interiorcleanse.com/partners/` |
| Book covers | `public/products/covers/<slug>.jpg` |
| Faceless video scripts | `content/marketing/faceless-video-scripts.md` |
| Instagram launch pack | `content/marketing/instagram-launch-pack.md` |
| Email launch sequence | `content/marketing/email-launch-sequence.md` |

---

## 1. What can earn money in the next 24 hours

Ranked by dollars unlocked per owner-minute. "Unlocks" means the money can
now move; it does not mean it will. Nothing here generates a sale on its
own. Traffic (row 8) is what turns an unlocked price into a real order.

Prices and commission facts below are the ones in the brief and in
`content/partners.json`. Fees, materials, postage, and Printful costs are
not stated anywhere in the repo, so they are not stated here.

| Rank | Action | Who | Minutes | What it unlocks | Plain-words value per sale |
| --- | --- | --- | --- | --- | --- |
| 1 | Put the link-in-bio live on TikTok and Instagram, pointing at `interiorcleanse.com/` | Owner | 5 | The whole funnel. Every other row is invisible without it. | Nothing on its own. Five minutes that every other row depends on. |
| 2 | Photograph the candle (three phone frames by a window), upload via admin, then switch Stripe to live: paste `sk_live` and `pk_live` into Vercel, Create Stripe Price on each published product, add the webhook `https://interiorcleanse.com/api/webhook/` with the trailing slash, enable Stripe Tax, redeploy, buy the candle with your own card, refund it | Owner | 20 + 45 | Real money on all five published prices: $34, $26, $28, $58, $42. The candle is the first-dollar product because you ship it yourself and it needs only a photograph. | Candle: $34 gross, less Stripe's fee, wax, vessel, box, and postage. You know those numbers; the repo does not. Merch: $26 to $58 gross, less Stripe and Printful. Do not sell merch until Printful is connected (Day 1 in `docs/LAUNCH_WEEK.md`, about 90 minutes) or you are prepared to fulfil it by hand. |
| 3 | Send the five affiliate follow-up emails using the template in `docs/FINISH_PLAN.md` Step 5. For Plunge and Castlery, ask for the rate in writing. | Owner | 25 | Approved links, which flip `/partners/` cards from "Coming soon" to live. Days to weeks of delay; zero cost. | Sweaty Yeti: flat $1,500 per sauna sold, paid monthly after the refund period. Sauna Kit Company: 5.5 percent, typically $385 to $550 per sale. Select Saunas: 5 percent. Plunge: rate not disclosed. Castlery: rate not disclosed. Internal note only; none of these figures go in public copy. Highest per-sale value in the business, and the most uncertain: it needs approval, then a reader, then a sauna purchase. |
| 4 | Paste the five Amazon URLs into each book's `amazonUrl` in the admin, set list price, move to `approved`, publish | Owner | 15 | `/library/` goes live. The books are the most content-native product: every "one rule" or room-reset video can point at one. | A KDP royalty per paperback or Kindle sale. The royalty is set in your KDP account and is not in the brief, so it is not quoted here. |
| 5 | Upload the free checklist to Gumroad at $0, click Validate Gumroad in the admin, publish. While you are there, upload the two paid downloads. | Owner | 15 + 15 | The lead magnet exists. The welcome email's checklist link stops being a placeholder. Every "link in bio" caption about the checklist stops being HOLD-UNTIL-LIVE. | Checklist: $0, earns an email address. The Considered Pantry: $12 less Gumroad's fee. The Calm Room Workbook: $18 less Gumroad's fee. Digital, so no postage and no stock. |
| 6 | Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and `BREVO_API_KEY` in Vercel, redeploy | Owner | 10 | Measurement. Without Plausible you cannot see which video sent the visitor; without Brevo the guest book collects nothing. | Nothing directly. Every experiment in section 3 assumes these are set. |
| 7 | Paste the welcome email from `docs/LAUNCH_WEEK.md` Day 5 into Brevo as the first automation step | Owner | 10 | Every signup gets the checklist link and knows a launch email is coming. | Nothing directly. It is the only touch a signup gets before the launch email. |
| 8 | Film and post the first three faceless videos from the scripts: phone footage of your own rooms, hands, the candle, the printed checklist. No stock footage, no AI product imagery. | Owner | 90 | Traffic. This is the only row that sends anyone to the site. Post the two that point at the homepage or the candle first; hold any script that points at books or downloads until rows 4 and 5 are done. | Nothing per se. Zero cost, and every experiment below needs it. |

Why this order: rows 1 and 2 take under 75 minutes together and are the
difference between "cannot take money" and "can". Row 3 is 25 minutes with
the largest per-sale number in the business attached, so it goes before the
slower rows even though it pays last. Rows 4 and 5 each unlock a product
line in fifteen minutes. Rows 6 and 7 are plumbing. Row 8 is the longest and
is worth nothing until rows 1 and 2 are done, which is why it is last even
though it is the only traffic source.

Illustration, not a forecast, to show the arithmetic the rest of this plan
uses: if a video sends 200 people to the candle page and 2 of them buy, that
is 2 x $34 = $68 gross, before Stripe's fee, wax, vessel, box, and postage.
The 200 and the 2 are made up to show the shape; write down the real
numbers on Sunday.

---

## 2. The first-dollar funnel

```
  faceless video (TikTok / Instagram)
       |   metric: views, and profile visits per 1,000 views (platform analytics)
       v
  profile link  ->  interiorcleanse.com/?utm_source=<platform>&utm_medium=bio
       |   metric: Plausible visitors with that utm_source
       v
  homepage            or          product page /shop/<slug>/       or   /library/   or   /partners/
  guest book signup               (candle first)                        (books)           (approved partners only)
       |                                 |                                |                    |
   metric:                            metric:                          metric:             metric:
   Brevo new contacts                 Plausible views of the           Plausible views     Plausible views of
   per homepage visitor               product page                     of /library/        /partners/, then outbound
       |                                 |                                |                    clicks if the outbound
       v                                 v                                v                    extension is on
  welcome email ->               Stripe checkout                  Amazon (KDP)          partner site
  checklist on Gumroad           metric: paid orders              metric: KDP dashboard  metric: partner dashboard
  metric: Brevo click rate       in Stripe, by day                sales, by day          referrals, by month
```

The single number that matters until the first dollar: paid orders in
Stripe. After the first dollar: Stripe paid orders divided by Plausible
product-page views, written down weekly.

---

## 3. Ten growth experiments, weeks 1 to 4

Rules for all ten: no paid spend in weeks 1 and 2. Zero or near-zero cost
throughout. Every video is faceless and uses the owner's own footage. Every
link goes only to the URLs in the brief. Anything pointing at books or
downloads is HOLD-UNTIL-LIVE until the Amazon and Gumroad links exist.
Anything pointing at `/partners/` waits for at least one approved partner
and carries the plain disclosure "affiliate link, we may earn a commission".

Measurement uses only Plausible, Stripe, and Brevo. Tag every link with a
UTM so Plausible can separate the arms, for example
`interiorcleanse.com/shop/ic-signature-candle/?utm_source=tiktok&utm_campaign=one-rule-01`.
With `trailingSlash: true`, keep the slash before the question mark.

Kill/keep rules compare arms to each other, not to a target rate, because
no target rate exists yet. Minimum sample before deciding: three posts per
arm, or seven days, whichever is later.

| # | Week | Hypothesis | Channel | Asset from this repo | Cost | Measure | Kill / keep |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | A candle video that treats it as an object first ("earns the shelf before it is lit") sends more people to the candle page than a generic shop link | TikTok and Instagram Reels | Faceless script for the candle; caption 1 from `docs/LAUNCH_WEEK.md` Day 5; link to `/shop/ic-signature-candle/` with `utm_campaign=candle-object` | Zero; your own footage | Plausible: visitors to the candle page by `utm_campaign`. Stripe: paid candle orders in the 48 hours after each post | Keep if the candle-page visits per post beat the homepage-link posts (experiment 3). Kill after three posts if it sends fewer visitors than the homepage arm. |
| 2 | 1 (HOLD-UNTIL-LIVE) | A "room reset in 15 minutes" video with the free checklist as the only CTA collects more email addresses than any product video | TikTok and Instagram Reels | Faceless room-reset script; the Room Reset Checklist on camera, printed; caption 4 from `docs/LAUNCH_WEEK.md`; link to `/` with `utm_campaign=checklist` | Zero | Brevo: new contacts on the days the video runs. Plausible: visitors to `/` by campaign | Keep if it produces more Brevo contacts per post than experiment 1 produces candle-page visits per post. Kill if three posts produce zero contacts; the CTA is not landing. |
| 3 | 1 to 2 | Where the bio link points matters more than what the video says | TikTok and Instagram bio | Bio link alternates weekly: week 1 `/` with `utm_medium=bio`, week 2 `/shop/ic-signature-candle/` with `utm_medium=bio` | Zero | Plausible: visitors by `utm_medium=bio`, split by landing page. Stripe: paid orders in each week. Brevo: contacts in each week | Keep whichever week produced more paid orders. If neither week produced an order, keep the homepage: it collects an email, which the candle page does not. |
| 4 | 1 to 2 | The same script posted in the evening outperforms the morning for this audience (people resetting a home after work) | TikTok | Two "one rule" scripts from the faceless set, each posted once in the morning and once in the evening on different days | Zero | Plausible: visitors within 24 hours of each post by `utm_campaign`, with the campaign tag carrying `-am` or `-pm` | Keep the slot that sent more visitors across four posts. If the difference is under a handful of visitors, it is noise; kill the experiment and post whenever is convenient. |
| 5 | 2 | On Instagram, a carousel of stills from the same footage reaches the profile link as well as a Reel does, at a fraction of the editing time | Instagram | Instagram pack: carousel captions and Reel captions for the same three subjects (candle, tote on a hook, checklist on a phone) | Zero | Plausible: visitors by `utm_source=instagram` and `utm_content=carousel` versus `utm_content=reel` | Keep carousels if they send at least as many visitors per post as Reels; they cost less time. Kill carousels if Reels send more than twice the visitors per post. |
| 6 | 2 | The welcome email converts better when its one link is the free checklist rather than the shop | Brevo | Welcome email from `docs/LAUNCH_WEEK.md` Day 5; email sequence variant with the shop link instead | Zero | Brevo: click rate on the single link, by variant, using Brevo's A/B or two automation branches | Keep the variant with the higher click rate after 30 contacts per arm. Below 30 per arm, keep the checklist link and revisit next month. |
| 7 | 2 | A plain launch email with no discount produces orders from the guest book list | Brevo | Launch email from `docs/LAUNCH_WEEK.md` Day 7, sent once, only after Stripe is live and the candle has a real photograph | Zero | Brevo: opens and clicks. Stripe: paid orders in the 48 hours after the send. Plausible: visitors with `utm_source=brevo` | This is a one-shot, not an arm. Keep the no-discount stance if at least one order arrives. If zero orders arrive from a list of any size, do not add a discount; look at whether the product pages had real photographs first. |
| 8 | 3 (HOLD-UNTIL-LIVE) | A "what I stopped buying" video that ends on a page of one of the founder's books sends readers to `/library/` | TikTok and Instagram Reels | Faceless "what I stopped buying" script; pages of *The Edited Kitchen* or *Small Home Reset* on camera; caption 3 from `docs/LAUNCH_WEEK.md`; link to `/library/` with `utm_campaign=stopped-buying` | Zero | Plausible: visitors to `/library/` by campaign, and outbound clicks to Amazon if the outbound extension is enabled. KDP dashboard for sales by day (outside the three tools, so note it by hand on Sunday) | Keep if `/library/` visits per post are within reach of candle-page visits per post from experiment 1. Kill the book angle for now if three posts produce fewer than a handful of library visits; return to it when the list is bigger. |
| 9 | 3 to 4 (HOLD until one partner is approved) | A faceless "sauna and cold routine at home" video, with the disclosure in the caption, sends people to `/partners/` and at least one outbound click | TikTok and Instagram Reels | Faceless sauna-routine script; `/partners/` page and the editorial notes in `content/partners.json`; caption must include "affiliate link, we may earn a commission"; no health-outcome claims beyond "many people find" | Zero | Plausible: visitors to `/partners/` by campaign and outbound clicks. Partner dashboards for referrals, monthly | Keep if `/partners/` visits per post are non-zero and any outbound click appears. Kill if three posts produce no outbound clicks: the audience is not there yet, and a sauna is a long purchase. Never quote a rate in the video or caption. |
| 10 | 4 | Pinterest sends slower but longer-lived traffic than TikTok for room-reset content | Pinterest | Stills from the owner's own footage; the Instagram pack captions; links to `/`, the candle page, and, once live, `/library/` and the checklist, each with `utm_source=pinterest` | Zero | Plausible: visitors by `utm_source=pinterest`, checked at the end of week 4 and again at the end of week 8 | Keep pinning if Pinterest appears in Plausible's sources at all by week 8. Kill if it sends nothing by then. Judge it on the week-8 number, not week 4. |

What is deliberately absent: paid ads in weeks 1 and 2 (none anywhere in
this plan), giveaways, follower-growth tactics, discount codes. Checkout
does not take promotion codes today; that is a choice, not a gap.

---

## 4. Do not do

- Do not invent urgency. No "only a few left", no countdowns, no "ends
  tonight". The prices are the prices.
- Do not fake scarcity. The candle is hand-poured in small batches; say
  that once, plainly, and do not turn it into a sales device.
- Do not fabricate reviews or testimonials. There are no customers yet, so
  there are no reviews. When there are, ask for honest ones and publish them
  unedited or not at all.
- Do not quote a commission rate for Plunge or Castlery anywhere, and do not
  put any partner's rate in public copy. The Sweaty Yeti, Sauna Kit Company,
  and Select Saunas figures stay inside `docs/` and `content/partners.json`.
- Do not publish, link to, or film a product that still has a stock
  photograph. The mug, tote, hoodie, and print need Printful mockups or real
  photographs before they appear in a video.
- Do not buy followers, likes, views, or engagement. The platforms punish
  it, the partners can see it, and the follow-up email promises the opposite.
- Do not put the founder on camera. Every video is faceless: rooms, hands,
  objects, pages.
- Do not use stock footage, AI-generated product imagery, or another
  brand's photography in any post.
- Do not make health claims about saunas or cold plunges beyond "many
  people find".
- Do not report a conversion rate, a revenue figure, or a follower count to
  anyone (partners included) that has not been read off Stripe, Plausible,
  Brevo, or the platform dashboard that day.
- Do not add a discount to get the first order. If the first order does not
  come, the fix is photographs, traffic, or the CTA, not the price.

---

## 5. The weekly loop

Sunday, 45 minutes, same order every week. Write the five numbers in a
plain text file or a notebook; the point is the trend, not the tool.

**Minutes 0 to 15: read the five numbers and write them down**

1. Plausible: unique visitors this week, and the top source.
2. Brevo: new contacts this week (total list size in brackets).
3. Stripe: paid orders this week, and gross dollars.
4. Plausible: views of `/shop/ic-signature-candle/` (and any other product
   page that is live). Divide Stripe orders by this number and write the
   result down as the product-page conversion, even when it is zero.
5. Posts published this week, and which experiments they belonged to.

Also note, not as a number: which affiliate applications have replied, and
whether any HOLD-UNTIL-LIVE item unlocked this week.

**Minutes 15 to 30: apply the kill/keep rules**

Go down the experiment table. For each arm that has reached its minimum
sample (three posts or seven days), decide keep or kill from the rule in the
table, not from how it felt. Write the decision next to the experiment
number. Anything short of sample continues unchanged.

**Minutes 30 to 45: set next week**

- Pick the three videos to film and post. At least one continues a kept
  experiment; at most one starts a new one.
- Decide the bio link for the week (experiment 3 until it resolves).
- List the owner actions still open from section 1, in rank order. If any
  row from section 1 is still open, it is the first task of Monday, ahead of
  any video.

The loop ends when you have written down the five numbers, marked each
experiment keep, kill, or continuing, and named Monday's first task. Do not
add a sixth number until the first five have been written down for four
consecutive Sundays.
