#!/usr/bin/env node
/**
 * Builds content/fleet.json: the sample fleet the Drive section runs on
 * until a real backend exists. Deterministic (seeded), so re-running it
 * changes nothing unless the templates below change.
 *
 *   npm run seed
 *
 * Every vehicle here is sample data for a demonstration marketplace. None
 * of it is a product of the storefront, and the UI says so.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../content/fleet.json')

// mulberry32: small, fast, and good enough to shuffle a demo.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20260928)

function tierForRate(cents) {
  if (cents >= 25000) return 'exotic'
  if (cents >= 15000) return 'luxury'
  if (cents >= 9000) return 'premium'
  return 'everyday'
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const between = (lo, hi) => lo + rand() * (hi - lo)
const chance = (p) => rand() < p
const round = (n, step = 1) => Math.round(n / step) * step
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const CITIES = [
  {
    slug: 'san-francisco', name: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194,
    bounds: [37.7, -122.52, 37.82, -122.36], taxRate: 0.0863,
    landmarks: [
      { name: 'Golden Gate Bridge', lat: 37.8199, lng: -122.4783 },
      { name: 'Ferry Building', lat: 37.7955, lng: -122.3937 },
      { name: 'Dolores Park', lat: 37.7596, lng: -122.4269 },
      { name: 'Ocean Beach', lat: 37.7594, lng: -122.5107 },
      { name: 'Twin Peaks', lat: 37.7544, lng: -122.4477 },
    ],
    hoods: [
      ['Mission', 37.7599, -122.4148], ['Noe Valley', 37.7502, -122.4337], ['Marina', 37.8021, -122.4382],
      ['SoMa', 37.7785, -122.4056], ['Inner Richmond', 37.7799, -122.4832], ['Bernal Heights', 37.7412, -122.4158],
      ['Hayes Valley', 37.7759, -122.4245], ['Outer Sunset', 37.7531, -122.4954],
    ],
  },
  {
    slug: 'los-angeles', name: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437,
    bounds: [33.9, -118.55, 34.2, -118.15], taxRate: 0.095,
    landmarks: [
      { name: 'Santa Monica Pier', lat: 34.0094, lng: -118.4973 },
      { name: 'Griffith Observatory', lat: 34.1184, lng: -118.3004 },
      { name: 'LAX', lat: 33.9416, lng: -118.4085 },
      { name: 'Downtown', lat: 34.0407, lng: -118.2468 },
      { name: 'Venice Beach', lat: 33.985, lng: -118.4695 },
    ],
    hoods: [
      ['Silver Lake', 34.0869, -118.2702], ['Venice', 33.985, -118.4695], ['Culver City', 34.0211, -118.3965],
      ['Koreatown', 34.0619, -118.3007], ['Los Feliz', 34.1063, -118.2876], ['Santa Monica', 34.0195, -118.4912],
      ['Highland Park', 34.1116, -118.1925], ['Westwood', 34.0561, -118.4291],
    ],
  },
  {
    slug: 'austin', name: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431,
    bounds: [30.15, -97.9, 30.45, -97.6], taxRate: 0.0825,
    landmarks: [
      { name: 'State Capitol', lat: 30.2747, lng: -97.7404 },
      { name: 'Zilker Park', lat: 30.2669, lng: -97.7729 },
      { name: 'AUS Airport', lat: 30.1975, lng: -97.6664 },
      { name: 'The Domain', lat: 30.4021, lng: -97.7256 },
    ],
    hoods: [
      ['East Austin', 30.262, -97.718], ['South Congress', 30.2489, -97.75], ['Hyde Park', 30.306, -97.728],
      ['Mueller', 30.297, -97.704], ['Zilker', 30.26, -97.774], ['North Loop', 30.319, -97.72],
    ],
  },
  {
    slug: 'denver', name: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903,
    bounds: [39.6, -105.12, 39.85, -104.8], taxRate: 0.0881,
    landmarks: [
      { name: 'Union Station', lat: 39.753, lng: -105.0002 },
      { name: 'City Park', lat: 39.7469, lng: -104.9508 },
      { name: 'Cherry Creek', lat: 39.7175, lng: -104.954 },
      { name: 'Sloan’s Lake', lat: 39.748, lng: -105.045 },
    ],
    hoods: [
      ['RiNo', 39.768, -104.98], ['Capitol Hill', 39.7317, -104.978], ['Highlands', 39.762, -105.018],
      ['Wash Park', 39.701, -104.97], ['Baker', 39.713, -104.993], ['Berkeley', 39.775, -105.04],
    ],
  },
  {
    slug: 'miami', name: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918,
    bounds: [25.68, -80.32, 25.86, -80.1], taxRate: 0.07,
    landmarks: [
      { name: 'South Beach', lat: 25.7826, lng: -80.1341 },
      { name: 'Wynwood Walls', lat: 25.801, lng: -80.1994 },
      { name: 'MIA Airport', lat: 25.7959, lng: -80.287 },
      { name: 'Coconut Grove', lat: 25.7126, lng: -80.257 },
    ],
    hoods: [
      ['Wynwood', 25.801, -80.1994], ['Brickell', 25.76, -80.193], ['Little Havana', 25.766, -80.218],
      ['Coral Gables', 25.7215, -80.2684], ['Coconut Grove', 25.7126, -80.257], ['Mid-Beach', 25.812, -80.125],
    ],
  },
  {
    slug: 'seattle', name: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321,
    bounds: [47.5, -122.42, 47.72, -122.24], taxRate: 0.1035,
    landmarks: [
      { name: 'Space Needle', lat: 47.6205, lng: -122.3493 },
      { name: 'Pike Place', lat: 47.6097, lng: -122.3422 },
      { name: 'Gas Works Park', lat: 47.6456, lng: -122.3344 },
      { name: 'Alki Beach', lat: 47.5812, lng: -122.409 },
      { name: 'Ballard Locks', lat: 47.6656, lng: -122.3975 },
    ],
    hoods: [
      ['Capitol Hill', 47.6253, -122.3222], ['Ballard', 47.6685, -122.384], ['Fremont', 47.651, -122.35],
      ['Queen Anne', 47.6325, -122.357], ['West Seattle', 47.57, -122.387], ['Columbia City', 47.559, -122.286],
    ],
  },
]

const HOSTS = [
  ['Priya Natarajan', 2019, 'I keep two cars for guests and treat both like my own. Ask me for the best breakfast within a mile of pickup.'],
  ['Marcus Bell', 2018, 'Former fleet mechanic. Every car gets checked over between trips, and I answer fast.'],
  ['Elena Fischer', 2021, 'Weekend road-tripper turned host. Happy to add the roof box or the bike rack, just ask.'],
  ['Tomás Rivera', 2020, 'Airport pickups are my speciality. Text me your flight number and the car will be waiting.'],
  ['Hannah Okafor', 2022, 'Sharing the family cars while we travel. Pet friendly, kid friendly, no fuss.'],
  ['Jae-won Park', 2017, 'Electric only. I will walk you through charging if you have never driven an EV before.'],
  ['Sofia Marchetti', 2019, 'Clean car, full tank, clear instructions. That is the whole promise.'],
  ['Daniel Whitfield', 2016, 'Hosting since the early days. Flexible on pickup times, strict about smoke-free.'],
  ['Amara Osei', 2023, 'New to hosting and trying hard to earn every star.'],
  ['Luca Bianchi', 2020, 'Convertibles for the coast, wagons for the mountains. Ask me which one you need.'],
  ['Grace Lindqvist', 2018, 'Trucks and SUVs for moves, camping and ski weekends. Tie-downs included.'],
  ['Omar Haddad', 2021, 'Downtown pickups with a reserved garage spot, so you never circle the block.'],
  ['Nina Volkova', 2022, 'Minivans for the whole crew. Car seats available on request.'],
  ['Caleb Ng', 2019, 'Engineer by day. The car is tidy, the instructions are precise, and the keys are in a lockbox.'],
].map(([name, year, bio], i) => ({
  id: `host_${String(i + 1).padStart(2, '0')}`,
  name,
  joined: `${year}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 27)).padStart(2, '0')}`,
  allStar: chance(0.5),
  rating: Number(between(4.6, 5).toFixed(2)),
  trips: Math.round(between(40, 900)),
  responseMinutes: pick([5, 10, 15, 20, 30, 45, 60]),
  bio,
}))

// [make, model, year, trim, body, fuel, transmission, seats, doors, efficiency, base daily $, extra features]
const MODELS = [
  ['Tesla', 'Model 3', 2023, 'Long Range', 'sedan', 'electric', 'automatic', 5, 4, { rangeMiles: 333 }, 78, ['keyless', 'blind-spot', 'heated-seats']],
  ['Tesla', 'Model Y', 2024, 'Long Range', 'suv', 'electric', 'automatic', 5, 4, { rangeMiles: 320 }, 92, ['keyless', 'blind-spot', 'heated-seats', 'awd']],
  ['Toyota', 'RAV4 Hybrid', 2023, 'XLE', 'suv', 'hybrid', 'automatic', 5, 4, { mpg: 40 }, 64, ['awd', 'apple-carplay', 'android-auto', 'backup-camera']],
  ['Honda', 'Civic', 2022, 'Sport', 'sedan', 'gas', 'automatic', 5, 4, { mpg: 36 }, 45, ['apple-carplay', 'android-auto', 'backup-camera']],
  ['Ford', 'Bronco', 2023, 'Outer Banks', 'suv', 'gas', 'automatic', 5, 4, { mpg: 20 }, 110, ['awd', 'apple-carplay', 'bike-rack']],
  ['Jeep', 'Wrangler', 2022, 'Sahara 4xe', 'suv', 'hybrid', 'automatic', 5, 4, { mpg: 49 }, 98, ['awd', 'apple-carplay', 'android-auto']],
  ['Ford', 'F-150', 2023, 'XLT', 'truck', 'gas', 'automatic', 5, 4, { mpg: 22 }, 95, ['tow-hitch', 'backup-camera', 'apple-carplay']],
  ['Toyota', 'Tacoma', 2022, 'TRD Off-Road', 'truck', 'gas', 'automatic', 5, 4, { mpg: 20 }, 88, ['awd', 'tow-hitch', 'bike-rack']],
  ['Mazda', 'MX-5 Miata', 2023, 'Club', 'convertible', 'gas', 'manual', 2, 2, { mpg: 30 }, 85, ['apple-carplay', 'bluetooth']],
  ['Ford', 'Mustang Convertible', 2022, 'EcoBoost Premium', 'convertible', 'gas', 'automatic', 4, 2, { mpg: 25 }, 99, ['apple-carplay', 'heated-seats']],
  ['BMW', '330i', 2023, 'M Sport', 'sedan', 'gas', 'automatic', 5, 4, { mpg: 30 }, 105, ['apple-carplay', 'heated-seats', 'sunroof', 'blind-spot']],
  ['Subaru', 'Outback', 2023, 'Wilderness', 'wagon', 'gas', 'automatic', 5, 4, { mpg: 24 }, 72, ['awd', 'ski-rack', 'roof-box', 'apple-carplay']],
  ['Volvo', 'V60 Cross Country', 2022, 'B5', 'wagon', 'gas', 'automatic', 5, 4, { mpg: 26 }, 96, ['awd', 'heated-seats', 'sunroof', 'apple-carplay', 'blind-spot']],
  ['Honda', 'Odyssey', 2022, 'EX-L', 'van', 'gas', 'automatic', 8, 4, { mpg: 22 }, 89, ['third-row', 'child-seat', 'backup-camera', 'apple-carplay']],
  ['Chrysler', 'Pacifica Hybrid', 2023, 'Touring L', 'van', 'hybrid', 'automatic', 7, 4, { mpg: 82 }, 94, ['third-row', 'child-seat', 'apple-carplay', 'android-auto']],
  ['Kia', 'Telluride', 2024, 'SX', 'suv', 'gas', 'automatic', 7, 4, { mpg: 23 }, 102, ['third-row', 'awd', 'heated-seats', 'sunroof', 'apple-carplay']],
  ['Hyundai', 'Ioniq 5', 2024, 'SEL', 'suv', 'electric', 'automatic', 5, 4, { rangeMiles: 303 }, 82, ['keyless', 'heated-seats', 'apple-carplay', 'android-auto']],
  ['Chevrolet', 'Bolt EUV', 2023, 'Premier', 'hatchback', 'electric', 'automatic', 5, 4, { rangeMiles: 247 }, 52, ['apple-carplay', 'android-auto', 'backup-camera']],
  ['Mini', 'Cooper S', 2022, null, 'hatchback', 'gas', 'automatic', 4, 2, { mpg: 31 }, 66, ['apple-carplay', 'sunroof', 'heated-seats']],
  ['Volkswagen', 'Golf GTI', 2023, 'SE', 'hatchback', 'gas', 'manual', 5, 4, { mpg: 28 }, 70, ['apple-carplay', 'android-auto', 'heated-seats']],
  ['Porsche', '911 Carrera', 2021, null, 'coupe', 'gas', 'automatic', 4, 2, { mpg: 20 }, 289, ['apple-carplay', 'heated-seats', 'keyless']],
  ['Toyota', 'Prius', 2023, 'XLE', 'hatchback', 'hybrid', 'automatic', 5, 4, { mpg: 52 }, 48, ['apple-carplay', 'android-auto', 'backup-camera']],
  ['Rivian', 'R1T', 2023, 'Adventure', 'truck', 'electric', 'automatic', 5, 4, { rangeMiles: 328 }, 165, ['awd', 'tow-hitch', 'keyless', 'heated-seats']],
  ['Mercedes-Benz', 'C 300', 2022, null, 'sedan', 'gas', 'automatic', 5, 4, { mpg: 28 }, 108, ['apple-carplay', 'heated-seats', 'sunroof', 'blind-spot']],
  ['Audi', 'Q5', 2023, 'Premium Plus', 'suv', 'gas', 'automatic', 5, 4, { mpg: 25 }, 99, ['awd', 'apple-carplay', 'heated-seats', 'sunroof']],
  ['Lexus', 'RX 350h', 2024, null, 'suv', 'hybrid', 'automatic', 5, 4, { mpg: 36 }, 118, ['awd', 'apple-carplay', 'heated-seats', 'blind-spot']],
  ['Toyota', 'Sienna', 2023, 'XLE', 'van', 'hybrid', 'automatic', 8, 4, { mpg: 36 }, 91, ['third-row', 'child-seat', 'awd', 'apple-carplay']],
  ['Ford', 'Maverick Hybrid', 2023, 'Lariat', 'truck', 'hybrid', 'automatic', 5, 4, { mpg: 37 }, 62, ['apple-carplay', 'android-auto', 'bike-rack']],
  ['Nissan', 'Leaf', 2022, 'SV Plus', 'hatchback', 'electric', 'automatic', 5, 4, { rangeMiles: 212 }, 44, ['apple-carplay', 'android-auto']],
  ['Honda', 'CR-V Hybrid', 2024, 'Sport', 'suv', 'hybrid', 'automatic', 5, 4, { mpg: 40 }, 68, ['awd', 'apple-carplay', 'android-auto', 'blind-spot']],
  ['Kia', 'Soul', 2023, 'GT-Line', 'hatchback', 'gas', 'automatic', 5, 4, { mpg: 31 }, 42, ['apple-carplay', 'android-auto']],
  ['Toyota', '4Runner', 2022, 'TRD Pro', 'suv', 'gas', 'automatic', 5, 4, { mpg: 17 }, 104, ['awd', 'ski-rack', 'roof-box', 'tow-hitch']],
  ['Mazda', 'CX-5', 2023, 'Carbon Edition', 'suv', 'gas', 'automatic', 5, 4, { mpg: 28 }, 61, ['awd', 'apple-carplay', 'heated-seats']],
  ['Polestar', '2', 2023, 'Long Range', 'sedan', 'electric', 'automatic', 5, 4, { rangeMiles: 320 }, 88, ['keyless', 'heated-seats', 'sunroof']],
  ['BMW', 'Z4', 2022, 'sDrive30i', 'convertible', 'gas', 'automatic', 2, 2, { mpg: 28 }, 128, ['apple-carplay', 'heated-seats']],
  ['Jeep', 'Grand Cherokee', 2023, 'Limited', 'suv', 'gas', 'automatic', 5, 4, { mpg: 22 }, 84, ['awd', 'tow-hitch', 'apple-carplay', 'heated-seats']],
  ['Subaru', 'Crosstrek', 2024, 'Premium', 'hatchback', 'gas', 'automatic', 5, 4, { mpg: 29 }, 55, ['awd', 'bike-rack', 'apple-carplay']],
  ['Chevrolet', 'Silverado 1500', 2022, 'LT', 'truck', 'gas', 'automatic', 6, 4, { mpg: 20 }, 92, ['tow-hitch', 'backup-camera', 'apple-carplay']],
  ['Volkswagen', 'ID.4', 2023, 'Pro S', 'suv', 'electric', 'automatic', 5, 4, { rangeMiles: 275 }, 74, ['keyless', 'apple-carplay', 'heated-seats']],
  ['Honda', 'Accord Hybrid', 2023, 'Sport', 'sedan', 'hybrid', 'automatic', 5, 4, { mpg: 44 }, 58, ['apple-carplay', 'android-auto', 'blind-spot']],
  ['Toyota', 'Corolla Hatchback', 2023, 'SE', 'hatchback', 'gas', 'manual', 5, 4, { mpg: 35 }, 41, ['apple-carplay', 'android-auto']],
  ['Ford', 'Escape PHEV', 2023, 'Titanium', 'suv', 'hybrid', 'automatic', 5, 4, { mpg: 40 }, 63, ['apple-carplay', 'android-auto', 'heated-seats']],
]

const COLORS = [
  ['Pearl White', '#E9E7E1'], ['Midnight Silver', '#6A6D73'], ['Deep Blue', '#1F3A6E'], ['Cardinal Red', '#9E2A2B'],
  ['Forest Green', '#2F5D3A'], ['Graphite', '#2B2D31'], ['Sand', '#C9B79C'], ['Slate Blue', '#4B6A88'],
  ['Copper', '#A8623E'], ['Glacier', '#B9D1DB'], ['Racing Yellow', '#E1B321'], ['Storm Gray', '#8A8F98'],
]

const COMMON = ['bluetooth', 'usb-charger', 'backup-camera']
const OPTIONAL = ['pet-friendly', 'gps', 'toll-pass', 'child-seat', 'snow-tires', 'keyless']

const OPENERS = {
  sedan: 'Quiet, comfortable and easy to park.',
  suv: 'Plenty of room for people and everything they bring.',
  truck: 'For the move, the hardware run or the trailhead.',
  van: 'Seats the whole crew with luggage to spare.',
  convertible: 'Drop the top and take the coast road.',
  coupe: 'Two doors and a great deal of character.',
  hatchback: 'Small outside, surprisingly roomy inside.',
  wagon: 'The long-weekend car: cargo, comfort and all-weather footing.',
}

const REVIEW_LINES = [
  'Pickup was exactly as described and the car was spotless.',
  'Host answered within minutes every time. Would book again.',
  'Drove it up the coast for three days without a single issue.',
  'Clear instructions, easy lockbox, full tank. Perfect.',
  'The car felt newer than the listing suggested. Very well kept.',
  'Charging guidance from the host made the EV painless.',
  'Delivery to the airport saved us an hour. Worth every dollar.',
  'Smooth, clean and comfortable for a family of five.',
  'Great value for the price. Small scuff on the bumper, disclosed up front.',
  'Would have liked a phone mount, but otherwise flawless.',
  'Easy check-in, easy check-out, and the host is a pleasure.',
  'Handled the mountain roads well and the ski rack was ready to go.',
]
const REVIEWERS = ['Alex M.', 'Jordan P.', 'Sam K.', 'Riley T.', 'Morgan L.', 'Casey D.', 'Taylor R.', 'Jamie W.', 'Drew H.', 'Avery S.', 'Quinn B.', 'Reese F.']

function isoDaysAgo(days) {
  const d = new Date(Date.UTC(2026, 8, 27) - days * 86400000)
  return d.toISOString().slice(0, 10)
}

const cars = []
let n = 0
for (const city of CITIES) {
  // Each city gets a rotating slice of the model list so no two cities are identical.
  const count = 7
  for (let i = 0; i < count; i++) {
    const m = MODELS[(n * 7 + i * 3) % MODELS.length]
    const [make, model, year, trim, body, fuel, transmission, seats, doors, efficiency, baseRate, extraFeatures] = m
    const [hoodName, hlat, hlng] = pick(city.hoods)
    const color = pick(COLORS)
    const host = pick(HOSTS)
    const features = Array.from(new Set([...COMMON, ...extraFeatures, ...OPTIONAL.filter(() => chance(0.3))]))
    if (fuel === 'electric') features.push('keyless')
    const rating = Number(between(4.5, 5).toFixed(2))
    const tripCount = Math.round(between(6, 260))
    const reviewCount = Math.min(6, Math.max(2, Math.round(tripCount / 30)))
    const reviews = Array.from({ length: reviewCount }, (_, r) => ({
      id: `rev_${n}_${i}_${r}`,
      author: pick(REVIEWERS),
      date: isoDaysAgo(Math.round(between(4, 400))),
      rating: chance(0.8) ? 5 : 4,
      text: pick(REVIEW_LINES),
    })).sort((a, b) => b.date.localeCompare(a.date))
    const dailyRateCents = round(baseRate * between(0.9, 1.15), 1) * 100
    const blockedOffsets = []
    let cursor = Math.round(between(1, 9))
    while (cursor < 60 && blockedOffsets.length < 4) {
      const len = Math.round(between(1, 4))
      blockedOffsets.push([cursor, cursor + len])
      cursor += len + Math.round(between(4, 14))
    }
    const id = `car_${String(++n).padStart(3, '0')}`
    const carSlug = slug(`${year}-${make}-${model}-${city.slug}`)
    if (cars.some((c) => c.slug === carSlug)) continue
    cars.push({
      id,
      slug: carSlug,
      make, model, year, trim, body, fuel, transmission,
      color: { name: color[0], hex: color[1] },
      seats, doors, efficiency,
      features: Array.from(new Set(features)),
      dailyRateCents,
      weeklyDiscountPct: pick([0, 5, 10, 10, 15]),
      monthlyDiscountPct: pick([0, 15, 20, 25]),
      instantBook: chance(0.65),
      delivery: chance(0.55)
        ? { offered: true, feeCents: pick([2500, 3500, 4500, 6000]), radiusMiles: pick([10, 15, 25]) }
        : { offered: false, feeCents: 0, radiusMiles: 0 },
      milesPerDay: pick([150, 200, 200, 250, 300]),
      minDays: body === 'coupe' || dailyRateCents > 15000 ? 2 : 1,
      maxDays: pick([14, 21, 30, 30]),
      city: city.slug,
      neighborhood: hoodName,
      lat: Number((hlat + between(-0.006, 0.006)).toFixed(5)),
      lng: Number((hlng + between(-0.008, 0.008)).toFixed(5)),
      hostId: host.id,
      rating,
      tripCount,
      listedAt: isoDaysAgo(Math.round(between(20, 1200))),
      description: `${OPENERS[body]} ${year} ${make} ${model}${trim ? ` ${trim}` : ''} in ${color[0].toLowerCase()}, kept in ${hoodName}. ${
        fuel === 'electric'
          ? `Around ${efficiency.rangeMiles} miles of range on a full charge; the host will show you how to charge if it is your first EV.`
          : `About ${efficiency.mpg} mpg combined${fuel === 'hybrid' ? ' thanks to the hybrid system' : ''}.`
      } ${features.includes('awd') ? 'All-wheel drive for the mountains or a wet week. ' : ''}${
        seats >= 7 ? `Seats ${seats}, with a proper third row. ` : ''
      }Keyless pickup: unlock from the app, no waiting on anyone.`,
      guidelines: [
        'No smoking of any kind.',
        `${features.includes('pet-friendly') ? 'Pets welcome in a carrier or on a blanket.' : 'No pets, please.'}`,
        `Return with the same ${fuel === 'electric' ? 'charge' : 'fuel'} level you started with.`,
        'Keep it in the state you found it; a clean-up fee applies otherwise.',
      ],
      blockedOffsets,
      reviews,
      valueTier: tierForRate(dailyRateCents),
      // Sample listings have no photos. Real listings carry the host's own.
      photos: [],
      sample: true,
    })
  }
}

// Pickup times are local; cancellation windows are measured in the city's zone.
const TZ = {
  'san-francisco': 'America/Los_Angeles',
  'los-angeles': 'America/Los_Angeles',
  austin: 'America/Chicago',
  denver: 'America/Denver',
  miami: 'America/New_York',
  seattle: 'America/Los_Angeles',
}

const fleet = {
  _note:
    'Sample fleet for the AVANT demonstration. Every vehicle, host and review here is generated by scripts/seed-fleet.mjs and is not a real listing, and none has photos: listing photos only ever come from the host of the actual car.',
  generatedAt: '2026-09-27',
  cities: CITIES.map(({ hoods, ...city }) => ({ ...city, tz: TZ[city.slug] })),
  hosts: HOSTS,
  cars,
}

writeFileSync(OUT, JSON.stringify(fleet, null, 2) + '\n')
// Cities alone, so browsers can load them without the sample fleet.
writeFileSync(OUT.replace('fleet.json', 'cities.json'), JSON.stringify(fleet.cities, null, 2) + '\n')
console.log(`Wrote ${cars.length} cars, ${HOSTS.length} hosts, ${CITIES.length} cities → ${OUT}`)
