# High-value services: selling to the very wealthy and the people who serve them

Written 2026-09-27 against the owner's ask: "make our company a master of
building rapport with multimillionaire and billionaire clients and the most
suitable and highly sought services to sell to them." The honest consultant's
answer.

**What the founder has today.** One person. Claude Code with 101 skills and 44
agents. Next.js and Vercel. One storefront (InteriorCleanse) that has not yet
taken a live dollar (`docs/REVENUE_TODAY.md`). A planned AI app builder with a
strategy document and no product (`docs/business/freehold/STRATEGY.md`).
No funding, clients, team, insurance, or references stated.

**How this was researched.** The container's proxy blocks page fetches, so
every fact below is a search snippet retrieved 2026-09-27. Open the source
before repeating a number. Figures labelled *illustration* are the author's
judgement, not a source.

## 1. How this buyer actually buys from small vendors

**The buyer is rarely the principal.** In a household, the house manager is
"the single point of contact for all outside parties" and "every vendor call
... routes instead through the household manager"
(myhouseholdmanaged.com/house-manager). In a family office, the chief of staff
"handles investment coordination, vendor management, and principal support"
(resonancesearch.com, 2026), and Heads of Operations and next-generation
leaders "are driving platform selection" (andsimple.co software report 2025).
On the estate, "every tradesperson, supplier and specialist ... reports through
the estate manager" and "a poorly managed contractor does not just deliver bad
work, they talk" (oplu.com estate manager page). Advisors, CPAs and family lawyers are a
second ring: the super-rich "rely heavily on the recommendations of
high-quality professionals with whom they are presently working" (Forbes,
Prince, 2018-01-29).

**How vendors get in.** Referral first. "Peer referrals and advisor networks
outperform traditional discovery channels" and "time-to-trust has overtaken
time-to-launch as the defining KPI" (andsimple.co, 2025). "Warm introductions
move through gatekeepers faster than any cold approach" (ctacquisitions.com,
2026). Where cold contact worked, it was specific: "the best cold outreach they ever
received was from someone who flagged a risk in their systems"
(mrfamilyoffice.com, 5-minute guide). 65% of software buyers now use formal
procurement committees and ask for sandbox testing first (andsimple.co, 2025).
Conferences are the weakest route: most are "dominated by sponsors and
vendors, and families hate when vendors bombard them" (mrfamilyoffice.com);
one organiser charged sponsors $18,000 to $200,000 for access that "rarely
materialized" (CNBC, 2025-02-21).

