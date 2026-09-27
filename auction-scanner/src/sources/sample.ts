/**
 * SAMPLE listings — so the app can be seen before any source is connected.
 *
 * These are NOT real cars. Every one carries kind:'SAMPLE', a VIN that starts
 * with SAMPLE, and a URL that goes nowhere. The feed labels them on every
 * card, the bid planner refuses to open a lot for them, and they never mix
 * with LIVE data in the estimate. They exist to show the shape of the app.
 */
import type { Listing } from '../types.ts'

const DAY = 86_400_000

type Seed = [title: string, mileage: number, bid: number, buyNow: number | undefined, title_: Listing['titleStatus'], damage: Listing['damage'], runs: boolean | undefined, state: string, endsInDays: number, body: string]

const SEEDS: Seed[] = [
  ['2014 Porsche 911 Carrera S', 41_200, 46_500, undefined, 'clean', 'none', true, 'FL', 1.4, 'Coupe'],
  ['2017 Lexus GX 460 Premium', 78_900, 21_800, 24_900, 'clean', 'minor', true, 'TX', 2.1, 'SUV'],
  ['2019 Toyota Camry SE', 52_300, 12_400, undefined, 'clean', 'none', true, 'GA', 0.6, 'Sedan'],
  ['2012 Chevrolet Corvette Grand Sport', 33_800, 27_900, undefined, 'clean', 'minor', true, 'AZ', 3.2, 'Coupe'],
  ['2016 Ford Mustang GT Premium', 61_000, 15_200, 17_900, 'clean', 'minor', true, 'NC', 1.9, 'Coupe'],
  ['2018 Honda Civic Si', 44_100, 13_900, undefined, 'clean', 'none', true, 'OH', 4.5, 'Sedan'],
  ['2011 BMW M3 Competition', 68_500, 24_300, undefined, 'clean', 'minor', true, 'CA', 2.8, 'Coupe'],
  ['2015 Toyota 4Runner Trail', 96_000, 18_600, undefined, 'clean', 'none', true, 'CO', 1.1, 'SUV'],
  ['2020 Tesla Model 3 Long Range', 38_700, 19_900, 21_500, 'clean', 'none', true, 'WA', 0.9, 'Sedan'],
  ['2013 Audi R8 V10', 29_400, 71_000, undefined, 'clean', 'none', true, 'NV', 5.0, 'Coupe'],
  ['2016 Jeep Wrangler Unlimited Sahara', 71_200, 17_400, undefined, 'clean', 'minor', true, 'UT', 2.4, 'SUV'],
  ['2017 Mazda MX-5 Miata Club', 27_900, 13_100, undefined, 'clean', 'none', true, 'OR', 3.7, 'Convertible'],
  ['2014 Mercedes-Benz E350', 88_000, 7_900, undefined, 'salvage', 'moderate', true, 'NJ', 1.2, 'Sedan'],
  ['2015 Nissan GT-R Premium', 22_100, 58_000, undefined, 'clean', 'none', true, 'IL', 2.2, 'Coupe'],
  ['2018 Toyota Tacoma TRD Off-Road', 64_300, 22_700, undefined, 'clean', 'none', true, 'TN', 0.4, 'Pickup'],
  ['2012 Lexus LX 570', 112_000, 16_900, undefined, 'clean', 'minor', undefined, 'FL', 6.1, 'SUV'],
  ['2019 Chevrolet Corvette Stingray Z51', 18_900, 39_800, 44_000, 'clean', 'none', true, 'MI', 1.7, 'Coupe'],
  ['2013 Porsche Cayman S', 49_600, 28_400, undefined, 'rebuilt', 'minor', true, 'PA', 2.6, 'Coupe'],
  ['2016 Lamborghini Huracan LP610-4', 14_200, 148_000, undefined, 'clean', 'none', true, 'CA', 3.9, 'Coupe'],
  ['2017 Toyota Corolla LE', 58_400, 8_900, 9_800, 'clean', 'none', true, 'VA', 1.0, 'Sedan'],
  ['2014 Ford F-150 XLT SuperCrew', 101_000, 11_200, undefined, 'clean', 'minor', true, 'OK', 2.9, 'Pickup'],
  ['2015 Subaru WRX Limited', 73_000, 12_300, undefined, 'clean', 'moderate', true, 'MA', 1.5, 'Sedan'],
  ['2018 Honda Accord EX-L', 47_700, 14_600, undefined, 'clean', 'none', true, 'MN', 0.8, 'Sedan'],
  ['2010 Ferrari California', 19_800, 74_500, undefined, 'clean', 'none', true, 'FL', 4.2, 'Convertible'],
]

