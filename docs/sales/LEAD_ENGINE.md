# Lead engine: large accounts, lawful list, kept warm

Written 2026-09-27 for one founder with Claude Code, Next.js, and Vercel. The
owner asked for automation, a call list, and lead generation aimed at
multimillionaire and billionaire clients and the professionals who serve them.
This is not a list. It is the system that produces one from public sources,
scores it, and works it by hand. No name, number, or email is invented; no
private data is scraped; no message is sent by software.

**Research note.** Every price below is a search snippet retrieved 2026-09-27.
Vendor pages were blocked by this container's proxy, so each price names its
primary URL and must be re-read before purchase.

**Offer gate.** An account enters a sequence only when the owner can name, in
one sentence, a product that is `published` in `content/catalog.json` or a
shipped version of the app builder (`docs/business/untitled-app-builder/`).
No product, no send. This outranks everything else here.

## 1. Ideal customer profiles

Tier 1 is a stated need, Tier 2 an organisational change, Tier 3 a public
appearance. A signal older than 90 days counts as none.

### 1a. Family office, single (SFO) and multi (MFO)

| Field | Detail |
| --- | --- |
| Definition | SFO: one family, usually exempt from registration under SEC Rule 202(a)(11)(G)-1, so rarely on Form ADV. MFO: several families, usually a registered adviser on Form ADV and, above $100M in 13(f) securities, on 13F. |
| Firing signals | Tier 1: job post for chief of staff, head of operations, or "technology and data" (a gap named in writing). Tier 2: Form ADV amendment showing a new office; first 13F; press on a direct investment or a new principal. Tier 3: an executive speaks at a family-office conference or on a podcast. |
| Disqualifiers | No public footprint (no filing, site, or press): no lawful route without a referral. Litigation or sanctions listing. Fewer than three visible staff. |
| Gatekeeper first | Chief of Staff; failing that, Head of Operations or the principal's Executive Assistant. Never the principal on a first touch. |

### 1b. Wealth or private-banking advisor

| Field | Detail |
| --- | --- |
| Definition | RIA or private-bank team; minimum and AUM band read from Form ADV Part 2A, not guessed. |
| Firing signals | Tier 1: job post for client experience associate or client service manager. Tier 2: team moves firm (press); Form ADV shows AUM step-up or new branch. Tier 3: advisor speaks at an event, writes a column, or is a podcast guest. |
| Disqualifiers | State-registered adviser below $100M if the offer is a premium item. Published no-vendor-solicitation policy. FINRA-registered person where a touch would involve a gift above the Rule 3220 limit of $100. |
| Gatekeeper first | Client Service Associate or Practice Manager; anything resembling a gift programme needs the Chief Compliance Officer's approval first. |

### 1c. Founder-CEO of a private company

| Field | Detail |
| --- | --- |
| Definition | Private company with revenue stated in a public source (Inc. 5000, press, own site); starting band $10M to $250M, set by the owner. |
| Firing signals | Tier 1: job post for executive assistant or chief of staff to the CEO (the desk we need is being created). Tier 2: Form D on EDGAR; product launch; new headquarters; acquisition. Tier 3: founder keynote, podcast, or award. |
| Disqualifiers | Pre-revenue. Publicly listed. Government contractor or regulated entity whose gift rules are unread. Revenue known only from a broker estimate. |
| Gatekeeper first | Executive Assistant to the CEO; Chief of Staff where one exists. |

## 2. Lawful sourcing playbook

No automated scraping of LinkedIn, no purchase of leaked or "enriched" lists,
no personal mobile numbers, no texts. The owner performs every manual step and
records the URL that proves each fact.

