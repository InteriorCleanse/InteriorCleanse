/**
 * The rule-based walkthrough: "how to buy THIS car at THIS auction", written
 * for someone who has never bought a car at auction.
 *
 * Seven numbered steps, built from the listing, the estimate, the score, the
 * bid plan and the auction house's directory entry. No network, no AI, no
 * guessing: every number quoted comes from the card, every fee comes with a
 * "verify" link, and anything the listing does not say is called out as a
 * question to ask. The optional AI explainer (ai.ts) starts from this text and
 * falls back to it.
 */
import type { BidPlan, Estimate, Listing, Score } from './types.ts'
import type { AuctionHouse } from './sources/directory.ts'

export type Walkthrough = {
  source: 'rules' | 'ai'
  title: string
  steps: Array<{ n: number; title: string; body: string }>
  warnings: string[]
}

export type WalkthroughCard = { listing: Listing; estimate: Estimate; score: Score; plan: BidPlan }

const HOUR = 3_600_000
const DAY = 24 * HOUR

function usd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function carName(l: Listing): string {
  const parts = [l.year, l.make, l.model].filter((p) => p !== undefined && p !== '').map(String)
  return parts.length >= 2 ? parts.join(' ') : l.title
}

function whereIs(l: Listing): string | undefined {
  const loc = l.location
  if (!loc) return undefined
  const bits = [loc.city, loc.state].filter(Boolean)
  return bits.length ? bits.join(', ') : loc.country
}

function endsIn(endsAt: number | undefined, now: number): string | undefined {
  if (endsAt === undefined) return undefined
  const ms = endsAt - now
  if (ms <= 0) return 'This auction has already ended.'
  if (ms < HOUR) return `This auction ends in under an hour.`
  if (ms < DAY) return `This auction ends in about ${Math.round(ms / HOUR)} hours.`
  const days = Math.round(ms / DAY)
  return `This auction ends in about ${days} day${days === 1 ? '' : 's'}.`
}

function askingPrice(l: Listing): number | undefined {
  return l.currentBidUsd ?? l.buyNowUsd
}

function isDealerOnly(house: AuctionHouse | undefined): boolean {
  return house?.access === 'dealer'
}

/* ── step 1 ─────────────────────────────────────────────────────────────── */
function stepIdentity(l: Listing): string {
  const p: string[] = []
  // The first sentence is the one that gets read: make it the thing to do.
  p.push('Decode the VIN, then run a history report on it, before you think about a bid.')
  if (l.kind === 'SAMPLE') {
    p.push('This is a SAMPLE car, so there is no real VIN to check. On a real car, this is what you would do.')
  }
  p.push(
    'A VIN (Vehicle Identification Number) is the 17-character code stamped on every car. It is the car\'s fingerprint: it tells you exactly what the factory built.',
  )
  if (l.vin && l.kind !== 'SAMPLE') {
    p.push(
      `This listing gives the VIN ${l.vin}. Decode it with the VIN check in Gavel (it asks the NHTSA, the US vehicle safety agency, for free). The year, make and model it returns must match this listing: ${carName(l)}. If they do not match, walk away.`,
    )
  } else if (l.kind !== 'SAMPLE') {
    p.push(
      'This listing does not show a VIN. Ask the seller for it before you bid, and decode it with the VIN check in Gavel. A seller who will not share the VIN is a red flag; move on.',
    )
  }
  p.push(
    'Then run a vehicle history report on that VIN. This is a paid report (an NMVTIS report through a provider listed on vehiclehistory.gov, or Carfax or AutoCheck) that shows title brands such as salvage, flood or rebuilt, reported accidents, past odometer readings and how many owners the car has had. The VIN decode alone does not know any of this.',
  )
  const status = l.titleStatus
  if (status === 'clean') {
    p.push('The listing says the title is clean. A clean title means no insurer has declared the car a total loss. Let the history report confirm it before you believe it.')
  } else if (status === 'unknown') {
    p.push('The listing does not say what kind of title the car has. Ask, and treat the answer as unconfirmed until the history report agrees.')
  } else {
    p.push(`The listing says the title is ${status}. That is a branded title: the car was declared a total loss or worse at some point. Starter mode hides these, and this is not a first car.`)
  }
  return p.join(' ')
}

