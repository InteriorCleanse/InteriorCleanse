/**
 * VIN decoding through NHTSA vPIC — free, no key, run by the US government's
 * vehicle safety agency.
 *
 * A VIN (Vehicle Identification Number) is the 17-character code stamped on
 * every car. vPIC reads the build sheet out of it: the model year, make,
 * model, trim, body, engine, fuel, drive and the factory. It does NOT know the
 * car's history. Whether the car was ever wrecked, flooded, stolen or branded
 * salvage lives in a separate, paid title/history report: an NMVTIS report
 * (vehiclehistory.gov lists the approved providers) or Carfax/AutoCheck.
 * Always run one of those before you bid.
 *
 * Every field vPIC leaves blank stays undefined. Gavel never fills a gap.
 */
import { looksLikeVin } from './sources/normalize.ts'

export type VinDecode = {
  vin: string
  year?: number
  make?: string
  model?: string
  trim?: string
  bodyClass?: string
  engine?: string
  fuel?: string
  drive?: string
  plantCountry?: string
  /** vPIC's own complaint about the VIN, when it has one (a bad check digit, a character it cannot read). */
  errorText?: string
}

/** One row of vPIC's DecodeVin answer. */
export type VpicRow = { Variable: string; Value: string | null }

const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/'

function clean(v: string | null | undefined): string | undefined {
  const s = (v ?? '').trim()
  if (!s || s.toLowerCase() === 'not applicable') return undefined
  return s
}

/** Turn vPIC's list of Variable/Value rows into a VinDecode. Pure: safe to test on captured rows. */
export function parseVpic(vin: string, rows: Array<{ Variable: string; Value: string | null }>): VinDecode {
  const get = (name: string): string | undefined => clean(rows.find((r) => r.Variable.toLowerCase() === name.toLowerCase())?.Value)

  const yearText = get('Model Year')
  const year = yearText && /^\d{4}$/.test(yearText) ? Number(yearText) : undefined

  const engineParts: string[] = []
  const litres = get('Displacement (L)')
  const cylinders = get('Engine Number of Cylinders')
  const engineModel = get('Engine Model')
  if (litres && Number.isFinite(Number(litres))) engineParts.push(`${Number(litres).toFixed(1)} L`)
  if (cylinders) engineParts.push(`${cylinders} cylinders`)
  if (engineModel) engineParts.push(engineModel)

  const code = get('Error Code')
  const codeIsClean = !code || code.split(',').every((c) => c.trim() === '0')
  const errorText = codeIsClean ? undefined : get('Error Text') ?? `vPIC error code ${code}`

  return {
    vin: vin.toUpperCase(),
    year,
    make: titleCase(get('Make')),
    model: get('Model'),
    trim: get('Trim'),
    bodyClass: get('Body Class'),
    engine: engineParts.length ? engineParts.join(', ') : undefined,
    fuel: get('Fuel Type - Primary'),
    drive: get('Drive Type'),
    plantCountry: get('Plant Country'),
    errorText,
  }
}

/** vPIC shouts makes in capitals ("PORSCHE"); this makes them readable ("Porsche"). Short names that are really initials (BMW, GMC) and mixed-case values are left alone. */
function titleCase(s: string | undefined): string | undefined {
  if (!s) return undefined
  if (s !== s.toUpperCase()) return s
  return s
    .split(/(\s+|-)/)
    .map((part) => (part.length > 3 && /[A-Z]/.test(part[0]) ? part[0] + part.slice(1).toLowerCase() : part))
    .join('')
}

/**
 * Decode a VIN with NHTSA vPIC. Throws a plain-English Error when the text is
 * not a VIN (so nothing is sent) or when the service does not answer.
 */
export async function decodeVin(vin: string, fetchImpl: typeof fetch = fetch): Promise<VinDecode> {
  const v = (vin ?? '').trim().toUpperCase()
  if (v.startsWith('SAMPLE')) {
    throw new Error('This is a SAMPLE car. It has no real VIN to decode, and nothing about it can be checked or bought.')
  }
  if (!looksLikeVin(v)) {
    throw new Error(
      'That does not look like a VIN. A VIN is exactly 17 letters and numbers and never contains the letters I, O or Q. ' +
        'Find it at the bottom of the windscreen on the driver\'s side, on the sticker inside the driver\'s door, or on the title.',
    )
  }
  const res = await fetchImpl(`${VPIC_URL}${encodeURIComponent(v)}?format=json`, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`The VIN service (NHTSA vPIC) answered HTTP ${res.status}. It is free and sometimes busy; try again in a minute.`)
  }
  const body = (await res.json()) as { Results?: VpicRow[] }
  if (!Array.isArray(body.Results)) {
    throw new Error('The VIN service (NHTSA vPIC) sent an answer Gavel could not read. Try again in a minute.')
  }
  return parseVpic(v, body.Results)
}
