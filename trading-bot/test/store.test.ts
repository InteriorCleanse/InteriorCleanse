/**
 * The store: schema, the one-shot import of the old files, dedupe that
 * survives a reopen, event ids that keep climbing, and two processes
 * writing at the same time without losing a row.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tempDataDir, ROOT } from './helpers.ts'

const tmp = tempDataDir('mrcash-store-')
process.env.MRCASH_DATA_DIR = tmp.dir
after(() => tmp.cleanup())

function seedFlatFiles(dir: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'ledger.csv'), 'timestamp,symbol,action,price,quantity,reason,mode,outcome,pnl\n2026-01-15T13:30:00.000Z,BTCUSDT,BUY,100,1,"a reason, with a comma and ""quotes""",replay-raw,WIN,1.5\n2026-01-16T13:30:00.000Z,BTCUSDT,SKIP,101,0,K — memory said no,replay-memory,SKIPPED,0\n')
  writeFileSync(join(dir, 'learnings.md'), '# What the bot has learned\n\n- First lesson. <!-- key:K1 -->\n\n- Second lesson. <!-- key:K2 -->\n')
  writeFileSync(join(dir, 'positions.json'), JSON.stringify({ open: [{ id: 'p1', status: 'open', openedAt: 1000, direction: 'long', entry: 100, stop: 99, target: 102 }], closed: [{ id: 'p0', status: 'closed', openedAt: 500, closedAt: 900, direction: 'long', entry: 100, stop: 99, target: 102, exit: 102, rMultiple: 1.8, pnlUsd: 0.36 }] }))
  writeFileSync(join(dir, 'equity.csv'), 'timestamp,equity,rMultiple,setupKey\n2026-01-15T13:30:00.000Z,25.36,1.8,A|B|C\n')
  writeFileSync(join(dir, 'events.jsonl'), JSON.stringify({ id: 1, time: 1000, kind: 'info', title: 'old event', body: 'from the file', severity: 'info' }) + '\n' + 'not json\n')
  writeFileSync(join(dir, 'journal.jsonl'), JSON.stringify({ id: 'j1', tradeTime: 1000, direction: 'long', outcome: 'win', emotions: [], tags: [], execution: 3, followedPlan: true }) + '\n')
  writeFileSync(join(dir, 'goals.json'), JSON.stringify([{ id: 'g1', title: 'A goal', kind: 'manual', done: false }]))
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ dayKey: '2026-01-15', armedAt: 1, allow: 'long', riskPerTradePercent: 1, maxTrades: 2, notes: '', proposal: '' }))
  writeFileSync(join(dir, 'orderflow.csv'), 'timestamp,price,bidUsd1pct,askUsd1pct,imbalance,walls,trades,tradesPerMinute,buyShare,deltaUsd,bigBuys,bigSells\n2026-01-15T13:30:00.000Z,100.00,5000,4000,0.556,b99:5000,1000,60.0,0.550,20000,2,1\n')
}

test('a fresh store imports every flat file once and records what it did', async () => {
  seedFlatFiles(tmp.dir)
  const { Store, DB_PATH } = await import('../src/store.ts')
  const s = new Store(DB_PATH)
  const m = s.migration()
  assert.ok(m, 'a migration report exists')
  assert.deepEqual(m!.imported, { 'ledger.csv': 2, 'learnings.md': 2, 'positions.json': 2, 'equity.csv': 1, 'events.jsonl': 1, 'journal.jsonl': 1, 'goals.json': 1, 'plan.json': 1, 'orderflow.csv': 1 })
  assert.deepEqual(m!.skipped, ['news-cache.json'])
  const rows = s.readLedger()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].reason, 'a reason, with a comma and "quotes"')
  assert.equal(rows[0].pnl, 1.5)
  assert.equal(s.lessons().length, 2)
  assert.equal(s.positions('open').length, 1)
  assert.equal(s.positions('closed').length, 1)
  assert.equal(s.equityCurve()[0].setupKey, 'A|B|C')
  assert.equal(s.recentEvents(10).length, 1)
  assert.equal(s.journalAll().length, 1)
  assert.equal((s.getJson<unknown[]>('goals') ?? []).length, 1)
  assert.equal(s.getJson<{ allow: string }>('plan')?.allow, 'long')
  assert.equal(s.flowLog(10)[0].deltaUsd, 20000)
  assert.equal(s.integrity(), 'ok')
  s.close()
  assert.equal(existsSync(join(tmp.dir, 'ledger.csv')), true, 'the original file is untouched')
})

test('reopening the same file does not import again, and dedupe keys survive the reopen', async () => {
  const { Store, DB_PATH } = await import('../src/store.ts')
  const a = new Store(DB_PATH)
  assert.equal(a.readLedger().length, 2, 'no second import')
  assert.equal(a.announceOnce('sweep-1'), true)
  assert.equal(a.announceOnce('sweep-1'), false)
  const id1 = a.appendEvent({ time: 2000, kind: 'sweep', title: 'x', body: 'y', severity: 'warn' })
  a.close()
  const b = new Store(DB_PATH)
  assert.equal(b.announceOnce('sweep-1'), false, 'still known after a reopen')
  const id2 = b.appendEvent({ time: 3000, kind: 'sweep', title: 'x2', body: 'y', severity: 'warn' })
  assert.ok(id2 > id1, 'ids keep climbing')
  assert.deepEqual(b.recentEvents(2).map((e) => e.id), [id1, id2])
  b.close()
})

test('the memory module reads from the store and keeps the CSV export in step', async () => {
  const m = await import('../src/memory.ts')
  assert.equal(m.readLedger().length, 2)
  m.appendLedgerRow({ timestamp: '2026-01-17T13:30:00.000Z', symbol: 'BTCUSDT', action: 'SELL', price: 99, quantity: 1, reason: 'third', mode: 'test', outcome: 'LOSS', pnl: -1 })
  assert.equal(m.readLedger().length, 3)
  assert.match(readFileSync(m.LEDGER_PATH, 'utf8'), /third/)
  assert.equal(m.addLesson('K1', 'First lesson.'), false, 'imported lessons are already on file')
  assert.deepEqual(m.lessonLines(), ['First lesson.', 'Second lesson.'])
  assert.match(m.readLearnings(), /<!-- key:K2 -->/)
})

test('two processes appending at the same time lose nothing and the file stays consistent', async () => {
  const m = await import('../src/memory.ts')
  m.resetMemory()
  const run = (label: string) => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ['test/fixtures/append-worker.ts', label, '300'], { cwd: ROOT, env: { ...process.env, MRCASH_DATA_DIR: tmp.dir }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; let err = ''
    child.stdout.on('data', (d) => { out += String(d) }); child.stderr.on('data', (d) => { err += String(d) })
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${label} exited ${code}: ${err}`))))
  })
  await Promise.all([run('A'), run('B')])
  const rows = m.readLedger()
  assert.equal(rows.length, 600)
  assert.equal(rows.filter((r) => r.reason.startsWith('A ')).length, 300)
  assert.equal(rows.filter((r) => r.reason.startsWith('B ')).length, 300)
  const { store } = await import('../src/store.ts')
  assert.equal(store().integrity(), 'ok')
  assert.equal(readFileSync(m.LEDGER_PATH, 'utf8').trim().split('\n').length, 601, 'the CSV export has every row too')
})