/* ── step 2 ─────────────────────────────────────────────────────────────── */
function stepPhotos(l: Listing, house: AuctionHouse | undefined): string {
  const p: string[] = []
  p.push('Photos show what the seller wants you to see. Your job is the rest.')
  switch (l.damage) {
    case 'none':
      p.push('The seller says there is no damage. Do not take that on trust: ask for close-up photos of every corner of the car, the roof, the underside of the front bumper and the wheels, plus one of the odometer and one of the dashboard with the engine running so you can see any warning lights.')
      break
    case 'minor':
      p.push('The seller describes minor damage, which usually means scratches, scuffs or small dents. Ask exactly where, ask for close-ups, and ask whether any airbag has ever gone off. Minor cosmetic work is a cheap fix; an airbag is not.')
      break
    case 'moderate':
    case 'severe':
      p.push(`The seller describes ${l.damage} damage. Starter mode hides cars like this because the repair bill is unknown until the car is apart. Unless a mechanic has priced the repair for you in writing, pass.`)
      break
    default:
      p.push('The listing does not say whether the car is damaged. Assume there is some until you have seen every side of it, and ask the seller directly: "Has this car been in any accident? Is there any damage at all?"')
  }
  if (l.runsAndDrives === true) {
    p.push('The seller says it runs and drives. Ask for a short video of a cold start (the engine being started after sitting overnight) and of the car driving. Listen for knocking, watch for smoke, and check that every gear engages.')
  } else if (l.runsAndDrives === false) {
    p.push('The seller says it does NOT run and drive. That means a tow home and a repair bill nobody has measured. For a first car, pass.')
  } else {
    p.push('Nobody says whether it runs and drives. Ask. If the answer is vague, assume it does not.')
  }
  if (l.mileage !== undefined) p.push(`Mileage listed: ${l.mileage.toLocaleString('en-US')} miles. Check it against the odometer photo and the history report.`)
  else p.push('No mileage is listed. Ask for a photo of the odometer.')

  const where = whereIs(l)
  if (house?.inPerson) {
    p.push(
      `${house.name} lets you see cars before the sale.${where ? ` This one is in ${where}.` : ''} Go to the preview. Bring a flashlight and a paper towel. Look at the oil (milky means trouble), the coolant, rust underneath, tyres worn unevenly, paint that does not match from panel to panel, and every light on the dashboard when the key is turned. Start it if the house allows.`,
    )
  } else {
    p.push(
      `You cannot see this car in person before the auction ends${where ? ` (it is in ${where})` : ''}, so put your questions to the seller in writing and keep the answers. For anything you would mind losing money on, hire a pre-purchase inspection: a mobile mechanic goes to the car, checks it over and sends you a report for a fee. Search "pre-purchase inspection" plus the car's city.`,
    )
  }
  return p.join(' ')
}