/** Comparables so the SAMPLE estimates have something to compare against. Also SAMPLE. */
const COMPS: Array<[title: string, mileage: number, price: number]> = [
  ['2014 Porsche 911 Carrera S', 38_000, 68_900], ['2013 Porsche 911 Carrera S', 45_000, 62_500], ['2015 Porsche 911 Carrera S', 30_000, 74_900], ['2014 Porsche 911 Carrera', 40_000, 61_000],
  ['2017 Lexus GX 460 Premium', 70_000, 30_900], ['2016 Lexus GX 460', 82_000, 27_500], ['2018 Lexus GX 460 Premium', 60_000, 34_800],
  ['2019 Toyota Camry SE', 45_000, 18_900], ['2019 Toyota Camry SE', 60_000, 17_200], ['2018 Toyota Camry SE', 55_000, 16_500], ['2020 Toyota Camry SE', 40_000, 20_400],
  ['2012 Chevrolet Corvette Grand Sport', 30_000, 36_900], ['2011 Chevrolet Corvette Grand Sport', 38_000, 33_500], ['2013 Chevrolet Corvette Grand Sport', 25_000, 39_900],
  ['2016 Ford Mustang GT Premium', 55_000, 22_900], ['2017 Ford Mustang GT Premium', 48_000, 24_500], ['2015 Ford Mustang GT', 70_000, 20_100],
  ['2018 Honda Civic Si', 40_000, 20_500], ['2018 Honda Civic Si', 52_000, 19_200], ['2019 Honda Civic Si', 35_000, 22_400],
  ['2011 BMW M3 Competition', 60_000, 33_900], ['2012 BMW M3', 72_000, 30_500], ['2011 BMW M3', 80_000, 28_900],
  ['2015 Toyota 4Runner Trail', 90_000, 27_800], ['2016 Toyota 4Runner Trail', 85_000, 29_900], ['2014 Toyota 4Runner Trail', 100_000, 25_900],
  ['2020 Tesla Model 3 Long Range', 35_000, 26_900], ['2020 Tesla Model 3 Long Range', 42_000, 25_800], ['2019 Tesla Model 3 Long Range', 50_000, 23_900],
  ['2013 Audi R8 V10', 25_000, 92_000], ['2012 Audi R8 V10', 32_000, 86_500], ['2014 Audi R8 V10', 20_000, 98_000],
  ['2016 Jeep Wrangler Unlimited Sahara', 65_000, 24_900], ['2017 Jeep Wrangler Unlimited Sahara', 60_000, 26_500], ['2015 Jeep Wrangler Unlimited Sahara', 80_000, 22_900],
  ['2017 Mazda MX-5 Miata Club', 25_000, 19_900], ['2016 Mazda MX-5 Miata Club', 30_000, 18_500], ['2018 Mazda MX-5 Miata Club', 22_000, 21_900],
  ['2014 Mercedes-Benz E350', 80_000, 13_900], ['2013 Mercedes-Benz E350', 90_000, 12_500], ['2015 Mercedes-Benz E350', 70_000, 15_900],
  ['2015 Nissan GT-R Premium', 20_000, 74_900], ['2014 Nissan GT-R Premium', 25_000, 69_900], ['2016 Nissan GT-R Premium', 18_000, 79_500],
  ['2018 Toyota Tacoma TRD Off-Road', 60_000, 30_900], ['2017 Toyota Tacoma TRD Off-Road', 70_000, 28_500], ['2019 Toyota Tacoma TRD Off-Road', 50_000, 33_400],
  ['2012 Lexus LX 570', 105_000, 24_900], ['2011 Lexus LX 570', 120_000, 22_500], ['2013 Lexus LX 570', 98_000, 27_900],
  ['2019 Chevrolet Corvette Stingray Z51', 15_000, 52_900], ['2018 Chevrolet Corvette Stingray Z51', 20_000, 49_500], ['2019 Chevrolet Corvette Stingray', 22_000, 47_900],
  ['2013 Porsche Cayman S', 45_000, 39_900], ['2014 Porsche Cayman S', 40_000, 43_500], ['2013 Porsche Cayman S', 55_000, 37_500],
  ['2016 Lamborghini Huracan LP610-4', 12_000, 189_000], ['2015 Lamborghini Huracan LP610-4', 15_000, 179_900], ['2017 Lamborghini Huracan LP610-4', 10_000, 199_000],
  ['2017 Toyota Corolla LE', 50_000, 13_900], ['2017 Toyota Corolla LE', 62_000, 12_800], ['2018 Toyota Corolla LE', 45_000, 14_900],
  ['2014 Ford F-150 XLT SuperCrew', 95_000, 16_900], ['2015 Ford F-150 XLT SuperCrew', 90_000, 18_500], ['2013 Ford F-150 XLT SuperCrew', 110_000, 14_900],
  ['2015 Subaru WRX Limited', 65_000, 17_900], ['2016 Subaru WRX Limited', 60_000, 19_500], ['2015 Subaru WRX Limited', 80_000, 16_500],
  ['2018 Honda Accord EX-L', 40_000, 21_900], ['2018 Honda Accord EX-L', 50_000, 20_800], ['2019 Honda Accord EX-L', 35_000, 23_500],
  ['2010 Ferrari California', 18_000, 99_900], ['2011 Ferrari California', 22_000, 104_500], ['2010 Ferrari California', 25_000, 94_900],
]

