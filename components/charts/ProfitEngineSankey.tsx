import { layoutProfitSankey, SankeyImbalanceError, type SankeyInput } from '@/lib/charts/flow'
import { ChartEmpty, ChartShell } from './ChartShell'

/**
 * Profit Engine — where every unit of revenue goes.
 *
 * Costs are drawn in one recessive tone and retained profit in the signal
 * colour, because the question this answers is "how much survived", not "which
 * cost is which" — giving each cost bucket its own hue would spend four
 * categorical slots on a distinction the labels already make.
 *
 * If the model does not balance, the layout throws and this renders the
 * discrepancy instead of a diagram. Ribbons that do not sum to the inflow are a
 * wrong financial statement drawn confidently.
 */
export function ProfitEngineSankey({
  input,
  format,
  purpose = 'Follow every unit of revenue through to the profit you keep.',
}: {
  input: SankeyInput
  format: (minorUnits: number) => string
  purpose?: string
}) {
  const title = 'Profit engine'

  const table = {
    columns: ['Destination', 'Amount', 'Share of revenue'],
    rows: input.outflows.map((o) => [
      o.label,
      format(o.amount),
      input.inflow === 0 ? '—' : `${((o.amount / input.inflow) * 100).toFixed(1)}%`,
    ]),
    caption: `${format(input.inflow)} of ${input.inflowLabel.toLowerCase()} distributed across costs and retained profit.`,
  }

  let layout
  try {
    layout = layoutProfitSankey(input)
  } catch (error) {
    const residual = error instanceof SankeyImbalanceError ? error.residual : 0
    return (
      <ChartShell title={title} purpose={purpose} table={table}>
        <ChartEmpty
          message={`This diagram is not shown because the figures do not balance: ${format(Math.abs(residual))} of revenue is unaccounted for. The table below shows the raw components.`}
        />
      </ChartShell>
    )
  }

  if (layout.nodes.length === 0) {
    return (
      <ChartShell title={title} purpose={purpose} table={table}>
        <ChartEmpty message="No revenue in this period, so there is nothing to trace." />
      </ChartShell>
    )
  }

  const labelGutter = 190
  const totalWidth = layout.width + labelGutter

  return (
    <ChartShell
      title={title}
      purpose={purpose}
      table={table}
      footnote={`Ribbon thickness is proportional to amount. Total in: ${format(input.inflow)}.`}
    >
      <svg
        viewBox={`0 0 ${totalWidth} ${layout.height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title}. ${format(input.inflow)} of revenue split across ${input.outflows.length} destinations. Amounts are in the table below.`}
      >
        {layout.links.map((link) => (
          <path
            key={link.key}
            d={link.path}
            fill={link.tone === 'retained' ? 'rgb(var(--signal))' : 'rgb(var(--muted))'}
            opacity={link.tone === 'retained' ? 0.4 : 0.22}
          />
        ))}

        {layout.nodes.map((node) => {
          const isTarget = node.tone !== 'inflow'
          const fill =
            node.tone === 'retained'
              ? 'rgb(var(--signal))'
              : node.tone === 'inflow'
                ? 'rgb(var(--cobalt))'
                : 'rgb(var(--muted))'

          return (
            <g key={node.key}>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={Math.max(1, node.height)}
                fill={fill}
                rx={2}
              />
              {isTarget ? (
                <text
                  x={node.x + node.width + 8}
                  y={node.y + node.height / 2}
                  dominantBaseline="middle"
                  fontSize="11"
                  fill="rgb(var(--ink))"
                >
                  {node.label}
                  <tspan className="tabular" fill="rgb(var(--muted))">
                    {'  '}
                    {format(node.amount)}
                  </tspan>
                </text>
              ) : (
                <text
                  x={node.x + node.width + 8}
                  y={12}
                  fontSize="11"
                  fill="rgb(var(--ink))"
                >
                  {node.label} {format(node.amount)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </ChartShell>
  )
}
