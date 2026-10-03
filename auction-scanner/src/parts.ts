/**
 * THE PART FINDER — the parts that fit one car, and where to buy them.
 *
 * Two kinds of answer, always labelled:
 *   LIVE   eBay's own fitment search (Browse API, compatibility filter), with
 *          real prices, when the eBay keys are set;
 *   LINKS  a search for this exact car and part at the big parts stores and
 *          the salvage-yard networks. Prices are on the store's own page;
 *          Gavel does not read those sites (no scraping, ever).
 * Fitment is the seller's or the store's claim: match the part number or the
 * VIN before you pay.
 */
export type PartVehicle = { year: number; make: string; model: string; vin?: string }
export type PartCategory = { id: string; name: string; query: string; group: string }
export type PartLink = { store: string; url: string; kind: 'new' | 'used' | 'catalog'; note: string }

export const PART_GROUPS: Array<{ group: string; parts: Array<[string, string]> }> = [
  { group: 'Service', parts: [['oil-filter', 'Oil filter'], ['engine-air-filter', 'Engine air filter'], ['cabin-air-filter', 'Cabin air filter'], ['spark-plugs', 'Spark plugs'], ['ignition-coil', 'Ignition coil'], ['serpentine-belt', 'Serpentine belt'], ['battery', 'Battery'], ['wiper-blades', 'Wiper blades']] },
  { group: 'Brakes and suspension', parts: [['brake-pads', 'Brake pads'], ['brake-rotors', 'Brake rotors'], ['struts', 'Struts and shocks'], ['control-arm', 'Control arm'], ['wheel-bearing', 'Wheel bearing'], ['tie-rod', 'Tie rod end']] },
  { group: 'Engine and electrical', parts: [['alternator', 'Alternator'], ['starter', 'Starter'], ['water-pump', 'Water pump'], ['thermostat', 'Thermostat'], ['radiator', 'Radiator'], ['o2-sensor', 'Oxygen sensor'], ['ac-compressor', 'A/C compressor']] },
  { group: 'Body and lights', parts: [['headlight', 'Headlight assembly'], ['tail-light', 'Tail light'], ['side-mirror', 'Side mirror'], ['front-bumper', 'Front bumper cover'], ['rear-bumper', 'Rear bumper cover'], ['grille', 'Grille'], ['fender', 'Fender'], ['door-handle', 'Door handle'], ['windshield', 'Windshield']] },
  { group: 'Interior and keys', parts: [['floor-mats', 'Floor mats'], ['seat-covers', 'Seat covers'], ['key-fob', 'Key fob'], ['window-regulator', 'Window regulator']] },
]

export function partCategories(): PartCategory[] {
  return PART_GROUPS.flatMap((g) => g.parts.map(([id, name]) => ({ id, name, query: name.toLowerCase(), group: g.group })))
}

export function vehicleFrom(v: { year?: unknown; make?: unknown; model?: unknown; vin?: unknown }): PartVehicle {
  const year = Number(v.year)
  const make = typeof v.make === 'string' ? v.make.trim().slice(0, 40) : ''
  const model = typeof v.model === 'string' ? v.model.trim().slice(0, 60) : ''
  if (!Number.isInteger(year) || year < 1950 || year > 2050) throw new Error('Give the car\'s model year.')
  if (!make || !model) throw new Error('Give the car\'s make and model.')
  if (/[;:{}]/.test(make + model)) throw new Error('Make and model are letters, numbers and spaces.')
  const vin = typeof v.vin === 'string' && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v.vin) ? v.vin.toUpperCase() : undefined
  return { year, make, model, vin }
}

export function cleanQuery(q: unknown): string {
  const s = typeof q === 'string' ? q.replace(/[^\p{L}\p{N}\s/&.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  if (!s) throw new Error('Say which part, for example "front brake pads".')
  return s
}

/** Store searches for this car and part. Built from the store's public search address; nothing is fetched. */
export function partLinks(v: PartVehicle, query: string): PartLink[] {
  const car = `${v.year} ${v.make} ${v.model}`
  const full = encodeURIComponent(`${car} ${query}`)
  const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '+')
  return [
    { store: 'RockAuto', url: `https://www.rockauto.com/en/catalog/${slug(v.make)},${v.year},${slug(v.model)}`, kind: 'catalog', note: 'The whole catalog for this car, often the lowest new prices. Pick the engine, then the part.' },
    { store: 'eBay Motors', url: `https://www.ebay.com/sch/6030/i.html?_nkw=${full}`, kind: 'new', note: 'New and used. Use "My Garage" on eBay to see fitment.' },
    { store: 'Amazon', url: `https://www.amazon.com/s?k=${full}&i=automotive`, kind: 'new', note: 'Add the car in Amazon\'s garage to check fit.' },
    { store: 'AutoZone', url: `https://www.autozone.com/searchresult?searchText=${full}`, kind: 'new', note: 'Same-day pickup; tests batteries and reads codes free.' },
    { store: 'O\'Reilly', url: `https://www.oreillyauto.com/search?q=${full}`, kind: 'new', note: 'Same-day pickup; loaner tools.' },
    { store: 'Advance Auto Parts', url: `https://shop.advanceautoparts.com/web/SearchResults?searchTerm=${full}`, kind: 'new', note: 'Same-day pickup; online codes are common.' },
    { store: 'car-part.com', url: 'https://www.car-part.com/', kind: 'used', note: `Used parts from salvage yards across the US. Search ${car} and the part; best for body panels, mirrors and lights in the right colour.` },
    { store: 'LKQ Pick Your Part', url: 'https://www.lkqpickyourpart.com/', kind: 'used', note: 'Pull the part yourself at a yard near you, for the lowest price.' },
  ]
}
