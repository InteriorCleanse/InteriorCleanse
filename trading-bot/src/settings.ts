/**
 * Runtime settings — the few things you may change while the bot runs,
 * without editing config.ts. Defaults come from config.ts; overrides live
 * in the store; `config.ts` stays the place you read to understand the
 * bot.
 *
 * Nothing in this version reads `strategy` yet (there is one strategy).
 * It exists so the playbook phase has a settled home for it.
 */

import { config } from '../config.ts'
import { store } from './store.ts'

export type Settings = {
  /** Which brain runs. Only 'ict' and 'crossover' exist in this version. */
  strategy: string
  /** How often the watch loop re-reads the market, in minutes. */
  watchEveryMinutes: number
  /** Whether the 24/7 paper trader may open positions on its own. */
  autoPaperTrade: boolean
  /** Which playbook strategies are shown and replayable, comma-separated. Empty = the config default (all). */
  enabledStrategies: string
}

const PREFIX = 'settings:'

export function defaultSettings(): Settings {
  return { strategy: config.strategy, watchEveryMinutes: config.app.watchEveryMinutes, autoPaperTrade: config.app.autoPaperTrade, enabledStrategies: config.strategies.enabled.join(',') }
}

export function getSettings(): Settings {
  const d = defaultSettings()
  const out: Settings = { ...d }
  for (const key of Object.keys(d) as Array<keyof Settings>) {
    const v = store().getJson<Settings[typeof key]>(PREFIX + key)
    if (v !== null && typeof v === typeof d[key]) (out as Record<string, unknown>)[key] = v
  }
  return out
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Settings {
  const d = defaultSettings()
  if (typeof value !== typeof d[key]) throw new Error(`Setting "${key}" must be a ${typeof d[key]}`)
  if (key === 'watchEveryMinutes' && !((value as number) >= 1 && (value as number) <= 60)) throw new Error('watchEveryMinutes must be between 1 and 60')
  store().setJson(PREFIX + key, value)
  return getSettings()
}

export function resetSetting(key: keyof Settings): Settings {
  store().deleteJson(PREFIX + key)
  return getSettings()
}

/** Which settings differ from config.ts right now. */
export function overrides(): Partial<Settings> {
  const d = defaultSettings()
  const s = getSettings()
  const out: Partial<Settings> = {}
  for (const key of Object.keys(d) as Array<keyof Settings>) if (s[key] !== d[key]) (out as Record<string, unknown>)[key] = s[key]
  return out
}
