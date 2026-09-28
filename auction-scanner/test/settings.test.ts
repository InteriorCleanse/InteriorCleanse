/**
 * Tests for src/settings.ts — validation and merging. Runs against the temp
 * data directory that test/setup.ts provides, never ./data.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultSettings, getSettings, updateSettings } from '../src/settings.ts'
import { writeJson } from '../src/store.ts'
import { config } from '../config.ts'

test('defaults come from config.starter, samples on, everything else empty', () => {
  const d = defaultSettings()
  assert.deepEqual(d.starter, {
    cleanTitleOnly: config.starter.cleanTitleOnly,
    maxDamage: config.starter.maxDamage,
    mustRunAndDrive: config.starter.mustRunAndDrive,
    maxPriceUsd: config.starter.maxPriceUsd,
    maxMileage: config.starter.maxMileage,
    minYear: config.starter.minYear,
  })
  assert.equal(d.allowSample, true)
  assert.deepEqual(d.demandExtra, [])
  assert.deepEqual(d.feeOverrides, {})
  assert.equal(d.homeState, undefined)
  assert.equal(d.homeZip, undefined)
  assert.deepEqual(getSettings(), d, 'with no file saved, getSettings is the defaults')
})

test('updateSettings applies a partial patch, keeps the rest, persists, ignores unknown keys', () => {
  const s = updateSettings({ starter: { maxPriceUsd: 25_000 }, homeState: 'tx', bogus: 'ignored', allowSample: false })
  assert.equal(s.starter.maxPriceUsd, 25_000)
  assert.equal(s.starter.minYear, config.starter.minYear, 'untouched starter keys keep their value')
  assert.equal(s.starter.cleanTitleOnly, config.starter.cleanTitleOnly)
  assert.equal(s.homeState, 'TX', 'state codes are upper-cased')
  assert.equal(s.allowSample, false)
  assert.equal('bogus' in s, false)
  assert.deepEqual(getSettings(), s, 'persisted')

  const again = updateSettings({ homeZip: '75201', feeOverrides: { copart: 12.5, 'cars and bids': 5 }, demandExtra: [{ make: ' Toyota ', models: ['Land Cruiser', ' '], tier: 'holds-value', why: 'Lasts a long time.' }] })
  assert.equal(again.homeZip, '75201')
  assert.equal(again.homeState, 'TX', 'earlier keys survive a later patch')
  assert.deepEqual(again.feeOverrides, { copart: 12.5, 'cars and bids': 5 })
  assert.deepEqual(again.demandExtra, [{ make: 'Toyota', models: ['Land Cruiser'], tier: 'holds-value', why: 'Lasts a long time.' }])

  const cleared = updateSettings({ homeState: '', homeZip: null })
  assert.equal(cleared.homeState, undefined)
  assert.equal(cleared.homeZip, undefined)
  assert.equal(getSettings().homeState, undefined)
})

test('updateSettings rejects bad values with a plain reason and saves nothing', () => {
  const before = getSettings()
  const bad: Array<[unknown, RegExp]> = [
    ['not an object', /object/],
    [{ starter: { maxPriceUsd: 0 } }, /maxPriceUsd/],
    [{ starter: { maxPriceUsd: 5_000_001 } }, /maxPriceUsd/],
    [{ starter: { maxPriceUsd: '60000' } }, /maxPriceUsd must be a number/],
    [{ starter: { maxMileage: -1 } }, /maxMileage/],
    [{ starter: { maxMileage: 500_001 } }, /maxMileage/],
    [{ starter: { minYear: 1949 } }, /minYear/],
    [{ starter: { minYear: 2051 } }, /minYear/],
    [{ starter: { maxDamage: 'total' } }, /maxDamage/],
    [{ starter: { cleanTitleOnly: 'yes' } }, /cleanTitleOnly/],
    [{ starter: { mustRunAndDrive: 1 } }, /mustRunAndDrive/],
    [{ starter: 'loose' }, /starter/],
    [{ allowSample: 'yes' }, /allowSample/],
    [{ homeState: 'Texas' }, /two-letter/],
    [{ homeState: 'T1' }, /two-letter/],
    [{ homeZip: '7520' }, /ZIP/],
    [{ homeZip: 75201 }, /ZIP/],
    [{ feeOverrides: { copart: 31 } }, /feeOverrides\.copart/],
    [{ feeOverrides: { copart: -1 } }, /feeOverrides\.copart/],
    [{ feeOverrides: { copart: 'ten' } }, /feeOverrides\.copart/],
    [{ feeOverrides: [] }, /feeOverrides/],
    [{ demandExtra: 'Porsche' }, /demandExtra/],
    [{ demandExtra: [{ make: '', models: [], tier: 'rental', why: 'x' }] }, /make/],
    [{ demandExtra: [{ make: 'Porsche', models: 'all', tier: 'rental', why: 'x' }] }, /models/],
    [{ demandExtra: [{ make: 'Porsche', models: [], tier: 'exotic', why: 'x' }] }, /tier/],
    [{ demandExtra: [{ make: 'Porsche', models: [], tier: 'supercar', why: '' }] }, /why/],
  ]
  for (const [patch, re] of bad) {
    assert.throws(() => updateSettings(patch), re, `expected ${JSON.stringify(patch)} to be rejected`)
  }
  assert.deepEqual(getSettings(), before, 'nothing changed')
})

test('getSettings merges a saved file over the defaults and ignores a corrupt value', () => {
  writeJson('settings.json', { allowSample: false, starter: { maxPriceUsd: 'lots', minYear: 2012 }, homeState: 'ca', feeOverrides: { iaa: 99 }, unknownKey: true })
  const s = getSettings()
  assert.equal(s.allowSample, false)
  assert.equal(s.starter.minYear, 2012)
  assert.equal(s.starter.maxPriceUsd, config.starter.maxPriceUsd, 'a corrupt saved value falls back to the default')
  assert.equal(s.starter.maxDamage, config.starter.maxDamage, 'a missing saved key appears from the defaults')
  assert.equal(s.homeState, 'CA')
  assert.deepEqual(s.feeOverrides, {}, 'an out-of-range saved override is dropped')
  assert.deepEqual(s.demandExtra, [])
  assert.equal('unknownKey' in s, false)

  writeJson('settings.json', 'garbage')
  assert.deepEqual(getSettings(), defaultSettings(), 'a file that is not an object is ignored')
})

test('cash for one car: a dollar amount from $500, cleared with null', () => {
  assert.equal(updateSettings({ cashUsd: 15_000 }).cashUsd, 15_000)
  assert.equal(getSettings().cashUsd, 15_000)
  assert.throws(() => updateSettings({ cashUsd: 20 }), /cashUsd/)
  assert.throws(() => updateSettings({ cashUsd: '15000' }), /cashUsd/)
  assert.equal(updateSettings({ cashUsd: null }).cashUsd, undefined)
})