/* ── step 3 ─────────────────────────────────────────────────────────────── */
function stepNumber(card: WalkthroughCard): string {
  const { listing: l, plan, estimate } = card
  const p: string[] = []
  p.push(
    `Your max bid for this car is ${usd(plan.maxBidUsd)}. That is the most you should pay, and it comes from working backwards: what the car should resell for, minus the buyer fee, transport, repairs, a cushion for surprises and the margin you want left over.`,
  )
  if (plan.lines.length) p.push('The lines: ' + plan.lines.join(' · ') + '.')
  if (estimate.ok) {
    p.push(`The estimate behind it is ${usd(estimate.valueUsd)} (${estimate.method}; range ${usd(estimate.low)} to ${usd(estimate.high)}).`)
  } else {
    p.push(`There is no value estimate for this car: ${estimate.reason} Until you have looked up real sold prices yourself, treat the max bid as a rough number, not a safe one.`)
  }
  const price = askingPrice(l)
  if (price !== undefined) {
    if (plan.headroomUsd !== undefined && plan.headroomUsd > 0) {
      p.push(`Right now the price is ${usd(price)}, which is ${usd(plan.headroomUsd)} under your max.`)
    } else if (plan.headroomUsd !== undefined) {
      p.push(`Right now the price is ${usd(price)}, already at or above your max. Watch how it ends and learn from it, but do not bid.`)
    } else {
      p.push(`Right now the price is ${usd(price)}.`)
    }
  }
  p.push('Write the max down before the sale starts. Never go above it, not by $100. Auctions are designed to make one more bid feel small; the number you wrote down is the only thing that protects you.')
  return p.join(' ')
}

/* ── step 4 ─────────────────────────────────────────────────────────────── */
function stepRegister(l: Listing, house: AuctionHouse | undefined): string {
  const p: string[] = []
  if (!house) {
    p.push(
      'Register with the auction before the sale, and write down its buyer fee, deposit and payment deadline.',
      l.kind === 'SAMPLE'
        ? 'This SAMPLE car has no real auction behind it, so Gavel does not have a directory entry for it; on a real lot, the Auctions screen has each house\'s rules.'
        : `Gavel does not have a directory entry for this auction (source: ${l.source}). Open the listing and read the site's "how to register" and "fees" pages.`,
    )
    return p.join(' ')
  }
  if (house.id === 'ebay') {
    p.push('You need a free eBay account; there is no licence and no membership fee. Add a payment method and make sure your address and phone number are current, because the seller will contact you.')
    p.push(`Buyer fee: ${house.buyerFee} Verify on ${house.feeUrl}.`)
    p.push(
      'Payment is arranged with the seller after the auction, not through eBay checkout for most vehicles. Agree the method in writing before the auction ends: a small deposit through eBay is common, with the balance paid when you collect the car and the title. Never wire the full amount to a seller you have not met, and never pay outside eBay\'s messages so the record exists. Read eBay\'s Vehicle Purchase Protection page to see what it covers before you rely on it.',
    )
    return p.join(' ')
  }
  p.push(`Registering at ${house.name}: ${house.register}`)
  p.push(`Buyer fee: ${house.buyerFee} Verify on ${house.feeUrl} before you bid, and put the real number into your bid plan.`)
  if (house.access === 'dealer') {
    p.push('You cannot buy here yet: it needs a dealer licence. Until you have one, a licensed dealer can buy for you for a fee (a dealer buying service). The Playbook explains how to get the licence.')
  } else if (house.access === 'public-some-states') {
    p.push('Whether you can register as a member of the public depends on your state and on the car\'s title type; the house lists this per state. Where you cannot, a registered broker bids for you for a fee. Add that fee to your plan.')
  } else if (house.access === 'broker') {
    p.push('You buy here through a registered broker, who bids for you and charges a fee. Add that fee to your plan.')
  }
  p.push(
    'Have ready: a government photo ID, the deposit the house asks for (it is refunded if you buy nothing), a way to pay the balance that the house accepts (many do not take personal cheques or credit cards for the full amount), and your max bid written down.',
  )
  if (house.starterNote) p.push(`Tip for this house: ${house.starterNote}`)
  return p.join(' ')
}

