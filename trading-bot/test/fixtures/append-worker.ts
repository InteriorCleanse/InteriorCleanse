// A worker the concurrency test spawns: appends N ledger rows as fast as it can.
// Usage: MRCASH_DATA_DIR=<dir> node test/fixtures/append-worker.ts <label> <count>
const [label, countArg] = process.argv.slice(2)
const { appendLedgerRow } = await import('../../src/memory.ts')
const n = Number(countArg)
for (let i = 0; i < n; i++) {
  appendLedgerRow({ timestamp: new Date(i).toISOString(), symbol: 'BTCUSDT', action: 'BUY', price: i, quantity: 1, reason: `${label} row ${i}, with a comma`, mode: 'test', outcome: 'WIN', pnl: 0 })
}
process.stdout.write(`${label} done\n`)
