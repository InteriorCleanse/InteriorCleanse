import { buildBriefing, BRIEFING_LABELS, type BriefingKind } from '@/lib/assistant/briefings'
import { cronDenied, isCronAuthorized } from '@/lib/cron'
import { publicEnv } from '@/lib/env'
import { DEFAULT_PREFERENCES, type Preferences, type Severity } from '@/lib/notifications/delivery'
import { dispatch, localHourIn, type DeliveryRecord, type Recipient } from '@/lib/notifications/dispatch'
import { emailTransport } from '@/lib/notifications/email'
import { evaluateRules, type NotificationRule } from '@/lib/notifications/evaluate'
import { briefingDedupeKey, dueBriefings, localMoment } from '@/lib/notifications/schedule'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * The scheduled sweep: evaluate rules, build due briefings, deliver both.
 *
 * Run it hourly. Everything about it is built to be safe to run more often than
 * that, and safe to miss an hour:
 *
 * **Idempotent by dedupe key.** Notifications carry a key naming the thing
 * being reported and the period it covers. A second sweep in the same hour
 * collides on the unique index and writes nothing, so a scheduler that
 * double-fires — or a deploy that replays — does not send twice.
 *
 * **One workspace's failure does not stop the others.** Each is wrapped, and a
 * failure is counted and skipped. The alternative is that the first workspace
 * with bad data silences everyone else's alerts.
 *
 * **The response carries counts, not content.** It is behind a shared secret,
 * but it still crosses tenants, and there is no reason for one workspace's
 * figures to appear in a response about all of them.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Bounded so one invocation terminates. The next sweep takes the rest. */
