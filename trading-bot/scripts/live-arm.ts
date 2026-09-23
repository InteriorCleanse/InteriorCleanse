/**
 * Inspect the live-arming gate chain. This script REPORTS; it never sends an
 * order and cannot arm anything by itself. Run: `node scripts/live-arm.ts`.
 */
import { gateInputFromEnv, liveArmed, liveGates, CONFIRM_PHRASE } from '../src/live/gates.ts'
import * as ui from '../src/ui.ts'

ui.heading('LIVE ARMING — gate chain')
ui.safetyBanner()
const input = gateInputFromEnv({ testnetTradesReconciled: 0, guardPresent: true, killSwitchEngaged: false, feedHealthy: true, typedConfirmation: process.argv.includes('--confirm') ? CONFIRM_PHRASE : undefined })
ui.blank()
for (const g of liveGates(input)) console.log(`  ${g.ok ? ui.good('✓') : ui.bad('✗')} ${g.name.padEnd(22)} ${g.reason}`)
ui.blank()
console.log(liveArmed(input) ? ui.bad('  LIVE IS ARMED — real orders could be placed.') : ui.good('  Live is NOT armed. Paper only. Nothing can send an order.'))
ui.plainEnglish([
  'This build ships with the top-level flag off, so live is unreachable by design.',
  'Every gate must pass at once before any order-placing code can run.',
])
