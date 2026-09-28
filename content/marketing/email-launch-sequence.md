# Email launch sequence

> **Update 2026-09-28.** The three printable downloads, including the free
> Room Reset Checklist, left this repository on `main` (#60) and now live in
> a separate project. Where this file says `assets/downloads/`, use that
> project's copy. The steps are otherwise unchanged.

Internal working document for the owner. Everything below is written to be
pasted into Brevo. Email 1 is the existing welcome ("The next edit, quietly
delivered", in `docs/LAUNCH_WEEK.md`) and is not rewritten here.

Rules this file obeys: no invented products, prices, reviews, follower counts
or results. No commission rate stated for Plunge or Castlery. Sweaty Yeti,
Sauna Kit Company and Select Saunas rates appear nowhere in the email copy.
Every link is on the allowed list. Anything that depends on a books or
downloads link is tagged HOLD-UNTIL-LIVE.

Do not paste this document into Brevo as a whole. Paste one email at a time.

---

## 1. Brevo automation map

### What the site already does

- The guest book (`app/api/subscribe/route.ts`) upserts the address into the
  Brevo list `BREVO_LIST_SUBSCRIBERS` (default id 1) with attributes
  `SOURCE` and `SIGNUP_DATE`. It captures email only. There is no first
  name, so no email below uses a name greeting.
- The Stripe webhook (`app/api/webhook/route.ts`) upserts buyers into
  `BREVO_LIST_CUSTOMERS` (default id 2) with `FIRSTNAME`, `LASTNAME`,
  `LAST_ORDER_DATE`, `LAST_ORDER_AMOUNT`.
- Both routes also send a Claude-authored email through `lib/ai-email.ts`
  when `ANTHROPIC_API_KEY` is set. Decide before launch: either the app sends
  the welcome, or Brevo does. Not both. If Brevo owns the sequence, leave
  `ANTHROPIC_API_KEY` unset on Vercel or the first subscriber receives two
  welcomes on day 0.

### Workflow: Guest book welcome

| Step | Timing | Email | Brevo action |
|------|--------|-------|--------------|
| Trigger | Contact added to list Subscribers (id 1) | — | Entry condition: contact is not in list Customers (id 2) |
| 1 | Immediately | The next edit, quietly delivered | Existing welcome, unchanged |
| 2 | Wait 2 days | The room reset checklist, free | Section 2, email 2 |
| 3 | Wait 3 days (day 5) | One candle, one print | Section 2, email 3 |
| 4 | Wait 4 days (day 9) | Five books, one shelf | Section 2, email 4 (HOLD-UNTIL-LIVE) |
| 5 | Wait 4 days (day 13) | Heat, cold, and the room between | Section 2, email 5 (gate: at least one partner card live) |
| 6 | Wait 5 days (day 18) | One a month at most | Section 2, email 6, then end workflow |

Send window: 07:00 to 09:00 in the contact's timezone if Brevo has it,
otherwise 08:00 in the owner's timezone. No sends on Sunday; if a delay
lands on Sunday, Brevo's "wait until" pushes it to Monday.

If a step is on hold (email 4, possibly 5), disable that step in Brevo and
keep the delays on either side. Do not close the gap. Silence is fine;
a broken link is not.

### Exit conditions (set in the workflow's exit settings)

1. Contact added to list Customers (id 2). They bought something. They leave
   this workflow and enter the post-purchase sequence in section 3.
2. Unsubscribe.
3. Hard bounce. Brevo blocklists the address automatically; confirm the
   setting is on.
4. Spam complaint. Same as above.
5. Workflow re-entry: off. A contact who signs up twice runs once.

### The one segmentation rule

At this list size there is one distinction worth acting on: clicked a
product link, or did not.

- Segment **Browsed**: clicked any link containing `/shop/` in any email
  (Brevo segment builder: email activity, clicked a link, URL contains
  `/shop/`). Once in, a contact stays in.
- Segment **Read only**: everyone else on the Subscribers list who is not
  in Customers.

How it is used:

- The six-email sequence goes to everyone. No branching inside it; the
  arc is the arc.
- After the sequence, the monthly editorial email goes to Subscribers and
  Customers alike.
- Any email whose subject is a product (a restock, a new object, the launch
  "We are open" note) goes to Browsed plus Customers only. Read only
  contacts hear about products inside the monthly email and nowhere else.
- Review the Read only segment at 180 days after `SIGNUP_DATE`. Anyone with
  zero clicks in that time gets one plain "still want these?" note, then is
  removed if they do not click.

That is the whole rule. Do not add a second dimension until the list is
large enough that a segment has more than a few dozen people in it.

### What to watch (Brevo reports)

Opens are directional only; Apple Mail Privacy Protection inflates them.
Judge each email on clicks.

| Metric | Watch for | Act if |
|--------|-----------|--------|
| Click rate per email | Email 2 and 3 should lead | Any email under 1% for two months running: rewrite it |
| Unsubscribes per email | Spread evenly | One email carrying most of them: it is the wrong email or the wrong day |
| Complaint rate | Near zero | Above 0.10%: pause the workflow and check the list source |
| Hard bounces | Near zero after the first month | Above 1% on any send: stop and verify the list |
| Replies | Emails 2, 6 and post-purchase 2 ask for them | None after 50 contacts: the ask is not landing |

---

## 2. Emails 2 to 6

Paste each into Brevo as a plain-text-friendly template: no header image,
one column, system font, ink text on bone background if using the
designer, and a single text link for the CTA. Sender: InteriorCleanse
<hello@interiorcleanse.com>. Reply-to the same. Footer: one-click
unsubscribe (Brevo adds the List-Unsubscribe header) and the owner's postal
address as CAN-SPAM requires.

### Email 2 — day 2

**Send delay:** 2 days after email 1.
**Subject:** The room reset checklist, free
**Preview text:** Twelve pages, one per room, surfaces before floors. A short version and a full one.

**Body:**

We said the checklist was free. Here it is.

The Room Reset Checklist is twelve pages, one page per room. Every page runs in the same order: surfaces first, then floors. Doing it that way round means you are never sweeping around things you are about to move.

Each room has a fifteen-minute version for the evenings when that is all there is, and a full version for a slow Saturday. Print it, pin it inside a cupboard door, and tick things off in pencil so the same sheet lasts longer than a week.

Start with the room you walk into first. It sets the tone for the rest, and it is usually the smallest job.

[Choose one line, delete the other:]
[A] The checklist is attached to this email as a PDF.
[B] Download the checklist here: [HOLD-UNTIL-LIVE: Gumroad URL for The Room Reset Checklist]

If a page is missing something your room needs, reply and say which room. The next printing will be better for it.

— InteriorCleanse

**Primary CTA:** "Download the checklist" → [HOLD-UNTIL-LIVE: Gumroad URL for
The Room Reset Checklist]. Until that link exists, use option [A]: attach
the Room Reset Checklist PDF from the separate downloads project directly to the Brevo template
(the file is in the repository today) and make the CTA a plain sentence with
no link. If the Brevo plan in use does not allow attachments on automation
emails, hold the email rather than linking anywhere else.
**Affiliate disclosure:** none needed; no partner mentioned.

### Email 3 — day 5

**Send delay:** 3 days after email 2.
**Subject:** One candle, one print
**Preview text:** Hand-poured in small batches and shipped by the person who poured it.

**Body:**

Two objects from the shop, and the honest version of each.

The Signature Candle is hand-poured in small batches and shipped by the founder, not a warehouse. It was designed as an object first: something that earns its place on a bare surface whether or not it is lit. It is 34 dollars.

A candle is also a fragrance trade-off, and we would rather say so than pretend otherwise. Burn it with a window open an inch and trim the wick before each use. Our book on indoor air covers the trade-off in full, and we do not soften it there either.

The Considered Home Print is a study in warm neutrals: three thresholds, one horizon, one sun. Giclée, 18 by 24, on heavyweight matte paper. It ships flat and unframed so you can choose the frame that suits your wall, not ours. It is 42 dollars.

interiorcleanse.com/shop/considered-home-art-print/

Neither is on sale and neither will be. The prices are the prices.

— InteriorCleanse

**Primary CTA:** "See the candle" → https://interiorcleanse.com/shop/ic-signature-candle/
**Affiliate disclosure:** none needed; both are our own products.

### Email 4 — day 9 — HOLD-UNTIL-LIVE

**Send delay:** 4 days after email 3. Keep this step disabled in Brevo until
`/library/` shows live Amazon links.
**Subject:** Five books, one shelf
**Preview text:** Written by the founder. Paperback and Kindle. Start with the room that bothers you most.

**Body:**

The founder has written five books. Each one takes a single problem and stays with it.

The Calm Room Method is a field guide to rooms that breathe: editing visual noise, quieter storage, and room-by-room prompts.

Small Home Reset is for organising beautifully when every inch counts. Vertical storage without chaos, and a weekly rhythm that keeps it that way.

The Edited Kitchen is a quieter approach to the hardest-working room: countertop rules, pantry zones that stop duplicate buying, an evening cleaning ritual.

The Rested Body is about sleep, light, and the rooms that hold them. Evening light, bedding, and a closing routine you can repeat.

Clean Air, Clean Home is a practical guide to what you breathe indoors, including the honest case for and against candles.

All five are on Amazon in paperback and Kindle. Pick the one that matches the room that bothers you most, and ignore the rest until it stops bothering you.

— InteriorCleanse

**Primary CTA:** "Browse the library" → https://interiorcleanse.com/library/
**Affiliate disclosure:** none needed for the founder's own books. If the
Amazon links on `/library/` are Amazon Associates links, add this line
above the sign-off: "The Amazon links are affiliate links; we may earn a
commission."

### Email 5 — day 13

**Send delay:** 4 days after email 4 (or after email 3 if email 4 is held).
Gate: send only once at least one partner card on `/partners/` is live. If
every card still reads "Coming soon", disable this step and keep the delay.
**Subject:** Heat, cold, and the room between
**Preview text:** A sauna and a cold plunge at home, and the partners we chose to list. Affiliate links.

**Body:**

Not everything in a considered home is furniture. Some of it is routine.

Many people find that a short stint in a sauna followed by cold water is the most reliable way to put a day down. It is a ritual, not a treatment, and we make no larger claim for it than that. What we can say is that it works best when it lives at home, close enough to use on an ordinary Tuesday.

Our partners page lists the makers we would buy from ourselves. Sweaty Yeti build outdoor cedar cabins that weather honestly. Sauna Kit Company turns a spare corner into a sauna without rebuilding the house. Select Saunas carry several makers in one place and take HSA and FSA through TrueMed at checkout. Plunge make the cold half, a tub built to sit outside and be stepped into daily.

Each card says plainly what the maker is good for and what to check before you order.

The links on that page are affiliate links; we may earn a commission if you buy through them.

— InteriorCleanse

**Primary CTA:** "See the partners" → https://interiorcleanse.com/partners/
**Affiliate disclosure:** included in the body, second-to-last paragraph.
Keep it. No commission figures anywhere in this email.

### Email 6 — day 18

**Send delay:** 5 days after email 5. Last step; the workflow ends here.
**Subject:** One a month at most
**Preview text:** That is the whole promise. Here is what it covers, and one small favour to ask.

**Body:**

This is the last of the welcome notes. From here on, one email a month at most.

Each one will hold a single room, a single idea, and, if there is one, a single object. When there is nothing worth saying, you will not hear from us. We would rather skip a month than fill one.

Two things would help us write a better one.

First, reply to this email with the room you are working on right now. One word is enough. Kitchen, hallway, the cupboard under the stairs. We read every reply and it decides what the next note is about.

Second, if you want fewer than one a month, the unsubscribe link at the bottom takes one click and asks no questions.

Everything else lives on the site: the shop, the library, the partners, and the guest book you came in through.

Thank you for staying.

— InteriorCleanse

**Primary CTA:** "Back to the house" → https://interiorcleanse.com/
**Affiliate disclosure:** none needed; no partner named.

---

## 3. Post-purchase sequence (Stripe customers)

Trigger: the Stripe webhook adds the buyer to the Customers list (id 2). The
webhook may also send a Claude-authored order note if `ANTHROPIC_API_KEY`
is set; that note is the receipt-side email and is not replaced here.

The two emails below need one new Brevo contact attribute, `SHIPPED_DATE`
(date). The founder sets it on the contact when the parcel goes out. A
second workflow, "Candle shipped", triggers on that attribute changing.
Both emails are transactional in tone and carry no shop links. Send the
first through Brevo transactional (template, not campaign) so it is never
throttled with marketing volume.

### Post-purchase 1 — sent when SHIPPED_DATE is set

**Subject:** Your candle is on its way
**Preview text:** Posted today. A short note on the first burn.

**Body:**

Your Signature Candle left us today.

It was poured by hand in a small batch, wrapped by the same hands, and posted with [carrier]. Tracking, if you want it: [tracking link]. Expect it within [X] working days; if it takes longer, reply to this email and we will chase it.

Two notes for when it arrives.

The first burn matters most. Let it burn until the melted wax reaches the edge of the vessel before you put it out, usually an hour or two. That sets the surface for every burn after it. Trim the wick before each lighting.

Burn it with a window open an inch. A candle is a fragrance trade-off and we do not pretend otherwise.

If it arrives damaged, reply with a photograph and we will sort it out.

— InteriorCleanse

**Primary CTA:** the [tracking link] in the body; no other link.
**Placeholders to fill per order:** [carrier], [tracking link], [X].

### Post-purchase 2 — 10 days after SHIPPED_DATE

**Subject:** How it is living in your room
**Preview text:** A plain question. A reply is all we are after.

**Body:**

Your candle should have been with you for a week or so now. We would like to know how it is living in your room.

Where did it end up: a shelf, a table, the windowsill in the bathroom, the box it came in. Whether it gets lit or mostly sits there, which is a fine use for it. Whether the scent read the way you hoped, or not.

Reply to this email. It comes straight to us, not to a review site or a form, and nobody is scored on it. If something is not right, say that too; it is the more useful kind of reply.

If you would rather not, that is fine. We will not ask again.

— InteriorCleanse

**Primary CTA:** reply. No link in this email.
**Exit:** if the customer replies to post-purchase 1, skip this one.

---

## 4. Partner follow-up cadence (owner's affiliate applications)

One thread per partner, sent from hello@interiorcleanse.com, plain text.
Fill the bracketed numbers on the day of sending with the real figures
from Brevo, Instagram and TikTok. Do not round up. If a number is small,
say so; programme managers read hundreds of these and a small honest number
lands better than a vague large one.

For Plunge and Castlery, ask for the rate; it is not published. For Sweaty
Yeti, Sauna Kit Company and Select Saunas, the rate is published, so ask
only for approval, the link and photo permission.

### Day 0 — the application note

**Subject:** InteriorCleanse affiliate application

Hello, I have just applied to the [Brand] affiliate programme and wanted to introduce the site properly rather than leave it to a form. InteriorCleanse (interiorcleanse.com) is a small storefront and editorial site for a considered home: a hand-poured candle, a few objects, five books written by me, and a short partners page where I list the makers I would buy from myself, with a plain affiliate disclosure on every link. It is new. Today the email list is [N] people, Instagram is [N] and TikTok is [N]; the content is faceless room-reset and routine videos shot in my own home. I would like to list [Brand] on the partners page with a short editorial note about what you are good for. Could you let me know whether the application is approved, and if so send my tracking link, confirm whether I may use your product photography on the partner card, [and let me know the commission rate and cookie window, as I could not find them published]. Thank you for your time.

### Day 4 — first follow-up

**Subject:** Following up on our application

Hello again, a short follow-up on the InteriorCleanse application from [date]. I know applications from small sites are easy to set aside, so here is the honest position: the list is [N], the socials are [N] and [N], and the partners page is built and waiting for approved links before any card goes live, so nothing about [Brand] is published yet. What I need from you is a yes or no on approval, the tracking link if yes, a line confirming I may use your own product photographs on the card, [and the commission rate and tracking window]. If there is anything you need from me first, a media sheet or a look at the draft card, say so and I will send it the same day.

### Day 10 — closing note

**Subject:** One last note on our application

Hello, this is my last follow-up on the InteriorCleanse application, so as not to add to your inbox. If [Brand] is not taking on small partners at the moment, a one-line no is genuinely useful; I will leave the card in draft and check back in six months when the numbers are bigger. If you are still considering it, the four things I need are approval, the tracking link, permission to use your product photography, [and the commission rate]. Either way, thank you for reading, and I hope the site makes the case on its own: interiorcleanse.com/partners/.

---

## 5. Deliverability checklist for the new sending domain

1. SPF: add Brevo's include to the domain's existing SPF TXT record (`v=spf1 include:spf.brevo.com ~all` if there is no other sender; otherwise merge, never a second SPF record) and copy the exact string from Brevo's domain authentication screen.
2. DKIM: publish the DKIM record(s) Brevo shows for interiorcleanse.com, click verify in Brevo, and send a test to a Gmail address and confirm "signed-by: interiorcleanse.com" in the message headers.
3. DMARC: start with `v=DMARC1; p=none; rua=mailto:hello@interiorcleanse.com` at `_dmarc.interiorcleanse.com`; after four weeks of clean reports move to `p=quarantine`, and later `p=reject`.
4. Warm-up: the list is new, so volume is small by nature; keep the first month to the automation only, send the first monthly email to the most recent signups first and the rest a day later, and never send more in one day than the list received in signups that month.
5. Hygiene: double opt-in on the guest book (Brevo's DOI template), hard bounces and complaints blocklisted automatically, three consecutive soft bounces suppressed, role addresses (info@, admin@) excluded, and the Read only segment reviewed at 180 days as in section 1.
