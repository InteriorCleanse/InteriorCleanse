import { buildBriefing, type BriefingKind } from '@/lib/assistant/briefings'
import { can } from '@/lib/authz'
import {
  briefingNote,
  documentNote,
  notificationNote,
  toZipEntries,
  vaultReadme,
  type VaultNote,
} from '@/lib/knowledge/obsidian'
import { limitKey, rateLimit, rateLimitHeaders } from '@/lib/ratelimit-configured'
import { getSessionContext } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { buildZip } from '@/lib/zip'

/**
 * The Obsidian vault bundle.
 *
 * A zip of Markdown notes with frontmatter: today's briefings, the last ninety
 * days of alerts, and every knowledge document. Read through the user's own
 * client, so RLS decides what goes in the archive — the same rule as the JSON
 * export, for the same reason: a bulk download is where a wrong
 * `organization_id` would do the most damage.
 *
 * A snapshot, and honest about it. Obsidian has no cloud API; the README
 * inside the bundle says so, and says how to get a newer one.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ALERT_DAYS = 90
const KINDS: BriefingKind[] = ['morning', 'end_of_day', 'weekly', 'monthly']

export async function GET() {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = { userId: session.userId, tenantRole: membership.role, platformRole: session.platformRole }
  if (!can(actor, 'data:export')) {
    return Response.json({ error: 'Exporting requires the Analyst role or above.' }, { status: 403 })
  }

  const limit = await rateLimit({
    key: limitKey('api', membership.organizationId, session.userId),
    policy: 'api',
    cost: 10,
  })
  if (!limit.allowed) {
    return Response.json({ error: 'Too many exports in a short time.' }, { status: 429, headers: rateLimitHeaders(limit) })
  }

  const now = new Date()
  const supabase = await supabaseServer()
  const notes: VaultNote[] = [vaultReadme(membership.name, now)]

  for (const kind of KINDS) {
    const briefing = buildBriefing({ kind, isDemo: membership.isDemo, currency: membership.baseCurrency })
    notes.push(briefingNote(briefing, now, membership.name))
  }

  const [{ data: alerts }, { data: documents }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, title, body, severity, evidence, created_at')
      .eq('organization_id', membership.organizationId)
      .gte('created_at', new Date(now.getTime() - ALERT_DAYS * 86_400_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('knowledge_documents')
      .select('title, content, source, url, source_updated_at')
      .eq('organization_id', membership.organizationId)
      .order('updated_at', { ascending: false })
      .limit(2_000),
  ])

  for (const alert of alerts ?? []) {
    notes.push(
      notificationNote({
        id: alert.id,
        title: alert.title,
        body: alert.body,
        severity: alert.severity,
        evidence: (alert.evidence ?? {}) as Record<string, unknown>,
        createdAt: new Date(alert.created_at),
        workspace: membership.name,
      }),
    )
  }

  for (const doc of documents ?? []) {
    notes.push(
      documentNote({
        title: doc.title,
        content: doc.content,
        source: doc.source,
        url: doc.url,
        updatedAt: doc.source_updated_at ? new Date(doc.source_updated_at) : null,
      }),
    )
  }

  await supabase.from('audit_logs').insert({
    organization_id: membership.organizationId,
    actor_user_id: session.userId,
    action: 'workspace.exported',
    target_type: 'organization',
    target_id: membership.organizationId,
    metadata: { format: 'obsidian', notes: notes.length },
  })

  const zip = buildZip(toZipEntries(notes))
  const filename = `aurelis-vault-${now.toISOString().slice(0, 10)}.zip`

  return new Response(zip, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'content-length': String(zip.byteLength),
      'cache-control': 'no-store, private',
    },
  })
}
