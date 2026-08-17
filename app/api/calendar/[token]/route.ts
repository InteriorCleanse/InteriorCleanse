import { createHash } from 'node:crypto'
import { publicEnv } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/server'
import { buildIcalFeed, type CalendarEvent } from '@/lib/calendar/ical'

/**
 * The read-only iCalendar feed.
 *
 * Unauthenticated by necessity — a calendar client cannot log in — so the URL
 * itself is the credential, and it is treated as one:
 *
 *   - The token is compared by SHA-256, so the table holds no usable token.
 *   - It is revocable, and a revoked token 404s rather than explaining itself.
 *   - A wrong token is indistinguishable from a missing calendar.
 *   - The endpoint has no write path at all. Not "writes are rejected" — there
 *     is no PUT, no POST, no REPORT. A subscription URL people paste into phone
 *     settings and forward to assistants must not be able to change anything.
 *   - `noindex` and no-store, because these URLs end up in link previews.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params

  // Cheap shape check before touching the database, so a scanner spraying
  // short strings costs nothing.
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return notFound()

  const tokenHash = createHash('sha256').update(token).digest('hex')

  // The service role: there is no session to act as, and the token *is* the
  // authorization. Every query below is explicitly scoped by what the token
  // resolves to.
  const admin = supabaseAdmin()

  const { data: feed } = await admin
    .from('calendar_feed_tokens')
    .select('id, organization_id, user_id, label, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!feed || feed.revoked_at) return notFound()

  const [{ data: organization }, { data: goals }, { data: events }] = await Promise.all([
    admin.from('organizations').select('name, deleted_at').eq('id', feed.organization_id).maybeSingle(),
    admin
      .from('goals')
      .select('id, title, deadline, metric_key, state, updated_at')
      .eq('organization_id', feed.organization_id)
      .eq('state', 'active'),
    admin
      .from('calendar_events')
      .select('id, title, description, starts_at, ends_at, all_day, updated_at')
      .eq('organization_id', feed.organization_id)
      .gte('starts_at', new Date(Date.now() - 90 * 86_400_000).toISOString()),
  ])

  // A deleted workspace's calendar stops existing, rather than continuing to
  // publish its goals to whoever still has the URL.
  if (!organization || organization.deleted_at) return notFound()

  const calendarEvents: CalendarEvent[] = [
    ...(goals ?? []).map((goal) => ({
      id: `goal-${goal.id}`,
      title: `Goal: ${goal.title}`,
      description: `Target for ${goal.metric_key}. Open ${publicEnv().NEXT_PUBLIC_SITE_URL}/app/command-center to see progress.`,
      startsAt: new Date(`${goal.deadline}T00:00:00Z`),
      endsAt: new Date(`${goal.deadline}T00:00:00Z`),
      allDay: true,
      updatedAt: goal.updated_at ? new Date(goal.updated_at) : undefined,
    })),
    ...(events ?? []).map((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      description: event.description,
      startsAt: new Date(event.starts_at),
      endsAt: new Date(event.ends_at),
      allDay: event.all_day,
      updatedAt: event.updated_at ? new Date(event.updated_at) : undefined,
    })),
  ]

  const body = buildIcalFeed({
    calendarName: `${organization.name} — ${feed.label}`,
    domain: new URL(publicEnv().NEXT_PUBLIC_SITE_URL).hostname,
    events: calendarEvents,
  })

  // Best-effort: a failed touch must not fail the feed.
  void admin
    .from('calendar_feed_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', feed.id)

  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="aurelis.ics"',
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}

/** One response for every failure, so the endpoint confirms nothing. */
function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  })
}
