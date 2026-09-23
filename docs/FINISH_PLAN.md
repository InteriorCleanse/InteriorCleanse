# Finishing InteriorCleanse — the plan, in order

Written 2026-09-14 against the catalog as it stands. Every step names who does
it and what "done" looks like. Steps are ordered by what unblocks what.

## Where things actually stand

| Fact | Consequence |
| --- | --- |
| The site, admin, pipeline, posters, and clips are live on `main` and deployed. | The build is finished. What remains is commerce, not code. |
| Five products are `published` with Stripe **test-mode** Price IDs. | Checkout works in test mode. No real money can move yet. |
| All five carry **stock photographs** from Unsplash, not photos of the products. | Product pages show someone else's candle. Imagery is a blocker for launch. |
| All five have `fulfillment: manual` and **no Printful variant ID**. | A paid order is recorded by Stripe and **never sent to Printful**. Someone would have to fulfil it by hand. |
| Five partner records exist; every affiliate link is `PENDING_APPROVAL`. | `/partners` shows "Coming soon" on every card. No revenue possible from it yet. |
| Twenty draft shells exist across books, digital, merch, cleaning. | Names, prices, images, and links to fill in the admin. |
| `GITHUB_TOKEN` may or may not be set in Vercel. | Without it, admin saves in production report the blocker instead of saving. Check the banner on `/admin/products`. |

---

## Step 1 — Make the admin able to save (10 minutes, you)

1. github.com → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token (classic) → tick **`repo`** → generate → copy.
2. Vercel → `interior-cleanse-cr2t` → Settings → Environment Variables → `GITHUB_TOKEN` → paste → all environments → Save → Deployments → Redeploy.
3. Open `/admin/products`. The banner must read "Edits commit to InteriorCleanse/InteriorCleanse@main".

Done when: you change a product's name in the admin and a commit by `InteriorCleanse Admin` appears on GitHub within a minute.

---

## Step 2 — Create the products on Printful (about an hour, you; I finish the site side)

The five merch products need to exist in your Printful store so orders flow
there. The candle is not a Printful product; see 2b.

### 2a. Printful merch — tote, mug, hoodie, art print

For each, in the Printful dashboard → Stores → your store → **Add product**:

| Site product | Printful product to pick | Design file you need | Notes |
| --- | --- | --- | --- |
| InteriorCleanse Tote Bag (`ic-linen-tote`) | Eco Tote Bag or Organic Cotton Tote, natural colour | **Ready:** `print-files/tote-front-3600x4200.png` (12×14 in at 300 dpi, ink mark over wordmark, transparent) | Rendered from the brand vector by `npm run print:files` |
| InteriorCleanse Ceramic Mug (`ic-ceramic-mug`) | White Glossy Mug 11 oz | **Ready:** `print-files/mug-wrap-2700x1050.png` (Printful's 11 oz template size; wordmark one side, mark the other) | Drop it on the template; the handle gap is already left clear |
| InteriorCleanse Premium Hoodie (`ic-premium-hoodie`) | Premium Eco Hoodie or Unisex Heavy Blend, charcoal | **Ready:** `print-files/hoodie-chest-1500.png` (5×5 in tonal charcoal mark, left chest); `mark-bone-3000.png` if you want it visible instead | Pick 3–4 sizes to start |
| The Considered Home Print (`considered-home-art-print`) | Enhanced Matte Paper Poster, 18×24 | **Proposal:** `print-files/considered-home-print-18x24.png` (5400×7200, warm-neutral plan of rooms on bone) | This is a design proposal, not a decision. Approve it, ask for a different direction, or supply your own artwork; do not publish the print until you have chosen |

For each: upload the design → position it → pick variants → **set the retail
price** (Printful shows cost; the site's current prices are $28 / $26 / $58 /
$42) → save. Printful generates the mockups.

Then on the site:

1. Vercel → Environment Variables → `PRINTFUL_API_KEY` (Printful → Settings → Stores → API) and `PRINTFUL_STORE_ID`. Redeploy.
2. `/admin/products` → **Sync from Printful**. Each Printful product arrives or attaches to its record with the variant ID and mockup images.
3. Open each record: confirm the price, click **Create Stripe Price** (still test mode until Step 6), set the hero image to the mockup you like, **Save**, **Publish**.

Done when: each merch record shows `fulfillment: printful` and a variant ID in the editor, and a test checkout produces an order in Printful's dashboard (Printful → Orders, it will show as a draft in test mode).

### 2b. The candle (`ic-signature-candle`)

Hand-poured means you fulfil it. Two honest options:

- **You ship it.** Keep `fulfillment: manual`. Orders arrive in the Stripe dashboard and in the admin's Orders tab; you post them. Fine at launch volume.
- **A candle fulfiller.** If you use one later, add its link the same way.

Either way the candle needs a real photograph; see Step 3.

### 2c. Products that should not be published yet

Anything without a design file (probably the art print) goes back to
`needs-assets` in the admin until the design exists. A published product with
a stock photo is a promise the site cannot keep.

---

## Step 3 — Real product imagery (half a day, mostly me once references exist)

The rule: **no invented products.** Generated imagery is fine when it shows a
product that exists, made from a reference of that product. Until a reference
exists, nothing is generated.

References, per product:

| Product | Reference that unlocks imagery |
| --- | --- |
| Tote, mug, hoodie, print | Printful mockup PNGs from Step 2 (or a photo of a sample order, better) |
| Candle | Three phone photos of the actual candle on a plain background: front, three-quarter, top |

Then, per product, in this session:

1. Upload the reference via `/admin/products` → hero. Click **Cut out background** to get the transparent version for the pedestal.
2. I run Higgsfield **Marketing Studio** with the product reference to produce a set of lifestyle and UGC-style images — the object in the matching environment (candle in the atrium, mug in the atelier, print in the gallery), handheld phone-camera framing for the UGC set, no people's faces, no text. Roughly 4–8 credits per image; budget ~150 credits for the five products.
3. You pick; I upload the picks as hero and gallery through the admin, so they land in the repo and deploy.

Done when: no published product carries an Unsplash URL. (`/admin/products` — every hero should start with `/products/`.)

---

## Step 4 — Fill the twenty drafts (ongoing, you, in the admin)

Open each draft, set the fields, and the panel tells you what still blocks
publishing. Guidance per group:

- **Books (5, Amazon)**: your KDP titles. Name, description, cover image, the
  Amazon URL, price shown "from". Environment: library.
- **Digital (5, Gumroad)**: the wallpaper and printable sets. Create the Gumroad
  product first, paste the URL, click **Check** to confirm it resolves. Price
  and cover from Gumroad. Environment: gallery.
- **Merch (5, Printful)**: more Printful designs when you have them. Same path
  as Step 2.
- **Cleaning (5, affiliate)**: the TikTok Shop / Amazon picks. Affiliate URL
  is the tracking link; hero is a photo you are licensed to use (the
  programme's creative, or your own). Environment: cleaning.

Delete any shell you will not use. Drafts never appear publicly, so there is no
rush and no harm in leaving them.

---

## Step 5 — Affiliate partners: the calls and emails (you, this week)

All five applications are submitted. The ask now is approval and a tracking
link. What each programme knows about you is what is on your site, so make
the `/partners` page and the `/pavilion` environment your evidence.

### What to have ready before any call

- The live URL of `/partners/` and one product page, so they see the placement.
- Your audience, truthfully: platform, follower count, what you post. If it is
  early, say so; programmes approve small creators who post consistently.
- Where their product will appear: a dedicated partner card with an editorial
  note, in the wellness pavilion environment, plus content on your socials.
- What you want from them: approval, your tracking link, permission to use
  their product photography, and ideally a discount code for your audience.

### Per partner

| Partner | Where to reach them | The ask | Commission on record |
| --- | --- | --- | --- |
| **Sweaty Yeti** | https://sweatyyetisauna.com/affiliates/ (Solid Affiliate programme) | Approval + link. Ask whether they supply lifestyle photography. | Flat $1,500 per sauna, paid monthly after refund period |
| **Sauna Kit Company** | https://saunakitco.com/pages/sauna-affiliate-program | Approval + link; ask about their creative kit. | 5.5%, typical $385–$550 per sale |
| **Select Saunas** | https://selectsaunas.com/pages/affiliate-program | Approval + link; mention HSA/FSA via TrueMed as a talking point for your audience. | 5% |
| **Plunge** | https://plunge.com/pages/partnerships | Approval + link; **ask the rate**, it is not public. Do not quote one on the site until they state it. | Unknown |
| **Castlery** | https://castlery.com/us/affiliate-program | Approval + link; **ask the rate**; note the 30-day tracking window. | Unknown |

### Email template (adjust the bracketed parts; send from your domain address)

> Subject: InteriorCleanse × [Brand] — affiliate application follow-up
>
> Hi [Name / team],
>
> I applied to the [Brand] affiliate programme on [date] and wanted to put a face to it. I run InteriorCleanse (interiorcleanse.com), a home and wellness editorial shop built around the idea that a well-kept home is the foundation of a well-kept life. [Brand] is one of five partners I've chosen for the wellness pavilion — you can see the placement, with an editorial note I wrote about why, at interiorcleanse.com/partners/.
>
> My audience: [platform], [count] followers, posting [cadence] about [topics]. It's [early / growing]; I'd rather tell you that than inflate it.
>
> If approved, I'd like: my tracking link, permission to use your product photography on the partner card, and if you offer one, a code for my readers.
>
> Two quick questions: [for Plunge and Castlery: what is the commission rate?] [for all: do you have a creative kit?]
>
> Thank you — happy to jump on a call if that's easier.
>
> [Your name]
> InteriorCleanse · interiorcleanse.com

### Phone script, if you call

1. Who you are, one sentence. 2. That you've applied and where they'll appear (send the link while talking). 3. Audience, honestly. 4. The three asks. 5. For Plunge and Castlery, the rate. 6. Thank them and confirm the email you'll follow up to.

### When a link arrives

`content/partners.json` → that partner's `affiliateLink` → paste the URL, set
`applicationStatus` to `approved`. Or in the admin: open `partner-<id>`, paste
into **Affiliate URL**, Save, then Publish once it has an image. The card flips
from "Coming soon" to a live link on the next deploy.

---

## Step 6 — Go live with money (one sitting, you, after Steps 2–3)

1. Stripe dashboard → switch to **live** mode → Developers → API keys.
2. Vercel → `STRIPE_SECRET_KEY` = the live `sk_live_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_…`.
3. Run `npm run stripe:setup -- --apply` locally with the live key **or** click **Create Stripe Price** on each published product in the admin; either writes live Price IDs into the catalog.
4. Stripe → Webhooks → add endpoint `https://interiorcleanse.com/api/webhook/` — **with the trailing slash** — for `checkout.session.completed`; copy the signing secret into Vercel as `STRIPE_WEBHOOK_SECRET`.
5. Stripe Tax → enable, set origin address; or turn `automatic_tax` off in the checkout route.
6. Redeploy. Buy the cheapest product with a real card, refund it, and check: Stripe order, Printful order (for merch), Brevo contact if `BREVO_API_KEY` is set.

---

## Step 7 — Keep it measured (me)

- `npm run check:contrast` runs in the asset workflow; every surface passed on the real photographs (worst 4.60:1).
- Scroll performance is being profiled now; see `docs/LAUNCH_PLAN.md` for the result when it lands.
- Lighthouse on the live URL once imagery is real: target LCP < 2.5 s, CLS < 0.1, homepage JS < 200 KB (currently 119 KB).

---

## What not to do

- Do not publish a product with a stock photograph or without a fulfilment path.
- Do not quote a commission rate for Plunge or Castlery until they state one.
- Do not paste live Stripe keys anywhere but Vercel.
- Do not fill the draft shells with invented products to make the shop look fuller.
