/**
 * Full-text search over knowledge documents, the parts that are pure.
 *
 * The assistant asks a question in prose; Postgres wants a tsquery. Between
 * them sits the decision that determines whether search feels like recall or
 * like a lottery, and it is made here where it can be tested:
 *
 * **Every meaningful word, OR'd, ranked.** AND'ing the terms of a question
 * like "what did we decide about refund windows for wholesale" returns nothing
 * unless a note contains all six words. OR'ing them and ranking by `ts_rank`
 * returns the refund policy first and the wholesale terms second, which is
 * what a person would have opened. Precision comes from the rank, not the
 * boolean.
 *
 * **Stop words go, and so do the words that are only about asking.** "what",
 * "did", "we", "about" carry nothing; "decide" and "policy" carry a little;
 * "refund" and "wholesale" carry the answer. Postgres drops the first set; the
 * second is handled by the weighting the migration gives titles.
 *
 * **Prefix matching on the last term.** Someone typing "onboard" should find
 * "onboarding". Only the last term, because prefixing every term turns "re"
 * into a match for half the corpus.
 *
 * **Snippets are ours, not `ts_headline`.** Headline is slow on long documents
 * and cannot be told to prefer the first match after a heading. A window
 * around the earliest query term is cheap, deterministic, and reads well.
 */

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'do', 'did', 'does', 'we', 'i', 'you', 'our', 'us', 'it',
  'this', 'that', 'what', 'which', 'who', 'how', 'when', 'where', 'why', 'about',
  'have', 'has', 'had', 'can', 'could', 'should', 'would', 'me', 'my', 'any',
  'tell', 'show', 'find', 'know', 'please',
])

export const MAX_TERMS = 8

/** Words worth searching for, in order, deduplicated, bounded. */
export function searchTerms(question: string): string[] {
  const seen = new Set<string>()
  const terms: string[] = []

  for (const raw of question.toLowerCase().split(/[^a-z0-9']+/)) {
    const word = raw.replace(/^'+|'+$/g, '')
    if (word.length < 2 || STOP.has(word) || seen.has(word)) continue
    seen.add(word)
    terms.push(word)
    if (terms.length === MAX_TERMS) break
  }

  return terms
}

/**
 * A tsquery string for `to_tsquery('english', …)`.
 *
 * Terms are quoted so a stray apostrophe or operator character in the question
 * cannot become query syntax — `to_tsquery` would otherwise throw on `it's`,
 * and a thrown search is an assistant that says it found nothing.
 */
export function toTsQuery(question: string): string | null {
  const terms = searchTerms(question)
  if (terms.length === 0) return null

  return terms
    .map((term, index) => {
      const safe = `'${term.replace(/'/g, "''")}'`
      return index === terms.length - 1 ? `${safe}:*` : safe
    })
    .join(' | ')
}

/**
 * A window of the document around the first term that appears.
 *
 * Whole words at both ends, an ellipsis where it was cut, and never longer than
 * `width`. If no term appears — it matched on a stem — the opening of the
 * document is returned, which is the next best thing.
 */
export function snippet(content: string, question: string, width = 280): string {
  const text = content.replace(/\s+/g, ' ').trim()
  if (text.length <= width) return text

  const lower = text.toLowerCase()
  const terms = searchTerms(question)

  let at = -1
  for (const term of terms) {
    const index = lower.indexOf(term)
    if (index !== -1 && (at === -1 || index < at)) at = index
  }

  if (at === -1) return `${text.slice(0, width).replace(/\s+\S*$/, '')}…`

  let start = Math.max(0, at - Math.floor(width / 3))
  let end = Math.min(text.length, start + width)
  if (end === text.length) start = Math.max(0, end - width)

  // Snap to whole words, inward at the end so the window never exceeds
  // `width` — an overshoot of one long word is still an overshoot.
  if (start > 0) start = text.lastIndexOf(' ', start) + 1
  if (end < text.length) {
    const back = text.lastIndexOf(' ', end)
    if (back > start) end = back
  }

  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

export type KnowledgeHit = {
  id: string
  title: string
  source: string
  url: string | null
  snippet: string
  updatedAt: string | null
}