/* ── step 5 ─────────────────────────────────────────────────────────────── */
function stepBidding(l: Listing, house: AuctionHouse | undefined, now: number): string {
  const p: string[] = []
  const reserve =
    'A reserve is a secret minimum the seller will accept. If bidding ends below it, nobody wins and the seller may relist. "No reserve" means the highest bid takes the car whatever it is.'
  const id = house?.id
  if (id === 'ebay') {
    p.push(
      'eBay auctions end on a countdown at a fixed time, and the highest bid when the clock hits zero wins. Bids in the final seconds ("sniping") are normal and allowed. Set your max once, near the end, rather than bidding it up over days, which only tells everyone else you want the car. Enter your max as your bid: eBay bids for you in steps and never spends more than it has to.',
    )
    p.push(reserve)
    if (l.saleType !== 'auction') p.push('This listing also offers Buy It Now. If that price is under your max, you can skip the auction and pay it.')
  } else if (id === 'copart' || id === 'iaa') {
    p.push(
      `${house!.name} does not sell on a simple countdown. You leave a pre-bid (your max) before the sale, then the lot is sold in a live virtual lane at a set time, one car after another, fast. Your pre-bid competes for you; you can also bid live when the lot comes up if you are registered for it. If you are not sure, leave the pre-bid at your max and let it do the work.`,
    )
    p.push('Some lots are sold "on approval": the seller can still refuse the top bid. The lot page says which.')
  } else if (id === 'carsandbids' || id === 'bat') {
    p.push(
      `${house!.name} runs online auctions with a countdown, but a bid near the end extends the clock (the site\'s FAQ says by how much), so last-second sniping does not work here. Bid your max in the final minutes and stop when it is passed. Read the comments under the listing: mechanics and owners often point out what the photos miss.`,
    )
    p.push(reserve)
  } else if (id === 'govdeals') {
    p.push(
      'GovDeals auctions end on a countdown, usually with overtime: a bid in the final minutes extends the clock. Every lot sets its own terms, including the buyer premium and the pickup deadline, so read the lot page, not just the price.',
    )
  } else if (house?.inPerson && !house.bidApi && (id === 'local' || id === 'collector')) {
    p.push(
      'This is a live auction with an auctioneer. Register, get your bidder number, and raise it clearly when you bid. Each car crosses the block in a few minutes, and the auctioneer talks fast; if you lose track, stop. Listen for "reserve" and "no reserve" as the car comes up.',
    )
    p.push(reserve)
    p.push('Go twice as a spectator first. Sit near the front, watch what sells and for how much, and write it down.')
  } else if (house?.access === 'dealer') {
    p.push(
      `${house.name} runs live dealer lanes, in person and online. Every car has a condition report with a grade; read it before the lane starts. You cannot bid here without a dealer licence, so use this step to learn how the lanes work.`,
    )
  } else {
    p.push(
      'Read the house\'s "how bidding works" page before the sale and find out three things: does the auction end on a countdown or in a live lane, is there a reserve, and does a late bid extend the clock.',
    )
    p.push(reserve)
  }
  const ends = endsIn(l.endsAt, now)
  if (ends) p.push(ends)
  if (l.bidCount !== undefined) p.push(`Bids so far: ${l.bidCount}.`)
  p.push('Gavel never places a bid for you. When you are ready, the Bid button opens the lot on the auction\'s own site with your max in front of you.')
  return p.join(' ')
}

/* ── step 6 ─────────────────────────────────────────────────────────────── */
function stepWin(l: Listing, house: AuctionHouse | undefined): string {
  const p: string[] = []
  if (house?.id === 'ebay') {
    p.push('Pay the way you agreed with the seller, in writing, before the auction ended. Do not hand over the balance until you are standing next to the car with the title in your hand.')
  } else if (house) {
    p.push(`Pay within ${house.name}\'s window. The house states its payment deadline and the ways it accepts payment on its site (start at ${house.feeUrl}). Missing the deadline usually costs a late fee, the deposit, or the car.`)
  } else {
    p.push('Pay within the auction\'s stated window, using a method it accepts. Find both on the site before you bid.')
  }
  p.push(
    'Get the title and a bill of sale. The title is the legal document that proves ownership; the seller signs it over to you. A bill of sale is a one-page receipt with the VIN, the price, the date and both signatures. An auction house may mail the title later; ask when, and do not leave without the bill of sale.',
  )
  const where = whereIs(l)
  p.push(
    `Transport: get a quote before you bid, not after${where ? ` (the car is in ${where})` : ''}. Search "auto transport quote"; an open carrier is the cheaper option. Drive it home only if it runs and drives, is insured, and you have a plate or a temporary tag your state allows.`,
  )
  p.push('Insure it before it moves. Call your insurer with the VIN; most add a car the same day.')
  p.push('Then register it in your state within the deadline. You will pay sales tax plus title and registration fees at the DMV; your state\'s DMV site lists them.')
  return p.join(' ')
}

