/**
 * The optional AI assistant.
 *
 * Everything else in this bot is rules you can read. This file is the
 * one place a language model gets involved, and it is boxed in on
 * purpose: it can EXPLAIN the bot's analysis, answer questions about
 * the session model, and talk through the plan with you. It cannot
 * place orders, change settings, or invent market data — it only ever
 * sees the same analysis you see.
 *
 * It needs ANTHROPIC_API_KEY in a .env file, and the SDK installed
 * (`npm install` does that). Without either, the bot says so and the
 * rule-based answers still work.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.ts'
import type Anthropic from '@anthropic-ai/sdk'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(HERE, '..', '.env')

/** Node 22 can load a .env file without any library. */
function loadEnv(): void {
  if (!process.env.ANTHROPIC_API_KEY && existsSync(ENV_PATH)) {
    try {
      process.loadEnvFile(ENV_PATH)
    } catch {
      // A malformed .env is reported by aiStatus below.
    }
  }
}

export type AiStatus = { available: boolean; reason: string; model: string }

let sdk: typeof Anthropic | null = null

async function loadSdk(): Promise<typeof Anthropic | null> {
  if (sdk) return sdk
  try {
    const mod = await import('@anthropic-ai/sdk')
    sdk = mod.default
    return sdk
  } catch {
    return null
  }
}

export async function aiStatus(): Promise<AiStatus> {
  loadEnv()
  const model = config.ai.model
  if (!(await loadSdk())) {
    return { available: false, reason: 'The Anthropic SDK is not installed. Run `npm install` in the trading-bot folder once.', model }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { available: false, reason: 'No ANTHROPIC_API_KEY found. Copy .env.example to .env and add your key to turn the assistant on.', model }
  }
  return { available: true, reason: 'ready', model }
}

const SYSTEM_RULES = `You are Mr. Cash, the voice of a PAPER-trading bot that a beginner is learning with. Speak as Mr. Cash — calm, plain, a little dry — and never as "the assistant". The bot uses the ICT session model: Asia / London / New York session ranges, liquidity sweeps of session highs and lows, displacement, fair value gaps, and inversion fair value gaps, entered only inside killzones with a defined stop and target.

Your job is to make the bot's analysis understandable and to think through the day WITH the user, like a calm, honest mentor.

Rules you never break:
- The bot trades pretend money only. Never suggest the user risk real money, and never imply this strategy is reliably profitable. If asked "will this make money", say plainly that no one can promise that, and that the honest look-back test in this bot is the only evidence worth trusting.
- Never invent prices, levels, news, or results. Everything you say about the market must come from the CONTEXT below. If the context doesn't contain something, say you don't have it.
- Explain jargon the first time you use it. Short sentences. No hype.
- When the user proposes something risky (bigger size, trading outside killzones, skipping the stop), explain the trade-off honestly and then respect their decision — it's their bot.
- You cannot place orders or change settings. If asked, tell the user which config.ts setting or command does that.
- Keep answers focused. A few short paragraphs or a list, not an essay, unless the user asks for depth.`

export const PICTURE_QUESTION = 'Break this chart down for me: what is happening, where the levels are, and where an entry, stop and target would sit — and why.'

const PICTURE_RULES = `

The user has attached a PICTURE of a chart. Analyze it in this order, with a short heading for each:
1. What I can see — symbol/timeframe if visible, the trend and structure (higher highs? lower lows?), any session ranges or labelled levels, and whether the picture is clear enough to read prices. If a number is not legible, say "I can't read this" — never guess a price.
2. Levels and liquidity — obvious highs/lows where stops are resting, equal highs/lows, anything already swept.
3. Gaps — fair value gaps you can see, and whether any has been closed through (inverted).
4. A plan — the entry ZONE (not a single tick), the stop, the target, the approximate reward-to-risk, and the reasoning, using the same sweep → displacement → gap → retest logic the bot uses. If no clean plan exists, say so; "no trade" is a valid answer.
5. What would invalidate it — the specific thing that, if it happens, means the idea is wrong.
6. News to check — from the CONTEXT if it contains any, otherwise say to check the calendar.
Remind the user at the end, in one line, that this is a picture-based read on paper, not advice.`

export type AiAnswer = {
  text: string
  refused: boolean
  usage: { input: number; output: number; cacheRead: number }
  costUsd: number
}

/**
 * Ask a question with the bot's current analysis as context. Streams
 * the answer through `onText` as it arrives.
 */
export type AiImage = { mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; data: string }

