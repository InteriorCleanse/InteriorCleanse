import { layoutPortfolio, type PortfolioPoint, QUADRANT_LABELS } from '@/lib/charts/flow'
import { ChartEmpty, ChartShell } from './ChartShell'

/**
 * Product portfolio — growth against contribution margin, sized by revenue.
 *
 * Quadrant, not hue, carries the meaning: position already says everything a
 * colour would, and a scatter with one hue per product burns through the
 * categorical slots at the fifth SKU. Every bubble is directly labelled, and
 * the table lists the quadrant in words.
 */
export function ProductPortfolioMatrix({
  points,
  format,
  title = 'Product portfolio',
  purpose = 'Which products are growing, which are profitable, and which are neither.',
}: {
  points: readonly PortfolioPoint[]
  format: (minorUnits: number) => string
  title?: string
  purpose?: string
}) {
  const layout = layoutPortfolio(points)

  const table = {
    columns: ['Product', 'Growth', 'Margin', 'Revenue', 'Assessment'],
    rows: layout.points.map((p) => [
      p.label,
      `${(p.growth * 100).toFixed(1)}%`,
      `${(p.margin * 100).toFixed(1)}%`,
      format(p.revenue),
      QUADRANT_LABELS[p.quadrant],
    ]),
    caption: 'Bubble area is proportional to revenue.',
  }

  if (layout.points.length === 0) {
    return (
      <ChartShell title={title} purpose={purpose} table={table}>
        <ChartEmpty message="No product data in this period yet." />
      </ChartShell>
    )
  }

  const { width, height, xZero, yZero } = layout
  // Quadrant captions live in a reserved band above and below the plot, not
  // inside it — rendered in the corners they collide with bubbles and with the
  // direct labels, which is exactly what the first render showed.
  const capTop = 18
  const capBottom = 16
  const totalHeight = height + capTop + capBottom

  return (
    <ChartShell
      title={title}
      purpose={purpose}
      table={table}
      footnote="Axes cross at zero growth and zero margin. Bubble area is proportional to revenue, so a product twice the area earned twice as much."
    >
      <svg
        viewBox={`0 0 ${width} ${totalHeight}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title}. ${layout.points.length} products plotted by growth and margin. Each product and its assessment is in the table below.`}
      >
        {(
          [
            ['Shrinking · profitable', 8, 12, 'start'],
            ['Growing · profitable', width - 8, 12, 'end'],
            ['Shrinking · unprofitable', 8, totalHeight - 4, 'start'],
            ['Growing · unprofitable', width - 8, totalHeight - 4, 'end'],
          ] as const
        ).map(([label, tx, ty, anchor]) => (
          <text key={label} x={tx} y={ty} textAnchor={anchor} fontSize="10" fill="rgb(var(--muted))">
            {label}
          </text>
        ))}

        <g transform={`translate(0 ${capTop})`}>
          <line x1={xZero} x2={xZero} y1={0} y2={height} stroke="rgb(var(--hairline))" />
          <line x1={0} x2={width} y1={yZero} y2={yZero} stroke="rgb(var(--hairline))" />

        {layout.points.map((p) => {
          // Margin decides the tone: a product losing money should not look
          // the same as one making it, whichever way growth is pointing.
          const fill = p.margin >= 0 ? 'rgb(var(--signal))' : 'rgb(var(--negative))'
          return (
            <g key={p.productId}>
              {/* Surface ring first, so overlapping bubbles stay separable. */}
              <circle cx={p.x} cy={p.y} r={p.r + 1.5} fill="none" stroke="rgb(var(--panel))" strokeWidth={3} />
              <circle cx={p.x} cy={p.y} r={p.r} fill={fill} opacity={0.28} stroke={fill} strokeWidth={2} />
              {(() => {
                const text = p.label.length > 18 ? `${p.label.slice(0, 17)}…` : p.label
                // Rough half-width at 10px; enough to decide anchoring.
                const half = text.length * 2.7
                // Anchor flips near an edge so the label cannot run off the
                // canvas — the first render clipped "Cedar Reed Diffuser".
                const anchor = p.x - half < 4 ? 'start' : p.x + half > width - 4 ? 'end' : 'middle'
                const lx = anchor === 'start' ? 4 : anchor === 'end' ? width - 4 : p.x
                // Sit below the bubble when there is no room above, so labels
                // do not land on a neighbour near the top of the plot.
                const above = p.y - p.r - 5 > 10
                const ly = above ? p.y - p.r - 5 : p.y + p.r + 12
                return (
                  <text x={lx} y={ly} textAnchor={anchor} fontSize="10" fill="rgb(var(--ink))">
                    {text}
                  </text>
                )
              })()}
            </g>
          )
        })}

          <text x={width - 8} y={yZero - 6} textAnchor="end" fontSize="10" fill="rgb(var(--muted))">
            Growth →
          </text>
          <text x={xZero + 6} y={12} fontSize="10" fill="rgb(var(--muted))">
            ↑ Margin
          </text>
        </g>
      </svg>
    </ChartShell>
  )
}
