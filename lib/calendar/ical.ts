/**
 * iCalendar (RFC 5545) feed generation.
 *
 * Hand-written rather than pulled from a package, because the format is small
 * and the failure mode of a library here is a calendar app silently showing
 * nothing. The three things that actually break feeds are all handled: CRLF
 * line endings, escaping of commas, semicolons and newlines inside text
 * values, and 75-octet line folding.
 *
 * The feed is read-only by construction. There is no PUT or REPORT handler,
 * `METHOD:PUBLISH` announces it as a one-way publication, and Apple Calendar,
 * Google Calendar and Outlook all treat a subscribed URL as read-only. That is
 * a deliberate product limit, not an omission: a subscription URL is a bearer
 * token that people paste into phone settings and share with assistants, and a
 * writable one would let anyone holding it change the business's calendar.
 */

export type CalendarEvent = {
  id: string
  title: string
  description?: string | null
  startsAt: Date
  endsAt: Date
  allDay?: boolean
  /** Stable across regenerations, so updates replace rather than duplicate. */
  updatedAt?: Date
  url?: string | null
}

export type FeedOptions = {
  calendarName: string
  /** Used in the UID domain part; must be stable for the calendar's lifetime. */
  domain: string
  timezone?: string
  events: readonly CalendarEvent[]
  /** Refresh hint honoured by most clients; a feed is polled, not pushed. */
  refreshMinutes?: number
}

export function buildIcalFeed(options: FeedOptions): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//AURELIS OS//Business Calendar//EN`,
    'CALSCALE:GREGORIAN',
    // Announces this as a publication, not an invitation exchange. Clients use
    // it to decide the calendar is not writable.
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.calendarName)}`,
    `NAME:${escapeText(options.calendarName)}`,
    `X-PUBLISHED-TTL:PT${options.refreshMinutes ?? 60}M`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${options.refreshMinutes ?? 60}M`,
  ]

  if (options.timezone) {
    lines.push(`X-WR-TIMEZONE:${escapeText(options.timezone)}`)
  }

  for (const event of options.events) {
    lines.push(...renderEvent(event, options.domain))
  }

  lines.push('END:VCALENDAR')

  // CRLF is not optional in RFC 5545, and LF-only feeds fail in Outlook while
  // appearing fine in Google — the worst kind of bug to find in production.
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

function renderEvent(event: CalendarEvent, domain: string): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@${domain}`,
    `DTSTAMP:${formatUtc(event.updatedAt ?? new Date())}`,
  ]

  if (event.allDay) {
    // All-day events are dates, not instants. Using a timestamp here is what
    // makes a deadline show up on the wrong day for anyone west of UTC.
    lines.push(`DTSTART;VALUE=DATE:${formatDate(event.startsAt)}`)
    lines.push(`DTEND;VALUE=DATE:${formatDate(exclusiveEnd(event.endsAt))}`)
  } else {
    lines.push(`DTSTART:${formatUtc(event.startsAt)}`)
    lines.push(`DTEND:${formatUtc(event.endsAt)}`)
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`)
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
  if (event.url) lines.push(`URL:${escapeText(event.url)}`)

  // Subscribed calendars are informational here; marking them TRANSPARENT keeps
  // them out of free/busy so a goal deadline does not make someone look busy.
  lines.push('TRANSP:TRANSPARENT')
  lines.push('END:VEVENT')

  return lines
}

/** DTEND on an all-day event is exclusive: a one-day event ends the next day. */
function exclusiveEnd(end: Date): Date {
  return new Date(end.getTime() + 24 * 60 * 60 * 1000)
}

function formatUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * Escapes per RFC 5545 §3.3.11. Backslash first, or the escapes escape each
 * other.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Folds to 75 octets per RFC 5545 §3.1, counting bytes rather than characters
 * so a multi-byte character is never split across a fold — which produces
 * mojibake in some clients and a parse error in others.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line

  const parts: string[] = []
  let start = 0
  let limit = 75

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Walk back off a continuation byte so the split lands on a boundary.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1
    parts.push(bytes.subarray(start, end).toString('utf8'))
    start = end
    // Continuation lines carry a leading space, so they hold one byte less.
    limit = 74
  }

  return parts.join('\r\n ')
}
