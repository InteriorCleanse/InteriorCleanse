/**
 * RESEARCH TOOLS — the candle exporter, the Python research bench and the
 * skills that drive it. The bench is walled off from the bot, and the skills
 * say the rules out loud.
 *
 * SYNTHETIC / TEST FIXTURE: the candles written below are made up.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseArgs, toCsv } from '../../scripts/research-export.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')
const NEVER_SAY = /\b(profitable|proven|guaranteed?|superior|best)\b|edge established|expected return/i

test('exporter arguments are validated', () => {
  const a = parseArgs(['--symbol', 'ethusdt', '--interval', '1h', '--db', '/x.db'])
  assert.deepEqual([a.symbol, a.interval, a.db, a.out], ['ETHUSDT', '1h', '/x.db', null])
  assert.equal(parseArgs([]).symbol, 'BTCUSDT')
  assert.throws(() => parseArgs(['--symbol', '../etc']), /Not a symbol/)
  assert.throws(() => parseArgs(['--interval', '5 minutes']), /Not an interval/)
})

test('CSV: header, one row per candle, no field can break a column', () => {
  const csv = toCsv([{ openTime: 1, open: 2, high: 3, low: 1, close: 2.5, volume: 10, source: 'SYNTHETIC, test\nfixture' }])
  const lines = csv.trim().split('\n')
  assert.equal(lines[0], 'open_time_ms,open,high,low,close,volume,source')
  assert.equal(lines.length, 2)
  assert.equal(lines[1].split(',').length, 7)
})

test('exporter reads the database read-only and writes exactly what was stored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-'))
  const dbPath = join(dir, 'mrcash.db')
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE candles (symbol TEXT NOT NULL, interval TEXT NOT NULL, open_time INTEGER NOT NULL, close_time INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, source TEXT NOT NULL, PRIMARY KEY (symbol, interval, open_time))')
  const ins = db.prepare('INSERT INTO candles VALUES (?,?,?,?,?,?,?,?,?,?)')
  ins.run('TSTUSDT', '5m', 600_000, 899_999, 2, 3, 1, 2.5, 7, 'SYNTHETIC')
  ins.run('TSTUSDT', '5m', 300_000, 599_999, 1, 2, 0.5, 2, 5, 'SYNTHETIC')
  ins.run('TSTUSDT', '1h', 0, 3_599_999, 9, 9, 9, 9, 9, 'SYNTHETIC')
  db.close()
  const before = statSync(dbPath).mtimeMs
  const out = join(dir, 'out.csv')
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'research-export.ts'), '--symbol', 'TSTUSDT', '--interval', '5m', '--db', dbPath, '--out', out], { stdio: 'pipe' })
  assert.deepEqual(readFileSync(out, 'utf8').trim().split('\n').slice(1), ['300000,1,2,0.5,2,5,SYNTHETIC', '600000,2,3,1,2.5,7,SYNTHETIC'], 'in time order, one interval only')
  assert.equal(statSync(dbPath).mtimeMs, before, 'the database was not written')
  const src = read('scripts', 'research-export.ts')
  assert.match(src, /readOnly:\s*true/)
  assert.doesNotMatch(src, /\bfetch\(|INSERT|UPDATE|DELETE/i, 'no network, no writes')
})

test('the bot never imports the research bench', () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])
  for (const f of walk(join(ROOT, 'src')).filter((f) => f.endsWith('.ts'))) {
    const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(/(?:from|import\()\s*['"](\.[^'"]+)['"]/g)) {
      const target = resolve(dirname(f), m[1])
      assert.ok(!target.startsWith(join(ROOT, 'research')) && !target.startsWith(join(ROOT, 'scripts')), `${f} must not import ${m[1]}`)
    }
    assert.doesNotMatch(s, /vectorbt|hftbacktest/i, `${f} must not mention the Python libraries`)
  }
})

test('research scripts label their output and keep SYNTHETIC data to the selftests', () => {
  const vbt = read('research', 'vbt_sweep.py'), hbt = read('research', 'hbt_mm.py')
  for (const s of [vbt, hbt]) { assert.match(s, /BACKTEST/); assert.match(s, /SYNTHETIC/) }
  assert.match(vbt, /NOT ENOUGH DATA/)
  assert.match(vbt, /out_of_sample/)
  assert.match(vbt, /combinations_tried/)
  assert.doesNotMatch(hbt, /connector|api_key|secret/i, 'no live connector, no keys')
  assert.match(read('research', '.gitignore'), /data\//)
  assert.match(read('research', 'requirements-vectorbt.txt'), /vectorbt==/)
  assert.match(read('research', 'requirements-hftbacktest.txt'), /hftbacktest==/)
})

test('the four skills exist, stay within the rules, and use no profitability language', () => {
  const skills = ['vectorbt-research', 'hftbacktest-research', 'market-making-study', 'mr-cash-morning-filings']
  for (const s of skills) {
    const p = join(ROOT, '.claude', 'skills', s, 'SKILL.md')
    assert.ok(existsSync(p), `${s} installed`)
    const body = readFileSync(p, 'utf8')
    assert.match(body, new RegExp(`^---\\nname: ${s}\\ndescription: .+\\n---`), `${s} has frontmatter`)
    assert.doesNotMatch(body.replace(/No profitability language:?[^\n]*(\n[^\n]+)*/gi, ''), NEVER_SAY, `${s} makes no profitability claim`)
    assert.match(body, /never|must not|do not/i, `${s} states what it must not do`)
  }
  const body = (s: string) => read('.claude', 'skills', s, 'SKILL.md')
  assert.match(body('vectorbt-research'), /BACKTEST/)
  assert.match(body('hftbacktest-research'), /live connector|connect to a live exchange/i)
  assert.match(body('market-making-study'), /Do not build, run or wire a live market maker/)
  assert.match(body('mr-cash-morning-filings'), /\/api\/bigmoney/)
  assert.match(body('mr-cash-morning-filings'), /places nothing|Place, stage or suggest sizing for any order/i)
  const listed = read('.claude', 'skills', 'THIRD_PARTY_SKILLS.md')
  for (const s of skills) assert.match(listed, new RegExp('`' + s + '`'))
})
