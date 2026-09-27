/**
 * REGULATIONS — the laws a car buyer, flipper and renter runs into, in plain
 * English, with who they apply to and what to do. Federal rules are stated;
 * state rules are flagged "varies by state" with the office to ask. A date
 * says when the text was checked; the sources are where to verify.
 */

export type Regulation = {
  id: string
  title: string
  scope: 'federal' | 'state' | 'platform'
  appliesTo: Array<'buyer' | 'seller' | 'flipper' | 'rental' | 'dealer'>
  summary: string
  whatToDo: string[]
  variesByState: boolean
  checked: string
  sources: string[]
}

export const REGULATIONS: Regulation[] = [
  {
    id: 'odometer-disclosure',
    title: 'Federal odometer disclosure (the 20-year rule)',
    scope: 'federal',
    appliesTo: ['buyer', 'seller', 'flipper', 'dealer'],
    summary: 'Every transfer of ownership must include a written odometer statement for the first 20 model years of a car. Since 1 January 2021 this applies to model year 2011 and newer; 2010 and older stay under the old 10-year rule and are exempt. Tampering with an odometer or lying on the statement is a federal crime.',
    whatToDo: ['Make sure the odometer reading is written on the title or a separate federal odometer statement when you buy and when you sell.', 'Compare the reading with the history report; a car that "lost" miles is a car you do not buy.', 'Keep a copy of the statement with the bill of sale.'],
    variesByState: false,
    checked: '2026-09',
    sources: ['https://www.federalregister.gov/documents/2019/11/26/2019-25657/odometer-disclosure-requirements', 'https://www.nhtsa.gov/press-releases/consumer-alert-changes-odometer-disclosure-requirements'],
  },
  {
    id: 'ftc-used-car-rule',
    title: 'FTC Used Car Rule (the Buyers Guide window sticker)',
    scope: 'federal',
    appliesTo: ['dealer', 'buyer'],
    summary: 'Dealers must display a Buyers Guide on every used car they sell, saying whether it comes with a warranty or is sold "as is". Which "as is" form a dealer may use depends on the state. Private sellers are not covered. Penalties for dealers run to tens of thousands of dollars per violation.',
    whatToDo: ['Buying from a dealer: read the Buyers Guide; it overrides anything the salesperson said.', 'Once you are licensed: put a Buyers Guide on every car you sell and keep a signed copy.'],
    variesByState: true,
    checked: '2026-09',
    sources: ['https://www.ftc.gov/business-guidance/resources/dealers-guide-used-car-rule', 'https://www.ftc.gov/legal-library/browse/rules/used-car-rule'],
  },
  {
    id: 'nmvtis',
    title: 'NMVTIS (the national title database)',
    scope: 'federal',
    appliesTo: ['buyer', 'flipper', 'dealer'],
    summary: 'The National Motor Vehicle Title Information System, run by the Department of Justice, records title brands (salvage, flood, junk), the current state of title, odometer readings at title events and total-loss reports from insurers and junk yards. Approved providers sell reports for a small fee. Commercial reports (Carfax, AutoCheck) add accident and service records from other sources.',
    whatToDo: ['Run an NMVTIS or commercial history report on every car before you bid.', 'Treat a "total loss" or "salvage" record as final even if the current title is clean; a title washed through another state is still a totalled car.'],
    variesByState: false,
    checked: '2026-09',
    sources: ['https://vehiclehistory.bja.ojp.gov/'],
  },
  {
    id: 'title-branding',
    title: 'Title brands: salvage, rebuilt, flood, lemon, junk',
    scope: 'state',
    appliesTo: ['buyer', 'flipper', 'rental'],
    summary: 'States brand titles when a car is declared a total loss (salvage), rebuilt and inspected after that (rebuilt or reconstructed), water damaged (flood), bought back by the maker (lemon), or fit only for parts (junk, non-repairable, certificate of destruction). Brands follow the car. What each brand allows, and what inspection a rebuild needs, varies by state.',
    whatToDo: ['Starter mode hides branded titles. Keep it that way until you have profit to risk.', 'Before ever buying a salvage car, ask your DMV what inspection a rebuilt title needs in your state and what it costs.', 'Never buy a junk, non-repairable or certificate-of-destruction car: it cannot be registered.'],
    variesByState: true,
    checked: '2026-09',
    sources: ['https://vehiclehistory.bja.ojp.gov/'],
  },
  {
    id: 'title-jumping',
    title: 'Title jumping (skipping the title)',
    scope: 'state',
    appliesTo: ['flipper', 'seller'],
    summary: 'Selling a car without first putting the title in your own name, by passing the previous owner\'s signed title to your buyer, is illegal in every state. It dodges sales tax and the sale-limit rules and it is how many first-time flippers get caught. It is also called "floating" a title or "curbstoning" when done at scale.',
    whatToDo: ['Title every car you buy in your name before you list it.', 'Keep the bill of sale for both ends of every flip.'],
    variesByState: true,
    checked: '2026-09',
    sources: [],
  },
  {
    id: 'sale-limit',
    title: 'How many cars you can sell without a dealer licence',
    scope: 'state',
    appliesTo: ['flipper', 'seller'],
    summary: 'Every state sets a yearly number of vehicle sales above which a person is a dealer and needs a licence. The number varies widely, from a few cars to more than a dozen, and some states count purchases too. Selling above it can mean fines and losing the right to register cars.',
    whatToDo: ['Look up "dealer licence" on your state DMV or motor vehicle site for the exact number.', 'Count every sale in a calendar year, including cars sold for friends.', 'Plan the licence before you reach the number, not after.'],
    variesByState: true,
    checked: '2026-09',
    sources: [],
  },
  {
    id: 'sales-tax',
    title: 'Sales and use tax on a used car',
    scope: 'state',
    appliesTo: ['buyer', 'flipper', 'dealer', 'rental'],
    summary: 'Most states charge sales or use tax when a car is registered by its buyer, on the price paid or a book value, whichever the state uses. Auctions in some states collect it at the yard unless you show a resale certificate. Dealers collect it from their buyers. Rental companies may owe rental surcharges.',
    whatToDo: ['Ask the auction whether it collects tax and what a resale certificate needs.', 'Budget the tax into your max bid if you are keeping the car.', 'Once licensed, ask your state revenue department how dealer sales tax and resale certificates work.'],
    variesByState: true,
    checked: '2026-09',
    sources: [],
  },
  {
    id: 'emissions',
    title: 'Emissions and safety inspections',
    scope: 'state',
    appliesTo: ['buyer', 'flipper'],
    summary: 'Some states and counties require an emissions ("smog") test or a safety inspection to register a car, and some make the seller responsible for a passing certificate. California is the well-known example. A car that cannot pass cannot be registered there.',
    whatToDo: ['Check your county\'s inspection rules before buying a car from out of state.', 'Read the check-engine light and the readiness monitors with an OBD-II scanner before you bid; a cleared computer will not pass.'],
    variesByState: true,
    checked: '2026-09',
    sources: [],
  },
  {
    id: 'lemon-laws',
    title: 'Lemon laws and implied warranties',
    scope: 'state',
    appliesTo: ['buyer', 'dealer'],
    summary: 'State lemon laws mostly cover new cars; a few states have used-car lemon laws that apply to dealers. Private sales are almost always "as is". Some states let dealers disclaim implied warranties with the as-is Buyers Guide; others do not.',
    whatToDo: ['As a buyer from a private seller or an auction, assume no warranty at all.', 'Once licensed, learn which implied warranties your state lets you disclaim.'],
    variesByState: true,
    checked: '2026-09',
    sources: ['https://www.ftc.gov/business-guidance/resources/dealers-guide-used-car-rule'],
  },
  {
    id: 'dealer-licence',
    title: 'Getting a dealer licence',
    scope: 'state',
    appliesTo: ['flipper', 'dealer'],
    summary: 'A state licence that lets you buy at dealer-only auctions, use dealer plates and sell above the per-year limit. The general path: a business entity and EIN, a surety bond, a compliant place of business, a pre-licensing course where required, the application and fee, an inspection and a background check, then yearly renewal. Costs and lot rules vary a lot by state.',
    whatToDo: ['Read your state\'s dealer-licence page before renting any lot.', 'Price the bond, the lot, the insurance and the fees before you decide.', 'Until then, use a dealer buying service or a broker for dealer-only cars.'],
    variesByState: true,
    checked: '2026-09',
    sources: [],
  },
  {
    id: 'insurance',
    title: 'Insurance before the car moves',
    scope: 'state',
    appliesTo: ['buyer', 'flipper', 'rental'],
    summary: 'Every state requires liability insurance to drive on public roads, and most require proof to register. A car in transit on a carrier is covered by the carrier\'s cargo insurance, within limits. A car used for rental is excluded by most personal policies.',
    whatToDo: ['Add the car to your policy with the VIN before it moves.', 'Check the carrier\'s cargo insurance limit against the car\'s value.', 'For rental use, get a policy that names rental use in writing before the first booking.'],
    variesByState: true,
    checked: '2026-09',
    sources: [],
  },
  {
    id: 'export-restrictions',
    title: 'Export-only and certificate-of-destruction lots',
    scope: 'state',
    appliesTo: ['buyer'],
    summary: 'Some salvage lots are sold only for export or only for parts and can never be registered in the United States. Copart and IAA mark them. Some states restrict who may buy salvage titles at all.',
    whatToDo: ['Read the title type on every salvage lot.', 'As a beginner, skip anything that is not a clean title.'],
    variesByState: true,
    checked: '2026-09',
    sources: ['https://www.copart.com/helpWithLicensing'],
  },
  {
    id: 'turo-eligibility',
    title: 'Peer-to-peer rental eligibility (Turo example)',
    scope: 'platform',
    appliesTo: ['rental'],
    summary: 'Turo, as of 2026, accepts cars under 12 model years old, with fewer than 130,000 miles, a clean title that was never declared a total loss, and a fair market value up to $200,000, with exceptions for specialty and classic cars. Other platforms have similar but different rules, and they change.',
    whatToDo: ['Read the platform\'s current eligibility page before you buy a car for it.', 'Buy the newest, lowest-mile example your budget allows; the limits creep up on you.'],
    variesByState: false,
    checked: '2026-09',
    sources: ['https://help.turo.com/en_us/vehicles-we-accept-rylmrNl45'],
  },
  {
    id: 'naaa-arbitration',
    title: 'Dealer-auction arbitration (the NAAA policy)',
    scope: 'platform',
    appliesTo: ['dealer'],
    summary: 'Dealer auctions sell under the NAAA arbitration policy. A green light means the seller guarantees no undisclosed defects above a repair threshold (Manheim: $800); yellow means announced conditions are excluded; red means as-is, with only odometer, salvage or flood history, frame damage and title issues open to dispute. Windows are short: Manheim gives 10 calendar days from the sale day for digital sales. An odometer understated by more than 200 miles is arbitrable.',
    whatToDo: ['Inspect or read the condition report before the hammer; arbitration is the exception, not the plan.', 'File any claim inside the window, from the sale day, not delivery day.'],
    variesByState: false,
    checked: '2026-09',
    sources: ['https://site.manheim.com/wp-content/themes/cox-manheim/assets/legal/NAAA-Arbitration-Policy.pdf'],
  },
]

export function regulationsFor(role: Regulation['appliesTo'][number]): Regulation[] {
  return REGULATIONS.filter((r) => r.appliesTo.includes(role))
}
