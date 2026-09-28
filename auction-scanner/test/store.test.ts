/** Per-member scoping: two members never see each other's files; outside a scope nothing changes. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, adoptLegacyFiles, currentUser, listUserScopes, readJson, userFile, userId, withUser, writeJson } from '../src/store.ts'
import { addWatch, listWatch } from '../src/paper.ts'
import type { Listing } from '../src/types.ts'

const car = (id: string): Listing => ({ id, source: 'sample', externalId: id, url: '#sample', title: 'TEST FIXTURE car ' + id, titleStatus: 'clean', damage: 'none', saleType: 'auction', photos: [], kind: 'SAMPLE', fetchedAt: 0 })

test('userFile resolves into a hashed member folder only inside a scope', () => {
  assert.equal(userFile('a.json'), 'a.json')
  assert.equal(currentUser(), undefined)
  withUser('Ann@Example.com', () => {
    assert.equal(currentUser(), 'ann@example.com')
    assert.equal(userFile('a.json'), `users/${userId('ann@example.com')}/a.json`)
    assert.ok(!userFile('a.json').includes('ann'), 'the email never appears in a path')
  })
})

test('two members keep separate watchlists, and the scope survives an await', async () => {
  await withUser('ann@example.com', async () => {
    addWatch(car('a1'))
    await new Promise((r) => setTimeout(r, 5))
    addWatch(car('a2'))
  })
  withUser('bo@example.com', () => addWatch(car('b1')))
  assert.deepEqual(withUser('ann@example.com', () => listWatch().map((w) => w.listingId).sort()), ['a1', 'a2'])
  assert.deepEqual(withUser('bo@example.com', () => listWatch().map((w) => w.listingId)), ['b1'])
  assert.equal(listWatch().length, 0, 'the top level is untouched')
  const scopes = listUserScopes().map((u) => u.email).sort()
  assert.ok(scopes.includes('ann@example.com') && scopes.includes('bo@example.com'))
})

test('legacy top-level files move into the owner folder once, never over existing ones', () => {
  writeFileSync(join(DATA_DIR, 'targets.json'), JSON.stringify([{ id: 'legacy' }]))
  const moved = adoptLegacyFiles('legacy-owner')
  assert.deepEqual(moved, ['targets.json'])
  assert.ok(existsSync(join(DATA_DIR, 'targets.json.moved-to-owner')))
  assert.deepEqual(withUser('legacy-owner', () => readJson(userFile('targets.json'), [])), [{ id: 'legacy' }])
  writeFileSync(join(DATA_DIR, 'targets.json'), JSON.stringify([{ id: 'second' }]))
  assert.deepEqual(adoptLegacyFiles('legacy-owner'), [], 'an existing owner file is never overwritten')
  assert.deepEqual(JSON.parse(readFileSync(join(DATA_DIR, 'targets.json'), 'utf8')), [{ id: 'second' }])
  writeJson('targets.json', [])
})

test('sold prices: per member, most recent first, and only recent ones count', async () => {
  const { listSold, recentSold, removeSold, saveSold } = await import('../src/sold.ts')
  const { listingFromImport } = await import('../src/sources/importer.ts')
  const now = Date.UTC(2026, 8, 28)
  const recent = listingFromImport({ title: '2019 Porsche 911', soldUsd: 100_000, soldAt: '2026-06-01', lotNumber: 'A1' }, now)
  const old = listingFromImport({ title: '2019 Porsche 911', soldUsd: 80_000, soldAt: '2022-01-01', lotNumber: 'A2' }, now)
  await withUser('sold-a@example.com', async () => {
    saveSold([old, recent])
    assert.deepEqual(listSold().map((l) => l.id), [recent.id, old.id])
    assert.deepEqual(recentSold(listSold(), now).map((l) => l.id), [recent.id], 'a sale over two years old is kept but not counted')
  })
  await withUser('sold-b@example.com', async () => { assert.equal(listSold().length, 0) })
  await withUser('sold-a@example.com', async () => {
    assert.equal(removeSold(old.id), true)
    assert.equal(removeSold(old.id), false)
  })
})
