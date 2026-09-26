/**
 * NAVIGATION — every tab has to be reachable, and every button has to mean one.
 *
 * The nav was a flat list of sixteen tabs: the last one scrolled off the edge of
 * a 1280px screen and phone users saw seven. It is now five in the bar plus a
 * grouped "More" panel, which is easier to use and introduces two ways to
 * silently break it. Both are guarded here rather than left to a person noticing.
 *
 *   1. A tab added to TABS but forgotten in PRIMARY and GROUPS is ORPHANED —
 *      it exists, it has a section, and nothing on screen can reach it.
 *   2. A nav button without a `data-tab` gets wired to `showTab(undefined)`,
 *      which matches no section, hides all of them and leaves a blank page.
 *      That is not hypothetical: the More button did exactly that, and the bug
 *      only surfaced because a screenshot came back empty.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../helpers.ts'

const html = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8')

/** The tab ids the app declares, in order. */
function tabIds(): string[] {
  const line = html.match(/^const TABS = \[.*$/m)?.[0] ?? ''
  return [...line.matchAll(/\['([a-z]+)',/g)].map((m) => m[1])
}
function primaryIds(): string[] {
  const line = html.match(/^const PRIMARY = \[(.*?)\]$/m)?.[1] ?? ''
  return [...line.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
}
function groupedIds(): string[] {
  const block = html.slice(html.indexOf('const GROUPS = ['), html.indexOf('const TAB = '))
  return [...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
}

test('every tab is reachable — none orphaned between the bar and the More panel', () => {
  const tabs = tabIds()
  assert.ok(tabs.length >= 10, `only parsed ${tabs.length} tabs — the parser is wrong, not the app`)
  const reachable = new Set([...primaryIds(), ...groupedIds()])
  const orphans = tabs.filter((id) => !reachable.has(id))
  assert.deepEqual(orphans, [], `these tabs exist but nothing can reach them: ${orphans.join(', ')}`)
})

test('every tab has a section, and every section has a tab', () => {
  const tabs = tabIds()
  const sections = [...html.matchAll(/<section id="tab-([a-z]+)"/g)].map((m) => m[1])
  assert.deepEqual([...tabs].sort(), [...sections].sort(), 'the tab list and the page sections disagree')
})

test('nothing is listed in both the bar and the More panel', () => {
  const both = primaryIds().filter((id) => groupedIds().includes(id))
  assert.deepEqual(both, [], `these appear twice in the navigation: ${both.join(', ')}`)
})

test('the bar stays short enough to fit — that was the whole problem', () => {
  assert.ok(primaryIds().length <= 6, `${primaryIds().length} primary tabs will start scrolling off again`)
})

test('only buttons that name a tab are wired to navigate', () => {
  // showTab(undefined) hides every section. The selector must require data-tab.
  const wiring = html.match(/document\.querySelectorAll\((.*?)\)\.forEach\(b => b\.onclick = \(\) => showTab\(b\.dataset\.tab\)\)/)
  assert.ok(wiring, 'the nav wiring line has moved — this guard needs updating, not deleting')
  for (const part of wiring[1].split(',')) {
    assert.match(part, /\[data-tab\]/, `"${part.trim()}" would wire buttons with no data-tab to showTab(undefined)`)
  }
})

test('the More button carries no data-tab, so it opens the panel instead of navigating', () => {
  const more = html.match(/<button id="btn-more"[^>]*>/)?.[0] ?? ''
  assert.ok(more, 'the More button is gone')
  assert.equal(/data-tab/.test(more), false, 'the More button must not look like a tab')
})

test('every area of the More panel has its own colour, and none of them means up or down', () => {
  const block = html.slice(html.indexOf('const GROUPS = ['), html.indexOf('const TAB = '))
  const titles = [...block.matchAll(/^\s*\['([^']+)',/gm)].map((m) => m[1])
  const hueLine = html.match(/^const AREA_HUE = \{(.*)\}$/m)?.[1] ?? ''
  const hues = Object.fromEntries([...hueLine.matchAll(/'([^']+)':'([a-z]+)'/g)].map((m) => [m[1], m[2]]))
  assert.ok(titles.length >= 4, `only parsed ${titles.length} groups`)
  for (const t of ['Home', ...titles]) assert.ok(hues[t], `the "${t}" area has no colour`)
  for (const h of Object.values(hues)) assert.ok(!/green|emerald|red|rose/.test(h), `"${h}" would read as up or down`)
  assert.equal(new Set(Object.values(hues)).size, Object.values(hues).length, 'two areas share a colour, so the colour no longer says where you are')
  for (const h of Object.values(hues)) assert.match(readFileSync(join(ROOT, 'web', 'css', 'app.css'), 'utf8'), new RegExp(`html\\[data-hue="${h}"\\]`), `no accent is defined for "${h}"`)
})

/**
 * THE TESTS THEMSELVES MUST BE TYPECHECKED.
 *
 * `tsconfig.json` used to include only `src/**` and `config.ts`, so all 553
 * tests were invisible to `tsc`. That is not a theoretical gap: changing
 * `attributionReport` to take a different argument type did not fail typecheck,
 * it failed at runtime — and a fixture in `test/factory/gate.test.ts` had been
 * building `pnlPercent` where `TradeLike` wants `pnlUsd`, hidden behind a cast,
 * for as long as the file has existed.
 *
 * A test suite the compiler never looks at drifts away from the code it is
 * meant to be testing, silently.
 */
test('the test suite is inside the typecheck, not outside it', () => {
  const raw = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8').replace(/\/\/.*$/gm, '')
  const cfg = JSON.parse(raw) as { include?: string[] }
  assert.ok(cfg.include, 'tsconfig has no include list')
  assert.ok(
    cfg.include!.some((p) => p.startsWith('test/')),
    `tsc only looks at ${cfg.include!.join(', ')} — the tests would not be typechecked`,
  )
})
