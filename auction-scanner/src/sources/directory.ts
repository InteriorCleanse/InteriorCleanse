/**
 * THE AUCTION DIRECTORY — every house worth knowing, who may buy there, and
 * whether Gavel can read or bid on it by API.
 *
 * Honesty first: most car auctions have NO public API. The two "salvage
 * giants" (Copart, IAA) sell to the public in many states but through their
 * own sites; the dealer lanes (Manheim, ADESA) need a dealer licence; the
 * enthusiast sites (Cars & Bids, Bring a Trailer) have no developer programme.
 * eBay Motors is the one with an official, free API, and that is the source
 * Gavel reads live. The rest are here so a member always knows where to go,
 * what it costs to register, and what to expect on the day.
 *
 * Fees change. Each entry carries the fee as published when this was written,
 * and a link to check it. Where a house uses a sliding scale, no number is
 * invented: the entry says "sliding scale" and points at the calculator.
 */

export type AuctionHouse = {
  id: string
  name: string
  url: string
  /** 'public' anyone may buy; 'public-some-states' public in many states, dealer-only in others; 'dealer' licence required; 'broker' public via a registered broker. */
  access: 'public' | 'public-some-states' | 'dealer' | 'broker'
  /** What the house is for. */
  best: string
  /** What the inventory looks like — and the starter-mode caution. */
  inventory: string
  /** Registration cost and what it takes. */
  register: string
  /** Buyer fee as published. */
  buyerFee: string
  feeUrl: string
  /** Does Gavel read it live? */
  api: 'official' | 'none'
  /** Bidding from Gavel is possible only when the house has a bidding API. None do today. */
  bidApi: boolean
  /** In person? */
  inPerson: boolean
  /** Open a search on the house for this make/model. */
  searchUrl: (q: string) => string
  starterNote: string
}