**What disqualifies a vendor immediately.** Mass mail-merge, words such as
"revolutionary" or "guaranteed", ignoring the gatekeeper ("being rude to them
means you are finished"), large attachments (blog.heyeveryone.io).
Pitching the principal directly when a chief of staff exists. No references.
Absence of the security basics: family offices are advised to require SOC 2 or,
failing that, a recent penetration test and clear incident history
(omegasystemscorp.com; papermark.com, 2026). Any lapse in discretion: 70% of
ultra-high-net-worth clients rank confidentiality first (smartasset.com,
undated, *unverified*).

**Why they are buying.** Technology was the fastest-growing cost line for North
American family offices in 2024, up 5.7% (RBC and Campden, 2025-10-16). 72%
admit they are under- or moderately invested in operational technology
(Deloitte, familywealthreport.com). 43% were attacked in the prior one to two
years, 57% in North America, and 31% have no incident response plan (Deloitte
Cybersecurity Report 2024). Only 22% use AI for operational tasks such as
document summarisation and email management (mrfamilyoffice.com, 2025). Smaller offices
"favor fractional specialists and outsourcing" (Crain Currency, 2026). There
are 8,030 single family offices, 3,180 in North America, heading for 10,720 by
2030 (Deloitte, 2024). Budgets are modest: offices under $500M spend about
$1.0M to $1.5M a year, half or more on salaries (Campden via
sociallifemagazine.com, 2025), so a software line is tens of thousands, not
millions.

## 2. Which services are both sought and deliverable by this founder

Fit is scored against what the founder has shipped (a Next.js storefront with
admin, catalog, Stripe, 3D viewers), not what the skill pack claims.

| # | Service | Demand evidence (source) | Fit | Price band, anchor | Cycle | Proof demanded | Risk |
|---|---|---|---|---|---|---|---|
| 1 | Digital footprint and email-security gap review for a family office or advisory firm (site, DNS, SPF/DKIM/DMARC, stale pages, exposed staff data), fixed fee, two weeks | 43% attacked, 93% via phishing (Deloitte 2024); BEC losses $3.05B in 2025 (FBI IC3); "flag a risk" was the best cold outreach (mrfamilyoffice.com) | High. Read-only, technical | *Illustration*: $2,500 to $7,500. Anchor: IT consultants bill $80 to $140/hr in North America (index.dev, 2026) | 2 to 6 weeks | Sample report, scope, NDA, E&O insurance | Low. Is not "cybersecurity" and must say so |
| 2 | Bespoke private software, delivered into the client's own GitHub, database and Vercel: household operations, collection inventory, deal-flow tracker | Deal-flow tools cost $2K to $3K per user per year (valueaddvc.com, 2026); Nines and Artlogic sell to this buyer, priced by quote (ninesliving.com; artlogic.net); buyers want modular systems that outlast the vendor (andsimple.co) | High. The storefront's architecture generalised; the app builder's Wedge A thesis | *Illustration*: $15,000 to $60,000 build plus retainer. Anchor: boutique agency builds run $6,000 to $35,000+ (loungelizard.com, 2025) | 2 to 6 months | Sandbox demo, delivered case study, security policy, references | Medium. Scope creep; single point of failure; handover must be documented |
| 3 | AI document and email workload automation for a family office | Only 22% use AI operationally, 30% want it (RBC and Campden 2025; mrfamilyoffice 2025) | Medium. Deliverable, but touches the most sensitive data in the building | *Illustration*: $10,000 to $40,000. No published anchor found | 3 to 9 months | Data-handling policy, model location, deletion terms, references | High. One leak ends the business; needs controls the founder lacks |
| 4 | Discreet personal or family digital presence (private site, name reservation, search hygiene) | Specialist agencies exist (pavesen.com, eightpr.com); UHNW clients want sites that convey trust "without revealing too much" (legendarylabs.com) | High on build, low on PR and search skills | Anchor: agency web design $10,000 to $150,000+ (dribbble.com); small-business sites $5,000 to $30,000 (loungelizard.com) | 1 to 3 months | Portfolio of prior sites, writing samples, NDA | Medium. Crowded; reputation firms bundle legal and PR |
| 5 | Founder-led company websites and product builds for businesses the principal owns or backs | 70% of family offices invest directly (Citi 2025); those companies need software | High. Closest to the founder's demonstrated work | Anchor: $6,000 to $35,000+ agency builds (loungelizard.com, 2025) | 1 to 3 months | Live sites, code the client owns, references | Low to medium. Competes with every agency |
| 6 | Due-diligence and research automation for direct deals | Family offices "still rely on outdated, manual" DD processes (diligencevault.com); incumbents exist (workwisesolutions.org) | Medium. Founder has no investment background | *Illustration*: $10,000 to $30,000 pilot | 3 to 9 months | Domain credibility, accuracy testing | High. Wrong output costs real money; wide credibility gap |
| 7 | Private digital archive: digitise, catalogue, build a searchable family archive | Everpresent serves "multi-generational family archives, estates" (everpresent.com); consumer digitising $220 to $1,400 (kinphotos.com, 2026); memoirs from $3,250 (storyterrace.com) | Medium. Software side fits; scanning is a subcontract | *Illustration*: $8,000 to $40,000 including subcontracted scanning | 2 to 6 months | Handling and custody policy, insurance, sample archive | Medium. Physical custody of irreplaceable items |
| 8 | Household "digital concierge" build (staff app, vendor book, property manuals) | Nines prices by property (ninesliving.com); concierge memberships run £2,000 to £25,000+ (stirlingaccess.com) | High on build; unknown on household workflow | *Illustration*: $10,000 to $30,000 | 2 to 4 months | Estate-manager references, demo | Medium. Nines is the incumbent; wins only when the family wants to own the system |
| 9 | Fractional technology lead for a small family office (set days per month) | Mayfair Tech sells exactly this to family offices (mayfairtech.com); smaller offices favour fractional specialists (Crain Currency, 2026) | Medium. Needs vendor-management and security judgement, not only building | No published anchor found; *illustration*: monthly retainer | 3 to 12 months | Track record, references, insurance | Medium. Sold on trust alone; closed to a founder without a case study |

**Ranking.** 1, 2, 5, 4, 8, 7, 9, 3, 6. Services 3 and 6 are the most sought
and the least sellable today: the buyer will demand controls and domain proof
that do not exist yet.

**Two to sell.**

- **Entry service: the gap review (1).** Read-only, fixed fee, two weeks. It
  matches the one cited example of cold outreach that worked, produces a
  written artefact the gatekeeper can forward upward, and every finding is a
  quote for a fix. It earns a reference in weeks.
- **Anchor service: bespoke private software the client owns (2).** The
  storefront's architecture (content as source of truth, admin writes through
  GitHub, deploy on Vercel) is already the shape of a household or collection
  system. The app builder's claim that the client owns repo, database and
  deployment is worth more to a family than to a hobbyist: leaving is free and
  the vendor's outage is not theirs.

