#!/usr/bin/env node
// Send one prompt to several chat models at once and write their answers
// side by side. Any OpenAI-compatible endpoint: OpenRouter by default, or a
// local server (Ollama, LM Studio, llama.cpp, vLLM) with --base.
// Zero dependencies; Node 18+.

import { writeFileSync, readFileSync } from 'node:fs'

const OPENROUTER = 'https://openrouter.ai/api/v1'
const MAX_MODELS = 6

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`)
  console.error(`usage: node compare.mjs --models a,b,c (--prompt "text" | --prompt-file path) [options]

  --models LIST      comma-separated model ids, at most ${MAX_MODELS}
  --prompt TEXT      the prompt (or --prompt-file PATH)
  --system TEXT      optional system prompt, the same for every model
  --base URL         OpenAI-compatible base URL (default ${OPENROUTER})
                     e.g. http://localhost:11434/v1 for Ollama
  --timeout SECONDS  per-model timeout (default 90)
  --max-tokens N     per-model output cap (default 1024)
  --out PATH         write the markdown report here (default: stdout only)

  The key comes from OPENROUTER_API_KEY, or MODEL_COMPARE_API_KEY for another
  endpoint. Local servers need no key.`)
  process.exit(2)
}

function parse(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) usage(`unexpected argument ${k}`)
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) usage(`${k} needs a value`)
    a[k.slice(2)] = v
    i++
  }
  return a
}

const args = parse(process.argv.slice(2))
const models = (args.models ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (!models.length) usage('--models is required')
if (models.length > MAX_MODELS) usage(`at most ${MAX_MODELS} models at once`)
const prompt = args.prompt ?? (args['prompt-file'] ? readFileSync(args['prompt-file'], 'utf8') : '')
if (!prompt.trim()) usage('--prompt or --prompt-file is required')
const base = (args.base ?? OPENROUTER).replace(/\/+$/, '')
const timeoutMs = Math.max(5, Number(args.timeout ?? 90)) * 1000
const maxTokens = Math.max(16, Number(args['max-tokens'] ?? 1024))
const isOpenRouter = base.startsWith(OPENROUTER)
const key = isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.MODEL_COMPARE_API_KEY
if (isOpenRouter && !key) usage('OPENROUTER_API_KEY is not set (put it in your shell environment, never in a file in the repo)')

const messages = [...(args.system ? [{ role: 'system', content: args.system }] : []), { role: 'user', content: prompt }]

async function ask(model) {
  const t0 = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    })
    const text = await res.text()
    let body = null
    try { body = JSON.parse(text) } catch { /* reported below */ }
    if (!res.ok) {
      const why = body?.error?.message ?? text.slice(0, 200)
      const hint = res.status === 401 || res.status === 403 ? ' (key missing, invalid or not allowed)' : res.status === 429 ? ' (rate limited)' : res.status === 404 ? ' (unknown model id?)' : ''
      return { model, ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}${hint}: ${why}` }
    }
    const answer = body?.choices?.[0]?.message?.content
    if (typeof answer !== 'string') return { model, ok: false, ms: Date.now() - t0, error: 'response had no choices[0].message.content' }
    return { model, ok: true, ms: Date.now() - t0, answer, served: body.model ?? model, usage: body.usage ?? null, finish: body.choices[0].finish_reason ?? null }
  } catch (err) {
    return { model, ok: false, ms: Date.now() - t0, error: err.name === 'AbortError' ? `timed out after ${timeoutMs / 1000}s` : String(err.message ?? err) }
  } finally {
    clearTimeout(timer)
  }
}

const results = await Promise.all(models.map(ask))

const when = new Date().toISOString()
const lines = [
  `# Model comparison`,
  '',
  `${when} · endpoint ${base} · ${models.length} models, run in parallel`,
  '',
  '## Prompt',
  '',
  ...(args.system ? ['**System:**', '', '```', args.system, '```', ''] : []),
  '```',
  prompt.trim(),
  '```',
  '',
  '## Summary',
  '',
  '| Model | Result | Time | Tokens in / out | Finish |',
  '|---|---|---|---|---|',
  ...results.map((r) => `| \`${r.model}\`${r.ok && r.served !== r.model ? ` → \`${r.served}\`` : ''} | ${r.ok ? 'answered' : 'FAILED'} | ${(r.ms / 1000).toFixed(1)} s | ${r.usage ? `${r.usage.prompt_tokens ?? '?'} / ${r.usage.completion_tokens ?? '?'}` : 'not reported'} | ${r.finish ?? '—'} |`),
  '',
  ...results.flatMap((r) => [`## ${r.model}`, '', r.ok ? r.answer.trim() : `**Failed:** ${r.error}`, '']),
]
const report = lines.join('\n')
if (args.out) { writeFileSync(args.out, report); console.error(`wrote ${args.out}`) }
process.stdout.write(report + '\n')
process.exit(results.some((r) => r.ok) ? 0 : 1)