| Source | Yields | Terms and legal note | Owner's manual step |
| --- | --- | --- | --- |
| SEC IAPD and Form ADV data sets (adviserinfo.sec.gov; sec.gov Form ADV data) | Advisers and MFOs: AUM, minimums, offices, key persons | Public record. EDGAR automation needs a declared User-Agent with contact details, under 10 requests a second (sec.gov/os/accessing-edgar-data) | Read Part 2A; copy AUM band, minimum, city, filing date |
| EDGAR 13F-HR and Form D (Atom feeds and full-text search) | Holders above $100M; private raises with issuer and officers | Public record, same access rules | Confirm the filer is the account; accession URL becomes `source_url` |
| Company registries: Companies House (UK), US Secretary of State portals, OpenCorporates | Officers, incorporation date, filings | Companies House is open data. OpenCorporates is free for non-commercial use; commercial reuse needs a licence | Verify legal name and officers; never copy a home address |
| Crunchbase free account | Funding events, founders, HQ | Free account view-limited (about 11 profiles a month per snippet); Pro $49 a month annual or $99 monthly (support.crunchbase.com, snippet 2026-09-27) | Confirm signals only; no export |
| PitchBook | Deal and fund data | No free tier; trial by request at pitchbook.com/free-trial; a seat reported at roughly $15,000 to $20,000 a year (vendr.com snippet 2026-09-27, unverified) | Not used yet |
| Conference speaker lists and podcast show notes | Names, titles, topics, dates (Tier 3) | Public pages; quote only what is on the page | Record event, date, URL; the topic opens the message |
| LinkedIn Sales Navigator, owner's own seat | Titles, role changes, posts | Core US$119.99 a month or $1,079.88 a year (business.linkedin.com/sell/sales-navigator/compare-plans, snippet 2026-09-27). User Agreement 8.2 forbids software, scripts, or bots that scrape or copy profiles, and automated messaging | Search, read, record name, title, profile URL only |
| Industry association directories where public (NAPFA Find an Advisor, CFP Board verification) | Advisor name, firm, city, credentials | Public; some terms forbid marketing use, read each first | Verify credentials, do not build a list |
| Press and Google Alerts RSS, PR Newswire and Business Wire feeds | Tier 2 signals with dates | Public; cite the article | Paste headline, date, URL |
| Greenhouse and Lever public job-board endpoints, company careers pages | Tier 1 job-post signals | Public, documented endpoints; respect robots.txt and rate limits | Confirm the post is live on the company's page |

**Contact rules by law.** CAN-SPAM: truthful headers, a postal address in
every email, opt-out honoured within 10 business days by law and one day here
(ftc.gov compliance guide). GDPR and UK GDPR: for EU and UK contacts the basis
is legitimate interest, Article 6(1)(f); a two-line assessment goes in
`owner_notes` and every message offers opt-out; UK PECR treats corporate
addresses as corporate subscribers, personal ones as individuals (ico.org.uk).
CCPA: the B2B exemption expired 2023-01-01; keep a notice-at-collection line
on the privacy page and honour deletion requests. TCPA and the Telemarketing
Sales Rule: manual calls to published business lines in business hours; no
autodialer, no prerecorded voice, no texts. The TSR exempts most
business-to-business calls from Do Not Call (16 CFR 310.6(b)(7)); the owner
scrubs anyway: register at telemarketing.donotcall.gov, first five area codes
free, then $82 per area code in FY2026 and $85 from 2026-10-01 (ftc.gov press
releases 2025-08 and 2026-08, snippet 2026-09-27).

## 3. Target account list and scoring

File: `docs/sales/target-accounts.csv`, committed with the header only.

| Column | Meaning |
| --- | --- |
| `account` | Legal or trading name as in the source |
| `segment` | `family-office`, `advisor`, `founder-ceo` |
| `signal` | One line from the source |
| `signal_date` | ISO date of the signal, not discovery |
| `source_url` | Public URL proving the signal |
| `gatekeeper_title` | Title reached first (Section 1) |
| `contact_name` | Only from a public page the owner read |
| `contact_channel` | `email:work`, `linkedin`, `phone:business`, `letter:office`, `referral` |
| `consent_basis` | `legitimate-interest`, `b2b-exempt`, `referral`, `opted-in` |
| `stage` | `candidate`, `qualified`, `sequenced`, `replied`, `meeting`, `closed-won`, `closed-no`, `opted-out` |
| `next_action` | One verb phrase |
| `next_action_date` | ISO date |
| `owner_notes` | Score arithmetic, LIA line, gift check |

**Scoring.** Three scores, each 0 to 5.

- Fit: 5 matches every ICP filter; 3 one filter unknown; 0 disqualified.
- Intent: 5 Tier 1 under 30 days; 4 Tier 2 under 30 days; 3 any signal under
  90 days; 1 older; 0 none.
- Access: 5 warm introduction; 4 gatekeeper named with published work email;
  2 title known, no name; 0 no lawful channel.

Score = 2 x Fit + 2 x Intent + Access, maximum 25. Example: Fit 4, Intent 3,
Access 4 gives 8 + 6 + 4 = 18. Thresholds: 18 and above is Tier 1, worked
this week; 12 to 17 is Tier 2, waits for a fresher signal; below 12 is parked.
The arithmetic goes in `owner_notes` so it can be audited.

## 4. Automation

**Built now: nothing.** This document and the empty CSV are the only
artefacts. Everything below is specification.

