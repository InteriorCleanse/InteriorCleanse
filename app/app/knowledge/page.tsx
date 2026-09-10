import Link from 'next/link'
import { Eyebrow, Panel, inputClass } from '@/components/ui'
import { snippet, toTsQuery } from '@/lib/knowledge/search'
import { requireCapability } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

export const metadata = { title: 'Knowledge' }

/**
 * What the assistant can cite.
 *
 * Every answer that quotes a note names the document; this is where a person
 * goes to see that document, and to see what the assistant *cannot* see. A
 * knowledge base nobody can inspect is a knowledge base nobody can correct.
 *
 * Read through the user's own client, so the page shows exactly the rows the
 * assistant's search tool sees for this person — the same policy, the same
 * query, the same snippets.
 */
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const [{ membership }, params] = await Promise.all([requireCapability('data:view'), searchParams])
  const question = (params.q ?? '').trim().slice(0, 300)
  const supabase = await supabaseServer()

  const base = supabase
    .from('knowledge_documents')
    .select('id, title, source, url, content, truncated, source_updated_at, updated_at')
    .eq('organization_id', membership.organizationId)

  const query = question ? toTsQuery(question) : null
  const { data: rows } = query
    ? await base.textSearch('search', query, { config: 'english' }).limit(50)
    : await base.order('updated_at', { ascending: false }).limit(100)

  const { count } = await supabase
    .from('knowledge_documents')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', membership.organizationId)

  const bySource = new Map<string, number>()
  for (const row of rows ?? []) bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1)

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Knowledge</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">What the assistant can cite</h1>
        <p className="text-sm text-muted">
          {count ?? 0} {count === 1 ? 'document' : 'documents'} from connected sources and uploads.
          When an answer quotes a note, it is one of these. Connect more on the{' '}
          <Link href="/app/integrations" className="text-signal hover:underline">
            integrations page
          </Link>
          .
        </p>
      </header>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={question}
          placeholder="Search notes the way you would ask the assistant"
          className={inputClass}
          maxLength={300}
        />
        <button
          type="submit"
          className="rounded-panel border border-hairline px-4 py-2 text-sm text-ink hover:bg-panelRaised"
        >
          Search
        </button>
      </form>

      {question && !query ? (
        <p className="text-sm text-muted">Nothing in that question is worth searching for. Try a noun.</p>
      ) : null}

      {(rows ?? []).length === 0 ? (
        <Panel>
          <p className="text-sm text-muted">
            {question
              ? 'No notes match. The assistant would say the same rather than guess.'
              : 'No documents yet. Connect Notion or Base44, or upload Markdown from a vault, and they appear here.'}
          </p>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {(rows ?? []).map((row) => (
            <li key={row.id}>
              <Panel>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-ink">
                    {row.url ? (
                      <a href={row.url} className="hover:underline" target="_blank" rel="noreferrer">
                        {row.title}
                      </a>
                    ) : (
                      row.title
                    )}
                  </h2>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
                    {row.source}
                    {row.truncated ? ' · truncated' : ''}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {snippet(row.content, question || row.title, 320)}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {row.source_updated_at
                    ? `Edited at source ${new Date(row.source_updated_at).toLocaleDateString()}`
                    : `Imported ${new Date(row.updated_at).toLocaleDateString()}`}
                </p>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {bySource.size > 0 ? (
        <p className="text-xs text-muted">
          Showing {[...bySource].map(([source, n]) => `${n} from ${source}`).join(', ')}.
        </p>
      ) : null}
    </div>
  )
}
