import type { ReactNode } from 'react'

/**
 * The frame every chart in the product sits in.
 *
 * It exists so three obligations are structural rather than remembered:
 * a plain-English statement of what the chart is for, a legend whenever there
 * is more than one series, and a keyboard-accessible table carrying the same
 * numbers. The table is not a fallback — it is how the chart stays readable for
 * screen readers, for print, and for the colour-vision cases where two slots
 * sit close together.
 */

export type ChartSeries = {
  key: string
  label: string
  /** CSS colour, normally `seriesVar(n)`. */
  color: string
}

export type ChartTable = {
  columns: string[]
  rows: (string | number)[][]
  caption?: string
}

export function ChartShell({
  title,
  purpose,
  series = [],
  table,
  footnote,
  children,
}: {
  title: string
  /** One line: what question this chart answers. Not a restatement of the title. */
  purpose: string
  series?: ChartSeries[]
  table: ChartTable
  footnote?: ReactNode
  children: ReactNode
}) {
  return (
    <figure className="rounded-panel border border-hairline bg-panel p-5 shadow-panel">
      <figcaption className="mb-4">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{purpose}</p>
      </figcaption>

      {/* A legend is mandatory past one series, so identity is never carried by
          colour alone. A single series is named by the title. */}
      {series.length > 1 ? (
        <ul className="mb-3 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-xs text-muted">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: s.color }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto">{children}</div>

      {footnote ? <p className="mt-3 text-xs leading-relaxed text-muted">{footnote}</p> : null}

      <details className="mt-4 border-t border-hairline pt-3">
        <summary className="cursor-pointer text-xs text-signal">
          View as table ({table.rows.length} row{table.rows.length === 1 ? '' : 's'})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            {table.caption ? (
              <caption className="pb-2 text-left text-muted">{table.caption}</caption>
            ) : null}
            <thead>
              <tr className="border-b border-hairline text-left text-muted">
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="py-1.5 pr-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-b border-hairline/50">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`py-1.5 pr-3 ${typeof cell === 'number' ? 'tabular text-right' : ''}`}
                    >
                      {typeof cell === 'number' ? cell.toLocaleString() : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/** Shared empty state, so a chart with no data never renders empty axes. */
export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-hairline p-6">
      <p className="max-w-sm text-center text-sm text-muted">{message}</p>
    </div>
  )
}