const BATCH_SIZE = 100

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return cronDenied()

  const admin = supabaseAdmin()
  const transport = emailTransport()
  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL
  const now = new Date()

  const { data: organizations } = await admin
    .from('organizations')
    .select('id, name, base_currency, timezone, is_demo')
    .is('deleted_at', null)
    .limit(BATCH_SIZE)

  let rulesRaised = 0
  let briefingsSent = 0
  let delivered = 0
  let suppressed = 0
  let failed = 0
  const problems: string[] = []

  for (const org of organizations ?? []) {
    try {
      const recipients = await loadRecipients(admin, org.id, org.timezone, now)
      const context = {
        transport,
        workspaceName: org.name,
        isDemo: org.is_demo,
        siteUrl,
      }

      // ── Rule evaluation ────────────────────────────────────────────────────
      const { data: ruleRows } = await admin
        .from('notification_rules')
        .select('id, organization_id, name, metric_key, comparator, threshold, channel, enabled')
        .eq('organization_id', org.id)
        .eq('enabled', true)

      const rules: NotificationRule[] = (ruleRows ?? []).map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        metricKey: row.metric_key,
        comparator: row.comparator,
        threshold: Number(row.threshold),
        channel: row.channel,
        enabled: row.enabled,
      }))

      if (rules.length > 0) {
        const evaluation = evaluateRules({
          rules,
          isDemo: org.is_demo,
          currency: org.base_currency,
        })

        for (const raised of evaluation.raised) {
          const created = await insertNotification(admin, {
            organizationId: org.id,
            severity: raised.severity,
            title: raised.title,
            body: raised.body,
            link: raised.link,
            dedupeKey: raised.dedupeKey,
            ruleId: raised.ruleId,
            evidence: raised.evidence,
          })
          // Null means it already existed for this period — the dedupe working,
          // not an error. Delivering again is exactly what must not happen.
          if (!created) continue

          rulesRaised += 1
          const records = await dispatch(
            {
              id: created,
              organizationId: org.id,
              severity: raised.severity,
              title: raised.title,
              body: raised.body,
              evidence: `${raised.evidence.observedDisplay} against a ${raised.evidence.thresholdDisplay} threshold.`,
              period: raised.evidence.period,
              link: raised.link,
            },
            recipients,
            context,
          )
          const counts = await recordDeliveries(admin, org.id, records)
          delivered += counts.delivered
          suppressed += counts.suppressed
          failed += counts.failed
        }
      }

      // ── Scheduled briefings ────────────────────────────────────────────────
      for (const recipient of recipients) {
        const moment = localMoment(recipient.timezone, now)
        const due = dueBriefings(recipient.briefings, moment)

        for (const kind of due) {
          const briefing = buildBriefing({
            kind,
            isDemo: org.is_demo,
            currency: org.base_currency,
          })

          const created = await insertNotification(admin, {
            organizationId: org.id,
            severity: 'info',
            title: `${BRIEFING_LABELS[kind]} — ${briefing.period}`,
            body: briefing.headline,
            link: '/app/briefings',
            dedupeKey: briefingDedupeKey(kind, recipient.userId, moment),
            // A briefing belongs to the person who subscribed to it, not to
            // the workspace — otherwise everyone sees everyone's.
            userId: recipient.userId,
            evidence: { kind, period: briefing.period },
          })
          if (!created) continue

          briefingsSent += 1
          const records = await dispatch(
            {
              id: created,
              organizationId: org.id,
              severity: 'info',
              title: `${BRIEFING_LABELS[kind]} — ${briefing.period}`,
              body: briefing.headline,
              evidence: briefing.lines
                .slice(0, 4)
                .map((line) => `${line.label}: ${line.value}${line.change ? ` (${line.change})` : ''}`)
                .join('\n'),
              period: briefing.period,
              link: '/app/briefings',
            },
            // A briefing goes only to the person who asked for it, not to
            // everyone in the workspace.
            [recipient],
            context,
          )
          const counts = await recordDeliveries(admin, org.id, records)
          delivered += counts.delivered
          suppressed += counts.suppressed
          failed += counts.failed
        }
      }
    } catch (error) {
      // Counted, named by workspace id only, and the sweep continues.
      problems.push(`${org.id}: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return Response.json({
    workspaces: organizations?.length ?? 0,
    rulesRaised,
    briefingsSent,
    delivered,
    suppressed,
    failed,
    emailConfigured: transport.configured,
    problems: problems.length,
  })
}

type LoadedRecipient = Recipient & { timezone: string; briefings: string[] }

/**
 * Active members of a workspace, with their preferences.
 *
 * A member with no preferences row gets the defaults rather than being skipped:
 * "we never sent it because they never opened settings" is not a defensible
 * reason for missing a critical alert.
 */
async function loadRecipients(
  admin: ReturnType<typeof supabaseAdmin>,
  organizationId: string,
  workspaceTimezone: string,
  now: Date,
): Promise<LoadedRecipient[]> {
  const [{ data: members }, { data: prefs }] = await Promise.all([
    admin
      .from('organization_members')
      .select('user_id, profiles(email, timezone)')
      .eq('organization_id', organizationId)
      .eq('status', 'active'),
    admin
      .from('notification_preferences')
      .select(
        'user_id, email_enabled, email_min_severity, quiet_hours_start, quiet_hours_end, briefings',
      )
      .eq('organization_id', organizationId),
  ])

  const byUser = new Map((prefs ?? []).map((p) => [p.user_id, p]))

  return (members ?? []).map((member) => {
    const profile = member.profiles as unknown as { email?: string; timezone?: string } | null
    const pref = byUser.get(member.user_id)
    const timezone = profile?.timezone || workspaceTimezone || 'UTC'

    const preferences: Preferences = pref
      ? {
          emailEnabled: pref.email_enabled,
          emailMinSeverity: pref.email_min_severity as Severity,
          quietHoursStart: pref.quiet_hours_start,
          quietHoursEnd: pref.quiet_hours_end,
        }
      : DEFAULT_PREFERENCES

    return {
      userId: member.user_id,
      email: profile?.email ?? null,
      preferences,
      localHour: localHourIn(timezone, now),
      timezone,
      briefings: pref?.briefings ?? [],
    }
  })
}

/**
 * Inserts a notification, returning its id, or null if the dedupe key already
 * exists for this workspace.
 *
 * The unique index does the work. Checking first and then inserting has a race
 * that a scheduler firing twice will find.
 */
async function insertNotification(
  admin: ReturnType<typeof supabaseAdmin>,
  input: {
    organizationId: string
    severity: Severity
    title: string
    body: string
    link: string
    dedupeKey: string
    userId?: string | null
    ruleId?: string | null
    evidence?: Record<string, unknown>
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from('notifications')
    .insert({
      organization_id: input.organizationId,
      severity: input.severity,
      title: input.title,
      body: input.body,
      link: input.link,
      dedupe_key: input.dedupeKey,
      user_id: input.userId ?? null,
      rule_id: input.ruleId ?? null,
      // Stored so the notice can be audited like any other claim in the
      // product: what was measured, against what, over which period.
      evidence: input.evidence ?? {},
    })
    .select('id')
    .single()

  if (error) {
    // 23505 is the dedupe working. Anything else is a real problem and is
    // raised to the per-workspace handler.
    if (error.code === '23505') return null
    throw new Error(error.message)
  }

  return data?.id ?? null
}

async function recordDeliveries(
  admin: ReturnType<typeof supabaseAdmin>,
  organizationId: string,
  records: readonly DeliveryRecord[],
): Promise<{ delivered: number; suppressed: number; failed: number }> {
  if (records.length === 0) return { delivered: 0, suppressed: 0, failed: 0 }

  await admin.from('notification_deliveries').insert(
    records.map((record) => ({
      organization_id: organizationId,
      notification_id: record.notificationId,
      user_id: record.userId,
      channel: record.channel,
      // The enum calls a successful delivery 'sent'; the dispatcher calls it
      // 'delivered'. Mapped here rather than renaming either — 'sent' is wrong
      // for an in-app notice, and the column is shared.
      status: record.status === 'delivered' ? 'sent' : record.status,
      detail: record.detail,
      delivered_at: record.status === 'delivered' ? new Date().toISOString() : null,
    })),
  )

  return {
    delivered: records.filter((r) => r.status === 'delivered').length,
    suppressed: records.filter((r) => r.status === 'suppressed').length,
    failed: records.filter((r) => r.status === 'failed').length,
  }
}

export type { BriefingKind }
