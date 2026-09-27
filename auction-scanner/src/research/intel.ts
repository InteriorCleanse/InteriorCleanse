/**
 * CAR INTEL — what the public record says about a year, make and model,
 * from free government databases that need no key:
 *
 *   NHTSA recalls       api.nhtsa.gov/recalls/recallsByVehicle
 *   NHTSA complaints    api.nhtsa.gov/complaints/complaintsByVehicle
 *   NHTSA safety stars  api.nhtsa.gov/SafetyRatings
 *   fueleconomy.gov     fueleconomy.gov/ws/rest/vehicle
 *
 * Every call takes an injectable fetch so tests never touch the internet.
 * When a service is down the intel says so in a sentence instead of a blank.
 */

export type Recall = { campaign: string; component: string; summary: string; remedy?: string; date?: string }
export type ComplaintSummary = { count: number; topComponents: Array<{ component: string; count: number }>; crashes: number; fires: number; sample: string[] }
export type SafetyStars = { overall?: number; frontal?: number; side?: number; rollover?: number; description?: string }
export type Mpg = { city?: number; highway?: number; combined?: number; fuel?: string; variant?: string }

export type CarIntel = {
  year: number
  make: string
  model: string
  recalls: Recall[] | null
  complaints: ComplaintSummary | null
  safety: SafetyStars | null
  mpg: Mpg | null
  notes: string[]
  fetchedAt: number
}

const NHTSA = 'https://api.nhtsa.gov'
const FE = 'https://www.fueleconomy.gov/ws/rest/vehicle'

type Json = Record<string, unknown>

async function getJson(url: string, fetchImpl: typeof fetch): Promise<Json> {
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as Json
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function parseRecalls(j: Json): Recall[] {
  const rows = (Array.isArray(j.results) ? j.results : []) as Json[]
  return rows.map((r) => ({ campaign: str(r.NHTSACampaignNumber), component: str(r.Component), summary: str(r.Summary), remedy: str(r.Remedy) || undefined, date: str(r.ReportReceivedDate) || undefined })).filter((r) => r.summary || r.component)
}

export function parseComplaints(j: Json, sampleSize = 3): ComplaintSummary {
  const rows = (Array.isArray(j.results) ? j.results : []) as Json[]
  const byComponent = new Map<string, number>()
  let crashes = 0
  let fires = 0
  const sample: string[] = []
  for (const r of rows) {
    const comps = str(r.components).split(',').map((c) => c.trim()).filter(Boolean)
    for (const c of comps) byComponent.set(c, (byComponent.get(c) ?? 0) + 1)
    if (r.crash === true || r.crash === 'Yes') crashes++
    if (r.fire === true || r.fire === 'Yes') fires++
    const s = str(r.summary)
    if (s && sample.length < sampleSize) sample.push(s.length > 240 ? s.slice(0, 237) + '…' : s)
  }
  const topComponents = [...byComponent.entries()].map(([component, count]) => ({ component, count })).sort((a, b) => b.count - a.count).slice(0, 5)
  return { count: typeof j.count === 'number' ? j.count : rows.length, topComponents, crashes, fires, sample }
}

export function parseSafety(j: Json): SafetyStars {
  const rows = (Array.isArray(j.Results) ? j.Results : []) as Json[]
  const r = rows[0] ?? {}
  return { overall: num(r.OverallRating), frontal: num(r.OverallFrontCrashRating), side: num(r.OverallSideCrashRating), rollover: num(r.RolloverRating), description: str(r.VehicleDescription) || undefined }
}

export function parseMpg(j: Json): Mpg {
  return { city: num(j.city08), highway: num(j.highway08), combined: num(j.comb08), fuel: str(j.fuelType) || undefined }
}

const cache = new Map<string, CarIntel>()
const TTL = 24 * 3600_000

/** Look a car up in the public record. Never throws: each missing piece is null with a note. */
export async function carIntel(year: number, make: string, model: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<CarIntel> {
  const mk = make.trim()
  const md = model.trim().split(' ')[0]
  const key = `${year}|${mk.toLowerCase()}|${md.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && now - hit.fetchedAt < TTL) return hit
  const out: CarIntel = { year, make: mk, model: md, recalls: null, complaints: null, safety: null, mpg: null, notes: [], fetchedAt: now }
  const q = `make=${encodeURIComponent(mk)}&model=${encodeURIComponent(md)}&modelYear=${year}`
  await Promise.all([
    getJson(`${NHTSA}/recalls/recallsByVehicle?${q}`, fetchImpl).then((j) => { out.recalls = parseRecalls(j) }).catch(() => out.notes.push('Recall data could not be reached right now.')),
    getJson(`${NHTSA}/complaints/complaintsByVehicle?${q}`, fetchImpl).then((j) => { out.complaints = parseComplaints(j) }).catch(() => out.notes.push('Owner complaint data could not be reached right now.')),
    getJson(`${NHTSA}/SafetyRatings/modelyear/${year}/make/${encodeURIComponent(mk)}/model/${encodeURIComponent(md)}`, fetchImpl)
      .then(async (j) => {
        const rows = (Array.isArray(j.Results) ? j.Results : []) as Json[]
        const id = rows[0]?.VehicleId
        if (id === undefined) { out.safety = {}; return }
        out.safety = parseSafety(await getJson(`${NHTSA}/SafetyRatings/VehicleId/${id}`, fetchImpl))
      })
      .catch(() => out.notes.push('Crash-test ratings could not be reached right now.')),
    getJson(`${FE}/menu/options?year=${year}&make=${encodeURIComponent(mk)}&model=${encodeURIComponent(md)}`, fetchImpl)
      .then(async (j) => {
        const items = (Array.isArray(j.menuItem) ? j.menuItem : j.menuItem ? [j.menuItem] : []) as Json[]
        const first = items[0]
        if (!first) { out.mpg = {}; return }
        const v = await getJson(`${FE}/${str(first.value)}`, fetchImpl)
        out.mpg = { ...parseMpg(v), variant: str(first.text) || undefined }
      })
      .catch(() => out.notes.push('Fuel economy data could not be reached right now.')),
  ])
  cache.set(key, out)
  return out
}

/** The three sentences a card can show without a click. */
export function intelSummary(i: CarIntel): string[] {
  const lines: string[] = []
  if (i.recalls) lines.push(i.recalls.length === 0 ? 'No open recalls on record for this year and model.' : `${i.recalls.length} recall${i.recalls.length === 1 ? '' : 's'} on record. Ask the seller whether each one was done; a dealer will do them free.`)
  if (i.complaints) lines.push(i.complaints.count === 0 ? 'No owner complaints filed with NHTSA.' : `${i.complaints.count} owner complaint${i.complaints.count === 1 ? '' : 's'} filed with NHTSA${i.complaints.topComponents[0] ? `, most about ${i.complaints.topComponents[0].component.toLowerCase()}` : ''}.`)
  if (i.safety && i.safety.overall) lines.push(`${i.safety.overall} of 5 stars overall in government crash tests.`)
  if (i.mpg && i.mpg.combined) lines.push(`About ${i.mpg.combined} mpg combined (${i.mpg.city ?? '?'} city, ${i.mpg.highway ?? '?'} highway).`)
  return lines
}
