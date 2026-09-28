/**
 * THE FIRST-CAR FINDER — given a budget and a road (peer-to-peer rental, your
 * own fleet, or a flip), rank a short list of candidate cars with the reason
 * each is there, and hand back the first ten steps for that road.
 *
 * The candidates are a curated table, not a market feed. Price bands are wide
 * and marked as rough; the live comps in the Feed are the real check. Nothing
 * here promises a return.
 */
import { config } from '../config.ts'
import { money } from './ui.ts'

export type RentalUse = 'p2p' | 'fleet' | 'flip'

export type RentalPick = {
  make: string
  model: string
  years: string
  whyPlain: string
  watchOut: string
  /** Against what you could bid once transport and a cushion come out of your cash: in, under, stretch (only just fits) or over. */
  budgetFit: 'under' | 'in' | 'stretch' | 'over'
  /** Rough used-price band in dollars, wide on purpose. */
  roughBandUsd: [number, number]
}

export type RentalResult = { picks: RentalPick[]; steps: string[]; notes: string[]; /** What your cash leaves to bid after default transport and the cushion. */ bidCeilingUsd: number }

type Candidate = Omit<RentalPick, 'budgetFit'> & { uses: RentalUse[]; rank: number }

const CANDIDATES: Candidate[] = [
  { make: 'Toyota', model: 'Camry', years: '2015–2021', roughBandUsd: [11_000, 24_000], uses: ['p2p', 'fleet'], rank: 1, whyPlain: 'The rental-fleet default. Reliable, cheap parts, comfortable, and renters never complain about it.', watchOut: 'Ex-rental and ex-fleet examples are common; check the history report for how many owners.' },
  { make: 'Toyota', model: 'Corolla', years: '2015–2022', roughBandUsd: [9_000, 20_000], uses: ['p2p', 'fleet'], rank: 2, whyPlain: 'Cheapest car to keep on the road. Small, efficient, endless demand.', watchOut: 'Small cars earn a little less per day; the gap closes when you count fuel and tyres.' },
  { make: 'Honda', model: 'Civic', years: '2016–2022', roughBandUsd: [10_000, 22_000], uses: ['p2p', 'fleet', 'flip'], rank: 3, whyPlain: 'Sells and rents everywhere. Holds value unusually well for its price.', watchOut: 'Many are modified by young owners; buy the stock one with records.' },
  { make: 'Honda', model: 'Accord', years: '2016–2022', roughBandUsd: [12_000, 26_000], uses: ['p2p', 'fleet', 'flip'], rank: 4, whyPlain: 'Camry\'s rival: roomier, a little sharper to drive, same reputation.', watchOut: 'Some earlier automatic transmissions had known issues; check the model year\'s history before buying.' },
  { make: 'Toyota', model: 'RAV4', years: '2016–2022', roughBandUsd: [15_000, 30_000], uses: ['p2p', 'fleet', 'flip'], rank: 5, whyPlain: 'The small SUV everyone wants to rent for a trip. Strong resale.', watchOut: 'Priced high for what it is because everyone knows it; steals are rare.' },
  { make: 'Honda', model: 'CR-V', years: '2016–2022', roughBandUsd: [14_000, 28_000], uses: ['p2p', 'fleet', 'flip'], rank: 6, whyPlain: 'Same story as the RAV4 with a bit more space.', watchOut: 'Check that the air conditioning blows cold; a known weak point on some years.' },
  { make: 'Tesla', model: 'Model 3', years: '2018–2022', roughBandUsd: [17_000, 32_000], uses: ['p2p'], rank: 7, whyPlain: 'One of the most-booked cars on peer-to-peer platforms. Very cheap to run per mile.', watchOut: 'Renters need charging explained; tyres wear fast; out-of-warranty repairs are dealer-only and pricey.' },
  { make: 'Jeep', model: 'Wrangler', years: '2012–2020', roughBandUsd: [15_000, 35_000], uses: ['p2p', 'flip'], rank: 8, whyPlain: 'People rent Wranglers for the experience and pay a premium. Holds value unusually well.', watchOut: 'Rough ride, thirsty, and many are lifted or abused off-road. Buy the stock one.' },
  { make: 'Toyota', model: 'Sienna', years: '2015–2020', roughBandUsd: [15_000, 30_000], uses: ['p2p', 'fleet'], rank: 9, whyPlain: 'The minivan for family trips near airports and theme parks. Reliable and roomy.', watchOut: 'Sliding-door motors and worn interiors on high-mile family vans.' },
  { make: 'Ford', model: 'Mustang (convertible)', years: '2015–2020', roughBandUsd: [15_000, 30_000], uses: ['p2p', 'flip'], rank: 10, whyPlain: 'A fun-car rental for weekends and holidays; strong demand in sunny places.', watchOut: 'Renters drive it hard. Budget for tyres and brakes more often.' },
  { make: 'Toyota', model: 'Tacoma', years: '2012–2020', roughBandUsd: [16_000, 34_000], uses: ['flip', 'p2p'], rank: 11, whyPlain: 'Among the strongest resale values of any vehicle. Sells fast at almost any age.', watchOut: 'Frame rust on older trucks from salted-road states; look underneath.' },
  { make: 'Toyota', model: '4Runner', years: '2010–2020', roughBandUsd: [15_000, 38_000], uses: ['flip', 'p2p'], rank: 12, whyPlain: 'Cult following, slow depreciation, easy to sell.', watchOut: 'High miles are normal; records matter more than the odometer.' },
  { make: 'Lexus', model: 'GX 460', years: '2010–2019', roughBandUsd: [14_000, 34_000], uses: ['flip'], rank: 13, whyPlain: 'A Toyota Land Cruiser Prado in a suit; loyal buyers and a small supply.', watchOut: 'Fuel-hungry; buyers are picky about the condition of the interior.' },
  { make: 'Mazda', model: 'MX-5 Miata', years: '2009–2020', roughBandUsd: [9_000, 24_000], uses: ['flip'], rank: 14, whyPlain: 'Cheap to own, always sells, and easy for a beginner to inspect.', watchOut: 'Convertible top condition and rust in the rear arches on older cars.' },
  { make: 'Chevrolet', model: 'Corvette (C6/C7)', years: '2008–2019', roughBandUsd: [22_000, 50_000], uses: ['flip'], rank: 15, whyPlain: 'The most-searched sports car in the country, with cheap parts for what it is.', watchOut: 'Clean-title cars with records only; the market punishes stories.' },
  { make: 'Porsche', model: '911 / Cayman / Boxster', years: '2006–2016', roughBandUsd: [28_000, 80_000], uses: ['flip'], rank: 16, whyPlain: 'The deepest enthusiast market of any brand; clean examples turn over quickly.', watchOut: 'A pre-purchase inspection by a Porsche specialist is not optional. Certain engines have known expensive issues.' },
  { make: 'BMW', model: 'M3 / M4', years: '2011–2018', roughBandUsd: [25_000, 55_000], uses: ['flip'], rank: 17, whyPlain: 'Enthusiast demand; manual and low-mile cars sell quickest.', watchOut: 'Expensive to fix and often abused; records and an inspection first.' },
]