```
 PUBLIC FEEDS                WEEKLY SCAN (spec)         HUMAN REVIEW
 EDGAR Atom: 13F-HR, ADV, D  scripts/signal-scan.mjs    owner reads
 PR Newswire, Business Wire  Monday, GitHub Actions     docs/sales/inbox/
 Google Alerts RSS       --> ICP keyword match      --> YYYY-WW.csv
 Greenhouse, Lever boards    writes candidate rows      keeps or deletes
                             never touches the CSV           |
                                                             v
 ENRICHMENT (spec, public)      TARGET LIST           OUTREACH (manual)
 Form ADV 2A, registry,   <--  target-accounts.csv --> owner types every
 company site, event page      scored, Section 3       email, note, call
                                                             |
                                        CRM (free tier) <----+
                                        HubSpot Free or Attio Free
                                        stages, opt-outs, five numbers
```

**Order to build.**

1. Fill the CSV by hand for the first 25 accounts. This tests the ICP before
   any code exists. No cost.
2. `scripts/signal-scan.mjs`: reads the feeds above, filters by ICP keywords
   (city, title, form type), writes candidate rows to `docs/sales/inbox/`.
   Runs on a GitHub Actions schedule; check the minutes allowance at
   github.com/pricing first. EDGAR calls carry the declared User-Agent.
   Nothing it writes is a lead until the owner moves it.
3. Enrichment inside the same script: for each kept row, fetch the Form ADV
   brochure link and the company's own site title. Public data only; no
   email-finder credits, no broker fields.
4. CRM. Recommended: HubSpot Free, $0 for up to 2 users; Sales Hub Starter
   $20 a seat monthly or $15 annual if reporting is needed later
   (hubspot.com/pricing/sales, snippet 2026-09-27). Alternative: Attio Free,
   $0 for up to 3 seats; Plus $29 a seat annual or $36 monthly
   (attio.com/pricing, snippet 2026-09-27). The CSV stays the source of truth
   until the CRM holds more than 100 accounts.
5. Sequencing tool, only when manual sending exceeds 20 first touches a week.
   Snippet prices, 2026-09-27: lemlist Email Pro $79 monthly or $63 annual,
   Multichannel Expert $109 or $87 (lemlist.com/pricing; sources disagree and
   mention a July 2026 restructure); Instantly Growth $47 monthly or $37.60
   annual, 5,000 emails (instantly.ai/pricing); Apollo Free $0, Basic $59
   monthly or $49 annual (apollo.io/pricing). Used in task mode only: it
   schedules the reminder, the owner writes and presses send.

**Human-in-the-loop rule.** No message leaves without the owner reading the
final text, its row, and the signal URL. Software drafts, reminds, and
records. It does not send.

## 5. The 21-day gatekeeper sequence

Rules. One email thread per account; every email is a reply in it. No more
than four emails. Stop on any no, however phrased. Opt-outs honoured within one
day. Calls to business lines only, in the recipient's business hours, one
voicemail per call day. No texts. Nothing of value in the letter until the
firm's gift policy is read; FINRA Rule 3220's $100 limit applies to registered
persons. Brackets are filled from the row; an unfilled bracket is not sent.

| Day | Channel | Step |
| --- | --- | --- |
| 1 | Email 1 | Signal opening, offer sentence, one question |
| 2 | LinkedIn | Connection request with note, no pitch |
| 4 | Phone | Office line; voicemail if unanswered |
| 6 | Email 2 | Useful public fact tied to the signal, no ask |
| 9 | LinkedIn | Message if connected; otherwise one considered comment on a public post |
| 11 | Letter | One page, hand-signed, to the office; arrives about day 14 |
| 14 | Phone | Second and final call |
| 16 | Email 3 | Concrete update, two direct questions |
| 19 | LinkedIn | Final message, closes the loop |
| 21 | Email 4 | Closing note; thread stays open for them |

**Email 1, day 1. Subject: re: [signal in three words]**

[First name], I read that [signal, e.g. the firm's Form ADV amendment of
[date] adds an office in [city]]. Openings like that tend to land on the
chief of staff's desk as a list of small things to get right.

We make [one sentence on a published product]. If that is useful for [the
specific use], I can send one item and a page of detail. If not, a one-word
no is welcome and I will not write again.

[Owner name], InteriorCleanse, [postal address]

**LinkedIn connection note, day 2**

[First name], I saw [signal]. I wrote to your work address on [date] about
[offer]; connecting here so you can see who is writing. No pitch in this
request.

**Voicemail, day 4**

[Name], this is [owner] from InteriorCleanse. I emailed on [date] about
[signal]. No need to call back; a yes or no by reply is all I need. [Number].

**Email 2, day 6, same thread**

