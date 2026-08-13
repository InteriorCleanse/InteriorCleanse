import Link from 'next/link'
import { requireCapability } from '@/lib/session'
import { BriefingPanel } from '@/components/assistant/BriefingPanel'
import { BRIEFING_LABELS, type BriefingKind } from '@/lib/assistant/briefings'

export const metadata = { title: 'Briefings' }

const KINDS: BriefingKind[] = ['morning', 'end_of_day', 'weekly', 'monthly']

function isKind(value: string | undefined): value is BriefingKind {
  return KINDS.includes(value as BriefingKind)
}

/**
 * Executive briefings.
 *
 * Four cadences over the same computation, so the morning read and the monthly
 * review cannot disagree about what happened. Rendered on request here;
 * Checkpoint 5 delivers the same object on a schedule.
 */
export default async function BriefingsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>
}) {
  const [{ membership }, params] = await Promise.all([
    requireCapability('data:view'),
    searchParams,
  ])

  const kind: BriefingKind = isKind(params.kind) ? params.kind : 'morning'

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Briefings</h1>
        <p className="max-w-2xl text-sm text-muted">
          Computed from the same figures as the command center — no model writes these, so a
          briefing and a dashboard can never disagree.
        </p>
      </header>

      <nav aria-label="Briefing cadence" className="flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <Link
            key={option}
            href={`/app/briefings?kind=${option}`}
            aria-current={option === kind ? 'page' : undefined}
            className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-sm transition ${
              option === kind
                ? 'border-signal text-ink'
                : 'border-hairline text-muted hover:text-ink'
            }`}
          >
            {BRIEFING_LABELS[option]}
          </Link>
        ))}
      </nav>

      <BriefingPanel kind={kind} isDemo={membership.isDemo} currency={membership.baseCurrency} />
    </div>
  )
}
