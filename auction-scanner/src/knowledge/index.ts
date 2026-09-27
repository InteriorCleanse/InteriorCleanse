/** One search over the whole knowledge base: policies, regulations, glossary, and the guides. */
import { HOUSE_POLICIES } from './policies.ts'
import { REGULATIONS } from './regulations.ts'
import { GLOSSARY } from './glossary.ts'
import { GUIDES } from '../playbook/content.ts'

export type Hit = { kind: 'policy' | 'regulation' | 'term' | 'guide'; id: string; title: string; snippet: string; score: number }

function tokens(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2)
}

function scoreText(text: string, toks: string[]): number {
  const t = text.toLowerCase()
  let s = 0
  for (const k of toks) {
    const n = t.split(k).length - 1
    if (n) s += 1 + Math.min(n, 4) * 0.25
  }
  return s
}

function snippetFor(text: string, toks: string[]): string {
  const t = text
  const idx = toks.map((k) => t.toLowerCase().indexOf(k)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, idx - 80)
  const s = t.slice(start, start + 220).trim()
  return (start > 0 ? '…' : '') + s + (start + 220 < t.length ? '…' : '')
}

export function searchKnowledge(query: string, limit = 12): Hit[] {
  const toks = tokens(query)
  if (!toks.length) return []
  const hits: Hit[] = []
  for (const p of HOUSE_POLICIES) {
    const text = [p.name, p.whoMayBuy, p.registration.cost, p.registration.needs.join(' '), p.deposit, p.payment.window, p.fees.map((f) => `${f.name} ${f.basis} ${f.note ?? ''}`).join(' '), p.pickup.storage, p.disputes, p.bidding.style, p.bidding.extension, p.titles, p.gotchas.join(' ')].join(' ')
    const s = scoreText(text, toks) + scoreText(p.name, toks) * 2
    if (s) hits.push({ kind: 'policy', id: p.houseId, title: `${p.name}: how it works`, snippet: snippetFor(text, toks), score: s })
  }
  for (const r of REGULATIONS) {
    const text = [r.title, r.summary, r.whatToDo.join(' ')].join(' ')
    const s = scoreText(text, toks) + scoreText(r.title, toks) * 2
    if (s) hits.push({ kind: 'regulation', id: r.id, title: r.title, snippet: snippetFor(r.summary, toks), score: s })
  }
  for (const g of GLOSSARY) {
    const text = `${g.term} ${g.meaning}`
    const s = scoreText(text, toks) + scoreText(g.term, toks) * 3
    if (s) hits.push({ kind: 'term', id: g.term, title: g.term, snippet: g.meaning, score: s })
  }
  for (const g of GUIDES) {
    const text = [g.title, g.tagline, ...g.sections.map((sec) => [sec.title, sec.body ?? '', ...(sec.steps ?? []), sec.tip ?? '', sec.warning ?? ''].join(' '))].join(' ')
    const s = scoreText(text, toks) * 0.6 + scoreText(g.title, toks) * 2
    if (s) hits.push({ kind: 'guide', id: g.id, title: g.title, snippet: snippetFor(text, toks), score: s })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

export { HOUSE_POLICIES, REGULATIONS, GLOSSARY }
