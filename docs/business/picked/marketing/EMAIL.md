# Picked email program (Klaviyo)

Every email is plain text in feel, signed by the founder, and sent to a defined
segment. None of them makes a health, weight-loss, disease, or GLP-1 claim.
None contains a number, review, rating, or testimonial that has not happened
yet.

**Tags used below**

- `[square brackets]`: fill in with a real fact before sending. If you have no real fact, cut the line.
- **HOLD-UNTIL-LIVE**: needs a live product, page, link, or lot. The email does not go out until that thing exists.
- `[x]g`: grams of fruit per scoop. Use the manufacturer's number, given in writing.
- `[20]g`: protein per scoop. Use the number on the final Supplement Facts panel.

The copy spells it "flavour" to match the site and the `next_flavour`
property. If you switch to US "flavor", change the site and the emails
together.

---

## 0. Fix these before the first email sends

1. **The signup form promises too little.** `site/index.html` says *"One email
   when it ships, nothing else."* That rules out the welcome series and the
   newsletter. Change it before the site goes live to: *"A few emails while
   we make it: the founding offer, the flavour vote, and the ship date.
   Unsubscribe anytime."* Also have the form send
   `waitlist_terms: "updates"` next to `next_flavour`. Anyone who signed up
   under the old wording gets `waitlist_terms: "ship-only"` (bulk update by
   signup date). They receive one email, P1 (doors open), and nothing else
   unless they click its "keep me posted" link. If the form copy changes
   before anyone signs up, delete the ship-only segment.
2. **Sending setup.** Set up a branded sending domain in Klaviyo (for example
   `send.pickedprotein.com`) with SPF and DKIM. Publish DMARC at `p=none`
   with a `rua=` report address, and move to `p=quarantine` after 30 clean
   days. From: `[Founder name] at Picked <[founder]@pickedprotein.com>`. A
   person reads the reply-to inbox. Replies are part of the strategy.
3. **Double opt-in stays on** for the Waitlist list (see `site/README.md`). The
   welcome flow triggers on confirmation, not on form submit.
4. **Template.** Use Klaviyo's text-based template: no header image, no
   product photo (none exists yet), and text links rather than buttons. Aim
   for 120 to 300 words. The form does not collect first names, so open with
   "Hi," and use no name tag.
5. **Footer.** Every marketing email ends with this block (CAN-SPAM needs a
   real postal address and a working opt-out, honoured within 10 business
   days):

```
—
You're getting this because you joined the Picked waitlist at pickedprotein.com.
[Picked LLC legal name] · [physical postal address or USPS-registered PO box]
Unsubscribe: {% unsubscribe %} · Preferences: {% manage_preferences %}
```

---

## 1. Flow map

| Flow | Trigger | Emails | Timing | Goal | Klaviyo setup notes |
| --- | --- | --- | --- | --- | --- |
| **Waitlist welcome** | Added to list: Waitlist (after double opt-in) | 3 (W1–W3) | Day 0, day 4, day 10 | Trust, a flavour vote from everyone, replies | Flow filter: `waitlist_terms` is not `ship-only`. Exit: unsubscribed, hard bounce, spam complaint, Placed Order since starting flow. W1 and W3 show or hide blocks on `next_flavour` (`mango` / `raspberry-lemon` / blank, because the top form has no vote). |
| **Pre-order launch** | Campaigns, not a flow. Sent when the production sample is approved and the ship date is firm. | 3 (P1–P3) | Day 0, day 5, and 24 h before founding pricing closes | Founding pre-orders | P1 goes to everyone on Waitlist, ship-only included. P2 and P3 go to WL-NotPurchased only. Founding codes are Shopify **unique coupon codes** issued through Klaviyo, one per profile, expiring at the deadline. The system enforces the deadline, so the email can state it honestly. Smart Sending on. |
| **Pre-order delay notice** | Ship date will be missed | 1 (D1), as needed | Before the promised date passes | Legal and honest | Required by the FTC Mail Order Rule: a revised date plus the option to cancel for a full refund. Send to everyone with an unfulfilled pre-order. Transactional, no promotion. |
| **Post-purchase** | Fulfilled Order (Shopify). **Not** Placed Order: pre-orders sit for months before they ship. | 3 (PP1–PP3) | On fulfilment, day 7, day 25 | Good first drink, honest feedback, second order | PP1 is how-to with no promotion, so it can go to every buyer. Ask Klaviyo for transactional status on that message if needed. PP2 and PP3 go to email-marketing-consented buyers only. Exit: refunded or cancelled order, unsubscribed, bounce, complaint. PP3 also exits on an active subscription (Loop event) or Placed Order since starting flow. |
| **Win-back** | Placed Order at least once, and 60 days since the last Fulfilled Order | 1 (WB1) | Day 60 after last fulfilment | Learn why they stopped, and win some back | Filters: not an active subscriber, Placed Order zero times since starting flow, not in post-purchase flow. No click within 90 days of WB1: move to Sunset and stop newsletters. |
| **From the bench** | Monthly campaign | 1 a month | First [Tuesday] of the month, [10:00] recipient local time | Keep the list warm until launch, so the P1 spike doesn't hit cold inboxes | Send to Engaged-180, excluding ship-only and Sunset. |

