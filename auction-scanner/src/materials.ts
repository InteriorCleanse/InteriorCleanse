/**
 * MATERIALS — what one car will likely need before it sells or rents, from
 * the facts on the listing (age, miles, damage, fuel, whether it runs).
 *
 * Each line says why it is on the list and how sure that is:
 *   always  every auction car gets it (fluids and filters of unknown age, a detail);
 *   likely  the miles or the age say it is due;
 *   check   look before you buy it; price it only if it is needed.
 * Prices are Gavel's working ranges from `config.materials` (parts and supplies,
 * doing the work yourself), never a quote, and every caller says so.
 * `partQuery` is what the Part finder searches for.
 */
import { config } from '../config.ts'

export type MaterialNeed = 'always' | 'likely' | 'check'
export type MaterialGroup = 'Service' | 'Safety' | 'Looks' | 'Keys and paperwork'
export type Material = { id: string; name: string; group: MaterialGroup; need: MaterialNeed; why: string; lowUsd: number; highUsd: number; partQuery: string }
export type MaterialsList = {
  items: Material[]
  /** Always and likely items, at the middle of each range: the figure Gavel counts in a deal. */
  expectedUsd: number
  expectedLowUsd: number
  expectedHighUsd: number
  /** What the "check" items add if every one turns out to be needed. */
  checkLowUsd: number
  checkHighUsd: number
  notes: string[]
}

export type MaterialsInput = { year?: number; make?: string; model?: string; mileage?: number; damage?: string; runsAndDrives?: boolean; fuel?: string }

const ELECTRIC_MAKES = /^(tesla|rivian|lucid|polestar)$/i

function isElectric(c: MaterialsInput): boolean {
  if (c.fuel && /electric|\bev\b|battery/i.test(c.fuel) && !/hybrid/i.test(c.fuel)) return true
  return !!c.make && ELECTRIC_MAKES.test(c.make)
}

