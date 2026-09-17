/**
 * TEST PRELOAD — every test process gets its own data directory, automatically.
 *
 * Loaded via `node --test --import ./test/setup.ts`, so this runs BEFORE any
 * test file (and therefore before any module that captures `DATA_DIR`) in every
 * test process.
 *
 * WHY THIS EXISTS, RATHER THAN A RULE EACH FILE HAS TO REMEMBER
 *
 * `node --test` runs test files in parallel, and `DATA_DIR` is a top-level const
 * read once at import time (`src/store.ts`). Any file that loaded a
 * store-touching module without first pointing `MRCASH_DATA_DIR` somewhere
 * temporary bound itself to the SHARED default database, then raced every other
 * file doing the same — SQLite answers that with
 * `ERR_SQLITE_ERROR: database is locked`.
 *
 * That bug is invisible locally: it depends on core count and scheduling. Three
 * test files did exactly this, passed every local run, and then failed ten tests
 * on CI the moment an unrelated file shifted the timing. And while they
 * "passed", they were reading and writing the developer's real `data/` folder.
 *
 * The per-file fix (assign the env var, then dynamically import) works but has
 * to be remembered every time, and a single static import silently defeats it
 * through hoisting. Doing it here instead makes the safe thing the default and
 * removes the whole class of mistake.
 *
 * A file that wants its own directory can still set `MRCASH_DATA_DIR` itself —
 * this defers to anything already set.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (!process.env.MRCASH_DATA_DIR) {
  const dir = mkdtempSync(join(tmpdir(), 'mrcash-test-'))
  process.env.MRCASH_DATA_DIR = dir
  // Best-effort cleanup. A leftover temp directory is a tidiness problem, never
  // a correctness one, so failing to remove it must not fail the run.
  process.on('exit', () => {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* the OS will reap it */ }
  })
}
