import { can } from '@/lib/authz'
import { parseMarkdownNote } from '@/lib/knowledge/obsidian'
import { prepareDocument } from '@/lib/knowledge/sync'
import { limitKey, rateLimit, rateLimitHeaders } from '@/lib/ratelimit-configured'
import { getSessionContext } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Uploading Markdown notes as knowledge.
 *
 * The inbound half of the Obsidian story, and the only way a note reaches the
 * assistant without a vendor API: a vault is a folder, and a person can hand
 * us files from it. Each file becomes a document the assistant can search and
 * cite; frontmatter supplies the title and date when present.
 *
 * Written through the user's own client. RLS's insert policy requires the
 * member role, which is the same bar as a CSV import — the act is the same.
 *
 * Bounds, because an upload endpoint is an open door: a file count, a size
 * per file, a total, and Markdown only by extension. A file that is not text
 * is refused rather than stored as a document nobody can read.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILES = 50
const MAX_FILE_BYTES = 512 * 1024
const MAX_TOTAL_BYTES = 8 * 1024 * 1024
const ALLOWED = /\.(md|markdown|txt)$/i

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) return Response.json({ error: 'Sign in first.' }, { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return Response.json({ error: 'No workspace available.' }, { status: 403 })

  const actor = { userId: session.userId, tenantRole: membership.role, platformRole: session.platformRole }
  if (!can(actor, 'data:import')) {
    return Response.json({ error: 'Uploading notes requires the Member role or above.' }, { status: 403 })
  }

  const limit = await rateLimit({
    key: limitKey('api', membership.organizationId, session.userId),
    policy: 'api',
    cost: 5,
  })
  if (!limit.allowed) {
    return Response.json({ error: 'Too many uploads in a short time.' }, { status: 429, headers: rateLimitHeaders(limit) })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Send the files as multipart form data.' }, { status: 400 })
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return Response.json({ error: 'No files were attached.' }, { status: 400 })
  if (files.length > MAX_FILES) {
    return Response.json({ error: `Upload at most ${MAX_FILES} files at a time.` }, { status: 400 })
  }

  let total = 0
  const rows = []
  const skipped: { file: string; reason: string }[] = []

  for (const file of files) {
    if (!ALLOWED.test(file.name)) {
      skipped.push({ file: file.name, reason: 'Not a Markdown or text file.' })
      continue
    }
    if (file.size > MAX_FILE_BYTES) {
      skipped.push({ file: file.name, reason: `Larger than ${MAX_FILE_BYTES / 1024} KB.` })
      continue
    }
    total += file.size
    if (total > MAX_TOTAL_BYTES) {
      skipped.push({ file: file.name, reason: 'The upload exceeded the total size limit.' })
      continue
    }

    const raw = await file.text()
    const parsed = parseMarkdownNote(file.name, raw)
    if (!parsed.content) {
      skipped.push({ file: file.name, reason: 'Empty after removing frontmatter.' })
      continue
    }

    const prepared = prepareDocument(parsed.content)
    rows.push({
      organization_id: membership.organizationId,
      connection_id: null,
      source: 'obsidian',
      // The filename is the identity, so re-uploading an edited note replaces
      // it rather than duplicating it.
      external_id: file.name.replace(/^.*[\\/]/, '').slice(0, 200),
      title: parsed.title,
      url: null,
      content: prepared.content,
      truncated: prepared.truncated,
      content_hash: prepared.hash,
      source_updated_at: parsed.updatedAt?.toISOString() ?? null,
      imported_by: session.userId,
    })
  }

  const supabase = await supabaseServer()

  if (rows.length > 0) {
    const { error } = await supabase
      .from('knowledge_documents')
      .upsert(rows, { onConflict: 'organization_id,source,external_id' })
    if (error) return Response.json({ error: 'The notes could not be saved.' }, { status: 500 })

    await supabase.from('audit_logs').insert({
      organization_id: membership.organizationId,
      actor_user_id: session.userId,
      action: 'knowledge.uploaded',
      target_type: 'knowledge_documents',
      target_id: membership.organizationId,
      metadata: { files: rows.length, skipped: skipped.length },
    })
  }

  return Response.json({ imported: rows.length, skipped })
}