export async function askAI(
  question: string,
  context: string,
  history: Anthropic.MessageParam[],
  onText: (delta: string) => void,
  image?: AiImage,
  skill?: { name: string; system: string } | null,
): Promise<AiAnswer> {
  loadEnv()
  const Sdk = await loadSdk()
  if (!Sdk) throw new Error('Anthropic SDK not installed')
  const client = new Sdk()

  const userContent: Anthropic.MessageParam['content'] = image
    ? [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
        { type: 'text', text: question },
      ]
    : question
  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userContent }]

  // The stable rules go first with a cache marker; the per-scan context
  // goes after it so the rules stay cached across questions.
  const params = {
    model: config.ai.model,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: config.ai.effort },
    system: [
      { type: 'text', text: SYSTEM_RULES, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `CONTEXT — the bot's current analysis (this is the only market information you have):\n\n${context}${image ? PICTURE_RULES : ''}${skill ? `\n\n${skill.system}` : ''}` },
    ],
    messages,
  }

  const stream = client.beta.messages.stream(params as unknown as Parameters<typeof client.beta.messages.stream>[0])
  let text = ''
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text
      onText(event.delta.text)
    }
  }
  const final = await stream.finalMessage()
  const refused = final.stop_reason === 'refusal'
  const usage = {
    input: final.usage.input_tokens,
    output: final.usage.output_tokens,
    cacheRead: final.usage.cache_read_input_tokens ?? 0,
  }
  const price = config.ai.prices[final.model] ?? config.ai.prices[config.ai.model] ?? { input: 5, output: 25 }
  const costUsd = (usage.input * price.input + usage.cacheRead * price.input * 0.1 + usage.output * price.output) / 1_000_000
  return { text, refused, usage, costUsd }
}

/**
 * One picture in, one JSON document out, constrained to `schema` with
 * structured outputs. Used by the chart scanner, which draws the result on
 * the screenshot. Streams under the hood (long thinking on a big image can
 * outlast a plain request) and returns the parsed object, or null with the
 * reason when the model declined or the output was cut short.
 */
export async function askAIJson(
  instructions: string,
  context: string,
  image: AiImage,
  schema: Record<string, unknown>,
): Promise<{ json: unknown | null; refused: boolean; reason: string | null; usage: AiAnswer['usage']; costUsd: number; model: string }> {
  loadEnv()
  const Sdk = await loadSdk()
  if (!Sdk) throw new Error('Anthropic SDK not installed')
  const client = new Sdk()
  const params = {
    model: config.ai.model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: config.ai.effort, format: { type: 'json_schema', schema } },
    system: [
      { type: 'text', text: SYSTEM_RULES, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `CONTEXT — the bot's current analysis of its own market (use it only if the picture is that market):\n\n${context}` },
    ],
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }, { type: 'text', text: instructions }] }],
  }
  const stream = client.beta.messages.stream(params as unknown as Parameters<typeof client.beta.messages.stream>[0])
  const final = await stream.finalMessage()
  const usage = { input: final.usage.input_tokens, output: final.usage.output_tokens, cacheRead: final.usage.cache_read_input_tokens ?? 0 }
  const price = config.ai.prices[final.model] ?? config.ai.prices[config.ai.model] ?? { input: 5, output: 25 }
  const costUsd = (usage.input * price.input + usage.cacheRead * price.input * 0.1 + usage.output * price.output) / 1_000_000
  const base = { usage, costUsd, model: final.model }
  if (final.stop_reason === 'refusal') return { ...base, json: null, refused: true, reason: 'The model declined to read this picture.' }
  if (final.stop_reason === 'max_tokens') return { ...base, json: null, refused: false, reason: 'The answer was cut short before it finished. Try a smaller or clearer screenshot.' }
  const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  try { return { ...base, json: JSON.parse(text), refused: false, reason: null } } catch { return { ...base, json: null, refused: false, reason: 'The answer was not valid JSON.' } }
}

/** A free call that proves the key works, for `npm run doctor`. */
export async function pingAI(): Promise<{ ok: boolean; detail: string }> {
  loadEnv()
  const Sdk = await loadSdk()
  if (!Sdk) return { ok: false, detail: 'SDK not installed' }
  try {
    const client = new Sdk()
    const page = await client.models.list({ limit: 1 })
    return { ok: true, detail: `models endpoint answered (${page.data.length} model listed)` }
  } catch (err) {
    return { ok: false, detail: await explainAiError(err) }
  }
}

/** Explains a typed SDK error in words a beginner can act on. */
export async function explainAiError(err: unknown): Promise<string> {
  const Sdk = await loadSdk()
  if (Sdk && err instanceof Sdk.AuthenticationError) return 'Your ANTHROPIC_API_KEY was rejected. Check .env for a typo, or make a new key at console.anthropic.com.'
  if (Sdk && err instanceof Sdk.RateLimitError) return 'Too many requests too fast. Wait a moment and ask again.'
  if (Sdk && err instanceof Sdk.APIConnectionError) return 'Could not reach the Anthropic API. Check your internet connection.'
  if (Sdk && err instanceof Sdk.APIError) return `The Anthropic API returned an error (${err.status}): ${err.message}`
  return err instanceof Error ? err.message : String(err)
}
