/**
 * Reading unread mail from Gmail.
 *
 * Read-only, bounded, and metadata-first. The assistant needs who wrote,
 * what about, and a line of preview to say "three things need a reply";
 * it does not need bodies, attachments, or history, and asking for them
 * would widen both the OAuth scope and the blast radius of a stored token.
 *
 * Every string that comes back is someone else's words. The tool layer
 * wraps it as external content before the model sees it; nothing here
 * treats a subject line as anything but text.
 */

export const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** The most messages one read returns, however many are unread. */
export const INBOX_LIMIT = 15

/** How far back "new" reaches, in days. Older unread mail is backlog, not news. */
export const INBOX_WINDOW_DAYS = 2

export type MailMessage = {
  id: string
  threadId: string
  /** The display name, or the address when there is no name. */
  from: string
  fromAddress: string | null
  subject: string
  /** ISO timestamp, or null when the provider gave none. */
  receivedAt: string | null
  /** The provider's own one-line preview. */
  snippet: string
  /** Where a person opens the message. */
  url: string
}

export class MailError extends Error {
  constructor(
    message: string,
    /** True for the vendor having a bad minute; false for a dead or under-scoped token. */
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'MailError'
  }
}

/** The search Gmail runs: unread, in the inbox, recent, and not the noise tabs. */
export function inboxQuery(newerThanDays: number = INBOX_WINDOW_DAYS): string {
  return `is:unread in:inbox -category:promotions -category:social newer_than:${newerThanDays}d`
}

export function gmailMessageUrl(id: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(id)}`
}

/**
 * "Maya Chen <maya@harbour.co>" → name and address. A bare address is its own
 * name; quotes around a name are dropped. Nothing is invented for a header
 * that has neither.
 */
export function parseFrom(header: string): { name: string; address: string | null } {
  const trimmed = header.trim()
  const angled = /^(.*?)\s*<([^<>]+)>\s*$/.exec(trimmed)
  if (angled) {
    const address = angled[2]!.trim()
    const name = angled[1]!.trim().replace(/^"(.*)"$/, '$1').trim()
    return { name: name || address, address }
  }
  if (trimmed.includes('@')) return { name: trimmed, address: trimmed }
  return { name: trimmed || '(unknown sender)', address: null }
}

export type GmailMessagePayload = {
  id?: string
  threadId?: string
  snippet?: string
  internalDate?: string
  payload?: { headers?: { name?: string; value?: string }[] }
}

export function parseMessage(raw: GmailMessagePayload): MailMessage | null {
  if (!raw.id) return null
  const headers = new Map<string, string>()
  for (const h of raw.payload?.headers ?? []) {
    if (h.name && typeof h.value === 'string') headers.set(h.name.toLowerCase(), h.value)
  }

  const from = parseFrom(headers.get('from') ?? '')
  const epoch = Number(raw.internalDate)
  const receivedAt = Number.isFinite(epoch) && epoch > 0 ? new Date(epoch).toISOString() : null

  return {
    id: raw.id,
    threadId: raw.threadId ?? raw.id,
    from: from.name,
    fromAddress: from.address,
    subject: (headers.get('subject') ?? '').trim() || '(no subject)',
    receivedAt,
    // Gmail HTML-escapes the snippet; unescape the handful of entities it uses.
    snippet: decodeEntities(raw.snippet ?? ''),
    url: gmailMessageUrl(raw.id),
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
}

function classify(response: Response): MailError {
  if (response.status === 401) return new MailError('The mailbox access token was rejected.', false)
  if (response.status === 403) {
    return new MailError(
      'Gmail refused the request: the connection does not have permission to read mail. Reconnect the mailbox.',
      false,
    )
  }
  if (response.status === 429 || response.status >= 500) {
    return new MailError(`Gmail returned ${response.status}.`, true)
  }
  return new MailError(`Gmail refused the request (${response.status}).`, false)
}

/**
 * Unread messages, newest first, bounded by `limit` and the window.
 *
 * Two requests per read at most: one list, then one metadata fetch per id in
 * parallel. `format=metadata` with named headers is what keeps the body — and
 * every attachment — on Google's side.
 */
export async function fetchUnread(input: {
  accessToken: string
  limit?: number
  newerThanDays?: number
  fetch?: typeof globalThis.fetch
}): Promise<MailMessage[]> {
  const doFetch = input.fetch ?? globalThis.fetch
  const limit = Math.max(1, Math.min(input.limit ?? 8, INBOX_LIMIT))
  const headers = { authorization: `Bearer ${input.accessToken}`, accept: 'application/json' }

  const listUrl = `${GMAIL_API}/messages?${new URLSearchParams({
    q: inboxQuery(input.newerThanDays),
    maxResults: String(limit),
  })}`

  const listResponse = await doFetch(listUrl, { headers }).catch(() => null)
  if (!listResponse) throw new MailError('Gmail could not be reached.', true)
  if (!listResponse.ok) throw classify(listResponse)

  const list = (await listResponse.json().catch(() => ({}))) as { messages?: { id?: string }[] }
  const ids = (list.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)).slice(0, limit)
  if (ids.length === 0) return []

  const detailUrl = (id: string) =>
    `${GMAIL_API}/messages/${encodeURIComponent(id)}?${new URLSearchParams({
      format: 'metadata',
      metadataHeaders: 'From',
    })}&metadataHeaders=Subject&metadataHeaders=Date`

  const details = await Promise.all(
    ids.map(async (id) => {
      const response = await doFetch(detailUrl(id), { headers }).catch(() => null)
      if (!response) throw new MailError('Gmail could not be reached.', true)
      if (!response.ok) throw classify(response)
      return parseMessage((await response.json().catch(() => ({}))) as GmailMessagePayload)
    }),
  )

  return details
    .filter((m): m is MailMessage => m !== null)
    .sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''))
}
