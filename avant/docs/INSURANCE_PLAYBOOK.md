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
  places (AVANT no longer quotes that figure: it's Turo's, not ours); New York trips default to the state minimum as of June 2026.
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

## Who to call (researched October 2026)

These place or write car-sharing cover today. Search summaries only: confirm
appetite for a pre-launch platform with each one.

| Who | What | Why them | Contact |
| --- | --- | --- | --- |
| **Liberty Mutual**, Sharing Economy & New Mobility practice | Turo's exclusive vehicle-damage provider; a dedicated vehicle-sharing practice ([LM](https://business.libertymutual.com/industries/sharing-economy-new-mobility/)) | The incumbent damage carrier for the category | business.libertymutual.com |
| **Tint** (MGA, embedded insurance) | Designs and runs embedded programmes for carshare platforms; powers Turo's off-trip host cover ([Tint](https://www.tint.ai/industries/mobility/)) | Works with startups; ask whether it places on-trip platform liability | tint.ai |
| **Roamly** (Lloyd's coverholder) | API-embedded carshare programme launched 2025 ([PRNewswire](https://www.prnewswire.com/news-releases/roamly-launches-ai-powered-carshare-insurance-following-lloyds-coverholder-appointment-and-celent-innovation-award-302533604.html)); host cover from $59/month | Built for platforms; Mobilitas among its underwriters | roamly.com |
| **Heffernan Insurance Brokers** | P2P car rental practice; host off-platform cover from $20/month ([Heffins](https://www.heffins.com/peer-to-peer-car-rental/)) | A broker that already knows the class | heffins.com |
| **Travelers E&S** | Issues Turo's third-party liability policy ([Turo](https://turo.com/us/en/car-rental/united-states/insurance)) | Reached through a broker | travelers.com |
| **Mobilitas** (CSAA) | Rideshare and carshare commercial insurer; Lyft is its anchor client ([IB](https://www.insurancebusinessmag.com/us/news/auto-motor/sharing-economy-insurer-mobilitas-launches-secures-lyft-as-first-client-241889.aspx)) | Category specialist | mobilitasinsurance.com |
| **Sedgwick**, **Gallagher Bassett** | Claims administrators (TPAs) used in the category | If the carrier doesn't bundle claims handling | sedgwick.com, gallagherbassett.com |

Dead ends: Getaround left the US in February 2025, HyreCar was absorbed into
it, and Buckle stopped writing rideshare cover in 2023.

## Colorado (Denver launch)

The **Peer-to-Peer Car Sharing Act, C.R.S. §§ 6-1-1201 to 6-1-1215**
(SB19-090) sets the rules. In short:

- **Insurance (§ 1203).** During every car-sharing period the programme must
  ensure owner and driver are insured, **primary**, with liability of **at
  least 3 × the state minimum** (Colorado's minimum is 25/50/15, so
  75/150/45), and the programme's cover must respond from the first dollar,
  with a duty to defend, if the owner's or driver's policy lapses.
- **Disclosures (§ 1210).** The agreement must state the programme's
  indemnification rights, that personal policies won't defend the
  programme's claims, that its cover applies only during the car-sharing
  period, all fees, and an emergency roadside number. *Done in the trip
  terms and coverage page; the roadside number comes from
  `AVANT_ROADSIDE_PHONE`.*
- **Lien notice (§ 1204).** Tell owners that sharing may breach a car loan or
  lease. *Done in the Host Agreement and the listing checkbox.*
- **Records (§§ 1206, 1211).** Keep each trip's times, fees and owner
  revenue for the injury limitation period, and produce them for claims.
  *Done: trip records in the database, `npm run trip-records` exports them.*
  § 1211 also asks for each driver's name, address, licence number and its
  date and place of issue. **AVANT deliberately doesn't store licence
  numbers** (see the decision below).
- **Recalls (§ 1213).** No car with an open recall. *Done: hosts attest at
  listing and must pause on a new recall.*
- **Airports (§ 1214).** No airport pickups without an agreement with the
  airport (DEN's Turo pilot: 5% of monthly revenue plus parking). *Done:
  airport delivery is switched off (`AIRPORT_HANDOFFS = false` in
  `lib/catalog.ts`) until you have one.*
- **Taxes.** Colorado sales tax and the daily vehicle rental fee (form DR
  1777; $5.23/day from January 2025, adjusted again in July 2026: confirm the
  current rate), plus Denver's short-term rental tax. A 2020 private letter
  ruling treated a platform as the lessor responsible for collecting them.

## Decisions only you (with counsel) can make

1. **Licence numbers.** § 1211 asks the programme to record each driver's
   licence number and issue details. AVANT's privacy design stores only
   eligibility facts. Options: store the number sealed in the privacy vault
   (`services/vault`, built for exactly this), or rely on the verification
   provider's record if counsel agrees it satisfies the statute.
2. **Are the protection plans insurance or a contractual damage waiver?**
   Turo sells its plans as contracts, not insurance. Counsel decides, and the
   wording in `lib/catalog.ts` and `/coverage` follows.
3. **How host physical damage is funded:** the carrier's programme, a
   self-insured retention, or a captive. Expect underwriters to ask for a
   retention or collateral from a platform with no loss history.

## What you do, in order

1. **Hire a specialist broker and Colorado counsel.** Approach Liberty
   Mutual's mobility practice, Tint, Roamly and Heffernan in parallel.
2. **Send the submission pack** (below).
3. **Bind the platform policy:** primary, at least 3 × minimum, first-dollar
   backstop, duty to defend, UM/UIM and PIP where required, physical damage
   for hosts' cars.
4. **Fill in the app** (no code change):
   - Vercel: `AVANT_INSURER_NAME`, `AVANT_POLICY_NUMBER`,
     `AVANT_ROADSIDE_PHONE`, `AVANT_CLAIMS_PHONE`, `AVANT_CLAIMS_EMAIL` (the
     adjuster's or TPA's intake address: every claim and incident report is
     sent there automatically, with the trip, both parties, the plan cap,
     the odometer readings, the words and the photos).
   - `lib/catalog.ts`: the carrier's plan prices, caps, deposits and
     liability wording; then `COVERAGE_TERMS_FINAL = true`. The "preview
     terms" notices disappear and the coverage page names the insurer and
     policy.
   - Bump the versions in `lib/legal.ts` when the final terms go in.
5. **Register** for Colorado sales tax, the DR 1777 fee and Denver tax.
6. **Buy the company policies:** general liability, cyber, errors and
   omissions.

## The submission pack

Underwriters price controls and data. Send:

- **The business:** founders, entity, launch city (Denver), launch date.
- **Projections by month for 12 months:** hosts, cars, trips, trip-days,
  gross booking value, average trip length.
- **Fleet rules:** at most 12 years old, under 130,000 miles, no open
  recalls, host-attested insurance and registration, one host per VIN
  (`lib/listing.ts`).
- **Driver controls:** licence and live-selfie verification (Stripe Identity)
  before any booking; age rules by car class (18 everyday, 21 premium, 25
  luxury and exotic, 5 years licensed for exotic); licence valid through the
  trip; server-side checks that the browser can't bypass. Ask whether they
  want MVR checks added (Checkr).
- **Trip controls:** timestamped, fingerprinted check-in and return photos;
  odometer and fuel readings at pickup and return, confirmed by both sides;
  no self-serve cancellation once a trip has started; 3 host cancellations in
  30 days pauses a host.
- **Claims process:** host reports within 3 days with photos; guest responds
  within 72 hours; guest accident and breakdown reports during the trip; every
  report forwarded to the claims desk automatically; no charge before review;
  guest liability capped by plan.
- **Data you can give them:** the trip-records CSV (`npm run trip-records`).
- **Loss history:** none (new platform); say so and lean on the controls.

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
- **Claims.** Hosts report from the trip page within 3 days, with photos;
  guests see it, get 72 hours to respond, and never pay more than their
  plan's cap. Guests report accidents and breakdowns during the trip, with
  the police report number and the other driver's details. Every report goes
  to `AVANT_CLAIMS_EMAIL`; reports nobody answered are escalated by the daily
  cron. Nothing is charged by the app.
- **Trip records.** Odometer and fuel at pickup and return, entered by one
  side and confirmed by the other, with mileage against the allowance.
- **After an accident.** `/help/accident` walks guests through it, with 911,
  roadside and claims numbers.

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
