/**
 * THE CHART AND THE BOT MUST AGREE ABOUT WHEN LONDON IS.
 *
 * `pine/ict-sessions.pine` had its session times hand-typed, under a comment
 * reading "Keep the session times equal to config.ts". That comment is a
 * person's memory doing the job of a guarantee — the same one-concept-written-
 * twice shape behind every defect this codebase has turned up: the previous-day
 * high, the win threshold, shadow R, the fee knob, the trading day.
 *
 * It had not drifted yet. These tests are what stop it starting: the served
 * script generates its windows from config, and the checked-in file is pinned to
 * config too, so neither copy can move on its own.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../helpers.ts'
import { config } from '../../config.ts'
import { toPineSession, sessionWindows, sessionInputLines, renderSessionScript } from '../../src/tv/sessionScript.ts'

const template = readFileSync(join(ROOT, 'pine', 'ict-sessions.pine'), 'utf8')

test('HH:MM becomes a Pine session string, and midnight is 0000 not 2400', () => {
  assert.equal(toPineSession('20:00', '00:00'), '2000-0000')
  assert.equal(toPineSession('02:00', '05:00'), '0200-0500')
  assert.equal(toPineSession('08:30', '11:00'), '0830-1100')
  assert.equal(toPineSession('9:05', '13:30'), '0905-1330', 'a single-digit hour must still pad')
  // The trading day rolls at 18:00 ET and ends at midnight; "24:00" is the same
  // instant as "00:00" and Pine only accepts the latter.
  assert.equal(toPineSession('24:00', '24:00'), '0000-0000')
})

test('a malformed time is refused rather than silently mis-drawn on a chart', () => {
  assert.throws(() => toPineSession('2000', '00:00'), /not a HH:MM time/)
  assert.throws(() => toPineSession('20:00', 'lunchtime'), /not a HH:MM time/)
  assert.throws(() => toPineSession('20:99', '00:00'), /not a valid time/)
})

test('the four windows come from config, and the killzones are labelled as such', () => {
  const w = sessionWindows()
  const s = config.ict.sessions
  assert.equal(w.asia.pine, toPineSession(s.asia.start, s.asia.end))
  assert.equal(w.london.pine, toPineSession(s.london.start, s.london.end))
  assert.equal(w.newYork.pine, toPineSession(s.newYork.start, s.newYork.end))
  assert.equal(w.nyPM.pine, toPineSession(s.nyPM.start, s.nyPM.end))
  for (const k of ['asia', 'london', 'newYork', 'nyPM'] as const) {
    assert.equal(w[k].killzone, (config.ict.killzones as string[]).includes(k), `${k} killzone flag disagrees with config`)
  }
})

test('the served script carries the configured times and says which are killzones', () => {
  const out = renderSessionScript(template)
  const w = sessionWindows()
  for (const k of ['asia', 'london', 'newYork', 'nyPM'] as const) {
    assert.ok(out.includes(`"${w[k].pine}"`), `the rendered script is missing the ${k} window ${w[k].pine}`)
  }
  assert.match(out, /generated from config\.ts/)
  assert.match(out, /Entry killzones right now: /)
  // Everything else must survive untouched: the boxes, sweeps and alerts.
  for (const keep of ['trackSession', 'sweptAsiaLow', 'alertcondition', 'Yesterday\'s high']) {
    assert.ok(out.includes(keep), `rendering dropped "${keep}" from the script`)
  }
})

test('rendering refuses rather than guessing if the template changes shape', () => {
  assert.throws(() => renderSessionScript('indicator("x")\n// no inputs here\n'), /template changed shape/)
})

/**
 * The checked-in file has to stand on its own — someone will open it straight
 * from the repo instead of the app. So its hardcoded defaults are pinned to
 * config as well. If this fails, the fix is to update the .pine file, not to
 * loosen the test.
 */
test('the checked-in pine file still matches config', () => {
  const w = sessionWindows()
  const want: Record<string, string> = {
    asiaSess: w.asia.pine, londonSess: w.london.pine, nySess: w.newYork.pine, nyPmSess: w.nyPM.pine,
  }
  for (const [name, pine] of Object.entries(want)) {
    const found = new RegExp(`${name}\\s*=\\s*input\\.session\\("([^"]+)"`).exec(template)?.[1]
    assert.equal(found, pine, `pine/ict-sessions.pine has ${name} as "${found}" but config says "${pine}"`)
  }
})

test('all four sessions are actually drawn, not just declared', () => {
  for (const v of ['asiaSess', 'londonSess', 'nySess', 'nyPmSess']) {
    assert.ok(new RegExp(`trackSession\\(\\s*${v}`).test(template), `${v} is declared but never tracked, so nothing is drawn for it`)
  }
})
