/**
 * Delivery decisions.
 *
 * Separated from sending on purpose: whether a message *should* go out is a
 * policy question with a testable answer, and mixing it into an email client
 * makes it untestable. Every decision returns a reason, including the negative
 * ones, because a notification that silently never arrives is indistinguishable
 * from a bug — and the delivery log records the reason so someone can check.
 */

export type Severity = 'info' | 'warning' | 'critical'

export type Preferences = {
  emailEnabled: boolean
  emailMinSeverity: Severity
  /** Local hours, inclusive start, exclusive end. Null disables the window. */
  quietHoursStart: number | null
  quietHoursEnd: number | null
}

export type Decision =
  | { deliver: true; channel: 'in_app' | 'email' }
  | { deliver: false; channel: 'email'; reason: string }

const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 }

export const DEFAULT_PREFERENCES: Preferences = {
  emailEnabled: true,
  emailMinSeverity: 'warning',
  quietHoursStart: null,
  quietHoursEnd: null,
}

/**
 * In-app is never suppressed. A person must always be able to open the app and
 * see what was decided on their behalf, whatever their channel preferences say;
 * quiet hours are about not being woken, not about hiding the record.
 */
export function decideInApp(): Decision {
  return { deliver: true, channel: 'in_app' }
}

export function decideEmail(input: {
  severity: Severity
  preferences: Preferences
  /** Local hour 0–23 in the recipient's workspace timezone. */
  localHour: number
}): Decision {
  const { preferences: prefs } = input

  if (!prefs.emailEnabled) {
    return { deliver: false, channel: 'email', reason: 'Email notifications are switched off.' }
  }

  if (RANK[input.severity] < RANK[prefs.emailMinSeverity]) {
    return {
      deliver: false,
      channel: 'email',
      reason: `Below the ${prefs.emailMinSeverity} threshold set for email.`,
    }
  }

  // Critical always breaks through. The entire point of a severity ladder is
  // that its top rung ignores convenience settings; otherwise a workspace can
  // quietly configure itself into missing the one alert that mattered.
  if (input.severity !== 'critical' && inQuietHours(input.localHour, prefs)) {
    return {
      deliver: false,
      channel: 'email',
      reason: 'Inside quiet hours. It is waiting in the app.',
    }
  }

  return { deliver: true, channel: 'email' }
}

/**
 * Handles the window that wraps midnight, which is the common case: 22:00 to
 * 07:00 is one window, not an empty one.
 */
export function inQuietHours(hour: number, prefs: Preferences): boolean {
  const { quietHoursStart: start, quietHoursEnd: end } = prefs
  if (start === null || end === null) return false
  if (start === end) return false
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

/** The subject line. Severity leads, because an inbox shows about forty characters. */
export function emailSubject(severity: Severity, title: string, workspace: string): string {
  const prefix = severity === 'critical' ? 'Action needed' : severity === 'warning' ? 'Heads up' : 'FYI'
  return `${prefix}: ${title} — ${workspace}`
}
