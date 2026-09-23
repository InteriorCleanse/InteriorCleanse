import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startMockFeeds, tempDataDir } from './helpers.ts'
import type { MockFeeds } from './helpers.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const tmp = tempDataDir('mrcash-news-')
process.env.MRCASH_DATA_DIR = tmp.dir
let feeds: MockFeeds
before(async () => { feeds = await startMockFeeds(); process.env.MRCASH_NEWS_URL = feeds.url })
after(async () => { await feeds.close(); tmp.cleanup() })

test('the fixture calendar and RSS parse and score as documented', async () => {
  const n = await import('../src/news.ts')
  const cal = n.parseCalendar(readFileSync(join(HERE, 'fixtures', 'calendar.json'), 'utf8'))
  assert.equal(cal.length, 4)
  assert.equal(cal[0].time, Date.UTC(2026, 0, 15, 13, 30))
  assert.equal(cal[2].impact, 'Holiday')
  const rss = n.parseRss(readFileSync(join(HERE, 'fixtures', 'headlines.rss'), 'utf8'), 'Fixture')
  assert.equal(rss.length, 3)
  assert.equal(rss[0].title, 'Fed holds rates & signals cuts later this year')
  const now = Date.UTC(2026, 0, 15, 12, 30)
  const scored = rss.map((h) => n.scoreHeadline(h, now))
  assert.ok(scored[0].score > scored[2].score, 'the Fed beats the cat')
  const report = n.buildReport(cal, rss, [], now)
  assert.equal(report.blackouts.length, 2, 'two high-impact USD events, two stand-aside windows')
  assert.ok(n.isBlackout(Date.UTC(2026, 0, 15, 13, 20), report))
  assert.equal(n.isBlackout(Date.UTC(2026, 0, 15, 15, 0), report), null)
  assert.equal(n.upcomingEvents(report, now).length, 2, 'only events in the next 36 hours')
})

test('getNews fetches, then serves from cache, then re-fetches when forced', async () => {
  const n = await import('../src/news.ts')
  const first = await n.getNews(true)
  assert.equal(first.fromCache, false)
  assert.equal(first.calendar.length, 2)
  assert.equal(first.errors.length, 0)
  const hitsAfterFirst = feeds.hits['/calendar.json']
  const second = await n.getNews()
  assert.equal(second.fromCache, true)
  assert.equal(feeds.hits['/calendar.json'], hitsAfterFirst, 'no network call for a cached read')
  const third = await n.getNews(true)
  assert.equal(third.fromCache, false)
  assert.equal(feeds.hits['/calendar.json'], hitsAfterFirst + 1)
  assert.ok(n.summarizeNews(third).length > 10)
})

test('probeNews reports each feed by name', async () => {
  const n = await import('../src/news.ts')
  const probes = await n.probeNews()
  assert.deepEqual(probes.map((p) => [p.name, p.ok]), [['calendar', true], ['Test feed', true]])
})
