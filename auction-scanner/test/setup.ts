/**
 * Test preload — keeps every test process away from the real data directory.
 *
 * `node --test` runs each test file in its own child process, in parallel, and
 * this file is loaded first in each of them (`--import ./test/setup.ts`).
 * `src/store.ts` fixes its data directory the moment it is imported, from
 * GAVEL_DATA_DIR, so that variable must already point somewhere safe before
 * any test imports the store. Two test files writing the same watchlist.json
 * at once would corrupt each other, and a test must never touch the
 * watchlist, paper bids or settings a real person keeps in ./data.
 *
 * So: unless GAVEL_DATA_DIR already points inside the OS temp directory, a
 * fresh `gavel-test-*` directory is created under it and used for this
 * process only. It is removed on exit, best effort.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const tmpRoot = resolve(tmpdir())
const current = (process.env.GAVEL_DATA_DIR ?? '').trim()
const insideTmp = !!current && (resolve(current) === tmpRoot || resolve(current).startsWith(tmpRoot + sep))

if (!insideTmp) {
  const dir = mkdtempSync(join(tmpRoot, 'gavel-test-'))
  process.env.GAVEL_DATA_DIR = dir
  const cleanup = (): void => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort: a leftover temp dir is harmless */
    }
  }
  process.once('exit', cleanup)
}
