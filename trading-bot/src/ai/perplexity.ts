/**
 * WEB RESEARCH — Perplexity, for the questions Kestrel's own feeds cannot answer.
 *
 * Kestrel reads prices, its news feed, the economic calendar and public
 * filings. It cannot search the web: why a stock jumped this morning, when a
 * company reports next, what a central banker said an hour ago. Perplexity's
 * search-grounded models answer that kind of question with their sources, so
 * this module asks them, on demand, and hands back the answer with every
 * source it cited.
 *
 * Boxed in on purpose:
 * - RESEARCH ONLY. Nothing here is read by the engine, fusion, risk, sizing,
 *   the stock desk's rules or the prediction desk's minds. An answer is text
 *   for a person to read, labelled AI RESEARCH: unverified, not a signal.
 * - It costs money, so it runs only when someone asks (no timer), each
 *   question is cached for a while, and a daily cap stops runaway spend.
 * - The key lives in .env (PERPLEXITY_API_KEY) and never leaves this file:
 *   not in a response, a log line or an error message.
 * - One fixed host. The caller picks a preset or types a question; nobody
 *   supplies a URL, so this cannot be turned into a fetch-anything proxy.
 * - The answer is untrusted text from the web. It is length-capped, stripped
 *   of control characters, and the page renders it escaped.
 */

import { store } from '../store.ts'

export const ENDPOINT = 'https://api.perplexity.ai/chat/completions'
export const LABEL = 'AI RESEARCH (Perplexity): unverified, not a signal'

export type Citation = { url: string; title: string | null; date: string | null }
export type WebAnswer = {
  question: string
  preset: Preset | 'ask'
  answer: string
  citations: Citation[]
  model: string
  at: number
  cached: boolean
  label: string
}
export type WebStatus = { available: boolean; reason: string; model: string; usedToday: number; dailyCap: number; presets: Array<{ id: Preset; label: string; needsSymbol: boolean }> }

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export type Preset = 'catalyst' | 'earnings' | 'macro' | 'crypto' | 'company'
const PRESETS: Record<Preset, { label: string; needsSymbol: boolean; prompt: (s: string) => string; recency: 'day' | 'week' | 'month' }> = {
  catalyst: { label: 'Why is it moving?', needsSymbol: true, recency: 'week', prompt: (s) => `What dated news from the last 48 hours explains the latest price move in ${s}? List each item with its date and source. If nothing specific explains it, say so plainly.` },
  earnings: { label: 'Next earnings date', needsSymbol: true, recency: 'month', prompt: (s) => `When is ${s}'s next scheduled earnings report (date and before/after market)? Give the source. If the date is not confirmed by the company, say it is an estimate.` },
  company: { label: 'What does it do?', needsSymbol: true, recency: 'month', prompt: (s) => `In plain English, what does ${s} do, how does it make money, and what are the two or three things investors are watching about it right now? Cite sources.` },
  macro: { label: "Today's macro picture", needsSymbol: false, recency: 'day', prompt: () => 'What scheduled US economic releases and central-bank events are on today and this week, and what was the latest notable macro news? Dated items with sources, most important first.' },
  crypto: { label: 'What is moving crypto?', needsSymbol: false, recency: 'day', prompt: () => 'What news from the last 24 hours is driving Bitcoin and the wider crypto market? Dated items with sources. Separate confirmed facts from commentary.' },
}

const SYSTEM = [
  'You are a research assistant for a person who runs a PAPER-trading bot. You find and summarise public information with sources.',
  'Rules: cite a source for every factual claim; give dates; separate confirmed facts from opinion; say plainly when you could not find something.',
  'Never give buy, sell or hold advice, price targets, or predictions of price. Never claim a strategy is profitable. No hype.',
  'Plain English, short paragraphs or a list, under 250 words.',
].join(' ')

const MAX_ANSWER = 4000
const CACHE_MS = 30 * 60_000
const TIMEOUT_MS = 30_000
const USAGE_KEY = 'perplexity:usage'
const CACHE_KEY = 'perplexity:cache'

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max)
const dayKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
/** Symbols are letters, digits and a few separators; anything else is refused rather than passed into a prompt. */
const symbolOk = (s: string) => /^[A-Za-z0-9.\-/: ]{1,20}$/.test(s)

export function settings(env: NodeJS.ProcessEnv = process.env) {
  const cap = Number(env.MRCASH_PERPLEXITY_DAILY)
  return {
    key: env.PERPLEXITY_API_KEY?.trim() || '',
    model: env.MRCASH_PERPLEXITY_MODEL?.trim() || 'sonar',
    dailyCap: Number.isFinite(cap) && cap >= 0 ? Math.min(500, Math.floor(cap)) : 40,
  }
}

function usage(now: number): { day: string; used: number } {
  const u = store().getJson<{ day: string; used: number }>(USAGE_KEY)
  return u && u.day === dayKey(now) ? u : { day: dayKey(now), used: 0 }
}

