// Every auction house Gavel knows, by id, in directory order. src/sources/directory.ts is the source;
// a test keeps this list equal to it. Generated with: node -e "..." (see test/houses.test.ts).
export const HOUSES = [
  ["ebay", "eBay Motors"],
  ["carsandbids", "Cars & Bids"],
  ["bat", "Bring a Trailer"],
  ["copart", "Copart"],
  ["iaa", "IAA (Insurance Auto Auctions)"],
  ["manheim", "Manheim"],
  ["adesa", "ADESA (OPENLANE)"],
  ["acv", "ACV Auctions"],
  ["govdeals", "GovDeals"],
  ["gsa", "GSA Auctions"],
  ["marketcheck", "MarketCheck (dealers and auctions)"],
  ["local", "Local public auto auctions"],
  ["collector", "Mecum and Barrett-Jackson"],
  ["pcarmarket", "PCARMARKET"],
  ["collectingcars", "Collecting Cars"],
  ["hagerty", "Hagerty Marketplace"],
  ["dupont", "duPont REGISTRY Live"],
  ["mbmarket", "The MB Market"],
  ["hemmings", "Hemmings Auctions"],
  ["rmsothebys", "RM Sotheby's"],
  ["gooding", "Gooding Christie's"],
  ["bonhams", "Bonhams Cars"],
  ["publicsurplus", "Public Surplus"],
  ["municibid", "Municibid"],
  ["propertyroom", "PropertyRoom.com"],
  ["govplanet", "GovPlanet"],
  ["hibid", "HiBid"],
  ["purplewave", "Purple Wave"],
  ["treasury", "US Treasury seized vehicles (CWS)"],
  ["americasaa", "America's Auto Auction"],
]

/** Names for ids that are not houses. */
const EXTRA = { sample: 'SAMPLE', other: 'Imported' }

export function houseName(id) {
  const h = HOUSES.find(([k]) => k === id)
  return h ? h[1] : EXTRA[id] || id
}
