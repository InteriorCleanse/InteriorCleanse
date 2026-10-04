# Start here: what only you can do

Everything that could be prepared without you is prepared: the brand, the
site, the emails, the legal drafts, the plans, the AI team. What's left needs
your name, your signature, your card, or your face. This page puts it in
order, with the answers to paste.

**Time:** about 3 hours on day 1, then 1 to 2 hours a day for the first
month. **Cash before the first production run:** about $6,000 plus the
trademark attorney's fee (details at the bottom).

## Decide first (10 minutes)

| Decision | Recommended | Why |
| --- | --- | --- |
| Company type | **LLC** in your home state | Cheap, simple, protects personal assets. Choose a Delaware C-corp only if you plan to raise money from investors (`LEGAL.md`) |
| How much you can put in | Write the number down | The model (`finance/README.md`) shows $25k works only if the pouch costs about $23 or less |
| Lean or standard first run | **Lean (144 pouches)** if Pure Private Label can make whey; otherwise the smallest run NutraSeller allows | `MANUFACTURING.md` |
| Your time zone and city | Write them in `ai-team/routines.md` and the store-lead agent | The agents schedule and search by them |
| Who writes the founder story | **You** | Four prompts in `BRAND_PLATFORM.md`, under 120 words |

## Day 1

### 1. Check the name is free (20 minutes, free)

- Search **PICKED** at tmsearch.uspto.gov in classes 5 and 32 (supplements,
  drink powders). Note anything close. The attorney decides; you're only
  looking for an obvious clash.
- Search your state's business registry for "Picked".
- Check the domains and handles (step 3 and 5) at the same time.

### 2. Form the company (30 minutes, about $50 to $500 by state)

File online at your Secretary of State's site, or use a filing service.

| Form field | Answer |
| --- | --- |
| Name | **Picked LLC**. If taken: Picked Foods LLC, then Picked Brands LLC. You can trade as "Picked" either way |
| Purpose | Sale of food and dietary supplement products |
| Registered agent | A registered agent service (about $50 to $150 a year), so your home address stays off public records |
| Management | Member-managed |
| Principal address | A virtual mailbox or the registered agent's address, not your home. Supplement labels must show a US address or phone for adverse event reports, so pick an address you'll keep |

### 3. Domains (10 minutes, about $25 a year)

Register **pickedprotein.com** (main) and **drinkpicked.com** (redirect),
two years each, with privacy protection on. Cloudflare Registrar or Namecheap.

### 4. Email (15 minutes, from about $7 a month)

Google Workspace or Microsoft 365 on pickedprotein.com. One paid user (you),
then free aliases:

| Address | For |
| --- | --- |
| hello@pickedprotein.com | Customers, stores, press. On the site and every profile |
| privacy@pickedprotein.com | Privacy requests, as named in `legal/privacy-policy.md` |
| social@pickedprotein.com | The login for every social account |
| orders@pickedprotein.com | Shopify, Pirate Ship, manufacturer, and supplier accounts |

### 5. Social accounts (90 minutes, free)

Follow `SOCIAL_SETUP.md`: same handle everywhere, two-factor on, bios and
banners ready to paste and upload.

### 6. Put the waitlist live (45 minutes, free)

- Create a free Klaviyo account. Make a list called "Waitlist".
- In `site/assets/site.js`, replace `REPLACE_WITH_PUBLIC_SITE_KEY` with
  Klaviyo's public site key (it's public by design) and
  `REPLACE_WITH_LIST_ID` with the list's ID.
- Deploy the `site/` folder (`site/README.md` shows how; Vercel or Netlify
  free tier) and point pickedprotein.com at it.
- Set up the Klaviyo sending domain and the welcome flow: `marketing/EMAIL.md`,
  section 0 first.

### 7. Post the first video (30 minutes)

`marketing/TIKTOK.md`, day 1. You, a phone, a kitchen counter.

## Week 1

