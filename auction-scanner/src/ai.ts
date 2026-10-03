/**
 * The optional AI explainer. Claude rewrites the rule-based walkthrough for
 * one car in Gavel's voice, or answers a member's question about it, using
 * ONLY the card and the rules walkthrough as facts.
 *
 * Optional means optional: the Anthropic SDK is loaded with a dynamic import
 * inside a try, so the app runs without the package; it needs ANTHROPIC_API_KEY
 * in .env; and every failure path (no key, no package, network, refusal,
 * unparseable text, a banned promise in the answer) returns null so the server
 * serves the rules walkthrough instead. The AI never sees anything but this
 * one card, and it is told, in the rules below, that it may not invent a
 * price, a fee, a fact or a history.
 */
import { config } from '../config.ts'
import { env } from './env.ts'
import type { AuctionHouse } from './sources/directory.ts'
import type { Walkthrough, WalkthroughCard } from './explain.ts'

const RULES = `You are the voice of Gavel, an AI car-auction scanner built for beginners with no car experience.
You explain how to buy one specific car at one specific auction, or answer one question about it.

Rules you never break:
1. Use only the CONTEXT you are given: the card (the listing, the value estimate, the score, the bid plan), the auction house entry, and the rules walkthrough. Nothing else.
2. Never invent a price, a fee, a date, a fact or a history. If the context does not say, write "verify on the auction's site" or say plainly that you do not know.
3. Never promise profit or certainty. Do not call any car a sure thing, a safe bet or an investment, and do not say a car will make money.
4. Plain English. Short sentences. Explain a term the first time it appears. End each step with what to do next.
5. Gavel never places a bid for anyone. Bidding happens on the auction's own site. A PAPER bid is practice; nothing is sent anywhere.
6. If the listing's kind is SAMPLE, say plainly that it is a sample car and cannot be bought.
7. If the house needs a dealer licence, say the person cannot buy there yet.

Answer format, exactly:
- A numbered list of steps, one per line, each written as "1. Title: what to do".
- Then a line that says only "Warnings:" followed by bullet lines that start with "- ". Write "- None." if there are none.
No preamble, no closing remarks, no markdown headings.`

const DEFAULT_QUESTION = 'Explain, step by step, how I should go about buying this car at this auction. I have never done this before.'

/** Words the product rules forbid. An answer containing one is thrown away and the rules walkthrough is served. */
const BANNED = /\b(guaranteed|risk[- ]free|proven\s+(?:profitable|flipper|investment)|best\s+investment)\b/i

type AnthropicCtor = new (opts: { apiKey: string }) => {
  beta: {
    messages: {
      stream: (params: unknown) => { finalMessage: () => Promise<FinalMessage> }
    }
  }
}

type FinalMessage = {
  stop_reason?: string | null
  content: Array<{ type: string; text?: string }>
}

async function loadSdk(): Promise<AnthropicCtor | null> {
  try {
    // A variable specifier keeps the type-checker from needing the package to exist.
    const name = '@anthropic-ai/sdk'
    const mod = (await import(name)) as { default?: unknown; Anthropic?: unknown }
    const ctor = (mod.default ?? mod.Anthropic) as AnthropicCtor | undefined
    return typeof ctor === 'function' ? ctor : null
  } catch {
    return null
  }
}

/** Is the AI explainer usable right now, and if not, what to do about it. */
export async function aiStatus(): Promise<{ available: boolean; reason: string; model: string }> {
  const model = config.ai.model
  if (!env('ANTHROPIC_API_KEY')) {
    return {
      available: false,
      reason: 'Off. Add ANTHROPIC_API_KEY to the .env file to turn on the AI explainer (get a key at console.anthropic.com). Without it, Gavel still explains every car with its built-in rules.',
      model,
    }
  }
  if (!(await loadSdk())) {
    return {
      available: false,
      reason: 'The @anthropic-ai/sdk package is not installed. Run "npm install" in the auction-scanner folder, then restart. Until then Gavel uses its built-in rules.',
      model,
    }
  }
  return { available: true, reason: `On. Explanations are written by ${model} from the card and the rules walkthrough, and checked against Gavel's rules.`, model }
}

/** Strip the one function from a house entry so it can be sent as JSON. */
function houseForContext(house: AuctionHouse | undefined): Record<string, unknown> | undefined {
  if (!house) return undefined
  const { searchUrl: _omit, ...rest } = house
  return rest
}

function buildContext(card: WalkthroughCard, house: AuctionHouse | undefined, base: Walkthrough): string {
  const listing = { ...card.listing, photos: card.listing.photos.length, description: (card.listing.description ?? '').slice(0, 1500) }
  const ctx = {
    card: { listing, estimate: card.estimate, score: card.score, plan: card.plan },
    house: houseForContext(house) ?? { note: `Gavel has no directory entry for source "${card.listing.source}".` },
    rulesWalkthrough: base,
  }
  return `CONTEXT (the only facts you may use):\n${JSON.stringify(ctx, null, 1)}`
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^#+\s*/, '')
    .trim()
}

/**
 * Turn the model's text back into steps and warnings. Tolerant of "1." or
 * "1)" numbering, "Title: body", "Title — body" or "Title - body", and
 * markdown bold. When no numbered step can be found the whole text becomes
 * one step, so a member never sees nothing.
 */