export function materialsFor(c: MaterialsInput, now = Date.now()): MaterialsList {
  const items: Material[] = []
  const add = (id: string, name: string, group: MaterialGroup, need: MaterialNeed, why: string, partQuery: string): void => {
    const [lowUsd, highUsd] = config.materials[id] ?? [0, 0]
    items.push({ id, name, group, need, why, lowUsd, highUsd, partQuery })
  }
  const ev = isElectric(c)
  const age = c.year ? new Date(now).getUTCFullYear() - c.year : undefined
  const mi = c.mileage
  const milesKnown = mi !== undefined

  if (!ev) add('oil', 'Engine oil and filter', 'Service', 'always', 'Nobody knows when it was last changed. Fresh oil is the cheapest insurance on an auction car.', 'oil filter')
  if (!ev) add('engineAir', 'Engine air filter', 'Service', 'always', 'Usually dirty on an auction car, and a buyer who opens the hood sees it.', 'engine air filter')
  add('cabinAir', 'Cabin air filter', 'Service', 'always', 'Stale smells come from here. Cheap, five minutes, and buyers notice a fresh cabin.', 'cabin air filter')
  add('wipers', 'Wiper blades', 'Safety', 'always', 'Streaky wipers fail a test drive. A pair costs little.', 'wiper blades')
  add('detail', 'Detail supplies (wash, clay, polish, interior cleaner)', 'Looks', 'always', 'A clean car sells faster and for more than the same car dirty.', 'car detailing kit')
  add('scan', 'OBD2 code scanner (a tool you keep)', 'Service', 'check', 'Reads warning codes before you buy and after the car arrives. Buy one once, if you do not have one, and use it on every car.', 'obd2 scanner bluetooth')

  if (!milesKnown || mi >= 40_000) add('brakes', 'Front brake pads and rotors', 'Safety', !milesKnown ? 'check' : mi >= 50_000 ? 'likely' : 'check', !milesKnown ? 'The miles are not stated. Look at the pads through the wheel.' : `At ${mi.toLocaleString('en-US')} miles the front brakes are often near the end.`, 'front brake pads and rotors')
  if (!ev && (!milesKnown || mi >= 60_000)) add('plugs', 'Spark plugs', 'Service', milesKnown && mi >= 90_000 ? 'likely' : 'check', milesKnown && mi >= 90_000 ? 'Most plugs are due between 90,000 and 120,000 miles.' : 'Check the service book; many are due around 100,000 miles.', 'spark plugs')
  if (!milesKnown || mi >= 60_000) add('coolant', 'Coolant', 'Service', 'check', 'Old coolant looks brown or rusty. Check the colour before you buy.', 'antifreeze coolant')
  if (!ev && milesKnown && mi >= 60_000) add('transFluid', 'Transmission fluid', 'Service', mi >= 90_000 ? 'likely' : 'check', 'Due on most automatics between 60,000 and 100,000 miles; check the book.', 'transmission fluid')
  if (!ev && (age === undefined || age >= 4)) add('battery', '12-volt battery', 'Service', age !== undefined && age >= 6 ? 'likely' : 'check', age !== undefined && age >= 6 ? `The car is ${age} years old; original batteries rarely last past five or six.` : 'Batteries last four to six years. A parts store tests one free.', 'car battery')
  if (ev) add('twelveVolt', '12-volt battery (electric cars have one too)', 'Service', age !== undefined && age >= 4 ? 'likely' : 'check', 'Electric cars still start from a small 12-volt battery, and a weak one strands them.', '12v battery')
  add('tyres', 'Tyres (a set of four)', 'Safety', 'check', 'Check tread depth and the date code on each tyre. The biggest surprise cost on most cars.', 'tires')
  if (age !== undefined && age >= 6) add('headlights', 'Headlight restoration kit', 'Looks', 'likely', 'Cloudy lenses make a car look older than it is. A kit clears them in an hour.', 'headlight restoration kit')

  if (c.damage === 'minor') {
    add('touchUp', 'Touch-up paint (matched to the paint code)', 'Looks', 'likely', 'Minor damage is listed. Chips and scratches take paint matched to the code on the door jamb.', 'touch up paint')
    add('dentRepair', 'Paintless dent repair', 'Looks', 'check', 'Small dents come out without paint. Priced per panel; get a quote from photos.', 'paintless dent repair kit')
    add('clips', 'Bumper and trim clips', 'Looks', 'check', 'Loose bumpers and trim usually need only clips.', 'bumper clips')
  }
  if (c.runsAndDrives === undefined) add('battery', 'Jump pack or battery on pick-up day', 'Service', 'check', 'The listing does not say it runs. Bring a jump pack; plan a tow if it does not start.', 'jump starter')
  add('spareKey', 'Spare key or fob', 'Keys and paperwork', 'check', 'Auction cars often come with one key. A second one matters to a buyer and to a rental.', 'key fob')
  add('mats', 'Floor mats', 'Looks', 'check', 'Missing or stained mats are cheap to replace and change the first look.', 'floor mats')

  // One line per id: the jump-pack check never doubles the battery line.
  const seen = new Set<string>()
  const list = items.filter((m) => (seen.has(m.id + m.name) ? false : (seen.add(m.id + m.name), true)))
  const counted = list.filter((m) => m.need !== 'check')
  const checks = list.filter((m) => m.need === 'check')
  const sum = (xs: Material[], f: (m: Material) => number) => xs.reduce((s, m) => s + f(m), 0)
  const notes = ['Prices are Gavel\'s working ranges for parts and supplies when you do the work yourself, not quotes. A shop adds labour.']
  if (ev) notes.push('Electric: no oil, plugs or transmission fluid. Ask for a battery health report before you buy.')
  if (!milesKnown) notes.push('The miles are not stated, so more items are marked "check".')
  notes.push('Registration, title and any state inspection vary by state and are not counted here; set your tax and title percent in Settings.')
  return {
    items: list,
    expectedUsd: Math.round(sum(counted, (m) => (m.lowUsd + m.highUsd) / 2)),
    expectedLowUsd: sum(counted, (m) => m.lowUsd),
    expectedHighUsd: sum(counted, (m) => m.highUsd),
    checkLowUsd: sum(checks, (m) => m.lowUsd),
    checkHighUsd: sum(checks, (m) => m.highUsd),
    notes,
  }
}