export const RENTAL_STEPS: Record<RentalUse, string[]> = {
  p2p: [
    'Read the platform\'s current eligibility page (age, mileage, title, value limits) before you shop.',
    'Ask your own insurer, in writing, whether a car you list for rental is covered. Understand the platform\'s protection plan.',
    'Set your budget and use the Feed with Starter mode on to find the car at your number.',
    'Verify the VIN and buy a history report.',
    'Buy at your number, title and register it in your name, insure it.',
    'Deep detail and twenty good photos.',
    'List it with a cleaning fee, a mileage limit and a fuel rule.',
    'Reply to every request within an hour for the first month.',
    'Track utilisation, revenue per day and cost per mile from the first trip.',
    'After ninety days, decide: car two, or sell into the market you now understand.',
  ],
  fleet: [
    'Form an LLC, get an EIN, open a business bank account.',
    'Get commercial auto insurance quotes for rental use before buying any car. This decides whether the plan works.',
    'Have a lawyer in your state review a rental agreement.',
    'Choose how you will verify licences and hold deposits.',
    'Ask your state whether rental companies must register or collect a surcharge.',
    'Buy the first car at your number using the Feed and the Plan screen.',
    'Fit a GPS tracker; set a cleaning routine and a maintenance schedule by miles.',
    'Start bookings with a calendar and a spreadsheet.',
    'Track utilisation, downtime and cost per mile weekly.',
    'Add car two only when car one pays for itself with time to spare.',
  ],
  flip: [
    'Pick a car on the demand list that sells quickly in your area.',
    'Use the Plan screen: resale minus fee, transport, fixes, cushion and margin equals your maximum bid.',
    'Verify the VIN, buy a history report, and get a mobile inspection.',
    'Buy at your number. Title it in your name at once.',
    'Fix safety first, then detail, then cosmetics; keep every receipt.',
    'Twenty honest photos and an honest listing.',
    'Price at the low end of the comps and hold firm.',
    'Meet at a bank, verify the funds, sign the title, two bills of sale, file the release of liability.',
    'Record what you paid, spent and sold for.',
    'Stay under your state\'s per-year sale limit or get licensed.',
  ],
}

