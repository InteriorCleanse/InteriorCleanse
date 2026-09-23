/**
 * `npm run picture -- chart.png "optional question"`
 *
 * Hands a screenshot of a chart to the assistant with Mr. Cash's rules
 * and gets a structured breakdown: what it sees, the levels, the gaps,
 * where an entry / stop / target would sit and why, what would
 * invalidate it, and what news to check. The picture is a picture —
 * the assistant is told to say what it cannot read rather than guess.
 */

import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { aiStatus, askAI, explainAiError, PICTURE_QUESTION } from './ai.ts'
import { analyzeNow } from './bot.ts'
import { buildBrief } from './brief.ts'
import * as ui from './ui.ts'

const TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

const file = process.argv[2]
const question = process.argv.slice(3).join(' ').trim() || PICTURE_QUESTION

ui.heading('MR. CASH — PICTURE ANALYZER')
ui.safetyBanner()
if (!file) {
  console.log('\n  Usage: npm run picture -- path/to/chart.png "what do you make of this?"\n')
  process.exit(1)
}
const mediaType = TYPES[extname(file).toLowerCase()]
if (!mediaType) {
  console.log(ui.bad('\n  Use a .png, .jpg, .gif or .webp screenshot.\n'))
  process.exit(1)
}
const status = await aiStatus()
if (!status.available) {
  console.log(ui.bad(`\n  ${status.reason}\n`))
  process.exit(1)
}

let context = 'Live market data was not available when this picture was analyzed. Work from the picture only.'
try {
  const snap = await analyzeNow()
  if (snap.analysis) context = buildBrief(snap.analysis, snap.news, snap.plan, Date.now(), snap.state, snap.flow).lines.join('\n')
} catch {
  // The picture can still be read without live data.
}

ui.step(`Reading ${file} with ${status.model}...`)
console.log('')
try {
  const answer = await askAI(question, context, [], (t) => process.stdout.write(t), { mediaType, data: readFileSync(file).toString('base64') })
  console.log('\n')
  if (answer.refused) console.log(ui.warn('  (The assistant declined to analyze that picture.)'))
  console.log(ui.dim(`  — cost $${answer.costUsd.toFixed(4)} (${answer.usage.input + answer.usage.cacheRead} in / ${answer.usage.output} out)`))
} catch (err) {
  console.log(ui.bad('\n  ' + (await explainAiError(err))))
}
console.log('')
