# Insurance, in plain English

This is the founder's guide to the insurance side of AVANT: what you need,
how Turo does it, the order to do things in, and what the app already
handles. It is not legal or insurance advice. Every step below ends with a
licensed broker and a lawyer signing off.

## The whole thing in one minute

A car sharing trip needs three kinds of cover:

| Layer | What it pays for | Who must provide it | In AVANT |
| --- | --- | --- | --- |
| **Liability** | Other people and their property when the guest causes a crash | The platform, during the trip, by state law in most states | Included on every trip, never optional |
| **Physical damage** | The host's car | Usually the platform's program; the guest's plan sets how much the guest pays | The three plans: Zero, Plus, Essential |
| **Your company's own cover** | Lawsuits against AVANT itself, data breaches, errors | You | Buy before launch (general liability, cyber, errors and omissions) |

The guest makes exactly one decision: **the most they'd pay if the car is
damaged**. $0, $500 or $2,500. Everything else follows from that.

## How Turo does it

- All Turo trips carry third-party liability under a policy issued to Turo
  by **Travelers Excess and Surplus Lines Company**, up to $750,000 in most
  places; New York trips default to the state minimum as of June 2026.
  ([Turo](https://turo.com/us/en/car-rental/united-states/insurance),
  [Turo help](https://help.turo.com/en_us/protection-plans-including-insurance-or-us-guests-HkwgBNgN9))
- Guests pick Premier ($0 out of pocket), Standard ($500 cap, $500 deposit)
  or Minimum ($3,000 cap, state-minimum liability). Premier is reported at
  65–100% of the daily trip price, with a $14/day minimum.
  ([ride-share.com](https://ride-share.com/turo-protection-plans-explained/),
  [Turo help](https://help.turo.com/en_us/summary-and-cost-of-protection-plans-or-us-guests-BJSgBNgVq))
- Hosts pick an "earnings plan" that trades their share of the trip price
  (reported at 70%, 80% or 90%) against how much damage cover they get.
  ([Rentovation](https://rentovation.co/guides/how-much-does-turo-take))
- Credit cards mostly don't help guests: Amex and Chase Sapphire explicitly
  exclude peer-to-peer rentals.
  ([The Points Guy](https://thepointsguy.com/travel/turo-car-rental-insurance/),
  [Thrifty Traveler](https://thriftytraveler.com/news/credit-card/turo-credit-card-car-rental-insurance/))

## What you do, in order

### Phase 0: now, before any real trip

1. **Hire a broker who already places car sharing programs.** Search results
   show mobility practices at [Aon](https://www.aon.com/unitedkingdom/insights/peer-to-peer-car-sharing-insurance),
   [Heffernan](https://www.heffins.com/peer-to-peer-car-rental/) and
   [Liberty Mutual](https://business.libertymutual.com/insights/three-keys-to-successful-car-sharing-and-the-role-of-insurance/);
   ask for two or three quotes. A broker, not a single insurer, because the
   program is custom.
2. **Ask for a "peer-to-peer car sharing program" commercial auto policy**
   covering, during the car sharing period: primary liability at the limits
   each launch state requires (California requires at least three times the
   state minimum), uninsured/underinsured motorist and PIP where required,
   and physical damage (sometimes called contingent collision) for hosts'
   cars. Ask what deductible and per-trip price structure they'll accept, so
   you can set the three guest plans on top.
3. **Hand them an underwriting pack.** Underwriters price the controls, so
   show them the ones already built:
   - licence + live-selfie verification before any booking (Stripe Identity);
   - age rules by car class, young driver fee, licence-validity checks;
   - timestamped check-in and check-out photos;
   - server-side eligibility checks that cannot be bypassed from the browser;
   - planned: motor vehicle record (MVR) checks through Checkr, about $9.50
     each plus state fees ([Checkr](https://checkr.com/pricing)), and
     continuous monitoring for repeat guests.
4. **Buy the company policies**: general liability, cyber (you hold driver
   data), and errors and omissions. These are ordinary small-business
   policies.

### Phase 1: pilot in one state

- Launch in one state with one carrier-signed program. Choose a state whose
  peer-to-peer statute is clear (most follow the NCOIL model act; see
  `LEGAL_BRIEF.md`).
- Replace the placeholder numbers in `lib/catalog.ts` (`COVERAGE_PLANS`) with
  the carrier's: percentage of trip, daily minimum, maximum out of pocket,
  deposit and liability limit. Then set `COVERAGE_TERMS_FINAL = true`; the
  "preview terms" notices disappear across the site.
- Hosts: tell them clearly that their personal policy likely does not cover
  sharing. In California a compliant program means their insurer may not
  cancel them for sharing
  ([Cal. Ins. Code § 11580.24](https://codes.findlaw.com/ca/insurance-code/ins-sect-11580-24/)).
  Several insurers sell host "carshare" endorsements for roughly $10–$40 a
  month; Allstate has one aimed at Turo hosts
  ([Insurance.com](https://www.insurance.com/auto-insurance/car-insurance-for-turo/)).

### Phase 2: scale

- Add states one at a time; each adds its own limits, taxes and disclosures.
- Turn on continuous MVR monitoring for frequent guests and hosts.
- Use your own loss data to renegotiate the program after 6–12 months.

## What the checkout already does

- **Liability is always included.** It is not a plan feature the guest can
  remove.
- **Three plans, one number each.** The picker shows the cap in large type
  and the exact price for this trip beside it, plus any refundable hold.
- **No booking without a Driver Pass.** Age, licence validity through the
  trip, and years licensed are checked on the server at checkout, not just in
  the browser.
- **Young drivers.** Everyday cars from 18, premium from 21, luxury and
  exotic from 25 (exotic also needs five years licensed). The fee is
  $29/day capped at $199 a trip for 18–20 and $19/day capped at $129 for
  21–24, halved with a verified clean record. For comparison, Turo's fee is
  reported at $50/day at 18 and $30/day from 21
  ([Ridester](https://www.ridester.com/turo-young-driver-fee/)), and Avis
  charges $84/day at 18–20 in New York
  ([LegalClarity](https://legalclarity.org/new-york-car-rental-age-laws-and-young-renter-policies/)).
  Adjust these in `lib/catalog.ts` if your carrier asks.
- **Deposits** are holds, not charges, released within 48 hours.
- **Claims fairness.** Guests see the host's photos and an itemised estimate
  and get 72 hours to respond; they never pay more than their plan's cap.

## Questions to ask every broker

1. Will the policy be primary during the car sharing period in every state
   we launch, and does it satisfy each state's P2P statute?
2. What liability limits, and do they meet California's three-times-minimum?
3. How is physical damage covered: per trip, per vehicle, or aggregate? Any
   vehicle value or age caps?
4. How is premium charged: percentage of trip revenue, per trip-day, or a
   minimum annual premium?
5. Which driver checks do you require: identity, MVR, credit, telematics?
6. Who handles claims (a third-party administrator?) and what are the
   response-time commitments we can publish?
7. Are loss of use, diminished value and admin fees recoverable from guests,
   and are there state limits on them?
8. Does the program cover airport pickups, and do the airports we want
   require their own permits?
