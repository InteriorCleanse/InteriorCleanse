/**
 * AI lot reader — optional. When the rule-based importer cannot find the key
 * facts in a pasted page (odd layouts, foreign labels), Claude reads the text
 * and returns the same fields as JSON. It may only copy what the text says:
 * a fact that is not there must be null. Without a key this returns null and
 * the member fills the blanks by hand.
 */
import { config } from '../../config.ts'
import { env } from '../env.ts'
import type { ImportFields } from '../sources/importer.ts'

type Ctor = new (opts: { apiKey: string }) => { beta: { messages: { create: (params: unknown) => Promise<unknown> } } }
let sdk: Ctor | null | undefined

async function loadSdk(): Promise<Ctor | null> {
  if (sdk !== undefined) return sdk
  try {
    sdk = ((await import('@anthropic-ai/sdk')) as { default: unknown }).default as Ctor
  } catch {
    sdk = null
  }
  return sdk
}

const RULES = `You read the text of a car auction lot page and return its facts as one JSON object, nothing else.
Keys: title (string, "year make model trim"), year (integer), make, model, vin (17 characters), mileage (integer miles),
titleStatus (one of clean, salvage, rebuilt, flood, lemon, parts-only, unknown), damage (one of none, minor, moderate, severe, unknown),
runsAndDrives (true/false), hasKeys (true/false), currentBidUsd (number), buyNowUsd (number), endsAt (ISO 8601 date-time),
lotNumber (string), city, state (two-letter US code).
Copy only what the text states. If a fact is not in the text, use null. Never estimate, never infer a price, never fill a VIN.`

export async function aiExtractLot(text: string, url?: string): Promise<ImportFields | null> {
  if (!env('ANTHROPIC_API_KEY')) return null
  const Sdk = await loadSdk()
  if (!Sdk) return null
  try {
    const client = new Sdk({ apiKey: env('ANTHROPIC_API_KEY') })
    const msg = (await client.beta.messages.create({
      model: config.ai.model,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `${url ? `URL: ${url}\n` : ''}PAGE TEXT:\n${text.slice(0, 40_000)}` }],
    })) as { stop_reason: string; content: Array<{ type: string; text?: string }> }
    if (msg.stop_reason === 'refusal') return null
    const raw = msg.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const o = JSON.parse(json) as Record<string, unknown>
    const out: ImportFields = {}
    const strOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    const numOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    out.title = strOf(o.title)
    out.year = numOf(o.year)
    out.make = strOf(o.make)
    out.model = strOf(o.model)
    out.vin = strOf(o.vin)?.toUpperCase()
    out.mileage = numOf(o.mileage)
    out.titleStatus = strOf(o.titleStatus) as ImportFields['titleStatus']
    out.damage = strOf(o.damage) as ImportFields['damage']
    out.runsAndDrives = typeof o.runsAndDrives === 'boolean' ? o.runsAndDrives : undefined
    out.hasKeys = typeof o.hasKeys === 'boolean' ? o.hasKeys : undefined
    out.currentBidUsd = numOf(o.currentBidUsd)
    out.buyNowUsd = numOf(o.buyNowUsd)
    const e = strOf(o.endsAt)
    out.endsAt = e && Number.isFinite(Date.parse(e)) ? Date.parse(e) : undefined
    out.lotNumber = strOf(o.lotNumber)
    out.city = strOf(o.city)
    out.state = strOf(o.state)?.toUpperCase()
    return out
  } catch (e) {
    console.error('[import] AI reader failed:', e instanceof Error ? e.message : e)
    return null
  }
}
