import { Eyebrow, Panel } from '@/components/ui'
import { BRIEFING_LABELS, buildBriefing, type BriefingKind } from '@/lib/assistant/briefings'

/**
 * The briefing surface.
 *
 * A server component with no model call in it. The figures and the sentences
 * are both computed, so this renders identically whether or not an API key is
 * configured, and a scheduled run produces the same words a person sees on
 * screen. The assistant's job is to answer questions *about* this, not to
 * write it.
 */

const SENTIMENT_CLASS: Record<'positive' | 'negative' | 'neutral', string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  neutral: 'text-muted',
}

export function BriefingPanel({
  kind,
  isDemo,
  currency,
}: {
  kind: BriefingKind
  isDemo: boolean
  currency: string
}) {
  const briefing = buildBriefing({ kind, isDemo, currency })

  return (
    <Panel>
      <Eyebrow>{BRIEFING_LABELS[kind]}</Eyebrow>

      <p className="text-base text-ink">{briefing.headline}</p>
      <p className="mt-1 text-xs text-muted">
        {briefing.period}
        {briefing.comparisonPeriod ? ` vs ${briefing.comparisonPeriod}` : ''}
        {briefing.isDemo ? ' · demonstration data' : ''}
      </p>

      {briefing.lines.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[24rem] border-collapse text-sm">
            <caption className="sr-only">{BRIEFING_LABELS[kind]} figures</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-[0.14em] text-muted">
                <th scope="col" className="py-2 font-medium">
                  Measure
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Value
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {briefing.lines.map((line) => (
                <tr key={line.label} className="border-b border-hairline/60">
                  <th scope="row" className="py-2 text-left font-normal text-muted">
                    {line.label}
                  </th>
                  <td className="py-2 text-right tabular-nums text-ink">{line.value}</td>
                  <td className={`py-2 text-right ${SENTIMENT_CLASS[line.sentiment]}`}>
                    {line.change ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {briefing.attention.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">
            Worth a decision
          </h3>
          <ul className="mt-2 space-y-2">
            {briefing.attention.map((item) => (
              <li key={item} className="text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {briefing.caveats.length > 0 ? (
        <div className="mt-5 rounded-lg border border-hairline bg-panelRaised p-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            What makes these partial
          </h3>
          <ul className="mt-2 space-y-1">
            {briefing.caveats.map((caveat) => (
              <li key={caveat} className="text-xs text-muted">
                {caveat}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {briefing.followUps.length > 0 ? (
        <p className="mt-5 text-xs text-muted">
          Ask the assistant: {briefing.followUps.map((q) => `“${q}”`).join(' · ')}
        </p>
      ) : null}
    </Panel>
  )
}
