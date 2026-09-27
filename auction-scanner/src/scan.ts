/**
 * `node src/scan.ts [query] [--max 30000] [--all]` — run the feed pipeline in
 * the terminal and print the top cards. Same code path as the app: sources →
 * estimate → score → starter rules. The heading says whether the cars are
 * LIVE, SAMPLE or that there is nothing to show.
 */
import { scanAll } from './sources/registry.ts'
import { estimateValue, askingPrice } from './valuation.ts'
import { demandFor } from './demand.ts'
import { scoreListing } from './scoring.ts'
import { getSettings } from './settings.ts'
import * as ui from './ui.ts'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const query = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--max').join(' ') || undefined
const max = Number(arg('--max')) || undefined
const showAll = process.argv.includes('--all')

const settings = getSettings()
const result = await scanAll({ text: query, maxPriceUsd: max, limit: 100 }, { allowSample: settings.allowSample })

ui.heading(`${result.kind === 'EMPTY' ? 'NO SOURCE' : result.kind} — ${query ? `"${query}"` : 'everything'}${max ? ` under ${ui.money(max)}` : ''}`)
if (result.kind === 'SAMPLE') ui.line(ui.warn('These are SAMPLE cars. They are not real. Connect a source (see .env.example) to scan live auctions.'))
for (const e of result.errors) ui.line(ui.warn(e))
if (result.kind === 'EMPTY') {
  ui.line('Nothing to show. Add a source to .env, or set allowSample in Settings to see the sample feed.')
  process.exit(0)
}

const cards = result.listings.map((l) => {
  const estimate = estimateValue(l, result.comps)
  const demand = demandFor(l.make, l.model, settings.demandExtra)
  const score = scoreListing(l, estimate, demand, settings.starter)
  return { l, estimate, score }
})
const shown = showAll ? cards : cards.filter((c) => c.score.starterOk)
const hidden = cards.length - shown.length
shown.sort((a, b) => (a.score.grade === 'unpriced' ? 1 : 0) - (b.score.grade === 'unpriced' ? 1 : 0) || b.score.total - a.score.total)

ui.line(ui.dim(`${shown.length} car${shown.length === 1 ? '' : 's'}${hidden ? `, starter mode hid ${hidden} (use --all to see them)` : ''}`))
ui.line()
for (const c of shown) {
  const grade = c.score.grade === 'unpriced' ? ui.dim('  —  unpriced ') : (c.score.total >= 60 ? ui.good : c.score.total >= 40 ? ui.warn : ui.dim)(`${String(c.score.total).padStart(3)}  ${c.score.grade.padEnd(9)}`)
  const price = askingPrice(c.l)
  const est = c.estimate.ok ? `comps ${ui.money(c.estimate.valueUsd)} (${c.estimate.comps})` : 'NOT ENOUGH COMPS'
  const badges = [c.l.titleStatus + ' title', c.l.damage === 'none' ? 'no damage' : c.l.damage + ' damage', c.l.runsAndDrives === true ? 'runs & drives' : c.l.runsAndDrives === false ? 'does not run' : 'runs? not stated'].join(' · ')
  ui.line(`${grade}  ${ui.bold(c.l.title)}${c.l.kind === 'SAMPLE' ? ui.warn('  [SAMPLE]') : ''}`)
  ui.line(`                 ${price !== undefined ? ui.money(price) : 'no price'} now · ${est} · ${badges}`)
  if (c.score.reasons[0]) ui.line(ui.dim(`                 ${c.score.reasons[0]}`))
  if (showAll && !c.score.starterOk) ui.line(ui.warn(`                 hidden by starter mode: ${c.score.starterBlocks.join(' ')}`))
  ui.line()
}
