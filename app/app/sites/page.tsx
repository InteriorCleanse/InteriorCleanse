import Link from 'next/link'
import { DemoBadge, Eyebrow, Panel } from '@/components/ui'
import { requireCapability } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

export const metadata = { title: 'Sites' }

/**
 * What the assistant has built.
 *
 * Each site is a page written from a brief the person gave and approved,
 * private to the workspace until a second approval publishes it. This is
 * where a person sees what was made, previews it in a sandbox, downloads it,
 * and — after publishing — finds the address.
 */
export default async function SitesPage() {
  const { membership } = await requireCapability('data:view')
  const supabase = await supabaseServer()

  const { data: sites } = await supabase
    .from('site_builds')
    .select('id, name, brief, status, published_url, error, created_at')
    .eq('organization_id', membership.organizationId)
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = sites ?? []

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Sites</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Pages the assistant built</h1>
          {membership.isDemo ? <DemoBadge /> : null}
        </div>
        <p className="text-sm text-muted">
          Ask the assistant to build a one-page site from a brief. Each one lands here as a private
          preview; publishing is a separate approval and needs Vercel connected on the{' '}
          <Link href="/app/integrations" className="text-signal hover:underline">
            integrations page
          </Link>
          .
        </p>
      </header>

      {rows.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted">
            Nothing built yet. Try: <span className="text-ink">“Build me a one-page site for the
            business — ask me what it should say.”</span>
          </p>
        </Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((site) => (
            <li key={site.id}>
              <Panel>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-ink">
                      <Link href={`/app/sites/${site.id}`} className="hover:underline">
                        {site.name}
                      </Link>
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{site.brief}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[11px] ${
                      site.status === 'published'
                        ? 'text-positive'
                        : site.status === 'failed'
                          ? 'text-negative'
                          : 'text-muted'
                    }`}
                  >
                    {site.status === 'published' ? 'Published' : site.status === 'failed' ? 'Publish failed' : 'Private preview'}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                  <Link href={`/app/sites/${site.id}`} className="text-signal hover:underline">
                    Preview
                  </Link>
                  <a href={`/api/sites/${site.id}?download=1`} className="text-muted hover:text-ink">
                    Download HTML
                  </a>
                  {site.published_url ? (
                    <a
                      href={site.published_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-positive hover:underline"
                    >
                      {site.published_url.replace(/^https?:\/\//, '')}
                    </a>
                  ) : null}
                  <span className="ml-auto text-muted">
                    Built {new Date(site.created_at).toLocaleDateString()}
                  </span>
                </div>
                {site.error ? <p className="mt-2 text-xs text-negative">{site.error}</p> : null}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