/* ── step 7 ─────────────────────────────────────────────────────────────── */
function stepLose(): string {
  return [
    'Nothing is lost. Mark your paper bid "lost" in Watchlist & paper bids and, if the site shows it, note what the car actually sold for next to it.',
    'After a handful of these you will know what these cars really sell for, which is worth more than any single car.',
    'Next time, look for: more comparable listings behind the estimate, a listing with the VIN and clear photos, a car closer to home, and an auction that ends at an awkward hour when fewer people are bidding.',
  ].join(' ')
}

/* ── warnings ───────────────────────────────────────────────────────────── */
function buildWarnings(card: WalkthroughCard, house: AuctionHouse | undefined, now: number): string[] {
  const { listing: l, estimate, score } = card
  const w: string[] = []
  if (l.kind === 'SAMPLE') w.push('This is a SAMPLE car. Nothing here can be bought.')
  if (isDealerOnly(house)) w.push('You cannot buy here yet: it needs a dealer licence. See the Playbook.')
  if (l.titleStatus !== 'clean' && l.titleStatus !== 'unknown') {
    w.push(`This car has a ${l.titleStatus} title. Branded titles are harder to insure, finance and resell, and the damage behind them may be hidden. Not a first car.`)
  }
  if (l.titleStatus === 'unknown') w.push('The listing does not say the title status. Ask before you bid, and assume it is not clean until the title says so.')
  if (!l.vin && l.kind !== 'SAMPLE') w.push('No VIN in the listing. Do not bid until you have it and have decoded it.')
  if (l.runsAndDrives === false) w.push('The seller says this car does not run and drive.')
  if (l.damage === 'moderate' || l.damage === 'severe') w.push(`The seller describes ${l.damage} damage. The repair bill is unknown.`)
  const price = askingPrice(l)
  if (estimate.ok && price !== undefined && price > 0 && price < estimate.valueUsd * 0.5) {
    w.push(
      `The price is less than half of what comparable cars are listed for. That is usually a sign of something the listing does not say: a bad title, hidden damage, or a listing that is not real. Ask hard questions before you bid, and never pay a deposit to hold a car you have not seen.`,
    )
  }
  if (l.endsAt !== undefined && l.endsAt - now > 0 && l.endsAt - now < HOUR) w.push('This auction ends in under an hour. Do not rush a first bid.')
  for (const flag of score.redFlags) if (!w.includes(flag)) w.push(flag)
  return w
}

/**
 * Build the walkthrough for one card at one house. `house` is the directory
 * entry for `listing.source`, or undefined when Gavel has none.
 */
export function walkthrough(card: WalkthroughCard, house: AuctionHouse | undefined): Walkthrough {
  const now = Date.now()
  const l = card.listing
  const where = house ? ` on ${house.name}` : ''
  const steps = [
    { title: 'Check it is the car it says it is', body: stepIdentity(l) },
    { title: 'Look for what the photos hide', body: stepPhotos(l, house) },
    { title: 'Know your number', body: stepNumber(card) },
    { title: 'Register and get ready', body: stepRegister(l, house) },
    { title: 'How the bidding works here', body: stepBidding(l, house, now) },
    { title: 'If you win', body: stepWin(l, house) },
    { title: "If you don't", body: stepLose() },
  ].map((s, i) => ({ n: i + 1, ...s }))

  return {
    source: 'rules',
    title: `How to buy this ${carName(l)}${where}`,
    steps,
    warnings: buildWarnings(card, house, now),
  }
}
