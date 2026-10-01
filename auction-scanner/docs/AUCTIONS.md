# The auction directory

The source of truth is `src/sources/directory.ts` (30 houses, in the groups
of `HOUSE_GROUPS`); the app renders it on the Auctions screen. Fees change:
every entry links to the house's own fee page.

## The best auctions for each goal (researched October 2026)

Research covered the developer pages, terms and fee pages of every major US
car auction: wholesale and salvage, enthusiast and collector, and government
and local. Two findings decide everything below:

1. **Only three sources offer data to outside apps on fair terms**: eBay
   Motors (free), GSA Auctions (free) and MarketCheck (free tier, then paid).
   Gavel reads all three. Copart, IAA, Bring a Trailer, Cars & Bids,
   GovDeals and the rest publish no API, and most of their terms forbid
   automated reading. Gavel never scrapes, so members bring those lots in
   with Send to Gavel (one click on a page they are looking at).
2. **Prices matter as much as listings.** A car is only a steal against what
   similar cars sell for. auto.dev (dealer prices, free tier) and VinAudit
   (market value by VIN, developer account) give Gavel that; members' own
   sold prices add more.

**A first rental car (reliable, clean title, low fees).**
GSA Auctions (no buyer premium, fleet cars with records; read live), US
Treasury seized vehicles through CWS (no buyer premium), Public Surplus and
Municibid (city and county fleets), eBay Motors (no buyer fee; read live),
then a local public auction once you have been once as a spectator.

**Flipping (buy under market, sell on).**
eBay Motors and Cars & Bids for clean cars, Copart and IAA filtered to clean
title and "run and drive" for the deepest discounts once you know repair
costs, and Bring a Trailer and Cars & Bids results as the price guide.

**Supercars and cars that hold their value.**
Cars & Bids (modern enthusiast, 5% capped, 1-minute reset), Bring a Trailer
(the deepest market and sold history), PCARMARKET (Porsche), duPont REGISTRY
Live (exotics, 5%), Collecting Cars (global, 6% capped, proxy bids; check
where the car is). Watch the live houses (RM Sotheby's, Gooding, Bonhams,
Mecum, Barrett-Jackson) to learn values; at 10-12% on top they are hard
places to flip from.

**Later, with a dealer licence.** Manheim, OPENLANE, ACV and America's Auto
Auction are where used-car lots buy.

### Partnerships worth asking for

None of these is self-serve; each is an email to start. Ask what a small
subscription app may show to members who are not dealers.

| Who | What it would add | How to ask |
|---|---|---|
| Cox Automotive (Manheim) | MMR wholesale values and Manheim listings with condition reports, by API | DataSyndication@coxautoinc.com; licensed under Cox's Master Agreement and Additional Terms; price not published |
| Collecting Cars | Its listings and results; its terms allow data use with written consent | Through the contact page, asking for written authorisation |
| Classic.com | Collector-car sold prices; a business tier with API access was listed as coming soon | Their business enquiry |
| Municibid, GovDeals | Government fleet lots; Municibid's terms allow access under a separate written agreement | Their seller or partner contact |
| Copart, IAA | Salvage and clean-title lots, the biggest volume | Business development; no published programme was found |


| House | Who may buy | Registering | Buyer fee basis | In person | API | Gavel reads it |
|---|---|---|---|---|---|---|
| eBay Motors | Anyone | Free account | None on vehicles | No | Official, free | **Yes** (Browse API, read-only) |
| Cars & Bids | Anyone | Free account + card | 5%, min $250, max $7,500 (as published) | No | None | Import |
| Bring a Trailer | Anyone | Free account + card | 5%, min $250, max $7,500 (as published) | No | None | Import |
| Copart | Public in many states | Free basic; paid tier to bid; broker where required | Sliding scale + gate and internet fees | Yes | None | Import |
| IAA | Public in many states | Registration tiers with an annual fee; broker where required | Sliding scale + fees | Yes | None | Import |
| Manheim | Dealers only | Dealer licence | Sliding scale by location | Yes | None | Import |
| ADESA / OPENLANE | Dealers only | Dealer licence | Sliding scale | Yes | None | Import |
| ACV | Dealers only | Dealer licence | Flat by price band | No | None | Import |
| GovDeals | Anyone | Free | Stated per lot | Yes | None | Import |
| GSA Auctions | Anyone | Free, identity verified | None (no buyer premium) | Yes | Official | **Yes** (GSA Auctions API) |
| MarketCheck | A data service; the seller decides | Paid API plan | Set by the dealer or auction | No | Official (paid) | **Yes** (auction lots; dealer prices as comparables) |
| Local public auctions | Anyone | ID + deposit at the door | Stated at the door | Yes | None | Import |
| Mecum / Barrett-Jackson | Anyone | Bidder registration fee, proof of funds | About 10% in person, more online (per event) | Yes | None | Import |
| PCARMARKET | Anyone | Free account + card | A percent with a minimum and cap (buyer agreement) | No | None | Import |
| Collecting Cars | Anyone | Free account + card | 6%, min US$1,000, max US$10,000 (as published) | No | None (data by written consent) | Import |
| Hagerty Marketplace | Anyone | Free account + card | 7%, min $500, no cap found (as published) | No | None | Import |
| duPont REGISTRY Live | Registered bidders | See bidder guidelines | 5% (as published) | Some lots | None | Import |
| The MB Market | Anyone | Free account + card | 4.5%, min $225, max $4,500 (as published) | No | None | Import |
| Hemmings Auctions | Anyone | Free account | Check the site | No | None | Import |
| RM Sotheby's | Approved bidders | References | 12% to $250k, 10% above (as published for the sale) | Yes | None | Import |
| Gooding Christie's | Approved bidders | References | Live 12% / 10% above $250k; online 10% (as published) | Yes | None | Import |
| Bonhams Cars | Approved bidders | References | Changed 1 Oct 2026; check the page | Yes | None | Import |
| Public Surplus | Anyone | Free | Set by each agency, often 6.5-10% | No | None | Import |
| Municibid | 18+, US/Canada | Free + card | 9% to $99,999.99, then tiered (as published) | No | None (written agreement possible) | Import |
| PropertyRoom | Anyone | Free | 10, 12 or 15% on vehicles | No | None | Import |
| GovPlanet | 21+, approved | Free, approval to bid | Sliding by price | No | None | Import |
| HiBid (local auctioneers) | Depends on the auctioneer | Free, per-auctioneer approval | Set by each auctioneer, often 10-18% | Some | None | Import |
| Purple Wave | Anyone | Free | 10% on most sales, some 15%, min $100 (as published) | No | None | Import |
| US Treasury seized (CWS) | Anyone with photo ID | Free | None (as published) | Some | None | Import |
| America's Auto Auction | Dealers; public at public and GSA sales | AuctionACCESS | Sliding by location | Yes | None | Import |

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

## "Import" means

Gavel reads the lot you open yourself: the **Send to Gavel** bookmark button
passes the visible page text to Gavel, or you paste it, or you upload a CSV
exported from your own auction account. Nothing is scraped. See
`src/sources/importer.ts` for the labels it reads.

The same button works on a **finished** sale (a Bring a Trailer or Cars &
Bids result, a lot you won, an auction's sold report as a CSV). Gavel keeps it
as a sold price: real money paid, the strongest comparable there is. Sold
prices never appear in the feed; they sharpen the estimate for the same make
and model within a model year, for two years after the sale date.