export function parseAiText(text: string): { steps: Walkthrough['steps']; warnings: string[] } {
  const cleaned = text.replace(/\r\n/g, '\n').trim()
  const split = /^\s*\**\s*warnings?\s*:?\s*\**\s*$/im.exec(cleaned)
  const stepsText = split ? cleaned.slice(0, split.index) : cleaned
  const warnText = split ? cleaned.slice(split.index + split[0].length) : ''

  const steps: Walkthrough['steps'] = []
  const lines = stepsText.split('\n')
  let current: { title: string; body: string[] } | null = null
  const flush = (): void => {
    if (!current) return
    const body = current.body.join(' ').replace(/\s+/g, ' ').trim()
    steps.push({ n: steps.length + 1, title: current.title, body })
    current = null
  }
  for (const raw of lines) {
    const m = /^\s*(\d{1,2})[.)]\s+(.*)$/.exec(raw)
    if (m) {
      flush()
      const rest = stripMarkdown(m[2])
      const sep = /^(.{2,80}?)\s*(?::|\s[—–-]\s)\s*(.*)$/.exec(rest)
      if (sep) current = { title: sep[1].trim(), body: sep[2].trim() ? [sep[2].trim()] : [] }
      else current = { title: rest, body: [] }
    } else if (current && raw.trim()) {
      current.body.push(stripMarkdown(raw))
    }
  }
  flush()

  const warnings = warnText
    .split('\n')
    .map((l) => stripMarkdown(l.replace(/^\s*[-*•]\s*/, '')))
    .filter((l) => l && !/^none\.?$/i.test(l))

  if (steps.length === 0) {
    return { steps: [{ n: 1, title: 'What to do', body: cleaned.replace(/\s+/g, ' ') }], warnings }
  }
  for (const s of steps) if (!s.body) s.body = s.title
  return { steps, warnings }
}

/**
 * Ask Claude for the walkthrough (or an answer to `question`) in Gavel's voice.
 * Returns null whenever the AI is unavailable or anything goes wrong; the
 * server then serves `base`, the rules walkthrough. Hard warnings from the
 * rules (SAMPLE, dealer licence) are always kept.
 */
export async function aiWalkthrough(card: WalkthroughCard, house: AuctionHouse | undefined, base: Walkthrough, question?: string): Promise<Walkthrough | null> {
  try {
    const status = await aiStatus()
    if (!status.available) return null
    const Anthropic = await loadSdk()
    if (!Anthropic) return null

    const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
    const q = (question ?? '').trim() || DEFAULT_QUESTION
    const params = {
      model: config.ai.model,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: config.ai.effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: RULES, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: buildContext(card, house, base) },
      ],
      messages: [{ role: 'user', content: q }],
    } as unknown

    const stream = client.beta.messages.stream(params)
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') return null

    const text = msg.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim()
    if (!text) return null
    if (BANNED.test(text)) return null

    const parsed = parseAiText(text)
    const hard = base.warnings.filter((w) => w.startsWith('This is a SAMPLE car') || w.startsWith('You cannot buy here yet'))
    const warnings = [...hard, ...parsed.warnings.filter((w) => !hard.includes(w))]
    return { source: 'ai', title: base.title, steps: parsed.steps, warnings }
  } catch {
    return null
  }
}

const ADVISOR_RULES = `You are Gavel's business partner for one member who buys cars at auction to flip or rent out.
You answer one question about their business.

Rules you never break:
1. Use only the CONTEXT: their books (companies, cars, costs, income, the report), the briefing, their settings. Nothing else.
2. Never invent a number, a sale price, a market value, a law or a tax rule. If the context does not hold it, say so and say where to get it.
3. Never promise profit. Do not call anything guaranteed, risk-free, a sure thing or the best investment.
4. Tax, legal and licensing questions: say plainly that a tax adviser or the state decides, then say what records to keep.
5. Plain English, short sentences, at most 180 words. Lead with the answer. End with one concrete next step.
6. Gavel never places a bid. Bidding happens on the auction's own site.
No markdown headings, no tables.`

/** Ask Claude a business question grounded in the member's own books. Null whenever the AI is off or anything fails. */
export async function aiAdvise(question: string, context: unknown): Promise<string | null> {
  try {
    const status = await aiStatus()
    if (!status.available) return null
    const Anthropic = await loadSdk()
    if (!Anthropic) return null
    const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
    const params = {
      model: config.ai.model,
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      output_config: { effort: config.ai.effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: ADVISOR_RULES, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `CONTEXT (the only facts you may use):\n${JSON.stringify(context).slice(0, 60_000)}` },
      ],
      messages: [{ role: 'user', content: question.slice(0, 1000) }],
    } as unknown
    const msg = await client.beta.messages.stream(params).finalMessage()
    if (msg.stop_reason === 'refusal') return null
    const text = msg.content.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('\n').trim()
    if (!text || BANNED.test(text)) return null
    return text.replace(/^#+\s*/gm, '').replace(/\*\*(.*?)\*\*/g, '$1')
  } catch {
    return null
  }
}