**What this means not doing.** No cybersecurity claims beyond the review's
scope. No document or email AI until a security policy, insurance and two
references exist. No approaching principals directly. The app builder becomes
the internal tool that makes service 2 fast, not a separate public launch.

## 3. The gap, and the shortest credible path across it

**The gap, stated plainly.** No delivered client work, case study, security
policy, NDA, insurance, references, or public identity for this line of
business, and a storefront that has not yet processed a real order. Every item
in Section 1's disqualification list is currently true of this founder.

**The first three clients should not be wealthy families** but the
professionals who serve them, who sign fast and sit on a referral path: an independent wealth advisory firm (RIAs
spend about 3.8% of revenue on technology and 67% say their stack needs
upgrading, per InvestmentNews 2024 and Advisor360 2025 via smartasset.com), a
private-staffing or estate-management agency (the kind of firm oplu.com or
myhouseholdmanaged.com is, not named targets), and a boutique CPA or law
practice with family clients. Sell them the gap review; deliver
service 2 or 5 to one of them at cost if that is what a real case study takes.

**Proof assets, in order.**

1. One case study from real delivered work, a named consenting client, a
   measurable before and after. Nothing else here works without it.
2. A one-page security and discretion policy: what data the founder touches,
   where it lives, who sees it, how it is deleted, what happens on a breach.
   Buyers are told to ask (omegasystemscorp.com).
3. A mutual NDA template, reviewed once by a lawyer; households treat NDAs as
   standard (myhouseholdmanaged.com/blog/what-is-an-nda).
4. Professional liability (E&O) insurance. IT consultants pay about $65 to
   $75 a month for $1M limits, software developers about $111 (Insureon;
   TechInsurance, 2025). The cheapest credibility on the list.
5. A sparse LinkedIn and a one-page services site: no storefront branding, no
   hype, a named person, the policy from item 2 linked. The InteriorCleanse
   voice transfers; the brand does not.
6. A sample gap review of the founder's own site, published as the worked
   example.

**Reachable rooms at low cost.** Family Office Club membership is $400 for
live-event access (familyoffices.com/join): useful for hearing how this buyer
talks, not for selling. DEMA runs local chapter meetings for private-service
professionals and certified vendors (linknovate.com; fees not published).
Campden passes are $4,650 for non-members (campdenwealth.com GOFOC2025) and FOX
advisor fees are unpublished; neither is sensible before the case study
exists. The cheapest room is coffee with one advisor who already trusts the
founder.

## 4. Rapport with this buyer: ten principles

Each has one behaviour and one never.

1. **Discretion is the product.** Do: put the data-handling policy in the first
   email. Never: mention any client, past or present, by name or by hint.
2. **Brevity.** Do: three-line emails, one ask, no attachments (blog.heyeveryone.io).
   Never: a deck before it is requested.
3. **Their currency is time.** Treat "every second ... with the greatest care"
   (smartasset.com). Do: arrive early, finish early, send the note the same
   day. Never: reschedule on the client.
4. **The gatekeeper is a peer, not an obstacle.** They "can speak on behalf of
   the principal" (myhouseholdmanaged.com/chief-of-staff). Do: solve the chief
   of staff's problem and let them carry it upward. Never: go around them.
5. **Lead with a finding, not a pitch.** The best cold outreach "flagged a risk
   in their systems" (mrfamilyoffice.com). Do: name one specific, verifiable
   gap. Never: "revolutionary", "guaranteed", or any superlative.
6. **No flattery.** They "are not looking for sales energy but rather confidence
   through clarity" (romvarirealty.com, 2026). Do: state the risk and the cost
   plainly. Never: compliment the house, the art, or the wealth.
7. **No name-dropping.** Referrals come from their advisors, not from you
   (Forbes, Prince). Do: let the referrer make the introduction. Never: claim
   proximity to anyone.
8. **Follow-through beats brilliance.** Trust comes "through consistency,
   discretion, and intellectual honesty" (selectadvisorsinstitute.com). Do:
   deliver the small thing when promised. Never: miss a date silently.
9. **Listen for the unspoken.** "The quickest way to turn off customers is
   talking too much" (jeffmowatt.com). Do: ask what a failure would cost.
   Never: fill silence.
10. **Give before asking.** "Families remember those who bring them quality
    connections" (mrfamilyoffice.com). Do: one useful introduction a month, no
    ask attached. Never: ask for a referral early.

## 5. Three decisions the owner must make first

1. **Lead service.** Gap review (fast trust, low ticket) or bespoke software
   (larger ticket, needs a case study first). Recommendation: the review,
   because it manufactures the case study the anchor needs.
2. **Geography.** In person matters to this buyer. Name one metro where the
   founder can meet advisors and estate managers face to face. North America
   holds 3,180 of 8,030 single family offices (Deloitte, 2024); the choice
   within it is the owner's.