function split(title: string): { year: number; make: string; model: string } {
  const [y, make, ...rest] = title.split(' ')
  return { year: Number(y), make, model: rest.slice(0, 2).join(' ') }
}

export function sampleListings(now = Date.now()): Listing[] {
  return SEEDS.map((s, i) => {
    const [title, mileage, bid, buyNow, titleStatus, damage, runs, state, days, body] = s
    const t = split(title)
    return {
      id: `sample:${i + 1}`,
      source: 'sample',
      externalId: String(i + 1),
      url: '#sample',
      title,
      year: t.year,
      make: t.make,
      model: t.model,
      vin: `SAMPLE${String(i + 1).padStart(11, '0')}`,
      mileage,
      titleStatus,
      damage,
      runsAndDrives: runs,
      hasKeys: true,
      bodyStyle: body,
      location: { state, country: 'US' },
      saleType: buyNow ? 'auction-or-buy-now' : 'auction',
      currentBidUsd: bid,
      buyNowUsd: buyNow,
      endsAt: now + days * DAY,
      bidCount: 3 + (i * 7) % 20,
      sellerType: i % 3 === 0 ? 'dealer' : 'private',
      photos: [],
      description: 'SAMPLE listing. Not a real car. Shown so the app can be seen before a source is connected.',
      kind: 'SAMPLE',
      fetchedAt: now,
    }
  })
}

/** SAMPLE comparables, shaped like listings so the estimator treats them the same. */
export function sampleComps(now = Date.now()): Listing[] {
  return COMPS.map(([title, mileage, price], i) => {
    const t = split(title)
    return {
      id: `sample-comp:${i}`, source: 'sample', externalId: `c${i}`, url: '#sample', title, year: t.year, make: t.make, model: t.model,
      mileage, titleStatus: 'clean', damage: 'none', runsAndDrives: true, saleType: 'buy-now', buyNowUsd: price, photos: [], kind: 'SAMPLE', fetchedAt: now,
    }
  })
}