Following my note of [date]. One thing that may help regardless of us:
[a public fact or resource tied to the signal, with its URL]. No action
needed. If the earlier note reached the wrong desk, whose should it be?

**LinkedIn message, day 9**

Thank you for connecting. Since [signal], is [specific use] something your
office is handling this quarter? If it sits on someone else's desk, a name is
enough; I will write to them once and copy you.

**Letter, day 11.** One page. First paragraph names the signal and date;
second is the offer sentence with one photograph of a published item; third
gives the thread's subject line so the reply can be by email. Hand-signed.
Nothing of value enclosed unless the gift policy was read.

**Email 3, day 16, same thread**

[First name], a short update since [signal]: [one concrete thing that exists,
e.g. the item is in stock at [URL]]. Two questions. Is [specific use] on your
list this quarter, and who decides it? If neither applies, say so and this
thread closes.

**LinkedIn message, day 19**

Last note here. I have written three times about [signal] and will stop after
one more email. If timing is the issue, the email thread will still work
later. Thank you for reading.

**Email 4, day 21, same thread**

Last note on this thread. I wrote on [dates] about [signal] and [offer]. No
reply usually means the timing is wrong, which is fine. I will not follow up
again. If it becomes relevant, replying here will reach me. Thank you for
your time.

## 6. Weekly operating rhythm

- Monday, 90 minutes: read the signal inbox, keep or delete each candidate,
  score kept rows, set `next_action_date` for anything at 18 or above.
- Tuesday to Thursday, one 60-minute block each morning: work the day's steps
  in row order, type every message, log each touch and outcome the same hour.
  Calls only in this block.
- Friday, 45 minutes: pipeline review. Move stages, close threads that got a
  no, honour any pending opt-out, write the five numbers into
  `docs/sales/METRICS.md` (create on first use).

The five numbers, recorded every Friday:

1. Qualified accounts added (`candidate` to `qualified`).
2. First touches sent (Email 1 count).
3. Reply rate: replies divided by Email 1 sent, positive and negative counted
   separately.
4. Meetings booked.
5. Opt-outs received and the longest time to honour one, in hours.

Targets are set after four weeks of real numbers, not before. Generic reply
rate benchmarks are not repeated here; they are unsourced for this segment.

## 7. Sources

All retrieved 2026-09-27. Vendor pricing pages, linkedin.com, and ftc.gov were
blocked by the container proxy; figures come from search snippets citing the
primary page named. Re-read each before acting.

- https://business.linkedin.com/sell/sales-navigator/compare-plans (via findymail.com, smartreach.io)
- https://www.linkedin.com/legal/user-agreement (8.2; via linkedin.com/help/linkedin/answer/a1341387)
- https://www.hubspot.com/pricing/sales (via mo.agency, sybill.ai)
- https://attio.com/pricing (via marketbetter.ai)
- https://www.lemlist.com/pricing (via astragtm.io, landbase.com, derrick-app.com; figures disagree)
- https://instantly.ai/pricing (via landbase.com, woodpecker.co)
- https://www.apollo.io/pricing (via landbase.com)
- https://support.crunchbase.com/hc/en-us/sections/360009766253-Plans-and-Pricing (via g2.com, vendr.com)
- https://pitchbook.com/free-trial and https://www.vendr.com/marketplace/pitchbook (price unverified)
- https://www.ftc.gov/news-events/news/press-releases/2025/08/telemarketer-fees-access-ftcs-national-do-not-call-registry-increase-2026
- https://www.ftc.gov/news-events/news/press-releases/2026/08/ftc-announces-2027-telemarketer-fees-access-national-do-not-call-registry (via natlawreview.com, tcpaworld.com)
- https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310 (TSR 310.6(b)(7))
- https://www.finra.org/rules-guidance/rulebooks/finra-rules/3220
- https://www.sec.gov/os/accessing-edgar-data
- https://adviserinfo.sec.gov/ and https://www.sec.gov/data-research/sec-markets-data/information-about-registered-investment-advisers-exempt-reporting-advisers
- https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets
- https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=13F-HR&output=atom and the same with type=D
- https://www.ecfr.gov/current/title-17/section-275.202(a)(11)(G)-1 (family office rule)
- https://gdpr-info.eu/art-6-gdpr/ and https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/
- https://oag.ca.gov/privacy/ccpa
- https://find-and-update.company-information.service.gov.uk/ and https://opencorporates.com/legal/terms
- https://developers.greenhouse.io/job-board.html and https://github.com/lever/postings-api
- https://www.napfa.org/find-an-advisor and https://www.cfp.net/verify-a-cfp-professional
- https://www.inc.com/inc5000
- https://github.com/pricing (Actions minutes, not quoted)
