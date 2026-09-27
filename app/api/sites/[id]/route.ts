import { z } from 'zod'
import { getSessionContext } from '@/lib/session'
import { siteContentSecurityPolicy } from '@/lib/sites/generate'
import { slugify } from '@/lib/sites/vercel'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Serving a built page.
 *
 * The page was written by a model from a brief a person typed, and it is
 * HTML — so it is served as a document that cannot touch this product: a
 * Content-Security-Policy with `sandbox` gives it a unique origin with no
 * access to the app's cookies or storage, no way to load a script from
 * elsewhere, and no way to submit a form anywhere. The preview page frames
 * it with the same sandbox from the other side.
 *
 * `?download=1` hands the same document over as a file, so a person who
 * would rather host it themselves can.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const idSchema = z.string().uuid()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext()
  if (!session) return new Response('Sign in first.', { status: 401 })

  const membership = session.memberships[0]
  if (!membership) return new Response('No workspace available.', { status: 403 })

  const { id } = await params
  if (!idSchema.safeParse(id).success) return new Response('Not found.', { status: 404 })

  // Through the person's client and pinned to their workspace: a foreign id
  // reads as not found without confirming it exists.
  const supabase = await supabaseServer()
  const { data: site } = await supabase
    .from('site_builds')
    .select('name, html')
    .eq('id', id)
    .eq('organization_id', membership.organizationId)
    .maybeSingle()
  if (!site) return new Response('Not found.', { status: 404 })

  const download = new URL(request.url).searchParams.get('download') === '1'

  return new Response(site.html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': siteContentSecurityPolicy(),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'private, no-store',
      ...(download ? { 'content-disposition': `attachment; filename="${slugify(site.name)}.html"` } : {}),
    },
  })
}
