import {
  areaPath,
  DEFAULT_PLOT,
  extentOf,
  innerSize,
  linePath,
  niceScale,
  type Plot,
  pointScale,
  yScale,
} from '@/lib/charts/scale'
import { seriesVar } from '@/lib/charts/palette'
import { ChartEmpty, ChartShell, type ChartTable } from './ChartShell'

/**
 * Line / area time series, rendered as inline SVG.
 *
 * Server-rendered, no charting dependency, and readable with JavaScript off.
 * Two series maximum by convention here — a third line on a revenue chart is
 * usually two charts wearing a trench coat.
 *
 * There is deliberately no dual-axis mode. Two measures on different scales get
 * two charts or an indexed comparison; a second y-axis lets the author choose
 * where the lines cross, which is not a chart, it is an argument.
 */

export type TimeSeries = {
  key: string
  label: string
  points: number[]
}

export function TimeSeriesChart({
  title,
  purpose,
  labels,
  series,
  format,
  mode = 'line',
  plot = DEFAULT_PLOT,
  footnote,
}: {
  title: string
  purpose: string
  labels: string[]
  series: TimeSeries[]
  /** Formats a value for the axis, the table, and any direct label. */
  format: (value: number) => string
  mode?: 'line' | 'area'
  plot?: Plot
  footnote?: React.ReactNode
}) {
  const allValues = series.flatMap((s) => s.points)

  const table: ChartTable = {
    columns: ['Period', ...series.map((s) => s.label)],
    rows: labels.map((label, i) => [label, ...series.map((s) => format(s.points[i] ?? 0))]),
    caption: `${title} — ${series.map((s) => s.label).join(', ')}`,
  }

  if (allValues.length === 0 || labels.length === 0) {
    return (
      <ChartShell title={title} purpose={purpose} table={{ columns: [], rows: [] }}>
        <ChartEmpty message="No data in this period yet." />
      </ChartShell>
    )
  }

  const scale = niceScale(extentOf(allValues))

  // Reserve gutter for the widest tick label. A fixed padding clips
  // "$10,000.00" down to "L0,000.00" the moment revenue crosses five figures.
  const widestTick = Math.max(...scale.ticks.map((t) => format(t).length))
  const measured: Plot = {
    ...plot,
    padding: { ...plot.padding, left: Math.max(plot.padding.left, widestTick * 6.5 + 12) },
  }

  const y = yScale(scale, measured)
  const x = pointScale(labels.length, measured)
  const { width: innerW } = innerSize(measured)
  const baseline = y(Math.max(0, scale.min))

  // Label every nth tick so text never collides on a dense daily series.
  const labelStride = Math.max(1, Math.ceil(labels.length / 7))

  return (
    <ChartShell
      title={title}
      purpose={purpose}
      series={series.map((s, i) => ({ key: s.key, label: s.label, color: seriesVar(i) }))}
      table={table}
      footnote={footnote}
    >
      <svg
        viewBox={`0 0 ${measured.width} ${measured.height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title}. ${purpose} Full values are in the table below.`}
      >
        {/* Recessive gridlines — reference, not decoration. */}
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={measured.padding.left}
              x2={measured.padding.left + innerW}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgb(var(--hairline))"
              strokeWidth={tick === 0 ? 1.5 : 1}
              opacity={tick === 0 ? 0.9 : 0.45}
            />
            <text
              x={measured.padding.left - 8}
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

        {series.map((s, i) => {
          const points = s.points.map((value, index) => ({ x: x(index), y: y(value) }))
          const color = seriesVar(i)
          return (
            <g key={s.key}>
              {mode === 'area' ? (
                <path d={areaPath(points, baseline)} fill={seriesVar(i, 0.18)} />
              ) : null}
              <path
                d={linePath(points)}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* End-point marker doubles as the direct label anchor. */}
              {points.length > 0 ? (
                <circle
                  cx={points[points.length - 1]!.x}
                  cy={points[points.length - 1]!.y}
                  r={4}
                  fill={color}
                  stroke="rgb(var(--panel))"
                  strokeWidth={2}
                />
              ) : null}
            </g>
          )
        })}

        {labels.map((label, i) =>
          i % labelStride === 0 ? (
            <text
              key={label + i}
              x={x(i)}
              y={measured.height - 8}
              textAnchor="middle"
              fontSize="10"
              fill="rgb(var(--muted))"
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>
    </ChartShell>
  )
}