export const AUCTION_HOUSES: AuctionHouse[] = [
  {
    id: 'ebay',
    name: 'eBay Motors',
    url: 'https://www.ebay.com/motors',
    access: 'public',
    best: 'The biggest public marketplace with a real developer API. Auctions and Buy It Now, private sellers and dealers, every make.',
    inventory: 'Everything from beaters to supercars. Titles are described by the seller, so read the listing and pull the VIN. Vehicle Purchase Protection covers some fraud cases.',
    register: 'Free eBay account. No licence. Payment and pickup are arranged with the seller after the auction ends.',
    buyerFee: 'No buyer fee on vehicles (the seller pays the listing fee).',
    feeUrl: 'https://www.ebay.com/help/selling/fees-credits-invoices/motors-fees',
    api: 'official',
    bidApi: false,
    inPerson: false,
    searchUrl: (q) => `https://www.ebay.com/sch/Cars-Trucks/6001/i.html?_nkw=${encodeURIComponent(q)}&_sop=1`,
    starterNote: 'Best first stop. You can bid from home, there is no buyer fee, and the seller must hand you a title. Always meet the seller with the car and the title before paying the balance.',
  },
  {
    id: 'carsandbids',
    name: 'Cars & Bids',
    url: 'https://carsandbids.com',
    access: 'public',
    best: 'Enthusiast cars from 1981 to today, every listing curated and photographed with a written inspection of known flaws.',
    inventory: 'Modern enthusiast cars, clean titles almost always, disclosed issues. Prices are often near retail, so real steals are rarer; watch for reserve-not-met relists and weekday endings.',
    register: 'Free account plus a card on file. No licence.',
    buyerFee: '5% of the hammer price, minimum $250, maximum $7,500 (as published; check the link).',
    feeUrl: 'https://carsandbids.com/faq',
    api: 'none',
    bidApi: false,
    inPerson: false,
    searchUrl: (q) => `https://carsandbids.com/search?q=${encodeURIComponent(q)}`,
    starterNote: 'Great for learning what cars really sell for: every past auction shows the final price and the comments where mechanics tear the car apart.',
  },
  {
    id: 'bat',
    name: 'Bring a Trailer',
    url: 'https://bringatrailer.com',
    access: 'public',
    best: 'The largest enthusiast auction. Classic to modern, strong on Porsche, BMW, Land Cruisers, air-cooled and analogue cars.',
    inventory: 'Well-documented, usually clean-title cars. Buyers are knowledgeable so bargains are rare; the comment threads are the best free education in the hobby.',
    register: 'Free account with a card on file. No licence.',
    buyerFee: '5% of the hammer price, minimum $250, maximum $7,500 (as published; check the link).',
    feeUrl: 'https://bringatrailer.com/faq/',
    api: 'none',
    bidApi: false,
    inPerson: false,
    searchUrl: (q) => `https://bringatrailer.com/search/?s=${encodeURIComponent(q)}`,
    starterNote: 'Use the "Results" pages as your price guide for anything collectible. Sold prices are public and searchable.',
  },
  {
    id: 'copart',
    name: 'Copart',
    url: 'https://www.copart.com',
    access: 'public-some-states',
    best: 'The biggest salvage and insurance auction. Also sells clean-title fleet, repo, dealer and donated cars.',
    inventory: 'Mostly damaged or salvage-title vehicles. Filter to "Clean Title" and "Run and Drive" to find the fleet and repo cars. Photos are the only inspection unless you visit the yard. Starter mode hides the salvage lanes.',
    register: 'Basic membership is free (view only); Premier membership (about $99/year as published) is needed to bid up to the deposit limit. Some states require a dealer or business licence for certain titles; Copart lists them per state. Where you cannot register directly, a registered broker bids for you for a fee.',
    buyerFee: 'Sliding scale by sale price, plus a gate fee, an internet-bid fee and, if used, a broker fee. No single number: use the fee calculator.',
    feeUrl: 'https://www.copart.com/content/us/en/member-fees',
    api: 'none',
    bidApi: false,
    inPerson: true,
    searchUrl: (q) => `https://www.copart.com/lotSearchResults?free=true&query=${encodeURIComponent(q)}`,
    starterNote: 'Set filters to Clean Title + Run and Drive + Minor Dents/Scratches. Add up every fee before you bid; on a cheap car the fees can be a third of the price.',
  },
  {
    id: 'iaa',
    name: 'IAA (Insurance Auto Auctions)',
    url: 'https://www.iaai.com',
    access: 'public-some-states',
    best: 'The other insurance giant. Clean-title lanes exist alongside the salvage.',
    inventory: 'Same picture as Copart: mostly damaged, with clean-title fleet and dealer trade-ins mixed in. Vehicle detail pages show an engine-start video on many lots.',
    register: 'Public buyer registration where the state allows it, otherwise a licensed buyer or a broker. Registration tiers carry an annual fee; check the current one.',
    buyerFee: 'Sliding scale by sale price, plus an internet-bid fee and service fees. Use the fee calculator.',
    feeUrl: 'https://www.iaai.com/buyerfees',
    api: 'none',
    bidApi: false,
    inPerson: true,
    searchUrl: (q) => `https://www.iaai.com/Search?Keyword=${encodeURIComponent(q)}`,
    starterNote: 'Watch the "pre-bid" close time; many lots close in a live virtual auction at a set hour, not on a countdown.',
  },
  {
    id: 'manheim',
    name: 'Manheim',
    url: 'https://www.manheim.com',
    access: 'dealer',
    best: 'The wholesale market where dealers buy trade-ins. This is where used-car lots get their inventory.',
    inventory: 'Clean-title trade-ins, lease returns, fleet and rental returns with condition reports and grades. The best source of nice cars at wholesale, and closed to the public.',
    register: 'A state dealer licence is required. No licence, no account. Until then a licensed dealer can buy for you for a flat fee (a "dealer buying service").',
    buyerFee: 'Buy fee on a sliding scale, set per auction location. Check the location page.',
    feeUrl: 'https://www.manheim.com/publications/fees',
    api: 'none',
    bidApi: false,
    inPerson: true,
    starterNote: 'The reason to get a dealer licence. Condition reports grade every car 0–5 so you can buy without seeing it.',
    searchUrl: (q) => `https://www.manheim.com/members/powersearch?keyword=${encodeURIComponent(q)}`,
  },
  {
    id: 'adesa',
    name: 'ADESA (OPENLANE)',
    url: 'https://www.openlane.com',
    access: 'dealer',
    best: 'The second big dealer lane, strong on off-lease cars straight from the finance companies.',
    inventory: 'Clean-title off-lease and fleet cars with condition reports. Dealer only.',
    register: 'Dealer licence required.',
    buyerFee: 'Sliding scale by sale price; see the current fee schedule.',
    feeUrl: 'https://www.openlane.com/us/fees',
    api: 'none',
    bidApi: false,
    inPerson: true,
    searchUrl: (q) => `https://www.openlane.com/search?q=${encodeURIComponent(q)}`,
    starterNote: 'Same rule as Manheim: dealer licence first.',
  },
  {
    id: 'acv',
    name: 'ACV Auctions',
    url: 'https://www.acvauctions.com',
    access: 'dealer',
    best: 'Online-only dealer auction with very detailed condition reports (undercarriage photos, engine sound recordings).',
    inventory: 'Dealer trade-ins, 20-minute auctions all day. Dealer only.',
    register: 'Dealer licence required.',
    buyerFee: 'Flat buy fee by price band; see the app.',
    feeUrl: 'https://www.acvauctions.com/faq',
    api: 'none',
    bidApi: false,
    inPerson: false,
    searchUrl: () => 'https://www.acvauctions.com',
    starterNote: 'Once licensed, the condition reports here are the easiest for a beginner to read.',
  },
  {
    id: 'govdeals',
    name: 'GovDeals and GSA Auctions',
    url: 'https://www.govdeals.com',
    access: 'public',
    best: 'Government surplus: police cars, city trucks, fleet sedans, seized vehicles. Anyone can bid.',
    inventory: 'Fleet-maintained, usually clean title, often high miles. Little to no photos of wear; inspection days are listed.',
    register: 'Free account. GSA Auctions (gsaauctions.gov) is the federal equivalent, also free.',
    buyerFee: 'Buyer premium varies by seller, typically stated on each lot. GSA charges none.',
    feeUrl: 'https://www.govdeals.com/en/help',
    api: 'none',
    bidApi: false,
    inPerson: true,
    searchUrl: (q) => `https://www.govdeals.com/en/search?keyword=${encodeURIComponent(q)}`,
    starterNote: 'Cheap, honest cars with maintenance records. Ex-fleet Ford Explorers, Chevy Tahoes and Toyota Camrys are common. Good first rental-fleet candidates.',
  },
  {
    id: 'local',
    name: 'Local public auto auctions',
    url: 'https://www.google.com/maps/search/public+auto+auction',
    access: 'public',
    best: 'Weekly in-person auctions that sell trade-ins, repos and donated cars to the public.',
    inventory: 'A mix. You can walk the lot, start the cars, look underneath. This is where to learn the rhythm of a live auction before spending real money.',
    register: 'Bring a photo ID and a deposit (cash or card, often $200–$500, refunded if you buy nothing). No licence at a public auction.',
    buyerFee: 'Stated at the door, typically a percentage of hammer with a minimum. Ask before you register.',
    feeUrl: 'https://www.google.com/maps/search/public+auto+auction',
    api: 'none',
    bidApi: false,
    inPerson: true,
    searchUrl: (q) => `https://www.google.com/maps/search/public+auto+auction+${encodeURIComponent(q)}`,
    starterNote: 'Go twice without bidding. Sit near the front, watch what sells and for how much, and write it down.',
  },
  {
    id: 'collector',
    name: 'Mecum and Barrett-Jackson',
    url: 'https://www.mecum.com',
    access: 'public',
    best: 'The big televised collector auctions. Supercars, muscle, exotics, in person and online.',
    inventory: 'Collector-grade cars, usually clean title, often sold at no reserve. Prices run hot under the lights; the bargains are the unglamorous lots on the first day.',
    register: 'Bidder registration with a fee (roughly $100–$500 depending on the event) and proof of funds or a bank letter for the high tiers.',
    buyerFee: 'About 10% of hammer in person and a little more online (as published per event; check before you register).',
    feeUrl: 'https://www.mecum.com/faq/',
    api: 'none',
    bidApi: false,
    inPerson: true,
    searchUrl: (q) => `https://www.mecum.com/lots/?q=${encodeURIComponent(q)}`,
    starterNote: 'Go as a spectator first; the ticket is cheap and you will see a thousand cars in a weekend.',
  },
]

export function houseById(id: string): AuctionHouse | undefined {
  return AUCTION_HOUSES.find((h) => h.id === id)
}
