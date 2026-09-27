/**
 * Turning what a site says into what Gavel stores. Every function here is
 * conservative: when the text is ambiguous the answer is 'unknown', never a guess.
 */
import type { Damage, TitleStatus } from '../types.ts'

export function parseTitleStatus(text: string | undefined): TitleStatus {
  const t = (text ?? '').toLowerCase()
  if (!t) return 'unknown'
  if (/parts[- ]only|non[- ]repairable|certificate of destruction|junk/.test(t)) return 'parts-only'
  if (/flood|water damage/.test(t)) return 'flood'
  if (/lemon|manufacturer buy ?back/.test(t)) return 'lemon'
  if (/rebuilt|reconstructed|prior salvage|previously salvage/.test(t)) return 'rebuilt'
  if (/salvage|total loss|totaled/.test(t)) return 'salvage'
  if (/\bclean\b|clear title|clean title/.test(t)) return 'clean'
  return 'unknown'
}

export function parseDamage(text: string | undefined): Damage {
  const t = (text ?? '').toLowerCase()
  if (!t) return 'unknown'
  if (/no damage|none|undamaged|no known damage|excellent condition/.test(t)) return 'none'
  if (/severe|heavy|rollover|frame|burn|fire|airbag|totaled|major/.test(t)) return 'severe'
  if (/moderate|front end|rear end|side|collision|hail/.test(t)) return 'moderate'
  if (/minor|scratch|scuff|dent|ding|cosmetic|light|wear/.test(t)) return 'minor'
  return 'unknown'
}

export function parseMileage(text: string | number | undefined): number | undefined {
  if (typeof text === 'number') return Number.isFinite(text) && text >= 0 ? Math.round(text) : undefined
  if (!text) return undefined
  const m = /([\d,]+(?:\.\d+)?)\s*(k)?\s*(mi|miles)?/i.exec(text)
  if (!m) return undefined
  let n = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(n)) return undefined
  if (m[2]) n *= 1000
  return Math.round(n)
}

export function parseMoney(text: string | number | undefined): number | undefined {
  if (typeof text === 'number') return Number.isFinite(text) ? text : undefined
  if (!text) return undefined
  const m = /([\d,]+(?:\.\d+)?)/.exec(text)
  if (!m) return undefined
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/** "2016 Porsche 911 Carrera S" → year, make, rest. */
export function splitTitle(title: string): { year?: number; make?: string; model?: string } {
  const m = /^\s*(19[5-9]\d|20[0-4]\d)\s+([A-Za-z-]+(?:\s+(?:Romeo|Rover|Martin|Royce|Benz))?)\s*(.*)$/.exec(title)
  if (!m) return {}
  const model = m[3].trim().split(/\s+/).slice(0, 2).join(' ') || undefined
  return { year: Number(m[1]), make: m[2], model }
}

/** Ten years of VINs look like this; anything else is not a VIN. */
export function looksLikeVin(v: string | undefined): boolean {
  return !!v && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v)
}
