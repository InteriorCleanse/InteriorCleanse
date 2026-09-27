# The auction directory

The source of truth is `src/sources/directory.ts`; the app renders it on the
Auctions screen. Fees change: every entry links to the house's own fee page.

| House | Who may buy | Registering | Buyer fee basis | In person | API | Gavel reads it |
|---|---|---|---|---|---|---|
| eBay Motors | Anyone | Free account | None on vehicles | No | Official, free | **Yes** (Browse API, read-only) |
| Cars & Bids | Anyone | Free account + card | 5%, min $250, max $7,500 (as published) | No | None | No |
| Bring a Trailer | Anyone | Free account + card | 5%, min $250, max $7,500 (as published) | No | None | No |
| Copart | Public in many states | Free basic; paid tier to bid; broker where required | Sliding scale + gate and internet fees | Yes | None | No |
| IAA | Public in many states | Registration tiers with an annual fee; broker where required | Sliding scale + fees | Yes | None | No |
| Manheim | Dealers only | Dealer licence | Sliding scale by location | Yes | None | No |
| ADESA / OPENLANE | Dealers only | Dealer licence | Sliding scale | Yes | None | No |
| ACV | Dealers only | Dealer licence | Flat by price band | No | None | No |
| GovDeals / GSA | Anyone | Free | Stated per lot; GSA none | Yes | None | No |
| Local public auctions | Anyone | ID + deposit at the door | Stated at the door | Yes | None | No |
| Mecum / Barrett-Jackson | Anyone | Bidder registration fee, proof of funds | About 10% in person, more online (per event) | Yes | None | No |

## How a beginner should use each

- **eBay Motors.** Start here. No buyer fee, proxy bidding, sellers must
  hand over a title. Always meet the seller with the car and the title before
  paying the balance. Never wire a deposit to a stranger.
- **Cars & Bids and Bring a Trailer.** The best free education: every past
  auction shows the final price and comments where mechanics tear the car
  apart. Bargains are rare because the buyers are knowledgeable.
- **Copart and IAA.** Mostly damaged and salvage. Filter to clean title, run
  and drive, minor damage, to find the fleet and repo cars. Add every fee
  before bidding: on a cheap car the fees can be a third of the price. Check
  your state's rules on who may buy which titles.
- **Manheim, ADESA, ACV.** The reason to get a dealer licence: wholesale
  trade-ins with condition reports. Until then, a dealer buying service can
  buy for you for a flat fee.
- **GovDeals and GSA.** Honest, cheap, fleet-maintained cars with records.
  Good first rental candidates.
- **Local public auctions.** Go twice without bidding. Learn the rhythm.
- **Mecum and Barrett-Jackson.** Go as a spectator first.

## What would make live bidding possible

None of these houses publishes a bidding API to the public. eBay's Browse API
is read-only; the Trading API's bidding calls are not available to ordinary
developers. Copart and IAA offer bidding only through their own sites, or
through registered brokers and licensed buyers. The dealer lanes require a
licence and use their own tools. Gavel's bid gate (`GAVEL_LIVE_BIDDING` and a
source's `capabilities.bid`) is in place so an adapter can be added the day one
of them offers an API to an account the owner holds. Until then, Gavel
prepares the number and opens the lot.
