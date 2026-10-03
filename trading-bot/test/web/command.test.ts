/**
 * HOME COMMAND CENTER and the design tokens — guarded as source, the way
 * nav.test.ts guards navigation. The real screens are checked by ui:smoke.
 *
 *   1. The token file loads before app.css and is part of the offline shell.
 *   2. The Home layer only reads: it fetches five GET endpoints and has no
 *      path to a state-changing request.
 *   3. Every state it draws has a shape as well as a colour.
 *   4. Reduced motion stops every token duration.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../helpers.ts'

const web = (f: string) => readFileSync(join(ROOT, 'web', f), 'utf8')

test('tokens.css loads before app.css and is cached with the shell', () => {
  const html = web('index.html')
  const t = html.indexOf('href="/css/tokens.css"'), a = html.indexOf('href="/css/app.css"')
  assert.ok(t > 0 && a > t, 'tokens.css must be linked, and before app.css')
  assert.match(web('sw.js'), /'\/css\/tokens\.css'/)
})

test('the Home command center only reads', () => {
  const js = web('js/overview.js')
  for (const p of ['/api/overview', '/api/health', '/api/system', '/api/live/status', '/api/events']) assert.ok(js.includes(`'${p}'`), `reads ${p}`)
  assert.equal(/method\s*:/i.test(js), false, 'no request method other than the default GET')
  assert.equal(/x-mrcash-csrf|\.post\(|setTheme|localStorage/.test(js), false, 'no state-changing call')
})

test('every state is a word and a shape, not only a colour', () => {
  const css = web('css/app.css')
  for (const s of ['ok', 'warn', 'bad', 'info', 'idle']) assert.match(css, new RegExp(`\\.cc-g\\.s-${s}\\s*\\{`), `.cc-g.s-${s} has its own shape rule`)
  const js = web('js/overview.js')
  assert.match(js, /glyph\(s\)\}\$\{word\}/, 'desk states print a glyph and a word together')
})

test('reduced motion stops every token duration', () => {
  const css = web('css/tokens.css')
  const durations = [...css.matchAll(/(--dur-[a-z]+):\s*\d+ms/g)].map((m) => m[1])
  const reduced = css.slice(css.indexOf('prefers-reduced-motion'))
  assert.ok(durations.length >= 5)
  for (const d of new Set(durations)) assert.match(reduced, new RegExp(`${d}:\\s*0ms`), `${d} is zeroed under reduced motion`)
})
