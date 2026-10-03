// VIN decoding via the free NHTSA vPIC API (no key required) plus a small
// key-type lookup. The flat prices returned are EXAMPLE values for the preview;
// the real price table is set by the operator before launch.

export type KeyMatch = {
  vehicle: string
  key: string
  method: string
  priceExample: number | null
}

type NhtsaResult = { Variable: string; Value: string | null }

const PRICE_BY_TYPE: Record<string, { key: string; method: string; price: number }> = {
  smart: { key: 'Smart key (push-to-start)', method: 'OBD add; PIN read on site', price: 279 },
  remote: { key: 'Remote-head key', method: 'OBD add; all-keys-lost supported', price: 235 },
  transponder: { key: 'Transponder key', method: 'OBD add, about 15 minutes', price: 189 },
}

// Very rough heuristic: newer vehicles trend to smart keys. The real system
// maps the exact make/model/year to the exact key SKU.
function guessType(year: number): keyof typeof PRICE_BY_TYPE {
  if (year >= 2018) return 'smart'
  if (year >= 2010) return 'remote'
  return 'transponder'
}

export async function decodeVin(input: string): Promise<KeyMatch> {
  const vin = input.trim().toUpperCase()
  const looksLikeVin = /^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)

  if (!looksLikeVin) {
    // Not a VIN (maybe a plate or free text) — the live site would look up the
    // plate through a DMV/registration provider. Preview returns a generic.
    return {
      vehicle: vin || 'Your vehicle',
      key: 'Identified from your VIN or plate on the live site',
      method: 'Come-to-you or mail-in kit',
      priceExample: null,
    }
  }

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${encodeURIComponent(vin)}?format=json`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`NHTSA ${res.status}`)
  const data = (await res.json()) as { Results: NhtsaResult[] }

  const get = (name: string) => data.Results.find((r) => r.Variable === name)?.Value ?? ''
  const year = parseInt(get('Model Year') || '0', 10)
  const make = get('Make')
  const model = get('Model')
  const vehicle = [year || '', make, model].filter(Boolean).join(' ').trim() || 'Your vehicle'

  const t = PRICE_BY_TYPE[guessType(year || 2015)]
  return { vehicle, key: t.key, method: t.method, priceExample: t.price }
}
