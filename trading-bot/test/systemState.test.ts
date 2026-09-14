import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from './helpers.ts'
import { mk, STEP } from './fixtures/candles.ts'

const tmp = tempDataDir('mrcash-system-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { systemState } = await import('../src/systemState.ts')
const settings = await import('../src/settings.ts')
const { stop, resume } = await import('../src/killswitch.ts')
const { config } = await import('../config.ts')
after(() => tmp.cleanup())

const fakeWatch = (lastCloseAgoMs: number, now: number) => {
  const closeTime = now - lastCloseAgoMs
  const c = mk(closeTime - STEP + 1, 100, 101, 99, 100)
  return { at: now - 1000, snap: { candles: [c], analysis: null, signal: { action: 'HOLD' as const, reason: '', price: 100, time: closeTime, setupKey: '', evidence: [] }, news: { fetchedAt: now - 60_000, fromCache: false, calendar: [], headlines: [], standouts: [], blackouts: [], errors: [] }, plan: null, engine: null, flow: null, state: null } }
}

test('before any watch cycle the feeds are "never" and the summary says ATTENTION', () => {
  const st = systemState({ lastWatch: null, lastError: null, startedAt: Date.now() - 5000 })
  assert.equal(st.mode, 'paper')
  assert.equal(st.feeds.candles.verdict, 'never')
  assert.match(st.summary, /ATTENTION/)
  assert.equal(st.data.integrity, 'ok')
  assert.equal(st.data.writable, true)
  assert.equal(typeof st.data.counts.ledger, 'number')
  assert.equal(st.uptimeSec, 5)
})

test('a fresh candle makes the system healthy; an old one makes it stale', () => {
  const now = Date.now()
  const fresh = systemState({ lastWatch: fakeWatch(30_000, now) as never, lastError: null, startedAt: now, now })
  assert.equal(fresh.feeds.candles.verdict, 'fresh')
  assert.equal(fresh.feeds.news.verdict, 'fresh')
  assert.equal(fresh.feeds.orderFlow.verdict, 'never')
  assert.match(fresh.summary, /^Healthy/)
  const stale = systemState({ lastWatch: fakeWatch(20 * 60_000, now) as never, lastError: { time: now, message: 'feed down' }, startedAt: now, now })
  assert.equal(stale.feeds.candles.verdict, 'stale')
  assert.match(stale.summary, /candles stale/)
  assert.equal(stale.lastError?.message, 'feed down')
})

test('the kill switch and settings overrides show up in the document', () => {
  stop('state test')
  settings.setSetting('watchEveryMinutes', 2)
  const st = systemState({ lastWatch: null, lastError: null, startedAt: Date.now() })
  assert.equal(st.killSwitch.stopped, true)
  assert.match(st.summary, /kill switch on/)
  assert.deepEqual(st.settingsOverrides, { watchEveryMinutes: 2 })
  assert.equal(st.settings.strategy, config.strategy)
  resume()
  settings.resetSetting('watchEveryMinutes')
  assert.deepEqual(settings.overrides(), {})
})

test('settings refuse the wrong type or an out-of-range value', () => {
  assert.throws(() => settings.setSetting('watchEveryMinutes', 'five' as never), /must be a number/)
  assert.throws(() => settings.setSetting('watchEveryMinutes', 0), /between 1 and 60/)
  assert.equal(settings.setSetting('autoPaperTrade', false).autoPaperTrade, false)
  settings.resetSetting('autoPaperTrade')
  assert.equal(settings.getSettings().autoPaperTrade, config.app.autoPaperTrade)
})
