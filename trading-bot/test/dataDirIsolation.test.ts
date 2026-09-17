/**
 * TEST ISOLATION — no test may touch the developer's real data directory.
 *
 * THE BUG THIS EXISTS TO PREVENT
 *
 * `node --test` runs test files in parallel, and `DATA_DIR` is a top-level const
 * read once at import time (`src/store.ts`). A file that loaded a store-touching
 * module without first pointing `MRCASH_DATA_DIR` somewhere temporary bound
 * itself to the SHARED default database and raced every other file doing the
 * same. SQLite answers that race with `ERR_SQLITE_ERROR: database is locked`.
 *
 * It is a nasty failure because it is INVISIBLE LOCALLY — it depends on core
 * count and scheduling. Three intel test files did exactly this, passed every
 * local run, and then failed ten tests on CI the moment an unrelated file was
 * added and shifted the timing. While they "passed" they were also reading and
 * writing the real `data/` folder.
 *
 * THE FIX, AND WHY IT IS A PRELOAD RATHER THAN A RULE
 *
 * The per-file remedy (assign the env var, then dynamically import) works but
 * must be remembered every single time, and one ordinary static import silently
 * defeats it through hoisting. An earlier version of this guard tried to police
 * that statically and was both over-strict (flagging files that import a module
 * which merely *could* reach the store) and under-strict (it missed
 * `paper/metrics.ts`, which became store-touching the moment it imported
 * `paperTrader` for the shared outcome reader).
 *
 * So the isolation is done once, centrally, in `test/setup.ts`, loaded through
 * `node --test --import`. These tests guard that arrangement instead of trying
 * to re-derive it per file.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR } from '../src/store.ts'

const TEST_ROOT = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(TEST_ROOT, '..')

test('the running test process is NOT pointed at the repository data directory', () => {
  const repoData = join(ROOT, 'data')
  assert.notEqual(DATA_DIR, repoData, 'this test process would read and write the real data/ folder')
  assert.ok(process.env.MRCASH_DATA_DIR, 'MRCASH_DATA_DIR must be set for every test process')
  assert.equal(
    DATA_DIR.startsWith(repoData), false,
    `DATA_DIR resolved inside the repo (${DATA_DIR}) — the preload did not run, so this process is racing the shared database`,
  )
})

test('the test scripts load the isolation preload', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  for (const name of ['test', 'check']) {
    assert.match(
      pkg.scripts[name], /--import \.\/test\/setup\.ts/,
      `npm run ${name} must preload test/setup.ts, or test files will bind to the shared database before any of them can isolate themselves`,
    )
  }
})

test('the preload defers to a file that wants its own directory', () => {
  // Several files still set MRCASH_DATA_DIR themselves (they want a dir they can
  // wipe mid-test). The preload must not override that, or those tests would
  // silently share one directory.
  const setup = readFileSync(join(TEST_ROOT, 'setup.ts'), 'utf8')
  assert.match(setup, /if \(!process\.env\.MRCASH_DATA_DIR\)/, 'the preload must only fill in a directory when none was chosen')
})
