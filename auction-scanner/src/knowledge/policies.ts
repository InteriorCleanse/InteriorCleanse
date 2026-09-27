/**
 * HOUSE POLICIES — how each auction actually works for a buyer: who may
 * register, what it costs, the deposit, the payment window, every fee line,
 * pickup and storage, what you can dispute, how the bidding runs, and the
 * traps. Written so a beginner can act on it.
 *
 * Numbers carry the month they were checked and a link to verify. Where a
 * house uses a sliding scale, the entry says so and names the calculator;
 * no rate is invented. Everything here changes; the verify link is the truth.
 */

export type FeeLine = { name: string; basis: string; note?: string }

export type HousePolicy = {
  houseId: string
  name: string
  checked: string
  sources: string[]
  whoMayBuy: string
  registration: { cost: string; needs: string[]; note?: string }
  deposit: string
  payment: { window: string; methods: string[]; late: string }
  fees: FeeLine[]
  pickup: { window: string; storage: string; transport: string }
  disputes: string
  bidding: { style: string; extension: string; proxy: string; increments: string }
  titles: string
  gotchas: string[]
}

export const HOUSE_POLICIES: HousePolicy[] = [
  {
    houseId: 'ebay',
    name: 'eBay Motors',
    checked: '2026-09',
    sources: ['https://www.ebay.com/help/buying/buying-vehicles/buying-vehicles?id=4131', 'https://pages.ebay.com/ebaymotors/buy/purchase-protection/'],
    whoMayBuy: 'Anyone with an eBay account. No licence. Sellers are private people and dealers.',
    registration: { cost: 'Free.', needs: ['An eBay account', 'A payment method on file'], note: 'Some sellers require you to contact them before bidding, or set a minimum feedback score.' },
    deposit: 'Set by the seller in the listing: often a deposit within a day or two of winning, with the balance on pickup. Read the "Payment" section of every listing before you bid.',
    payment: { window: 'The seller sets it; commonly a deposit within 24 to 48 hours and the balance within 7 days.', methods: ['Deposit through eBay', 'Balance by cashier\'s cheque, bank transfer at pickup, or as the listing states'], late: 'A buyer who does not pay gets an unpaid-item strike and can be blocked from bidding on vehicles.' },
    fees: [{ name: 'Buyer fee', basis: 'None on vehicles.', note: 'The seller pays eBay\'s listing fees.' }, { name: 'Sales tax', basis: 'Paid when you register the car in your state, not to eBay.' }],
    pickup: { window: 'Agreed with the seller; usually within a week or two.', storage: 'None from eBay; a seller may ask for storage after the agreed date.', transport: 'You arrange it. Get quotes before you bid.' },
    disputes: 'Vehicle Purchase Protection covers some cases of fraud and misdescribed title or damage, with conditions and a cap (check the current programme page). It is not a warranty. Meet the seller with the car and the title before paying the balance.',
    bidding: { style: 'Countdown auction with a fixed end time, or Buy It Now, or both.', extension: 'None. The listing ends exactly at the end time, so last-second bids ("sniping") work here.', proxy: 'Enter your maximum once; eBay bids for you in increments up to it.', increments: 'Set by eBay by price band; shown on the bid form.' },
    titles: 'Whatever the seller declares. The listing has a "Title" field; verify it with a history report and the VIN.',
    gotchas: ['Never wire money to a private seller you have not met.', 'A price far below every comparable is the classic scam pattern on eBay: fake listings with real photos.', 'The reserve can be hidden. "Reserve not met" means no sale at that price.', 'The car must be picked up in the state it sits in; check your own state\'s title and emissions rules first.'],
  },
  {
    houseId: 'carsandbids',
    name: 'Cars & Bids',
    checked: '2026-09',
    sources: ['https://carsandbids.com/faq/'],
    whoMayBuy: 'Anyone with an account and a card on file. No licence.',
    registration: { cost: 'Free.', needs: ['An account', 'A credit card on file for the buyer fee'] },
    deposit: 'None up front; the card on file is charged the buyer fee when you win.',
    payment: { window: 'You pay the seller directly for the car, usually within a few days of the auction ending.', methods: ['Bank wire to the seller', 'Cashier\'s cheque in person', 'As agreed with the seller'], late: 'The buyer fee is charged at the hammer; not paying the seller gets you banned.' },
    fees: [{ name: 'Buyer fee', basis: '5% of the hammer price, minimum $250, maximum $7,500.', note: 'As published in 2026. Verify on the FAQ.' }],
    pickup: { window: 'Agreed with the seller.', storage: 'Not a Cars & Bids matter; agree it with the seller.', transport: 'You arrange it. Cars & Bids partners with a shipper for quotes.' },
    disputes: 'Auctions are between you and the seller. Cars & Bids requires sellers to disclose known flaws and moderates comments; there is no post-sale arbitration like a dealer auction.',
    bidding: { style: 'Countdown auction, usually seven days.', extension: 'If a bid lands in the final two minutes the clock resets to two minutes, so sniping does not work; set your maximum and let it run.', proxy: 'Bids are placed live; there is no proxy bid, so be there for the last minutes or use your written maximum.', increments: 'Set by the site by price band.' },
    titles: 'Sellers must disclose title status; most cars are clean title. Salvage and rebuilt cars are listed rarely and labelled.',
    gotchas: ['Read the comments: the community finds the flaws for you.', 'The buyer fee applies even if you resell the car the next day.', 'Sale prices are public forever, so the "Results" pages are your price guide.'],
  },
  {
    houseId: 'bat',
    name: 'Bring a Trailer',
    checked: '2026-09',
    sources: ['https://bringatrailer.com/faq/'],
    whoMayBuy: 'Anyone with an account and a card on file. No licence.',
    registration: { cost: 'Free.', needs: ['An account', 'A credit card on file for the buyer fee'] },
    deposit: 'None up front; the buyer fee is charged to the card when you win.',
    payment: { window: 'Pay the seller directly, typically within a week.', methods: ['Bank wire', 'Cashier\'s cheque', 'As agreed with the seller'], late: 'Non-payment ends your ability to bid.' },
    fees: [{ name: 'Buyer fee', basis: '5% of the hammer price, minimum $250, maximum $7,500 for cars.', note: 'Motorcycles, parts and some other categories: 10% capped at $4,000 (since June 2025). Verify on the FAQ.' }],
    pickup: { window: 'Agreed with the seller.', storage: 'Agree it with the seller.', transport: 'You arrange it; the site offers shipping quotes.' },
    disputes: 'Between buyer and seller. The site vets listings and photos; it does not inspect cars. Comment threads carry the real inspection.',
    bidding: { style: 'Countdown auction, usually seven days.', extension: 'A bid in the final two minutes extends the auction by two minutes. Sniping does not work.', proxy: 'No proxy bidding; bid live.', increments: 'Set by the site.' },
    titles: 'Sellers disclose; almost all clean. Reserve and no-reserve listings are marked.',
    gotchas: ['Buyers are experts; a "steal" here usually has a reason stated in the comments.', 'The buyer fee is on top of the hammer and charged instantly.', 'Use "Results" as your comps for anything collectible.'],
  },
  {
    houseId: 'copart',
    name: 'Copart',
    checked: '2026-09',
    sources: ['https://www.copart.com/content/us/en/member-fees', 'https://www.copart.com/helpWithLicensing'],
    whoMayBuy: 'Registered members. Public buyers where the state allows it; many states and many titles (salvage in particular) are dealer- or licence-only, and there a registered broker bids for you.',
    registration: { cost: 'Basic membership about $59 a year (limited bidding), Premier about $259 a year (bid on more inventory, higher limits).', needs: ['Government photo ID', 'A membership', 'A deposit or a card for one', 'A dealer or business licence where your state or the title type requires it'], note: 'Prices as published in 2026 sources; verify on the fee page.' },
    deposit: 'A refundable deposit sets how high you can bid (a percentage of your bids, with a minimum). Premier members bid higher without a per-lot deposit.',
    payment: { window: 'Three business days after the sale for most lots.', methods: ['Wire transfer', 'Cashier\'s cheque or money order at the yard', 'Card for smaller amounts, with a card fee'], late: 'A late-payment fee, and after the window the sale can be cancelled with your deposit forfeited and a relist fee.' },
    fees: [
      { name: 'Buyer fee', basis: 'Sliding scale by sale price, different for licensed and non-licensed buyers.', note: 'No single number. Use Copart\'s fee calculator on the lot page.' },
      { name: 'Internet (virtual) bid fee', basis: 'Charged when you win online; tiered by price (about $99 in 2026 sources).', note: 'Verify.' },
      { name: 'Gate fee', basis: 'About $95 per vehicle for release from the yard.', note: 'Verify.' },
      { name: 'Environmental fee', basis: 'About $15 per vehicle.', note: 'Verify.' },
      { name: 'Broker fee', basis: 'If a broker bids for you, their own fee on top.' },
      { name: 'Loading and storage', basis: 'Storage after the free days; loading for non-runners.' },
      { name: 'Sales tax', basis: 'Charged at the yard unless you provide a resale certificate.' },
    ],
    pickup: { window: 'A few free days after payment (varies by yard), then daily storage.', storage: 'Daily storage fees begin after the free period.', transport: 'Copart offers transport quotes; you may also send your own carrier with the release paperwork.' },
    disputes: 'Sales are as-is. Copart may cancel a sale over a title or VIN problem; there is no arbitration for condition. Photos and the description are the whole inspection unless you visit the yard.',
    bidding: { style: 'Pre-bid, then a live virtual lane where lots close one after another at a set time.', extension: 'The lane runs until each lot closes; a late bid keeps the lot open a few more seconds.', proxy: 'Pre-bid your maximum; the system bids for you in the lane up to it.', increments: 'Set by price band; shown on the lot page.' },
    titles: 'Salvage, clean, rebuilt, parts-only (certificate of destruction), bill-of-sale-only. Each lot says which; the type decides who may buy it and what you can do with it.',
    gotchas: ['Add every fee before you bid: on a $3,000 car the fees can be a third of the price.', '"Run and drive" means it started and moved at the yard, nothing more.', 'A certificate of destruction car can never be registered.', 'Some states will not let you title a salvage car bought out of state without a rebuild inspection.'],
  },
  {
    houseId: 'iaa',
    name: 'IAA (Insurance Auto Auctions)',
    checked: '2026-09',
    sources: ['https://www.iaai.com/buyerfees', 'https://help.iaai.com/s/article/Buyer-Eligibility-by-State-1590513137195'],
    whoMayBuy: 'Registered buyers. Public buyers where the state allows; elsewhere a licensed business account or a broker.',
    registration: { cost: 'About $225 a year for a public or licensed buyer account (2026).', needs: ['Government photo ID', 'The annual fee', 'A business licence where required by your state or by the title type'], note: 'Verify the current fee on the registration page.' },
    deposit: 'A deposit or card on file sets your bidding limit.',
    payment: { window: 'Three business days after the sale for most lots.', methods: ['Wire', 'Cashier\'s cheque', 'Card within limits'], late: 'Late fee, then cancellation with deposit loss.' },
    fees: [
      { name: 'Buyer fee', basis: 'Sliding scale by sale price.', note: 'Public buyers pay the standard schedule; use the fee calculator.' },
      { name: 'Service fee', basis: 'About $105 per unit for handling, imaging and loading.', note: 'Verify.' },
      { name: 'Title handling', basis: 'About $20 per purchase.', note: 'Verify.' },
      { name: 'Internet bid fee', basis: 'Charged on online wins, tiered by price.' },
      { name: 'Storage', basis: 'Daily after the free days.' },
    ],
    pickup: { window: 'Free days after payment, then daily storage.', storage: 'Daily fees after the free period.', transport: 'IAA transport quotes or your own carrier.' },
    disputes: 'As-is. No condition arbitration. Many lots have an engine-start video.',
    bidding: { style: 'Pre-bid, then a live virtual auction at a set time.', extension: 'Lots stay open briefly after a late bid.', proxy: 'Pre-bid your maximum.', increments: 'By price band.' },
    titles: 'Salvage, clean, rebuilt, non-repairable. Each lot says which.',
    gotchas: ['Check "Buyer Eligibility by State" before registering; your state may not allow public buying at all.', 'The pre-bid close time is not the auction time; the live lane runs later.', 'Fees stack: buyer fee, service fee, internet fee, title fee.'],
  },
  {
    houseId: 'manheim',
    name: 'Manheim',
    checked: '2026-09',
    sources: ['https://site.manheim.com/en/marketplace-policies/us-policies.html', 'https://site.manheim.com/wp-content/themes/cox-manheim/assets/legal/NAAA-Arbitration-Policy.pdf'],
    whoMayBuy: 'Licensed dealers only, with a Manheim account tied to the licence.',
    registration: { cost: 'No membership fee; a dealer licence and business documents.', needs: ['State dealer licence', 'Business documents and a bank letter or floor plan', 'An AuctionACCESS registration'] },
    deposit: 'Credit is set per dealer; no per-lot deposit.',
    payment: { window: 'Typically by the next business day; floor-plan financing is common.', methods: ['ACH or wire', 'Floor plan', 'Certified funds at the location'], late: 'Late fees and account holds.' },
    fees: [{ name: 'Buy fee', basis: 'Sliding scale by sale price, set per location.', note: 'Use the location\'s fee schedule.' }, { name: 'Simulcast or online fee', basis: 'For online purchases, by location.' }, { name: 'Post-sale inspection', basis: 'Optional paid inspection that extends your protection.' }],
    pickup: { window: 'A few days; then storage.', storage: 'Per location.', transport: 'Manheim transport or your own carrier.' },
    disputes: 'The NAAA arbitration policy. Green light: full arbitration; the seller guarantees no undisclosed defects above the $800 repair threshold. Yellow light: announced conditions are excluded. Red light (as-is): only odometer, salvage or flood history, frame damage and title issues can be arbitrated. Digital sales get 10 calendar days from the sale day; if transport takes longer you get 2 days from delivery. An odometer understated by more than 200 miles is arbitrable.',
    bidding: { style: 'Live lanes in person and by Simulcast, plus timed online sales (OVE).', extension: 'Live lanes close at the fall of the hammer; timed sales extend briefly on late bids.', proxy: 'Proxy bids on timed sales.', increments: 'Set by the auctioneer.' },
    titles: 'Mostly clean; titles announced. Title-absent sales carry their own rules.',
    gotchas: ['Condition reports grade 0 to 5; a 3.5 is an average trade-in, a 4.5 is a nice car.', 'The light system decides what you can dispute. Never buy a red-light car you have not seen.', 'Arbitration clocks start on the sale day, not on delivery.'],
  },
  {
    houseId: 'adesa',
    name: 'ADESA (OPENLANE)',
    checked: '2026-09',
    sources: ['https://www.openlane.com/us/policies'],
    whoMayBuy: 'Licensed dealers only.',
    registration: { cost: 'No membership fee; a dealer licence and business documents.', needs: ['State dealer licence', 'AuctionACCESS', 'Bank references'] },
    deposit: 'Dealer credit line.',
    payment: { window: 'Typically two business days or per the sale terms.', methods: ['ACH', 'Wire', 'Floor plan'], late: 'Fees and holds.' },
    fees: [{ name: 'Buy fee', basis: 'Sliding scale by sale price.', note: 'See the current schedule.' }, { name: 'Online fee', basis: 'For OPENLANE purchases.' }],
    pickup: { window: 'A few days.', storage: 'Per location.', transport: 'Integrated transport quotes.' },
    disputes: 'NAAA-style arbitration with light designations and a short window; online sales rely on the seller\'s condition report, with arbitration for undisclosed structural damage, odometer and title issues.',
    bidding: { style: 'Live lanes and timed online sales.', extension: 'Timed sales extend on late bids.', proxy: 'Available online.', increments: 'Set per sale.' },
    titles: 'Announced per lot.',
    gotchas: ['Off-lease cars come with detailed condition reports; read the damage grid, not just the grade.'],
  },
  {
    houseId: 'acv',
    name: 'ACV Auctions',
    checked: '2026-09',
    sources: ['https://www.acvauctions.com/faq'],
    whoMayBuy: 'Licensed dealers only.',
    registration: { cost: 'No membership fee; dealer licence required.', needs: ['State dealer licence', 'Business documents'] },
    deposit: 'Dealer credit.',
    payment: { window: 'Fast, typically within a couple of business days.', methods: ['ACH', 'Wire', 'Floor plan'], late: 'Holds.' },
    fees: [{ name: 'Buy fee', basis: 'Flat fee by price band.', note: 'Shown in the app before you bid.' }],
    pickup: { window: 'Arranged through the app.', storage: 'Per seller.', transport: 'ACV Transportation quotes in the app.' },
    disputes: 'ACV inspects most cars itself and guarantees the condition report within stated limits; undisclosed frame damage, odometer and title issues are arbitrable within a short window after delivery.',
    bidding: { style: 'Timed online auctions, about 20 minutes each, all day.', extension: 'Late bids extend the clock.', proxy: 'Proxy bids available.', increments: 'Set by the app.' },
    titles: 'Announced per lot with title status and any absent-title terms.',
    gotchas: ['Listen to the engine recording and read the undercarriage photos; they are the reason to buy here.'],
  },
  {
    houseId: 'govdeals',
    name: 'GovDeals and GSA Auctions',
    checked: '2026-09',
    sources: ['https://www.govdeals.com/en/help', 'https://gsaauctions.gov'],
    whoMayBuy: 'Anyone with an account.',
    registration: { cost: 'Free.', needs: ['An account', 'A card on file on some sellers\' lots'] },
    deposit: 'Usually none; some sellers require a card hold.',
    payment: { window: 'Typically five business days after the sale.', methods: ['Wire', 'Card within limits', 'Certified funds at the seller'], late: 'Default fees and a ban.' },
    fees: [{ name: 'Buyer premium', basis: 'Stated per lot by the seller (a percentage); GSA charges none.' }, { name: 'Sales tax', basis: 'Per the selling agency and state.' }],
    pickup: { window: 'Usually ten business days; missed pickups can forfeit the car.', storage: 'The agency may charge or resell after the window.', transport: 'You arrange it; many lots must be towed.' },
    disputes: 'As-is, where-is. No returns. Inspection days are listed on the lot.',
    bidding: { style: 'Timed online auction.', extension: 'Bids in the last minutes extend the clock.', proxy: 'Enter a maximum.', increments: 'Set per lot.' },
    titles: 'Clean government titles; some lots are sold on a bill of sale only, which is a problem for registration.',
    gotchas: ['"Bill of sale only" means no title. Skip it as a beginner.', 'Pickup windows are strict and the lot may be far from a city.'],
  },
  {
    houseId: 'local',
    name: 'Local public auto auctions',
    checked: '2026-09',
    sources: [],
    whoMayBuy: 'The public, where the auction is licensed as a public sale. Dealer-only sales will turn you away.',
    registration: { cost: 'Free to a small fee at the door.', needs: ['Photo ID', 'A refundable deposit, often a few hundred dollars'] },
    deposit: 'Cash or card at the door, refunded if you buy nothing.',
    payment: { window: 'Same day or next business day.', methods: ['Cash', 'Certified funds', 'Card within limits'], late: 'The deposit is forfeited and the car is resold.' },
    fees: [{ name: 'Buyer premium', basis: 'Stated on the rules sheet, a percentage of the hammer with a minimum.' }, { name: 'Doc fee', basis: 'A flat paperwork fee.' }, { name: 'Sales tax', basis: 'Collected unless you present a resale certificate.' }],
    pickup: { window: 'Usually within a day or two.', storage: 'Daily after that.', transport: 'You drive it out or tow it.' },
    disputes: 'As-is unless the auctioneer announces otherwise. Some sales use a light or colour system: green means announced as running, yellow means announced problems, red means as-is with no recourse. The exact meaning is on the rules sheet.',
    bidding: { style: 'Live lane with an auctioneer and ringmen.', extension: 'None; the hammer falls.', proxy: 'None. You raise your number.', increments: 'Called by the auctioneer.' },
    titles: 'Announced per car; ask to see the title at the office before you bid.',
    gotchas: ['Go twice without bidding.', 'Write your maximum on your hand.', 'Ask what "as-is" means at this specific sale.'],
  },
  {
    houseId: 'collector',
    name: 'Mecum and Barrett-Jackson',
    checked: '2026-09',
    sources: ['https://www.mecum.com/faq/', 'https://www.barrett-jackson.com/'],
    whoMayBuy: 'Registered bidders; anyone may register.',
    registration: { cost: 'A bidder registration fee per event (roughly $100 to $500 by tier) and a bank letter or proof of funds for the higher tiers.', needs: ['Photo ID', 'The registration fee', 'A bank letter of guarantee for higher bidding limits'] },
    deposit: 'The registration and bank letter set your limit.',
    payment: { window: 'Usually by the end of the event or the next business day.', methods: ['Wire', 'Certified funds', 'Card within limits'], late: 'Fees and a ban.' },
    fees: [{ name: 'Buyer premium', basis: 'About 10% of the hammer in person, and a little more online, per event.', note: 'Verify for the specific event.' }, { name: 'Sales tax', basis: 'Per the event\'s state unless exempt.' }],
    pickup: { window: 'By the end of the event or a stated deadline.', storage: 'Then transport partners take over at your cost.', transport: 'Enclosed carriers are available at the event.' },
    disputes: 'As-is. Descriptions are the consignor\'s. Inspect on the preview days.',
    bidding: { style: 'Live lane with a television-paced auctioneer; online bidding runs alongside.', extension: 'None; the hammer falls.', proxy: 'Absentee and phone bids by arrangement.', increments: 'Called by the auctioneer.' },
    titles: 'Announced; mostly clean. Some cars sell on a bill of sale (very old cars) which needs care to register.',
    gotchas: ['Prices run hot under the lights. The quiet lots on the first day are where the value is.', 'The premium and the sales tax add up fast on a big number.'],
  },
]

export function policyFor(houseId: string): HousePolicy | undefined {
  return HOUSE_POLICIES.find((p) => p.houseId === houseId)
}