### Properties and segments

| Name | Definition (every live segment uses at least 2 conditions) |
| --- | --- |
| `next_flavour` | Profile property from the form: `mango`, `raspberry-lemon`, or blank. Voting by reply: update by hand, or add the field to Klaviyo's preference page. |
| `waitlist_terms` | `updates` or `ship-only` (see section 0). |
| WL-Updates | In Waitlist AND `waitlist_terms` ≠ `ship-only` |
| WL-ShipOnly | In Waitlist AND `waitlist_terms` = `ship-only` |
| WL-NotPurchased | In Waitlist AND Placed Order zero times since [pre-order open date] AND can receive email marketing |
| Vote-Mango / Vote-RL / Vote-None | In Waitlist AND `next_flavour` = `mango` / `raspberry-lemon` / is not set |
| Founding buyers | Placed Order where Discount Codes contains [founding code prefix] AND Fulfilled Order zero times (use for D1) |
| Engaged-180 | Can receive email marketing AND (Clicked Email in last 180 days OR Placed Order in last 180 days OR added to Waitlist in last 30 days). **Opened Email is never a condition here:** Apple Mail Privacy Protection fakes opens. |
| Sunset | Can receive email marketing AND no click and no order in 180 days AND on list more than 180 days |

---

## 2. Copy

### Waitlist welcome

#### W1 · Day 0 · Welcome and founder story

- **Subject A:** you're on the list
- **Subject B:** strawberry, from strawberries
- **Preview:** What Picked is, what you get for being early, and what happens next.

> Hi,
>
> Thanks for joining. I'm [Founder name], and I'm making Picked.
>
> [Your real reason, two or three sentences: the fruit protein that let you
> down, what it tasted like, what you thought. Use your own story. Don't
> borrow one.]
>
> So here's what I'm making. A light whey protein drink you mix with cold
> water, flavoured mainly with freeze-dried fruit. Not "natural flavors"
> doing an impression of a strawberry. Strawberries. The pack will say how
> many grams of fruit are in every scoop, on the front, where you can't miss it.
>
> A few things are already decided:
>
> - Sweetened with monk fruit or stevia. No sucralose.
> - Every lot tested for heavy metals, with that lot's results behind a QR code on the pouch.
> - Strawberry first. You help pick what comes second.
>
> For being here early, you get 20% off your first pouch and a free shaker
> when pre-orders open. I'm aiming to ship in early 2027. You'll get the real
> date as soon as I have one.
>
> What's next: two short emails over the next week and a half, then one note
> a month from the bench while we make it.
>
> *[Show if `next_flavour` is blank]* One question while you're here: mango or
> raspberry lemon next? Hit reply with one word.
>
> *[Show if `next_flavour` is set]* You voted {{ person|lookup:'next_flavour' }}
> for the second flavour. Counted.
>
> [Founder name]
> Founder, Picked
>
> P.S. This comes from my own inbox. Reply and I'll read it.

**CTA:** reply. W1 has no links on purpose. Replies help deliverability more than clicks do.

#### W2 · Day 4 · The real-fruit label lesson

- **Subject A:** what "natural flavors" actually means
- **Subject B:** your shaker has been lying to you about mango
- **Preview:** A one-minute label lesson you can try on any tub in your cupboard.