| # | Do | Time | Cost | Material |
| --- | --- | --- | --- | --- |
| 8 | Get the EIN at irs.gov once the LLC is approved. Answers: responsible party = you; reason = started a new business; principal activity = retail, online sales of food and dietary supplement drink mixes; first wages = none planned | 15 min | Free | irs.gov "Apply for an EIN online" |
| 9 | Open a business bank account and card. All Picked money goes through it, nothing personal | 30 min | Free (most online business banks) | Needs the LLC papers and EIN |
| 10 | Send the manufacturer emails, NutraSeller and Pure Private Label first | 45 min | Free | `outreach/manufacturer-emails.md`, attach `outreach/formula-brief.pdf` |
| 11 | Email two or three trademark attorneys | 20 min | Free to ask | `outreach/trademark-attorney-email.md` |
| 12 | Send the packaging, lab, and label-review emails for quotes | 30 min | Free | `outreach/supplier-emails.md` |
| 13 | Register for a sales tax permit in your home state | 30 min | Usually free | Your state's revenue department. Before the first sale |
| 14 | Write your founder story | 30 min | Free | `BRAND_PLATFORM.md` |
| 15 | Book discovery calls with the manufacturers who reply | | Free | `MANUFACTURING.md`, the ten questions |

## Weeks 2 to 4

| # | Do | Cost | Material |
| --- | --- | --- | --- |
| 16 | Order flavor samples from the manufacturer who can make clear whey with real fruit | $695 at Pure Private Label, or the quoted fee | `MANUFACTURING.md` |
| 17 | Hire the trademark attorney and file PICKED in classes 5 and 32 | Attorney's fee + $350 per class | Their quote |
| 18 | Buy the GS1 US 10-item company prefix | $250, then $50 a year | gs1us.org |
| 19 | Get product liability quotes from Insurance Canopy and Veracity. Bind before the first pre-order | About $2,800 a year | `outreach/supplier-emails.md`, 4 and 5 |
| 20 | Ask a lawyer to review the `legal/` drafts (policies, subscription terms, privacy) | Quote | `legal/README.md` |
| 21 | Build the private `picked` repository with the AI team in one command: `bash docs/business/picked/ai-team/setup-picked-repo.sh ~/picked`, then push it to a new private GitHub repository | Free on your Claude plan | `ai-team/README.md` |
| 22 | When samples arrive: run the blind taste panel | About $150 | `outreach/taste-panel/` |
| 23 | Put your real numbers in the financial model: starting cash, then the pouch cost from the quotes | Free | `finance/README.md` |

After that, `LAUNCH_GUIDE.md` and `TIMELINE.md` take over: formula locked
by early December, pre-orders open January 5, first Strawberry ships late
February to mid March 2027.

## Cash before the first production run

| Item | Estimate |
| --- | --- |
| LLC filing and registered agent | $100 to $650 |
| Domains, email (2 months) | about $40 |
| Trademark filing, 2 classes (USPTO fee only) | $700 |
| Trademark attorney | their quote |
| GS1 prefix | $250 |
| Flavor samples | $695 |
| Label and claims review | $599 |
| Lab test of the production sample | $165 to $330 |
| Taste panel | about $150 |
| Product liability insurance, first year | about $2,800 |
| Shopify, first month (only when the store is built) | $39 |
| **Total** | **about $5,500 to $6,500 plus the attorney** |

Then the first run itself, which depends entirely on the quote:
`finance/README.md`.

## Already done for you

| Need | Where |
| --- | --- |
| Name, logo, colors, type, packaging concepts | `BRAND.md`, `brand/` |
| What the brand stands for: the Picked Standard | `BRAND_PLATFORM.md` |
| Website with waitlist, flavor vote, Lot Book, link page | `site/` |
| Formula spec and emails to seven manufacturers | `FORMULA_BRIEF.md`, `outreach/` |
| One-partner manufacturing plan and supply chain | `MANUFACTURING.md` |
| Packaging, lab, label review, insurance, fruit emails | `outreach/supplier-emails.md` |
| Trademark attorney email | `outreach/trademark-attorney-email.md` |
| Store pitch and sell sheet | `outreach/02-local-store-pitch.md`, `outreach/sell-sheet/` |
| 90-day marketing plan, Bloom lessons | `MARKETING_PLAN.md`, `BLOOM_LESSONS.md` |
| 30 TikTok scripts, Instagram grid, email flows, product copy | `marketing/` |
| Social account setup, bios, banners | `SOCIAL_SETUP.md`, `brand/social/profile/` |
| Legal drafts for lawyer review | `LEGAL.md`, `legal/` |
| Store stack, automations, fulfillment | `OPERATIONS.md` |
| Products after protein | `EXPANSION.md` |
| Financial model | `finance/` |
| The AI team that runs the daily work | `ai-team/` |
| Taste panel kit | `outreach/taste-panel/` |
