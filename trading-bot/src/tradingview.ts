/**
 * Prints step-by-step instructions for putting the bot's session model
 * on a TradingView chart.
 *
 * Honesty note: this bot cannot log into TradingView for you and does
 * not pretend to. TradingView has no free public API for that. What it
 * CAN do is hand you two matching Pine Scripts and the exact clicks.
 * You run them there, on your screen, with your own eyes on the result.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.ts'
import * as ui from './ui.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const PINE_DIR = join(HERE, '..', 'pine')
const INDICATOR = join(PINE_DIR, 'ict-sessions.pine')
const STRATEGY = join(PINE_DIR, 'ict-strategy.pine')
const CROSSOVER = join(PINE_DIR, 'strategy.pine')

ui.heading('PUTTING THIS ON TRADINGVIEW')
console.log('')
console.log(ui.dim('  A free TradingView account is enough. This costs nothing.'))
console.log('')

const steps: [string, string[]][] = [
  ['Open a chart', [
    'Go to tradingview.com and sign in (the free plan is fine).',
    `Search for ${ui.bold(config.symbol)} and pick the ${ui.bold('BINANCE')} listing so prices match the bot.`,
    `Set the candle size to ${ui.bold(config.interval)} — it must match config.ts.`,
  ]],
  ['Open the Pine Editor', [
    'At the very bottom of the screen click "Pine Editor". A panel opens under the chart.',
  ]],
  ['Add the session indicator (draws what the bot sees)', [
    'Delete whatever is in the editor, then copy ALL of this file into it:',
    `  ${ui.bold(INDICATOR)}`,
    'Click "Add to chart". You should now see:',
    '  • shaded boxes for Asia, London and New York, each with its high and low',
    '  • dotted lines for yesterday\'s high and low',
    '  • green/red rectangles for fair value gaps — they turn grey when inverted',
    '  • small triangles where a session high or low was swept',
    'Click the gear on the indicator to change the session times. Keep them equal to config.ts.',
  ]],
  ['Add the strategy (the backtest)', [
    'Click "Open" in the Pine Editor, then "New blank strategy", delete it all, and paste:',
    `  ${ui.bold(STRATEGY)}`,
    'Click "Add to chart", then open the "Strategy Tester" tab next to Pine Editor.',
    'That panel is your backtest report. The numbers that matter:',
    '  Net Profit          — did it make or lose money overall',
    '  Percent Profitable  — how often it was right',
    '  Profit Factor       — above 1.0 means winners outweighed losers',
    '  Max Drawdown        — the worst drop along the way',
    '  Total Trades        — under ~30 means treat it as a demo, not proof',
  ]],
  ['Compare it with the bot', [
    'Run  npm run replay:raw  and put the two reports side by side.',
    'They will not match exactly — TradingView models fills, slippage and sizing',
    'differently, and its FVG rules are simpler than the bot\'s inversion logic.',
    'What you are checking is the STORY: do both see the same sweeps, the same gaps,',
    'the same handful of entries? If yes, you understand the model. If they disagree',
    'wildly, check symbol, timeframe and session times first.',
  ]],
]

steps.forEach(([title, lines], i) => {
  console.log(`  ${ui.bold(`${i + 1}. ${title}`)}`)
  for (const l of lines) console.log(`     ${l}`)
  console.log('')
})

ui.plainEnglish([
  'Why bother, when the bot already has a look-back test?',
  '',
  'Because seeing it drawn on a chart is how the model stops being a',
  'list of rules and starts being something you recognise. Watch a few',
  'days of London opens with the session boxes on, and the sweep →',
  'displacement → gap → retest story becomes obvious. That is the point.',
  '',
  'The simple 9/21 crossover script is still here too:',
  `  ${CROSSOVER}`,
])

console.log('')
for (const f of [INDICATOR, STRATEGY, CROSSOVER]) {
  console.log(existsSync(f) ? ui.dim(`  ✓ ${f}`) : ui.bad(`  ✗ missing: ${f}`))
}
console.log('')
