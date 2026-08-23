import type { BriefingKind } from '@/lib/assistant/briefings'

/**
 * When a briefing is due.
 *
 * Pure arithmetic over a local date, kept out of the cron route so the awkward
 * cases are testable without a database or a clock:
 *
 * **Local, always.** A morning briefing at 08:00 UTC arrives at 3am for a
 * customer in New York. The hour is computed in the recipient's own zone and
 * daylight saving is followed rather than an offset stored once.
 *
 * **Idempotent by period key, not by "have we run".** A cron that fires twice,
 * or a deploy that replays an hour, must not send two morning briefings. The
 * key names the thing being reported — `morning:2025-06-01` — so the second
 * attempt collides with the first on a unique index rather than relying on the
 * scheduler being well behaved.
 *
 * **A missed hour is missed.** If the scheduler was down at 08:00, the 09:00
 * sweep does *not* send yesterday's morning briefing late. A briefing is a
 * statement about a moment; delivering it an hour late is fine, delivering it a
 * day late is misinformation. This is why the window is one hour wide and not
 * "anything not yet sent".
 */

export const BRIEFING_HOURS: Record<BriefingKind, number> = {
  morning: 8,
  end_of_day: 18,
  weekly: 8,
  monthly: 8,
}

export type LocalMoment = {
  hour: number
  /** 0 = Sunday, matching `Date.prototype.getDay`. */
  weekday: number
  dayOfMonth: number
  /** `YYYY-MM-DD` in the recipient's zone. */
  date: string
}

export function localMoment(timezone: string, at: Date = new Date()): LocalMoment {
  const parts = safeParts(timezone, at)

  return {
    hour: parts.hour,
    weekday: parts.weekday,
    dayOfMonth: parts.day,
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
  }
}

/**
 * Which of a person's subscribed briefings are due in this hour.
 *
 * Weekly lands on Monday because a weekly figure delivered mid-week invites
 * comparison against a partial week. Monthly lands on the 1st, reporting the
 * month that just finished rather than the one three hours old.
 */
export function dueBriefings(
  subscribed: readonly string[],
  moment: LocalMoment,
): BriefingKind[] {
  const wanted = new Set(subscribed)
  const due: BriefingKind[] = []

  if (wanted.has('morning') && moment.hour === BRIEFING_HOURS.morning) due.push('morning')
  if (wanted.has('end_of_day') && moment.hour === BRIEFING_HOURS.end_of_day) due.push('end_of_day')
  if (wanted.has('weekly') && moment.weekday === 1 && moment.hour === BRIEFING_HOURS.weekly) {
    due.push('weekly')
  }
  if (wanted.has('monthly') && moment.dayOfMonth === 1 && moment.hour === BRIEFING_HOURS.monthly) {
    due.push('monthly')
  }

  return due
}

/**
 * The dedupe key for a briefing.
 *
 * Includes the recipient because two people in a workspace can subscribe to
 * different briefings, and excludes the time so a retry within the same period
 * collides instead of duplicating.
 */
export function briefingDedupeKey(kind: BriefingKind, userId: string, moment: LocalMoment): string {
  const period =
    kind === 'monthly'
      ? moment.date.slice(0, 7)
      : kind === 'weekly'
        ? `w${moment.date}`
        : moment.date
  return `briefing:${kind}:${userId}:${period}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function safeParts(
  timezone: string,
  at: Date,
): { year: number; month: number; day: number; hour: number; weekday: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      weekday: 'short',
    })

    const parts = new Map(formatter.formatToParts(at).map((p) => [p.type, p.value]))
    const weekday = WEEKDAYS.indexOf(parts.get('weekday') ?? '')

    return {
      year: Number(parts.get('year')),
      month: Number(parts.get('month')),
      day: Number(parts.get('day')),
      // Intl renders midnight as "24" in some locales/zones; normalise it so
      // an 08:00 comparison is never accidentally matched by hour 24.
      hour: Number(parts.get('hour')) % 24,
      weekday: weekday >= 0 ? weekday : at.getUTCDay(),
    }
  } catch {
    // An unrecognised zone must not stop every briefing in the workspace.
    return {
      year: at.getUTCFullYear(),
      month: at.getUTCMonth() + 1,
      day: at.getUTCDate(),
      hour: at.getUTCHours(),
      weekday: at.getUTCDay(),
    }
  }
}
