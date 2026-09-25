/**
 * Not a test in spirit — a render harness. Writes the real chart components to
 * a static HTML file so the layout can be looked at, which the palette
 * validator cannot check for you. Kept out of `tests/` so `npm test` stays fast.
 */
import { describe, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { ProfitEngineSankey } from '@/components/charts/ProfitEngineSankey'
import { CashFlowWaterfall } from '@/components/charts/CashFlowWaterfall'
import { ProductPortfolioMatrix } from '@/components/charts/ProductPortfolioMatrix'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { loadWorkspaceAnalytics } from '@/lib/workspace-analytics'
import { formatMoney, money } from '@/lib/money'

describe('render harness', () => {
  it('writes charts.html', () => {
    const a = loadWorkspaceAnalytics({ isDemo: true, preset: 'last_30', comparison: 'previous_period' })
    const fmt = (m: number) => formatMoney(money(Math.round(m), a.currency))

    const body = renderToStaticMarkup(
      <div style={{ display: 'grid', gap: 24, maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <TimeSeriesChart
          title="Revenue and advertising"
          purpose="Whether spend is tracking revenue, or pulling away from it."
          labels={a.series.labels}
          series={[
            { key: 'r', label: 'Net revenue', points: a.series.netRevenue },
            { key: 's', label: 'Ad spend', points: a.series.adSpend },
          ]}
          format={fmt}
          mode="area"
        />
        <ProfitEngineSankey input={a.sankey} format={fmt} />
        <CashFlowWaterfall opening={0} steps={a.cashSteps} format={fmt} title="Revenue to profit" purpose="Each cost taken out of revenue in turn." />
        <ProductPortfolioMatrix points={a.portfolio} format={fmt} />
      </div>,
    )

    const css = `
:root{--ground:250 250 249;--panel:255 255 255;--panel-raised:245 245 244;--hairline:214 211 209;--ink:28 25 23;--muted:120 113 108;--signal:8 145 178;--cobalt:37 99 235;--amber:180 120 20;--positive:21 128 61;--negative:190 50 42;
--series-1:42 120 214;--series-2:235 104 52;--series-3:27 175 122;--series-4:237 161 0;}
body{margin:0;background:rgb(var(--ground));color:rgb(var(--ink));font-family:system-ui,sans-serif}
figure{margin:0;border:1px solid rgb(var(--hairline));background:rgb(var(--panel));border-radius:14px;padding:20px}
h3{margin:0;font-size:16px}
.text-muted,p{color:rgb(var(--muted))}
.tabular{font-variant-numeric:tabular-nums}
svg{width:100%;height:auto;display:block}
ul{list-style:none;margin:0;padding:0;display:flex;gap:16px;font-size:12px}
ul li{display:flex;align-items:center;gap:8px;color:rgb(var(--muted))}
.inline-block{display:inline-block;width:10px;height:10px;border-radius:2px}
h3{margin:0 0 4px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:4px 8px 4px 0;text-align:left}
details{margin-top:12px;border-top:1px solid rgb(var(--hairline));padding-top:8px;font-size:12px}
`
    writeFileSync(
      '/tmp/charts.html',
      `<!doctype html><meta charset="utf-8"><title>chart harness</title><style>${css}</style>${body}`,
    )
  })
})