> Hi,
>
> Grab whatever fruit-flavoured protein is in your cupboard and turn it
> around. Three questions:
>
> **1. Is the fruit actually in the ingredients?** Look for the fruit by name:
> "strawberry powder", "freeze-dried mango". If all you find is "natural
> flavors", the taste may come from something other than the fruit on the
> front. The label doesn't have to say what the flavour was made from.
>
> **2. Where is it in the list?** Ingredients are listed from most to least
> by weight. Fruit sitting after the sweetener means there isn't much of it.
>
> **3. Does the pack say how much?** "Made with real fruit" has no required
> minimum behind it. It can mean a lot of fruit or a dusting.
>
> One more code word: **WONF**, short for "with other natural flavors". Some of
> the strawberry taste comes from strawberry, and some comes from other
> natural flavourings built to taste like it.
>
> Picked's answer to question 3 will be on the front of the pouch: [x]g of
> fruit per scoop. I won't guess that number here. It goes on the pack once the
> recipe is locked. If the final recipe needs a little natural flavour to back
> the fruit up, the label will say so, and you'll hear it from me first.
>
> Try it on your tub and reply with what you find. I collect these.
>
> [Founder name]

**CTA:** reply with what you find. Secondary: "The Real Fruit Test, one page you can keep: [link]" **HOLD-UNTIL-LIVE** (the guide doesn't exist yet).

#### W3 · Day 10 · Flavour vote and behind the scenes

Two versions. Run **Vote open** until the vote closes, then swap in **Vote closed**.

- **Subject A (open):** mango or raspberry lemon?
- **Subject B (open):** what's on the bench this week
- **Subject (closed):** the vote's in: [winner]
- **Preview:** Where Picked is right now, and the one decision that's yours.

> Hi,
>
> Quick look at where things are. [Real current stage, one or two sentences.
> For example: "Quotes are back from [n] manufacturers and we're choosing on
> flavour skill and lot testing, not just price." Or: "Bench sample round
> [n] arrived. Too sweet. Round [n+1] is on its way." Only what actually
> happened.]
>
> **Vote open**
>
> *[Blank `next_flavour`]* Strawberry ships first. What comes second is up to
> this list. Reply "mango" or "raspberry lemon". One word is enough.
>
> *[`mango`]* You voted mango. The aim: the sun-warm, sticky bit near the
> stone, not mango candy.
>
> *[`raspberry-lemon`]* You voted raspberry lemon. The aim: tart first, then
> the seedy bit of a raspberry, then lemon to finish.
>
> The vote closes [date]. The result goes out to everyone, with the real count.
>
> **Vote closed** (replaces the block above)
>
> [Winner] won, [n] votes to [n]. [Winner] goes into development after
> Strawberry. [Only if true: "[Runner-up] isn't off the table. It goes back
> to a vote after that."]
>
> **Optional, only if the panel is really running:** I'm picking [30] people
> from this list for a blind taste test against two clear proteins already on
> the shelf. If Picked doesn't win on "tastes like real fruit", it doesn't
> ship. Reply "panel" if you're in [city/region, or "we'll post samples"].
>
> [Founder name]

**CTA:** reply (vote, or join the panel). Use counts taken straight from the Vote-Mango and Vote-RL segments on the closing date. Never round them in your favour.

---

### Pre-order launch

Send only once the production sample is approved, the ship date has a
reasonable basis, and the founding deadline is set in Shopify.

#### P1 · Day 0 · Doors open · HOLD-UNTIL-LIVE

- **Subject A:** pre-orders are open
- **Subject B:** strawberry is ready to pre-order
- **Preview:** Your founding price: $43.99 for your first pouch, plus a free shaker. Ships [date range].

> Hi,
>
> It's ready. [One real sentence on what changed: "The production sample
> came back and it tastes like strawberries," or whatever is true.]
>
> **Strawberry Picked, 20 servings**
>
> - [20]g protein per scoop
> - [x]g freeze-dried strawberry in every scoop
> - Sweetened with [monk fruit / stevia / both]. No sucralose.
> - Lot [number] heavy-metal results: [COA link]
>
> **Your founding price:** $43.99 for your first pouch (normally $54.99), plus
> a free shaker. Your code: {% coupon_code '[Klaviyo coupon name]' %}. It works
> once, for you.
>
> **Ships:** [date range]. You're charged [at checkout / when it ships]. If the
> date slips, I'll email you before it passes, and you can cancel for a full
> refund.
>
> **Founding pricing closes** [weekday, date, time, timezone]. After that it's
> $54.99.
>
> Want it to keep coming? Subscribe and save 15%: $46.74 a pouch. [Decide
> and state: does the founding 20% apply to a subscription's first pouch?]
>
> Pre-order Strawberry: [link]
>
> [Founder name]
>
> *[Show to WL-ShipOnly only]* You asked for one email when Picked was
> ready, and this is it. If you'd like the monthly note from the bench too:
> [keep me posted link]. Otherwise, you won't hear from us again.

**CTA:** Pre-order Strawberry, as a text link. **HOLD-UNTIL-LIVE:** store, COA page, coupon, ship date.

#### P2 · Day 5 · The why · WL-NotPurchased

- **Subject A:** why the fruit number is on the front
- **Subject B:** what $54.99 pays for
- **Preview:** Three decisions behind Picked, and the one thing it isn't.

> Hi,
>
> Three decisions make Picked what it is. Each one costs more than the easy
> version.
>
> **The fruit.** Freeze-dried strawberry is the main flavour, [x]g a scoop, and
> the number is on the front. Flavouring is cheaper. It also tastes like
> flavouring.
>
> **The sweetener.** Monk fruit or stevia, no sucralose. If you've ever
> finished a shake and tasted it for the next hour, you know why.
>
> **The testing.** Every lot is tested for heavy metals before it ships, and
> your lot's results are one QR scan away. Not a promise on a website. A
> document you can read.
>
> What it isn't: a meal replacement or a treatment for anything. It's a cold
> drink that tastes like strawberries and has [20]g of protein in it.
>
> Your founding price, $43.99 plus a free shaker, runs until [weekday, date,
> time, timezone].
>
> Pre-order Strawberry: [link]
>
> [Founder name]

**CTA:** Pre-order Strawberry. **HOLD-UNTIL-LIVE.**

#### P3 · 24 h before close · Last call · WL-NotPurchased

**Send only if the deadline is real, the coupon really expires then, and you
won't reopen founding pricing afterwards.** If any of those is false, don't
send P3.

- **Subject A:** founding pricing closes tomorrow
- **Subject B:** last email about the founding price
- **Preview:** [Weekday, time, timezone]. After that, $54.99.

> Hi,
>
> Short one. Founding pricing ($43.99 for your first pouch, plus a free
> shaker) closes [weekday, date, time, timezone]. After that, Strawberry is
> $54.99. This is the last email about it.
>
> If now isn't the time, that's fine. You stay on the list and you'll hear
> when [next flavour] is ready.
>
> Pre-order Strawberry: [link]
>
> [Founder name]

**CTA:** Pre-order Strawberry. **HOLD-UNTIL-LIVE.** Never add a countdown timer
or stock count unless it reflects real inventory.

#### D1 · Delay notice · Founding buyers with unfulfilled orders · as needed

- **Subject:** your Picked order: new ship date
- **Preview:** New date, the reason, and how to cancel if you'd rather not wait.

> Hi,
>
> Your Strawberry pre-order won't ship by [original date]. The new date is
> [new date]. The reason: [plain, true reason].
>
> If you'd rather not wait, reply "cancel" or use [link] and you'll get a full
> refund to your original payment method. If you'd like to keep your order, you
> don't need to do anything. [If another delay happens, you'll hear before the
> new date.]
>
> Sorry about this.
>
> [Founder name]

---

### Post-purchase

#### PP1 · On fulfilment · Shipping and how to mix

- **Subject A:** how to make it taste right
- **Subject B:** your strawberries are on the way
- **Preview:** Cold water, 10 to 12 oz, shake hard. And where your lot's lab results live.

> Hi,
>
> Your Picked is on its way. Tracking: [Shopify tracking link].
>
> When it lands:
>
> 1. One scoop.
> 2. 10 to 12 oz of cold water. Use 10 for a stronger taste and 12 for a
>    lighter one. Ice if you like it like a juice box.
> 3. Shake hard for 10 to 15 seconds. If there's foam, give it a minute.
>
> It'll look a little cloudy. That's the fruit.
>
> Keep the pouch sealed, cool, and dry. It contains milk (whey).
>
> Your lot's heavy-metal results: scan the QR code on the back, or go to
> [COA page link].
>
> *[Show to founding buyers]* Your free shaker is in the box.
>
> [Founder name]

**CTA:** none beyond tracking and COA. No promotion in this one.
**HOLD-UNTIL-LIVE:** COA page.

#### PP2 · Day 7 · Honest feedback

- **Subject A:** honest question
- **Subject B:** how does it taste?
- **Preview:** One word is plenty. I read every reply.

> Hi,
>
> You've had Picked for a few days. How does it taste? Reply with one of these,
> or your own words:
>
> - more fruit
> - less sweet
> - just right
> - not for me
>
> Every reply comes to me, and the next batch is built from them.
>
> If you'd like to leave a public review, here's the link: [review link]. Good,
> bad, or "fine". I'd rather have a true three stars than a fake five.
>
> [Founder name]

**CTA:** reply first, then the review link. **HOLD-UNTIL-LIVE:** review app.
Send the review link to every buyer, not only happy ones, and offer no reward
tied to the rating (FTC rule on reviews, 16 CFR Part 465).

#### PP3 · Day 25 · Replenish or subscribe

- **Subject A:** running low?
- **Subject B:** about 20 scoops in
- **Preview:** One a day, and you're nearly out. Two ways to get more.

> Hi,
>
> A pouch is 20 scoops. If you've had one most days, you're close to the
> bottom.
>
> Two options:
>
> - **Subscribe:** $46.74 a pouch (15% off), every [interval you choose].
>   [Skip, pause, or cancel from your account anytime. State only the terms
>   your subscription app actually allows.]
> - **One more pouch:** $54.99.
>
> Get more Strawberry: [link]
>
> Not for you? Reply and tell me why. That helps as much as an order.
>
> [Founder name]

**CTA:** Get more Strawberry. **HOLD-UNTIL-LIVE.**

---

### Win-back

#### WB1 · Day 60 after last fulfilment

- **Subject A:** did we get it wrong?
- **Subject B:** one question, then I'll leave you be
- **Preview:** If Picked didn't work for you, I'd like to know why.

> Hi,
>
> It's been a couple of months since your last pouch. No pressure. I would just
> like to know why. Reply with whichever fits:
>
> - taste
> - price
> - forgot
> - switched to something else
> - other: [tell me]
>
> *[Show only if true]* Since you last ordered: [real change, such as "Mango
> is out" or "we cut the sweetness after your feedback"].
>
> If you want another pouch: [link]
>
> [Founder name]

**CTA:** reply. Secondary: shop link, **HOLD-UNTIL-LIVE**. [Optional: an offer,
only if you'll honour it for everyone in this flow and can afford it at about
$22 margin a pouch.]

---

## 3. "From the bench" monthly template

- **Audience:** Engaged-180, excluding ship-only and Sunset.
- **Length:** 200 to 350 words, one link (two once the store is live).
- **Subject format:** `from the bench: [one concrete thing that happened]`. For example: "from the bench: round 3 was too sweet".
- **Preview:** the second most interesting thing in the email.

> Hi,
>
> **This month**
> - [Real thing 1]
> - [Real thing 2]
> - [Real thing 3. Fewer is fine. Never pad.]
>
> **What I learned**
> [Two or three sentences on taste, sourcing, the label, or manufacturing.
> Something a reader could repeat to a friend.]
>
> **Label lesson**
> [One term from a real protein label, explained in two sentences. For
> example: "isolate" vs "concentrate", "proprietary blend", "%DV".]
>
> **A number** *(include only if it's real and you can show it)*
> [For example: "[n] bench samples tasted" or "lot [n] COA: [link]". Never an
> estimate presented as a result.]
>
> **Your turn**
> [One question with a one-word reply. For example: "ice or no ice?"]
>
> **Next month**
> [What's coming, with a date only if it's firm.]
>
> [Founder name]

Rules: no product photos until a real pouch exists, no claims, no "coming
soon" without a date or an honest "not sure when yet".

---

## 4. Five numbers to watch

These targets are **rules of thumb from DTC email practice, not facts about
Picked.** Replace them with your own baselines after three months of data.
Open rate is left out on purpose: Apple Mail Privacy Protection inflates it.

| # | Number | How to read it in Klaviyo | Healthy (rule of thumb) | Act if |
| --- | --- | --- | --- | --- |
| 1 | **Click rate** (unique clicks ÷ delivered) | Per campaign and per flow message | Campaigns 2%+, flows 4%+ | Campaigns under 1%: the subject or content isn't earning the click |
| 2 | **Waitlist to pre-order conversion** | WL-NotPurchased shrinkage, or Placed Order with the founding code ÷ Waitlist size, over the founding window | 10%+ | Under 5%: check price, ship date, or list quality before more P-emails |
| 3 | **Repeat order within 45 days** of first fulfilment | Customers with 2+ orders ÷ first-time customers fulfilled 45+ days ago | 25%+ | Under 15%: read the PP2 replies. It's taste or price, and they'll tell you which. |
| 4 | **Unsubscribe rate** per send | Per campaign | Under 0.3% | Over 0.5%: too frequent, or the segment is wrong |
| 5 | **Spam complaint rate** per send | Per campaign, plus Google Postmaster Tools | Under 0.1% | 0.1% or more: pause campaigns and check the source of the list. **0.3% is Google's published enforcement line (a fact, not a rule of thumb).** |

Also count PP2 replies by hand each week. They aren't a Klaviyo metric, but
they're the most useful feedback in the program.