3. **Minimum engagement price.** The floor below which the founder declines.
   Anchors: North American freelance rates $80 to $140/hr (index.dev), agency
   builds from $6,000 (loungelizard.com). Without a floor the founder is a
   commodity developer to a buyer that buys on trust.

Until these are stated, scripts and target lists are premature.

## 6. Sources

All retrieved 2026-09-27 as search snippets; no page fetched in full.

- https://www.ubs.com/global/en/media/display-page-ndp/en-20260528-global-family-office-report-2026.html
- https://www.rbcwealthmanagement.com/en-ca/newsroom/2025-10-16/2025-rbc-and-campden-wealth-report-north-american-family-offices-adapt-to-uncertainty-and-embrace-ai-innovation
- https://www.campdenwealth.com/report/north-america-family-office-report-2025
- https://www.campdenwealth.com/GOFOC2025
- https://www.privatebank.citibank.com/press-releases/2025-global-family-office-report
- https://www.deloitte.com/global/en/services/deloitte-private/research/family-office-cybersecurity-report.html
- https://www.deloitte.com/global/en/services/deloitte-private/research/defining-the-family-office-landscape.html
- https://www.familywealthreport.com/article.php/Family-Offices'-Tech-Investment-Shows-Patchy-Readiness-%E2%80%93-Deloitte-?id=205733
- https://newsroom.bankofamerica.com/content/newsroom/press-releases/2025/11/inside-the-modern-family-office--complexity--innovation--and-a-g.html
- https://andsimple.co/reports/family-office-software
- https://www.mrfamilyoffice.com/p/how-to-connect-with-family-offices-full-guide
- https://www.mrfamilyoffice.com/p/family-office-conferences-the-good-the-bad-and-the-ugly
- https://www.mrfamilyoffice.com/p/how-ai-is-reshaping-family-offices
- https://www.cnbc.com/2025/02/21/family-office-conference-spike.html
- https://blog.heyeveryone.io/cold-email-to-us-family-offices/
- https://ctacquisitions.com/family-office-deal-flow-mechanics/
- https://www.forbes.com/sites/russalanprince/2018/01/29/how-the-super-rich-find-elite-wealth-planners/
- https://www.resonancesearch.com/post/fo-cos-salary-guide
- https://myhouseholdmanaged.com/house-manager
- https://myhouseholdmanaged.com/chief-of-staff
- https://myhouseholdmanaged.com/blog/what-is-an-nda
- https://oplu.com/private-estate/hire/private-household-estate-management/estate-manager
- https://www.craincurrency.com/family-office-management/major-shift-more-family-offices-are-shifting-fractional-hiring-modular
- https://mayfairtech.com/fractional-cto/
- https://omegasystemscorp.com/insights/blog/cybersecurity-for-family-offices-faq/
- https://www.papermark.com/blog/cybersecurity-due-diligence
- https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf
- https://valueaddvc.com/blog/family-office-crm-and-deal-flow-management-top-platforms-compared
- https://ninesliving.com/
- https://artlogic.net/pricing
- https://www.pavesen.com/online-reputation-management-ultra-high-net-worth-individuals/
- https://www.eightpr.com/blog/reputation-pr-high-net-worth-individuals
- https://www.legendarylabs.com/blog/reputation-management-for-high-net-worth-individuals/
- https://everpresent.com/family-legacy-projects/
- https://kinphotos.com/blog/cost-to-digitize-family-photos
- https://shop-us.storyterrace.com/pages/pricing
- https://stirlingaccess.com/compare/quintessentially/review
- https://diligencevault.com/ai-automation-due-diligence-family-offices-rias/
- https://workwisesolutions.org/guides/ai-family-office-complete-guide.html
- https://www.loungelizard.com/blog/small-business-website-development-cost/
- https://dribbble.com/resources/tips/web-design-agency-pricing
- https://www.index.dev/blog/React-Developer-Hourly-Rates-in-2025-Global-Cost-Guide
- https://www.insureon.com/technology-business-insurance/it-consultants/cost
- https://www.insureon.com/technology-business-insurance/software-developers/cost
- https://www.techinsurance.com/technology-business-insurance/it-consulting/cost
- https://familyoffices.com/join/
- https://www.linknovate.com/web/dema-domestic-estate-management-association-chapters-2332851/
- https://www.familyoffice.com/fox-advisor-membership
- https://smartasset.com/advisor-resources/ultra-high-net-worth-wealth-management
- https://smartasset.com/advisor-resources/ria-software-solutions
- https://www.selectadvisorsinstitute.com/our-perspective/strategies-for-ultra-high-net-worth-clients
- https://www.romvarirealty.com/blog/2026/8/24/building-trust-with-high-net-worth-clients-in-real-estate
- https://jeffmowatt.com/article/dealing-with-wealthy-customers/
- https://sociallifemagazine.com/the-archive/family-office-costs-economics/
