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
| Damage disputes | Frequent complaints about unitemised or unproven claims ([ComplaintsBoard](https://www.complaintsboard.com/turo-false-damage-claim-c1936307)) | Timestamped photo checklist for both sides; 72-hour response window; charges never exceed the plan cap |
| Map | Price pins | Price pins that show the all-in price, linked to the list (hover one, the other lights up), with a drawn fallback when maps can't load |
| Navigation | Tabs | Five tabs on phones with the concierge at the centre; ⌘K palette and `g`-key shortcuts on desktop |
| Availability | Calendar on request | Five-week availability calendar on every car page |
| Privacy | Account required | No account to browse or book; export or delete your data from Account |
| Loyalty | — | AVANT Miles with tiers that unlock free delivery and waived deposits (*earning live; perks planned*) |
| Long-term | Multi-month rentals since October 2025 ([Wikipedia](https://en.wikipedia.org/wiki/Turo_(company))) | Weekly and monthly discounts set by hosts; months-long trips *planned* |
| Remote unlock | Turo Go ([Wikipedia](https://en.wikipedia.org/wiki/Turo_(company))) | Keyless pickup is the default promise; hardware integration *planned* |
| Listing a car | Multi-screen host onboarding | Five steps with a live guest-view preview, VIN check-digit validation that catches typos instantly, a price suggestion from local medians, and a recall check linked to NHTSA |

## Next features worth building

1. **Price-drop alerts** on saved cars (the save toast already promises it;
   needs email or push).
2. **Continuous MVR** for repeat guests, feeding the clean-record discount.
3. **In-app photo check-in** with device timestamps and hashes, stored in R2
   behind the vault.
4. **Host dashboard**: listing is built (`/host/new`); still to build are
   the availability calendar, trip requests and payouts, plus a server-side
   listings store once accounts exist.
5. **Trip sharing**: send the itinerary to a friend, add a second verified
   driver.
