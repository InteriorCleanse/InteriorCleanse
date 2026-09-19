/**
 * The assistant's NDJSON stream, as the extension reads it.
 *
 * Plain ES module with no browser globals, so the same code runs under the
 * unit tests and in the side panel. The event names and shapes are the ones
 * `app/api/assistant/route.ts` emits; the reducer mirrors what the web dock
 * does with them so the two clients cannot tell a different story about the
 * same answer.
 */

/** Feeds text chunks in, calls `onEvent` once per complete JSON line. */
export function createLineParser(onEvent) {
  let buffer = ''
  const emit = (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let event
    try {
      event = JSON.parse(trimmed)
    } catch {
      // A torn or malformed line is dropped rather than aborting the whole
      // answer; the `done` event still arrives and the text so far stands.
      return
    }
    if (event && typeof event === 'object' && typeof event.type === 'string') onEvent(event)
  }
  return {
    push(chunk) {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        emit(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
      }
    },
    flush() {
      const rest = buffer
      buffer = ''
      emit(rest)
    },
  }
}

/** A fresh assistant turn. */
export function emptyTurn(id) {
  return {
    id,
    role: 'assistant',
    text: '',
    tools: [],
    approvals: [],
    citations: [],
    sources: [],
    threadId: null,
    failed: false,
    done: false,
  }
}

/** Applies one stream event to a turn. Pure: returns a new object. */
export function reduceTurn(turn, event) {
  switch (event.type) {
    case 'thread':
      return { ...turn, threadId: event.threadId }
    case 'text':
      return { ...turn, text: turn.text + (event.text ?? '') }
    case 'tool_start':
      return { ...turn, tools: [...turn.tools, { id: event.id, name: event.name }] }
    case 'tool_end':
      return {
        ...turn,
        tools: turn.tools.map((t) =>
          t.id === event.id ? { ...t, ok: event.ok, detail: event.detail } : t,
        ),
      }
    case 'approval':
      return { ...turn, approvals: [...turn.approvals, event.approval] }
    case 'done':
      return {
        ...turn,
        done: true,
        citations: Array.isArray(event.citations) ? event.citations : [],
        sources: Array.isArray(event.sources) ? event.sources : [],
      }
    case 'error':
      return { ...turn, failed: true, done: true, text: event.message ?? 'The assistant could not finish that.' }
    default:
      return turn
  }
}

const METRIC_LABELS = {
  net_revenue: 'Net revenue',
  gross_sales: 'Gross sales',
  gross_profit: 'Gross profit',
  contribution_profit: 'Contribution profit',
  contribution_margin: 'Contribution margin',
  ad_spend: 'Ad spend',
  roas: 'ROAS',
  mer: 'MER',
  cac: 'CAC',
  aov: 'AOV',
  refund_rate: 'Refund rate',
  order_count: 'Orders',
  units_sold: 'Units',
  top_products: 'Product mix',
  data_quality: 'Data quality',
  knowledge_documents: 'Connected notes',
  crm_deals: 'CRM pipeline',
}

/** What a source chip says and where it goes — the dock's rule, verbatim. */
export function describeCitation(key, sources) {
  const source = (sources ?? []).find((s) => s.key === key)
  if (source) return { label: source.label, href: safeHref(source.url) }
  return { label: METRIC_LABELS[key] ?? key, href: null }
}

function safeHref(url) {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : null
}

/** Strips markdown for a synthesiser: the web dock's `speakable`, reduced. */
export function speakable(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