export function webStatus(env: NodeJS.ProcessEnv = process.env, now = Date.now()): WebStatus {
  const s = settings(env)
  const used = usage(now).used
  const presets = (Object.keys(PRESETS) as Preset[]).map((id) => ({ id, label: PRESETS[id].label, needsSymbol: PRESETS[id].needsSymbol }))
  if (!s.key) return { available: false, reason: 'No PERPLEXITY_API_KEY in .env. Add your own key to turn web research on; it costs money per question.', model: s.model, usedToday: used, dailyCap: s.dailyCap, presets }
  if (used >= s.dailyCap) return { available: false, reason: `Today's cap of ${s.dailyCap} web questions is used up. It resets at midnight New York time (MRCASH_PERPLEXITY_DAILY changes the cap).`, model: s.model, usedToday: used, dailyCap: s.dailyCap, presets }
  return { available: true, reason: 'ready', model: s.model, usedToday: used, dailyCap: s.dailyCap, presets }
}

/** Builds the question from a preset or free text. Throws a plain-English error on bad input. */
export function buildQuestion(input: { preset?: string; symbol?: string; q?: string }): { question: string; preset: Preset | 'ask'; recency: 'day' | 'week' | 'month' } {
  if (input.preset && input.preset !== 'ask') {
    const p = PRESETS[input.preset as Preset]
    if (!p) throw new Error('Unknown research preset.')
    const sym = String(input.symbol ?? '').trim()
    if (p.needsSymbol && !symbolOk(sym)) throw new Error('Give a ticker or market name (letters and digits, up to 20 characters).')
    return { question: p.prompt(sym.toUpperCase()), preset: input.preset as Preset, recency: p.recency }
  }
  const q = clean(input.q, 600).trim()
  if (q.length < 4) throw new Error('Type a question of at least a few words.')
  return { question: q, preset: 'ask', recency: 'month' }
}

function parseCitations(j: Record<string, unknown>): Citation[] {
  const out: Citation[] = []
  const seen = new Set<string>()
  const add = (url: unknown, title: unknown, date: unknown) => {
    const u = clean(url, 500)
    if (!/^https?:\/\//i.test(u) || seen.has(u)) return
    seen.add(u)
    out.push({ url: u, title: title ? clean(title, 200) : null, date: date ? clean(date, 40) : null })
  }
  if (Array.isArray(j.search_results)) for (const r of j.search_results as Array<Record<string, unknown>>) add(r?.url, r?.title, r?.date)
  if (Array.isArray(j.citations)) for (const c of j.citations) add(c, null, null)
  return out.slice(0, 12)
}

/**
 * Asks Perplexity one question. Cached per question for 30 minutes; a cached
 * answer does not count against the cap. Throws a plain-English error that
 * never contains the key.
 */
export async function askWeb(input: { preset?: string; symbol?: string; q?: string }, deps: { env?: NodeJS.ProcessEnv; fetch?: FetchLike; now?: () => number } = {}): Promise<WebAnswer> {
  const env = deps.env ?? process.env
  const now = deps.now ?? Date.now
  const { question, preset, recency } = buildQuestion(input)
  const s = settings(env)

  const cache = store().getJson<Record<string, WebAnswer>>(CACHE_KEY) ?? {}
  const hit = cache[question]
  if (hit && now() - hit.at < CACHE_MS && hit.model === s.model) return { ...hit, cached: true }

  const st = webStatus(env, now())
  if (!st.available) throw new Error(st.reason)

  const f: FetchLike = deps.fetch ?? (globalThis.fetch as unknown as FetchLike)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let j: Record<string, unknown>
  try {
    const r = await f(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${s.key}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ model: s.model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: question }], search_recency_filter: recency, temperature: 0.2 }),
      signal: ctrl.signal,
    })
    if (r.status === 401 || r.status === 403) throw new Error('Perplexity refused the key. Check PERPLEXITY_API_KEY in .env.')
    if (r.status === 429) throw new Error('Perplexity is rate-limiting this key. Try again in a minute.')
    if (!r.ok) throw new Error(`Perplexity answered with an error (HTTP ${r.status}).`)
    j = (await r.json()) as Record<string, unknown>
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? 'Perplexity did not answer within 30 seconds.' : (e as Error).message
    // Belt and braces: an upstream message can never carry the key out.
    throw new Error(s.key ? msg.split(s.key).join('[key]') : msg)
  } finally {
    clearTimeout(timer)
  }

  // A call that reached Perplexity counts, whatever came back.
  const u = usage(now())
  store().setJson(USAGE_KEY, { day: u.day, used: u.used + 1 })

  const choice = Array.isArray(j.choices) ? (j.choices[0] as Record<string, unknown> | undefined) : undefined
  const answer = clean((choice?.message as Record<string, unknown> | undefined)?.content, MAX_ANSWER).trim()
  if (!answer) throw new Error('Perplexity returned no answer.')
  const out: WebAnswer = { question, preset, answer, citations: parseCitations(j), model: clean(j.model, 60) || s.model, at: now(), cached: false, label: LABEL }

  // Keep the cache small: the newest 40 answers.
  const next = Object.fromEntries(Object.entries({ ...cache, [question]: out }).sort((a, b) => b[1].at - a[1].at).slice(0, 40))
  store().setJson(CACHE_KEY, next)
  return out
}

/** The most recent answers, newest first, for the page to show without spending anything. */
export function recentAnswers(limit = 10): WebAnswer[] {
  const cache = store().getJson<Record<string, WebAnswer>>(CACHE_KEY) ?? {}
  return Object.values(cache).sort((a, b) => b.at - a.at).slice(0, limit).map((a) => ({ ...a, cached: true }))
}
