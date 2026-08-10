import {
  DEFAULT_PLOT,
  bandScale,
  extentOf,
  innerSize,
  niceScale,
  yScale,
} from '@/lib/charts/scale'
import { layoutWaterfall, type WaterfallStep } from '@/lib/charts/flow'
import { ChartEmpty, ChartShell } from './ChartShell'

/**
 * Cash flow waterfall — opening balance, movements, closing balance.
 *
 * Colour here is status, not identity: increases green, decreases red, totals
 * neutral. That is a legitimate use of the reserved status palette because the
 * encoded thing genuinely is polarity. Direction is also carried by the bar's
 * position relative to its predecessor and stated in the table, so the meaning
 * survives without colour.
 */
export function CashFlowWaterfall({
  opening,
  steps,
  format,
  title = 'Cash flow',
  purpose = 'Where the balance moved over the period, and what is left.',
}: {
  opening: number
  steps: readonly WaterfallStep[]
  format: (minorUnits: number) => string
  title?: string
  purpose?: string
}) {
  const layout = layoutWaterfall(opening, steps)

  const table = {
    columns: ['Step', 'Movement', 'Balance after'],
    rows: layout.bars.map((bar) => [
      bar.label,
      bar.kind === 'total' ? '—' : `${bar.amount >= 0 ? '+' : '−'}${format(Math.abs(bar.amount))}`,
      format(bar.balance),
    ]),
    caption: `Opening ${format(layout.opening)}, closing ${format(layout.closing)}.`,
  }

  if (steps.length === 0 && opening === 0) {
    return (
      <ChartShell title={title} purpose={purpose} table={table}>
        <ChartEmpty message="No cash movement recorded in this period." />
      </ChartShell>
    )
  }

  const scale = niceScale(extentOf([layout.min, layout.max]))

  // Same gutter measurement as the time series: a fixed left padding clips
  // "$10,000.00" to "L0,000.00" once the balance crosses five figures.
  const widestTick = Math.max(...scale.ticks.map((t) => format(t).length))
  const plot = {
    ...DEFAULT_PLOT,
    height: 300,
    padding: {
      ...DEFAULT_PLOT.padding,
      left: Math.max(DEFAULT_PLOT.padding.left, widestTick * 6.5 + 12),
    },
  }
  const y = yScale(scale, plot)
  const band = bandScale(layout.bars.length, plot)
  const { width: innerW } = innerSize(plot)
  const barWidth = Math.min(46, band.band * 0.62)

  return (
    <ChartShell
      title={title}
      purpose={purpose}
      table={table}
      footnote={`Closing balance is derived from the opening balance and the movements shown — it is not reported separately.`}
    >
      <svg
        viewBox={`0 0 ${plot.width} ${plot.height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title}. Opening ${format(layout.opening)}, closing ${format(layout.closing)}. Each movement is listed in the table below.`}
      >
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={plot.padding.left}
              x2={plot.padding.left + innerW}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgb(var(--hairline))"
              strokeWidth={tick === 0 ? 1.5 : 1}
              opacity={tick === 0 ? 0.9 : 0.45}
            />
            <text
              x={plot.padding.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="tabular"
              fontSize="10"
              fill="rgb(var(--muted))"
            >
              {format(tick)}
            </text>
          </g>
        ))}

        {layout.bars.map((bar, index) => {
          const top = y(Math.max(bar.from, bar.to))
          const bottom = y(Math.min(bar.from, bar.to))
          const height = Math.max(2, bottom - top)
          const cx = band.center(index)

          const fill =
            bar.kind === 'total'
              ? 'rgb(var(--cobalt))'
              : bar.kind === 'increase'
                ? 'rgb(var(--positive))'
                : 'rgb(var(--negative))'

          return (
            <g key={bar.key}>
              {/* Connector to the next bar, so the chain reads as a chain. */}
              {index < layout.bars.length - 1 ? (
                <line
                  x1={cx + barWidth / 2}
                  x2={band.center(index + 1) - barWidth / 2}
                  y1={y(bar.to)}
                  y2={y(bar.to)}
                  stroke="rgb(var(--hairline))"
                  strokeDasharray="3 3"
                />
              ) : null}

              <rect
                x={cx - barWidth / 2}
                y={top}
                width={barWidth}
                height={height}
                fill={fill}
                rx={3}
              />

              <text
                x={cx}
                y={top - 6}
                textAnchor="middle"
                className="tabular"
                fontSize="10"
                fill="rgb(var(--ink))"
              >
                {bar.kind === 'total'
                  ? format(bar.balance)
                  : `${bar.amount >= 0 ? '+' : '−'}${format(Math.abs(bar.amount))}`}
              </text>

              <text
                x={cx}
                y={plot.height - 8}
                textAnchor="middle"
                fontSize="10"
                fill="rgb(var(--muted))"
              >
                {bar.label.length > 14 ? `${bar.label.slice(0, 13)}…` : bar.label}
              </text>
            </g>
          )
        })}
      </svg>
    </ChartShell>
  )
}
