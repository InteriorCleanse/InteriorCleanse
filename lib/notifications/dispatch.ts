import { decideEmail, decideInApp, emailSubject, type Preferences, type Severity } from './delivery'
import { renderNotificationEmail, type EmailTransport } from './email'

/**
 * Turning a raised notification into deliveries.
 *
 * The decision layer (`delivery.ts`) already answers *whether* a message should
 * go out. This answers *what happened when it did*, and its whole purpose is
 * that the answer is recorded for every recipient, on every channel, including
 * the ones that were deliberately not sent.
 *
 * Why that matters more than it sounds: the failure mode of a notification
 * system is silence, and silence is ambiguous. "Nobody was emailed" could mean
 * quiet hours, a severity floor, an unsubscribed user, an unconfigured
 * provider, or a bug — and only one of those needs fixing. Every path here
 * produces a row with a reason, so the ambiguity never exists.
 *
 * A delivery row is written even when the send fails. Losing the record of a
 * failure is worse than the failure.
 */

export type Recipient = {
  userId: string
  email: string | null
  preferences: Preferences
  /** Hour 0–23 in the recipient's workspace timezone, for quiet hours. */
  localHour: number
}

export type DispatchableNotification = {
  id: string
  organizationId: string
  severity: Severity
  title: string
  body: string
  /** Formatted evidence line, or null. */
  evidence: string | null
  period: string
  /** Path within the app, e.g. `/app/revenue`. */
  link: string
}

export type DeliveryRecord = {
  notificationId: string
  userId: string
  channel: 'in_app' | 'email'
  status: 'delivered' | 'suppressed' | 'failed'
  detail: string | null
}

export type DispatchContext = {
  transport: EmailTransport
  workspaceName: string
  isDemo: boolean
  /** Absolute base, e.g. https://app.example.com. */
  siteUrl: string
}

export async function dispatch(
  notification: DispatchableNotification,
  recipients: readonly Recipient[],
  context: DispatchContext,
): Promise<DeliveryRecord[]> {
  const records: DeliveryRecord[] = []

  for (const recipient of recipients) {
    // In-app first and unconditionally. Whatever happens to the email, the
    // person can open the app and find out what was decided for them.
    decideInApp()
    records.push({
      notificationId: notification.id,
      userId: recipient.userId,
      channel: 'in_app',
      status: 'delivered',
      detail: null,
    })

    const decision = decideEmail({
      severity: notification.severity,
      preferences: recipient.preferences,
      localHour: recipient.localHour,
    })

    if (!decision.deliver) {
      records.push({
        notificationId: notification.id,
        userId: recipient.userId,
        channel: 'email',
        status: 'suppressed',
        detail: decision.reason,
      })
      continue
    }

    if (!recipient.email) {
      records.push({
        notificationId: notification.id,
        userId: recipient.userId,
        channel: 'email',
        status: 'suppressed',
        detail: 'No email address on file for this account.',
      })
      continue
    }

    if (!context.transport.configured) {
      // Not a failure — nothing was attempted. Recording it as failed would
      // put a permanent red mark on a deployment that simply has no provider.
      records.push({
        notificationId: notification.id,
        userId: recipient.userId,
        channel: 'email',
        status: 'suppressed',
        detail: 'No email provider is configured on this deployment.',
      })
      continue
    }

    const { text, html } = renderNotificationEmail({
      title: notification.title,
      body: notification.body,
      evidence: notification.evidence,
      period: notification.period,
      workspace: context.workspaceName,
      isDemo: context.isDemo,
      link: absolute(context.siteUrl, notification.link),
      preferencesUrl: absolute(context.siteUrl, '/app/notifications'),
    })

    const result = await context.transport.send({
      to: recipient.email,
      subject: emailSubject(notification.severity, notification.title, context.workspaceName),
      text,
      html,
    })

    records.push({
      notificationId: notification.id,
      userId: recipient.userId,
      channel: 'email',
      status: result.sent ? 'delivered' : 'failed',
      detail: result.sent ? null : result.detail,
    })
  }

  return records
}

/**
 * Joins a path onto the site URL.
 *
 * Absolute inputs are passed through, which is what makes a link into another
 * host possible — so the caller is responsible for never putting tenant text
 * here. Everything this module is called with is a fixed application path.
 */
export function absolute(siteUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${siteUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/**
 * The recipient's local hour, for quiet hours.
 *
 * Computed from the IANA zone rather than a stored UTC offset, because an
 * offset is wrong twice a year and quiet hours exist precisely to avoid waking
 * someone at the wrong local time.
 */
export function localHourIn(timezone: string, at: Date = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(at)
    const parsed = Number(hour)
    return Number.isFinite(parsed) ? parsed % 24 : at.getUTCHours()
  } catch {
    // An unknown zone must not stop delivery. UTC is a defensible fallback and
    // the workspace timezone is validated on the settings screen.
    return at.getUTCHours()
  }
}
