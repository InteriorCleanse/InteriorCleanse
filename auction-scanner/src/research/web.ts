/**
 * WEB RESEARCH — the optional desk that reads the live web. With an Anthropic
 * key, Claude runs a web search (a server-side tool, nothing to install),
 * reads the pages, and answers with the sources it used. Without a key the
 * server serves the built-in knowledge base instead and says so.
 *
 * The answer is labelled as AI research with citations. It is never used to
 * fill a price or a fee into a plan; a person reads it and decides.
 */
import { config } from '../../config.ts'
import { env } from '../env.ts'
import { BRAND } from '../brand.ts'

export type Citation = { url: string; title: string; quote?: string }
export type ResearchAnswer = { answer: string; citations: Citation[]; searches: number; model: string }

type Ctor = new (opts: { apiKey: string }) => { beta: { messages: { create: (params: unknown) => Promise<unknown> } } }
let sdk: Ctor | null | undefined

async function loadSdk(): Promise<Ctor | null> {
  if (sdk !== undefined) return sdk
  try {
    const mod = (await import('@anthropic-ai/sdk')) as { default: unknown }
    sdk = mod.default as Ctor
  } catch {
    sdk = null
  }
  return sdk
}

export async function researchAvailable(): Promise<{ available: boolean; reason: string }> {
  if (!env('ANTHROPIC_API_KEY')) return { available: false, reason: 'Add ANTHROPIC_API_KEY to .env to let the desk search the web. Until then it answers from the built-in knowledge base.' }
  if (!(await loadSdk())) return { available: false, reason: 'Run npm install in the Gavel folder once to add the AI library.' }
  return { available: true, reason: 'ready' }
}

const RULES = `You are the research desk inside ${BRAND}, an AI car-auction scanner used by a beginner buying, flipping and renting cars.
Search the web and answer the question with what you actually found. Cite the pages. Rules:
- Never invent a price, fee, rule or date. If the sources disagree or are old, say so.
- Fees and laws change: name the date on the source when you can, and tell the person to verify on the official page.
- Plain English, short sentences, explain any term the first time. Bullet points are fine.
- Never promise a profit. Never say a car is a sure thing.
- End with a line "What to do next:" and two or three concrete steps.`

type Block = { type: string; text?: string; citations?: Array<{ url?: string; title?: string; cited_text?: string }>; content?: unknown }
type Msg = { content: Block[]; stop_reason: string; model: string }

export async function webResearch(question: string, context = ''): Promise<ResearchAnswer | null> {
  const status = await researchAvailable()
  if (!status.available) return null
  const Sdk = await loadSdk()
  if (!Sdk) return null
  const client = new Sdk({ apiKey: env('ANTHROPIC_API_KEY') })
  const messages: unknown[] = [{ role: 'user', content: `${context ? `Context (from the app, not from the web):\n${context}\n\n` : ''}Question: ${question}` }]
  const params = {
    model: config.ai.model,
    max_tokens: 6000,
    thinking: { type: 'adaptive' },
    output_config: { effort: config.ai.effort },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }],
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
    messages,
  }
  let msg = (await client.beta.messages.create(params)) as Msg
  let hops = 0
  while (msg.stop_reason === 'pause_turn' && hops < 4) {
    messages.push({ role: 'assistant', content: msg.content })
    msg = (await client.beta.messages.create({ ...params, messages })) as Msg
    hops++
  }
  if (msg.stop_reason === 'refusal') return null
  return parseResearch(msg)
}

export function parseResearch(msg: Msg): ResearchAnswer {
  const citations = new Map<string, Citation>()
  let answer = ''
  let searches = 0
  for (const b of msg.content) {
    if (b.type === 'text' && b.text) {
      answer += b.text
      for (const c of b.citations ?? []) if (c.url && !citations.has(c.url)) citations.set(c.url, { url: c.url, title: c.title ?? c.url, quote: c.cited_text?.slice(0, 200) })
    }
    if (b.type === 'server_tool_use') searches++
  }
  return { answer: answer.trim(), citations: [...citations.values()], searches, model: msg.model }
}
