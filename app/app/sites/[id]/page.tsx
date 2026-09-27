import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eyebrow, Panel } from '@/components/ui'
import { requireCapability } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

export const metadata = { title: 'Site preview' }

/**
 * One built page, in a sandbox.
 *
 * The frame has no `allow-same-origin`, and the document it loads is served
 * with a sandboxing Content-Security-Policy, so the page is shown exactly as
 * a visitor would see it while having no way to reach this product's cookies
 * or storage from inside the frame.
 */
export default async function SitePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ membership }, { id }] = await Promise.all([requireCapability('data:view'), params])
  const supabase = await supabaseServer()

  const { data: site } = await supabase
    .from('site_builds')
    .select('id, name, brief, status, published_url, error, created_at')
    .eq('id', id)
    .eq('organization_id', membership.organizationId)
    .maybeSingle()
  if (!site) notFound()

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>
          <Link href="/app/sites" className="hover:underline">
            Sites
          </Link>{' '}
          / preview
        </Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{site.name}</h1>
        <p className="text-sm text-muted">
          {site.status === 'published' && site.published_url ? (
            <>
              Published at{' '}
              <a href={site.published_url} target="_blank" rel="noopener noreferrer" className="text-positive hover:underline">
                {site.published_url.replace(/^https?:\/\//, '')}
              </a>
              .
            </>
          ) : (
            'Private to this workspace. To put it on the web, ask the assistant to publish it — that is a separate approval.'
          )}{' '}
          <a href={`/api/sites/${site.id}?download=1`} className="text-signal hover:underline">
            Download the HTML
          </a>{' '}
          to host it anywhere.
        </p>
        {site.error ? <p className="text-sm text-negative">{site.error}</p> : null}
      </header>

      <Panel className="overflow-hidden p-0">
        <iframe
          src={`/api/sites/${site.id}`}
          title={`Preview of ${site.name}`}
          sandbox="allow-scripts allow-popups"
          className="h-[75vh] w-full bg-white"
        />
      </Panel>

      <Panel>
        <Eyebrow>The brief it was built from</Eyebrow>
        <p className="whitespace-pre-wrap text-sm text-muted">{site.brief}</p>
      </Panel>
    </div>
  )
}
