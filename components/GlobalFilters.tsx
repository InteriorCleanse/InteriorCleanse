import Link from 'next/link'
import {
  COMPARISON_LABELS,
  PRESET_LABELS,
  type ComparisonKey,
  type PresetKey,
} from '@/lib/periods'

/**
 * Date range and comparison, held in the URL.
 *
 * URL state rather than component state, so a filtered view is shareable,
 * bookmarkable, survives a reload, and works without JavaScript. Preferences
 * are per-user and per-workspace by virtue of living in the address of a
 * tenant-scoped page — they cannot leak between tenants.
 */
export function GlobalFilters({
  basePath,
  preset,
  comparison,
}: {
  basePath: string
  preset: PresetKey
  comparison: ComparisonKey
}) {
  const href = (next: { preset?: PresetKey; comparison?: ComparisonKey }) => {
    const params = new URLSearchParams({
      preset: next.preset ?? preset,
      comparison: next.comparison ?? comparison,
    })
    return `${basePath}?${params.toString()}`
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-panel border border-hairline bg-panel px-4 py-3">
      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">Date range</legend>
        <span className="mr-1 text-[10px] uppercase tracking-[0.16em] text-muted">Range</span>
        {(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => (
          <Link
            key={key}
            href={href({ preset: key })}
            aria-current={key === preset ? 'true' : undefined}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              key === preset
                ? 'bg-signal text-ground'
                : 'border border-hairline text-muted hover:border-signal hover:text-ink'
            }`}
          >
            {PRESET_LABELS[key]}
          </Link>
        ))}
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">Comparison</legend>
        <span className="mr-1 text-[10px] uppercase tracking-[0.16em] text-muted">Compare</span>
        {(Object.keys(COMPARISON_LABELS) as ComparisonKey[]).map((key) => (
          <Link
            key={key}
            href={href({ comparison: key })}
            aria-current={key === comparison ? 'true' : undefined}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              key === comparison
                ? 'bg-signal text-ground'
                : 'border border-hairline text-muted hover:border-signal hover:text-ink'
            }`}
          >
            {COMPARISON_LABELS[key]}
          </Link>
        ))}
      </fieldset>
    </div>
  )
}

const PRESETS = Object.keys(PRESET_LABELS)
const COMPARISONS = Object.keys(COMPARISON_LABELS)

/** Coerces untrusted query params to known keys. */
export function readFilters(params: { preset?: string; comparison?: string }) {
  const preset = (PRESETS.includes(params.preset ?? '') ? params.preset : 'last_30') as PresetKey
  const comparison = (
    COMPARISONS.includes(params.comparison ?? '') ? params.comparison : 'previous_period'
  ) as ComparisonKey
  return { preset, comparison }
}
