# Legal brief: peer-to-peer car sharing in the US

Research summary for counsel, not legal advice. Sources linked inline;
anything marked *to confirm* came from secondary sources.

## The framework most states follow

- **NCOIL Peer-to-Peer Car Sharing Program Model Act**, adopted December 13,
  2019 and amended April 18, 2021, with an updated draft published July 2026.
  The core rule: the platform must ensure the owner and driver are insured
  during each car sharing period at no less than the state's minimums, and
  must assume the owner's liability to third parties during that period.
  ([NCOIL](https://ncoil.org/2020/02/03/ncoil-adopts-peer-to-peer-car-sharing-program-model-act/),
  [2021 text](https://ncoil.org/wp-content/uploads/2021/04/NCOIL-P2P-Car-Sharing-Model-Amended-4-18-21.pdf),
  [July 2026 draft](https://ncoil.org/wp-content/uploads/2026/07/NCOIL-P2P-Model-July-2026.pdf))
- About 34 states have passed or proposed P2P legislation; some (Idaho,
  Montana, Wyoming) have none, and Maine applies rental-car rules to P2P
  programs. *To confirm state by state.*
  ([National Academies](https://www.nationalacademies.org/read/27983/chapter/7))
- The model act also covers the program agreement's disclosures, record
  keeping, driver's licence verification, safety recalls and airport
  arrangements. Counsel should map each to the launch state's enacted text.

## California

[Cal. Ins. Code § 11580.24](https://codes.findlaw.com/ca/insurance-code/ins-sect-11580-24/):

- The program assumes all of the owner's liability while the car is shared.
- Liability cover must be at least three times the state minimum.
- The program must keep verifiable electronic records of date, time, start
  and end location and miles driven for each trip.
- The owner's insurer may not cancel or non-renew solely because the car is
  shared through a compliant program.

## Taxes and fees

- **Virginia** taxes P2P car sharing at 7% (since July 2021); the platform
  collects it. ([Virginia Tax](https://www.tax.virginia.gov/peer-peer-vehicle-sharing-tax))
- **Maryland** applies 8%, or the 11.5% rental rate to hosts with 10+
  vehicles. ([Tax Foundation](https://taxfoundation.org/research/all/federal/car-sharing-taxes/))
- **Colorado** subjects car sharing to airport concession fees.
  ([Tax Foundation](https://taxfoundation.org/research/all/federal/car-sharing-taxes/))
- Other states vary; the app applies a per-city rate today
  (`content/fleet.json`). Before launch, use a tax engine or a
  state-by-state table from your accountant. ([Baker Institute](https://www.bakerinstitute.org/research/how-do-states-tax-peer-peer-car-sharing))

## Drivers and age

- Turo's US minimum age is 18, with a young driver fee for 18–24.
  ([Turo help](https://help.turo.com/age-requirements-for-drivers-HJXlV4l45))
- New York and Michigan require rental companies to rent from 18 and allow
  higher underage surcharges there. Whether that reaches P2P platforms is a
  question for counsel. ([Avis](https://www.avis.com/en/help/usa-faqs/age-requirements),
  [LegalClarity](https://legalclarity.org/new-york-car-rental-age-laws-and-young-renter-policies/))
- AVANT's rules are in `lib/eligibility.ts`, with a `STATE_RULES` table for
  overrides.

## Privacy

- Driver's licence data is sensitive personal information under several
  state privacy laws. AVANT minimises it by design (see `SECURITY.md`): it
  stores age, licence validity and a clean-record flag, never the licence
  number, date of birth or images, and asks the verification provider to
  redact after the check.
- Needed before launch: a final privacy policy (the draft is at
  `/legal/privacy`), a data processing agreement with each vendor (Stripe,
  Anthropic, Checkr, the insurer's claims administrator), and a breach
  response plan.

## Ten things to have done before the first real trip

1. Carrier-signed P2P program policy in each launch state.
2. Program agreement with every disclosure the state statute lists.
3. Host terms covering recalls (no car with an open safety recall), vehicle
   age and mileage limits, and maintenance.
4. Trip records retained as the statute requires (California: date, time,
   locations, miles).
5. State and local tax registration and collection.
6. Airport permits where pickups or deliveries happen.
7. Final privacy policy, vendor data processing agreements, breach plan.
8. Trademark clearance for the name (see the note in `README.md`).
9. Company insurance: general liability, cyber, errors and omissions.
10. A documented claims and dispute process that matches what the site
    promises (72-hour response window, evidence shown to the guest).

## What the app already does for you

- **Clickwrap records.** Sign-up requires ticking "18 or older" and the terms
  and privacy notice; booking requires the trip terms; listing requires the
  Host Agreement. Each acceptance is stored with the document version, the
  time and the trip or listing (`consents` table, `lib/legal.ts`), kept after
  an account closes, and included in the person's data export.
- **All-in price.** The checkout total includes every mandatory fee before
  the guest pays; taxes are their own line.
- **Privacy rights.** Download-my-data and close-my-account are in the app
  (Profile), which covers access and deletion requests and the App Store's
  in-app deletion rule. The retention schedule is in `SECURITY.md`.
- **Minimised identity data**, field encryption and email verification, as
  described in `SECURITY.md`.

## Checklist for counsel

Each item is a question for a licensed attorney in the launch state. The
drafts are written to make their review fast, not to replace it.

1. **State P2P car sharing law** in each launch state: the program agreement
   disclosures, insurance assumption, record keeping, recalls and airport
   rules, mapped to `/legal/terms` and `/legal/host`.
2. **Insurance:** carrier-signed program; coverage text replaces the
   placeholders; `COVERAGE_TERMS_FINAL` set true only then.
3. **Terms of Service:** complete the bracketed sections (legal entity,
   limitation of liability, disclaimers, indemnity, governing law, venue).
   Decide on **arbitration and a class-action waiver**, and if adopted, a
   mass-arbitration protocol and an opt-out window.
4. **Pricing law:** California SB 478 (all-in pricing, in force since July
   2024) and the FTC's rule on unfair or deceptive fees: confirm the checkout
   total and the search price display satisfy both.
5. **Privacy:** final privacy notice; CCPA/CPRA (notice at collection,
   "do not sell or share", sensitive personal information for licence data),
   and the other state privacy laws where AVANT operates; vendor data
   processing agreements (Stripe, Resend, Anthropic, the database host,
   Vercel); a breach response plan with the state notice deadlines.
6. **Referral programme:** FTC Endorsement Guides. Referrers must disclose
   that they earn credit; the terms tell them to. Confirm the credit terms
   (no cash value, expiry) satisfy state gift card and unclaimed property
   rules; set the "[period set by counsel]" in the programme terms.
7. **Accessibility:** ADA Title III exposure for consumer sites. Aim for WCAG
   2.2 AA; publish an accessibility statement with a contact.
8. **Tax:** marketplace facilitator registration and collection where
   required; P2P car sharing taxes (Virginia, Maryland and others); host
   1099-K reporting through Stripe Connect.
9. **Non-discrimination:** host and guest rules consistent with public
   accommodation law; how reports are handled.
10. **Company:** entity formed, registered agent, the company insurance in
    the list above, and trademark clearance for the AVANT name and marks.
