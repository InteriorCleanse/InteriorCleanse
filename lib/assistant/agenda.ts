/**
 * The person's day, as a window and a list.
 *
 * "What's on tomorrow?" is a question about a day in the person's own time
 * zone, not the server's. The window is computed in that zone; the events
 * inside it come from `calendar_events`, which the calendar sync already
 * keeps current. All of this is pure so the boundaries are pinned by tests
 * rather than by someone noticing their 9am meeting was reported as
 * yesterday's.
 */

export type AgendaDay = 'today' | 'tomorrow' | 'this_week'

export const AGENDA_LABELS: Record<AgendaDay, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  this_week: 'The next seven days',
}

export type AgendaEvent = {
  id: string
  title: string
  description: string | null
  /** ISO timestamps. */
  startsAt: string
  endsAt: string
  allDay: boolean
  /** 'external' for a synced calendar; 'goal' or 'briefing' for what this product added. */
  source: string
}

export type AgendaWindow = { from: Date; to: Date; label: string }

const DAY_MS = 86_400_000

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function partsIn(at: Date, timeZone: string): Parts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const read = (type: string) => Number(formatter.formatToParts(at).find((p) => p.type === type)?.value)
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

/** The instant at which the calendar day containing `at` begins, in `timeZone`. */
export function localStartOfDay(at: Date, timeZone: string): Date {
  let zone = timeZone
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    // An unknown zone is a configuration mistake, not a reason to return
    // nothing. UTC keeps the day recognisable.
    zone = 'UTC'
  }
  const p = partsIn(at, zone)
  // The wall clock as if it were UTC, minus the real instant, is the offset.
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const offset = wall - Math.floor(at.getTime() / 1000) * 1000
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offset)
}

export function agendaWindow(day: AgendaDay, now: Date, timeZone = 'UTC'): AgendaWindow {
  const start = localStartOfDay(now, timeZone)
  switch (day) {
    case 'today':
      return { from: start, to: new Date(start.getTime() + DAY_MS), label: AGENDA_LABELS.today }
    case 'tomorrow': {
      const from = new Date(start.getTime() + DAY_MS)
      return { from, to: new Date(from.getTime() + DAY_MS), label: AGENDA_LABELS.tomorrow }
    }
    case 'this_week':
      return { from: start, to: new Date(start.getTime() + 7 * DAY_MS), label: AGENDA_LABELS.this_week }
  }
}

/** "Thu 09:30–10:00" or "All day, Thu 26 Sep" — what a person would say. */
export function describeWhen(
  event: { startsAt: string; endsAt: string; allDay: boolean },
  timeZone = 'UTC',
): string {
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  const dayName = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(start)
  if (event.allDay) {
    const date = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(start)
    return `All day, ${dayName} ${date}`
  }
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${dayName} ${time.format(start)}–${time.format(end)}`
}

/** Events inside a window, soonest first. */
export function eventsIn(events: readonly AgendaEvent[], window: AgendaWindow): AgendaEvent[] {
  return events
    .filter((e) => {
      const at = new Date(e.startsAt).getTime()
      return at >= window.from.getTime() && at < window.to.getTime()
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}
