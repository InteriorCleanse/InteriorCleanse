# Picked legal and compliance checklist

**General information, not legal advice.** Use this to brief a business
lawyer and a label consultant, and to keep track of what's done. Items marked
**VERIFY** changed recently or are still pending as of October 2026. Drafts
of the documents themselves are in `legal/`. Sources are linked inline.

## Before the first sale

### The company

- [ ] **Entity.** Bootstrapping: an LLC in your home state is simplest.
      Planning to raise money from investors: a Delaware C-corp, which
      investors prefer and which can qualify for the QSBS tax exclusion on
      stock (up to 100% of the gain after 5 years, for stock issued after
      July 4, 2025) ([Baker Tilly](https://www.bakertilly.com/insights/changes-to-section-1202-qualified-small-business)).
      An LLC can convert later, at some cost. A Delaware company also
      registers as a foreign entity in your home state.
- [ ] **EIN**, free and immediate from the [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number).
      Never pay an "EIN service".
- [ ] **Registered agent** in the state of formation.
- [ ] **City or county business license** or home-occupation permit. **VERIFY**
      locally.
- [ ] **Business bank account** in the company's name.

### Sales tax

- [ ] **Home-state sales tax permit** before the first sale.
- [ ] **Know whether you collect.** Supplement-labeled products (Supplement
      Facts) are taxable in many states, California included, and largely
      exempt in about 10 (including FL, NY, TX, NJ). Food-labeled products
      (Nutrition Facts) are often exempt as groceries
      ([TaxJar](https://www.taxjar.com/blog/sales-tax-by-states-are-dietary-supplements-taxable)).
      **The supplement-or-food label decision changes your tax.**
- [ ] **Other states:** you owe tax there once your sales cross that state's
      economic threshold, usually $100,000 (California, New York, and Texas use
      $500,000) ([Kintsugi](https://trykintsugi.com/sales-tax-guides/usa/economic-nexus)).
      Stock in an Amazon warehouse creates nexus in that state from day one.
      Amazon and TikTok Shop collect tax on their own sales.
- [ ] **Shopify Tax** calculates tax and flags thresholds. It does **not**
      file returns. File yourself or pay a service once you're in more than
      one state.
- [ ] **Resale certificates:** give one to suppliers so you don't pay tax on
      inventory. Collect one from every store that buys wholesale.

### The product

- [ ] **Supplement or food, per product.** The label decides it. Words like
      "drink", "beverage", or "water" push a product toward food
      ([FDA 2014 guidance](https://www.fda.gov/files/food/published/Guidance-for-Industry--Distinguishing-Liquid-Dietary-Supplements-from-Beverages-(PDF).pdf)).

      | Product | Likely category |
      | --- | --- |
      | Protein powder | Either. Current plan: supplement |
      | Hydration drink mix | Either; "drink mix" leans food. **VERIFY** with counsel |
      | Creatine | Supplement |
      | Collagen | Either. Collagen scores 0 for protein quality, so no protein %DV claims |
      | Greens | Supplement. Check each botanical for new-ingredient status |
      | Ready-to-drink | Conventional beverage |

- [ ] **If a supplement:** you are responsible for cGMP (21 CFR 111) even
      when someone else makes it. FDA says a brand "cannot contract out its
      ultimate responsibility." That means written specifications, a release
      decision for every lot, a quality agreement, complaint handling, and
      records ([eCFR Part 111](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-111)).
- [ ] **Label review** by a consultant: facts panel, ingredient list, "Contains:
      Milk", net weight, flavor name under 21 CFR 101.22(i), protein %DV
      corrected by PDCAAS, US address or phone for adverse event reports, and
      the FDA disclaimer if any structure/function claim is made.
- [ ] **Ingredient status:** get a written statement from each supplier that
      the ingredient is not a new dietary ingredient, or is GRAS. A new one
      needs FDA notice 75 days before sale
      ([FDA](https://www.fda.gov/food/dietary-supplements-guidance-documents-regulatory-information/dietary-supplement-labeling-guide-chapter-vii-premarket-notification-new-dietary-ingredients)).
- [ ] **Manufacturing agreement and quality agreement** signed. See
      `legal/supply-agreement-term-sheet.md`. You own the formula and artwork.
- [ ] **Lot testing:** a certificate of analysis for every lot, plus your own
      independent heavy-metal and microbiology test on the first lot.
- [ ] **Product liability insurance** in force: typically $1M per claim,
      $2M total, roughly $1,500 to $3,500 a year for a low-risk powder
      ([Insurance Canopy](https://www.insurancecanopy.com/blog/supplement-liability-insurance)).
      Get three quotes.
- [ ] **Trademark** filed: $350 per class (classes 5 and 32 first) after a
      clearance opinion ([Reed Smith](https://www.reedsmith.com/articles/uspto-announces-trademark-fee-increases-effective/)).

### The store

- [ ] **Subscriptions built to California's rules, the strictest**
      ([Barnes & Thornburg](https://btlaw.com/en/insights/alerts/2025/california-expands-automatic-renewal-law-new-requirements-now-in-effect)):
      terms shown next to the subscribe button; a **separate, unchecked
      consent box** for auto-renewal; a confirmation email with the terms and
      how to cancel; **online cancellation**; annual reminders; 7 to 30 days'
      notice of a price change; consent records kept 3 years. New York
      requires cancelling to be as easy as signing up and a renewal reminder
      15 to 45 days ahead for some plans
      ([FKKS](https://advertisinglaw.fkks.com/post/102kfm1/new-yorks-sfy-2025-26-budget-a-new-era-of-consumer-protections)).
      **VERIFY** which of your plans trigger the reminder. The federal
      "click-to-cancel" rule was struck down in July 2025, but ROSCA still
      applies and the FTC restarted rulemaking in March 2026
      ([Gibson Dunn](https://www.gibsondunn.com/ftc-restarts-negative-option-rulemaking-after-eighth-circuit-vacatur-enforcement-under-rosca-continues/)).
      Draft: `legal/subscription-terms.md`.
- [ ] **Policies published:** terms, privacy, shipping and returns,
      subscription terms (drafts in `legal/`).
- [ ] **Washington consumer health data policy.** Washington's My Health My
      Data Act has no size threshold and lets consumers sue. Supplement
      purchases can count as health data
      ([Cooley](https://cdp.cooley.com/washington-states-my-health-my-data-act-faq-part-one-applicability-and-scope/)).
      Draft: `legal/consumer-health-data-policy.md`. Keep ad pixels off
      product pages until a lawyer has reviewed them.
- [ ] **Accessibility:** Shopify stores are the most-sued platform in website
      accessibility cases ([Clym](https://www.clym.io/blog/accessibility-lawsuits-2025-small-business-websites)).
      Check the theme against WCAG 2.1 AA before launch.
- [ ] **Pre-orders:** state a real ship date. If it slips, email before it
      passes with a new date and the option to cancel for a full refund
      ([FTC Mail Order Rule](https://ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule)).
- [ ] **Prices:** no "was $X" strike-throughs unless that price was really
      charged for a meaningful period ([16 CFR 233](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-233)).
- [ ] **Email:** working unsubscribe, honored within 10 business days, and a
      postal address in every email ([FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)).
- [ ] **Text messages:** prior express written consent before any marketing
      text. Respect state quiet hours (Florida, Oklahoma, and others). Let the
      SMS tool handle both.

### Claims and creators

- [ ] **Every claim has proof on file.** Health claims need competent and
      reliable scientific evidence, generally human trials of the same
      ingredient at the same dose
      ([FTC](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance)).
      Picked's claims are about taste, fruit content, and protein grams, which
      the formula and lab results prove. Keep it that way.
- [ ] **Creators:** a written agreement (`legal/creator-agreement.md`) with a
      clear disclosure on every post and no health claims. Fake, bought, or
      hidden reviews are illegal under the FTC's review rule
      ([FTC](https://www.ftc.gov/system/files/ftc_gov/pdf/r311003consumerreviewstestimonialsfinalrulefrn.pdf)).
- [ ] **No "Made in USA"** unless all or virtually all of it is. Imported whey
      or fruit powders rule out an unqualified claim
      ([FTC](https://www.ftc.gov/business-guidance/resources/complying-made-usa-standard)).

## Creatine and anything "muscle": age limits

- **New York** bans selling supplements marketed for weight loss or
  muscle building to anyone under 18, and online sellers must check ID at
  delivery. **Creatine is covered. Protein powders are exempt** unless they
  contain a covered ingredient such as creatine. Penalties up to $500 per sale
  ([NY Senate](https://www.nysenate.gov/legislation/laws/GBS/391-OO),
  [Polsinelli](https://www.polsinelli.com/publications/what-to-know-about-new-yorks-new-supplement-law-going-into-effect-this-month)).
  A Supreme Court challenge was set for conference on September 28, 2026.
  **VERIFY** the outcome.
- **California AB 2030**, signed September 28, 2026, adds a similar ban,
  likely from January 1, 2027, with age checks by database or adult-signature
  delivery. Whether protein is exempt is **not confirmed**
  ([Nutritional Outlook](https://www.nutritionaloutlook.com/view/california-governor-signs-ab-2030-restricting-minors-access-diet-supplements)).
- Similar bills are pending in other states.

**What Picked does:** never describe the protein as "muscle building" (it's
about taste and fruit). Before selling creatine, add an age check at checkout
and adult-signature delivery for New York and California orders, or don't
ship creatine to those states. Re-check this list every quarter.

## Within 90 days of launch

- [ ] File the FDA structure/function notice within 30 days of first use of
      any such claim (only if you make one).
- [ ] Adverse event log running (`legal/adverse-event-sop.md`): serious events
      reported to FDA within 15 business days, records kept 6 years
      ([FDA](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-questions-and-answers-regarding-adverse-event-reporting-and-recordkeeping-dietary)).
- [ ] Mock recall done (`legal/recall-plan.md`).
- [ ] Prop 65 decision made with lot results in hand. Businesses under 10
      employees are exempt from the warning duty, but retailers and Amazon
      will still ask ([OEHHA](https://www.p65warnings.ca.gov/business-resources/frequently-asked-questions-businesses)).
- [ ] Track: California SB 1033 (heavy-metal testing and disclosure for
      protein, from 2028 if passed; **VERIFY**), AB 2030's start date, the
      New York case, new state age laws, and the FTC subscription rulemaking.

## Before Amazon, TikTok Shop, or retail

- [ ] Amazon: third-party verification of COAs and cGMP by an approved lab
      such as NSF, UL, or Eurofins
      ([NSF](https://www.nsf.org/knowledge-library/amazon-new-dietary-supplements-policy-enhancing-safety-compliance)).
- [ ] TikTok Shop: an invitation to the supplement category, an ISO 17025 lab
      COA, cGMP or FDA registration proof. Weight-management products are
      banned there ([TikTok](https://seller-us.tiktok.com/university/essay?knowledge_id=1411277869713198&lang=en)).
- [ ] Retail: insurance certificate naming the retailer, vendor agreements,
      GS1 barcodes, lot and expiry coding, an FDA-registered 3PL.

## Before a ready-to-drink beverage

- [ ] A neutral-pH protein shake is a low-acid canned food (21 CFR 113); an
      acidified one falls under Part 114. The co-packer files its plant
      registration and process filing with FDA before packing, using a
      qualified process authority
      ([FDA](https://www.fda.gov/media/86047/download)). Get copies.
- [ ] Container deposit laws in 10 states. Check California's CRV rules with
      CalRecycle before launch ([NCSL](https://www.ncsl.org/environment-and-natural-resources/state-beverage-container-deposit-laws)).
- [ ] Avoid the additives on Texas's warning list in any food-labeled product
      ([HLC](https://www.hlc.com/en/publications/court-temporarily-blocks-enforcement-of-texas-sb-25s-warning-label-requirement)).

## Questions for the lawyer

1. LLC or Delaware C-corp, given our funding plans?
2. Supplement or food for protein and for the hydration mix, considering tax
   and claims?
3. Does California AB 2030 exempt protein, and when does it start?
4. Which of our subscription plans trigger New York's renewal reminder?
5. Review all drafts in `legal/` and our creator brief.
