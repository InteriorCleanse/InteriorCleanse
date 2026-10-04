# AVANT vs the incumbent

What Turo offers, what people complain about, and what AVANT does
differently. Turo facts come from the linked sources; AVANT items are what
this codebase does today unless marked *planned*.

| Moment | Turo today | AVANT |
| --- | --- | --- |
| Price on the card | Daily rate; the guest trip fee is added later and is reported at 2.5%–100% of the trip price with a $15 minimum ([Fleetwire](https://fleetwire.io/tools/turo-fee-calculator/)) | All-in daily price on every card and map pin: rate + flat 12% fee + default coverage. Toggle to the bare rate if you prefer |
| Checkout | Multi-screen | One page, five short steps, live total always visible; the server re-prices before charging |
| Insurance choice | Three plans with percentages and deductibles | Three plans shown as one big number: the most you'd pay. Liability always included |
| Young drivers | 18+, fee reported at $50/day at 18 and $30/day from 21 ([Ridester](https://www.ridester.com/turo-young-driver-fee/)) | 18+ for everyday cars; $29/day capped at $199/trip (18–20) and $19/day capped at $129 (21–24); halved with a clean record |
| Verification | Licence approval per account | Driver Pass: licence + live selfie once, reused everywhere; images redacted after the check |
| Support | Human queues; users report weeks-long escalations ([Elliott Report](https://www.elliott.org/the-troubleshooter/turo-charged-me-2338-for-damage-i-didnt-cause-can-i-get-a-refund/)) | 24/7 AI concierge that searches real inventory, prices trips and explains policy; humans for disputes |
| Damage disputes | Frequent complaints about unitemised or unproven claims ([ComplaintsBoard](https://www.complaintsboard.com/turo-false-damage-claim-c1936307)) | Six guided photos at pickup and six at return, each SHA-256 fingerprinted and timestamped, location data stripped, plus a tamper-evident evidence receipt; 72-hour response window; charges never exceed the plan cap |
| Map | Price pins | Price pins that show the all-in price, linked to the list (hover one, the other lights up), with a drawn fallback when maps can't load |
| Navigation | Tabs | Five tabs on phones with the concierge at the centre; ⌘K palette and `g`-key shortcuts on desktop |
| Availability | Calendar on request | Five-week availability calendar on every car page |
| Privacy | Account required | Browse without an account; licence images redacted after the check; export or delete your Driver Pass, or close the whole account, from Profile |
| Trip fee over time | Not reduced for loyal guests | **AVANT Circle**: 12% → 10% after 3 trips → 8% after 10, applied by the server at checkout; Gold also gets free cancellation until 12 hours before pickup. Hosts' share is untouched |
| Host cancels | Refund; further help varies | **AVANT Promise**: full refund plus $50 AVANT credit, automatically and only once per trip |
| Unanswered request | Can wait | Requests expire after 8 hours: full refund plus $15 credit; the host sees an answer-by time |
| Refunds | Policy-based | Exact refund shown before you confirm a cancellation; credit comes back as credit, card money to the card, sent to Stripe with idempotency keys and retried until done |
| Referrals | Referral programme exists | Give $25, get $25: the friend's credit at sign-up, the referrer's after the friend's first finished trip; no self-referral |
| Saved cars | Favorites | Favorites synced to the account, plus a price-drop alert when a host lowers the rate (at most one per car every three days) |
| Personal touch | Host messages | Host's welcome note and private pickup instructions on the trip page (confirmed guests only); a thank-you and review prompt the day after every trip |
| Wallet | Turo credits for some cases | AVANT credit wallet with a full history on the Circle page, applied automatically at checkout, never cashable |
| Long-term | Multi-month rentals since October 2025 ([Wikipedia](https://en.wikipedia.org/wiki/Turo_(company))) | Weekly and monthly discounts set by hosts; months-long trips *planned* |
| Remote unlock | Turo Go ([Wikipedia](https://en.wikipedia.org/wiki/Turo_(company))) | Keyless pickup is the default promise; hardware integration *planned* |
| Listing a car | Multi-screen host onboarding | Six steps, starting with six required photos the host takes of their own car (location data stripped on the device), a live guest-view preview, VIN check-digit validation that catches typos instantly, a price suggestion from local medians, and a recall check linked to NHTSA |

All amounts in the Circle, Promise and referral rows are set in one place,
`lib/circle.ts`, and every page, the concierge and the server read them from
there.

## Next features worth building

1. **Saved searches with alerts** ("an SUV in Denver under $90 next month").
2. **Continuous MVR** for repeat guests, feeding the clean-record discount.
3. **Photo sync for check-in evidence**: capture, fingerprinting and the
   tamper-evident receipt are built (`components/EvidenceCapture.tsx`);
   next is an opt-in upload to R2 behind the vault so hosts and claims
   staff can see the same photos.
4. **Trip changes**: move dates or extend a trip in place, re-priced by the
   server, instead of cancel-and-rebook.
5. **Trip sharing**: send the itinerary to a friend, add a second verified
   driver.