function fit(ceiling: number, cash: number, band: [number, number]): RentalPick['budgetFit'] {
  if (ceiling >= band[1]) return 'under'
  if (ceiling >= band[0]) return 'in'
  if (cash >= band[0]) return 'stretch'
  return 'over'
}

const FIT_ORDER: Record<RentalPick['budgetFit'], number> = { in: 0, under: 1, stretch: 2, over: 3 }

/** Cash for one car, all in, minus the plan's default transport and cushion: roughly what is left to bid. */
export function bidCeiling(cashUsd: number): number {
  const costs = Math.round(config.plan.defaultDistanceMiles * config.plan.transportPerMileUsd) + config.plan.surpriseReserveUsd
  return Math.max(0, cashUsd - costs)
}

export function rentalPicks(budgetUsd: number, use: RentalUse): RentalResult {
  const budget = Number.isFinite(budgetUsd) && budgetUsd > 0 ? budgetUsd : 0
  const ceiling = bidCeiling(budget)
  const picks: RentalPick[] = CANDIDATES.filter((c) => c.uses.includes(use))
    .map((c) => ({ make: c.make, model: c.model, years: c.years, whyPlain: c.whyPlain, watchOut: c.watchOut, roughBandUsd: c.roughBandUsd, budgetFit: fit(ceiling, budget, c.roughBandUsd), rank: c.rank }))
    .sort((a, b) => FIT_ORDER[a.budgetFit] - FIT_ORDER[b.budgetFit] || a.rank - b.rank)
    .map(({ rank: _rank, ...p }) => p)
  const notes = [
    'Price bands are rough and wide on purpose. The live comparables in the Feed are the real check.',
    'Insurance comes before the car. Get the quote in writing first.',
    use === 'p2p' ? 'Peer-to-peer eligibility pages change. Read the current one before you buy.' : use === 'fleet' ? 'A one-car fleet is hard to insure. Some insurers will not write it; ask several.' : 'A car that sits unsold costs money every week. Price to sell in two weeks.',
    'A car that sits is a cost, not an asset.',
  ]
  if (budget === 0) notes.unshift('Type your cash for one car to see which cars fit it.')
  else notes.unshift(`Your ${money(budget)} leaves about ${money(ceiling)} to bid once transport and a cushion come out; the auction fee and tax come out too, and each plan works them out exactly. Stretch means only the cheapest ones fit.`)
  return { picks, steps: RENTAL_STEPS[use], notes, bidCeilingUsd: ceiling }
}
