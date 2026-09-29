/**
 * Tests for src/sources/normalize.ts — the parsers that turn what a site says
 * into what Gavel stores. Every ambiguous input must come back 'unknown' or
 * undefined, never a guess. Offline; no fixtures beyond the strings here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalMake, isKnownMake, looksLikeVin, parseDamage, parseMileage, parseMoney, parseTitleStatus, splitTitle } from '../src/sources/normalize.ts'

test('parseTitleStatus reads the common phrasings and never guesses', () => {
  assert.equal(parseTitleStatus('Clean'), 'clean')
  assert.equal(parseTitleStatus('Clear title in hand'), 'clean')
  assert.equal(parseTitleStatus('Salvage Title'), 'salvage')
  assert.equal(parseTitleStatus('Total loss'), 'salvage')
  assert.equal(parseTitleStatus('Rebuilt'), 'rebuilt')
  assert.equal(parseTitleStatus('Prior salvage, now reconstructed'), 'rebuilt')
  assert.equal(parseTitleStatus('Flood damage'), 'flood')
  assert.equal(parseTitleStatus('Manufacturer buyback (lemon)'), 'lemon')
  assert.equal(parseTitleStatus('Parts only'), 'parts-only')
  assert.equal(parseTitleStatus('Certificate of Destruction'), 'parts-only')
  assert.equal(parseTitleStatus('TX - CLEAR'), 'clean', 'Copart and IAA write a clean title as CLEAR')
  assert.equal(parseTitleStatus('CA - SALVAGE CERTIFICATE (CLEAR)'), 'salvage', 'a worse word always wins')
  assert.equal(parseTitleStatus('Title unclear'), 'unknown')
  assert.equal(parseTitleStatus('Blue'), 'unknown')
  assert.equal(parseTitleStatus(''), 'unknown')
  assert.equal(parseTitleStatus(undefined), 'unknown')
})

test('parseDamage grades from none to severe, unknown when silent', () => {
  assert.equal(parseDamage('No damage'), 'none')
  assert.equal(parseDamage('Excellent condition'), 'none')
  assert.equal(parseDamage('Minor scratches on the bumper'), 'minor')
  assert.equal(parseDamage('Small dent, cosmetic only'), 'minor')
  assert.equal(parseDamage('Front end collision'), 'moderate')
  assert.equal(parseDamage('Hail'), 'moderate')
  assert.equal(parseDamage('Rollover'), 'severe')
  assert.equal(parseDamage('Airbags deployed'), 'severe')
  assert.equal(parseDamage('Used'), 'unknown')
  assert.equal(parseDamage(''), 'unknown')
  assert.equal(parseDamage(undefined), 'unknown')
})

test('parseMileage handles numbers, commas, k and words', () => {
  assert.equal(parseMileage(45_000), 45_000)
  assert.equal(parseMileage(45_000.6), 45_001)
  assert.equal(parseMileage('45,210 miles'), 45_210)
  assert.equal(parseMileage('45k'), 45_000)
  assert.equal(parseMileage('12.5k mi'), 12_500)
  assert.equal(parseMileage('n/a'), undefined)
  assert.equal(parseMileage(''), undefined)
  assert.equal(parseMileage(undefined), undefined)
  assert.equal(parseMileage(-5), undefined)
  assert.equal(parseMileage(Number.NaN), undefined)
})

test('parseMoney reads dollars with symbols and commas', () => {
  assert.equal(parseMoney('$12,500.00'), 12_500)
  assert.equal(parseMoney('12500'), 12_500)
  assert.equal(parseMoney(12_500), 12_500)
  assert.equal(parseMoney('Call for price'), undefined)
  assert.equal(parseMoney(''), undefined)
  assert.equal(parseMoney(undefined), undefined)
  assert.equal(parseMoney(Number.POSITIVE_INFINITY), undefined)
})

test('splitTitle pulls year, make and a short model out of a listing title', () => {
  assert.deepEqual(splitTitle('2016 Porsche 911 Carrera S'), { year: 2016, make: 'Porsche', model: '911 Carrera' })
  assert.deepEqual(splitTitle('2014 Mercedes-Benz E350 Sport'), { year: 2014, make: 'Mercedes-Benz', model: 'E350 Sport' })
  assert.deepEqual(splitTitle('2015 Land Rover Range Rover Sport'), { year: 2015, make: 'Land Rover', model: 'Range Rover' })
  assert.deepEqual(splitTitle('  2019 Toyota Camry'), { year: 2019, make: 'Toyota', model: 'Camry' })
  assert.deepEqual(splitTitle('Porsche 911 (no year)'), {})
  assert.deepEqual(splitTitle('1949 Ford Coupe'), {}, 'years before 1950 are not parsed')
  assert.deepEqual(splitTitle(''), {})
})

test('looksLikeVin accepts 17 characters without I, O or Q and nothing else', () => {
  assert.equal(looksLikeVin('WP0AB2A99ES123456'), true)
  assert.equal(looksLikeVin('wp0ab2a99es123456'), true, 'case does not matter')
  assert.equal(looksLikeVin('WP0AB2A99ES12345'), false, '16 characters')
  assert.equal(looksLikeVin('WP0AB2A99ES1234567'), false, '18 characters')
  assert.equal(looksLikeVin('WP0AB2A99ES12345I'), false, 'the letter I is never in a VIN')
  assert.equal(looksLikeVin('WP0AB2A99ES12345O'), false, 'nor O')
  assert.equal(looksLikeVin('WP0AB2A99ES12345Q'), false, 'nor Q')
  assert.equal(looksLikeVin(''), false)
  assert.equal(looksLikeVin(undefined), false)
  // A SAMPLE VIN has the right shape on purpose; decodeVin refuses it separately.
  assert.equal(looksLikeVin('SAMPLE00000000001'), true)
})

test('canonicalMake: one spelling per make, nicknames included, unknown makes left readable', () => {
  assert.equal(canonicalMake('Chevy'), 'Chevrolet')
  assert.equal(canonicalMake('CHEVROLET'), 'Chevrolet')
  assert.equal(canonicalMake('vw'), 'Volkswagen')
  assert.equal(canonicalMake('mercedes'), 'Mercedes-Benz')
  assert.equal(canonicalMake('bmw'), 'BMW')
  assert.equal(canonicalMake('INTERNATIONAL'), 'International')
  assert.equal(canonicalMake(''), undefined)
  assert.equal(isKnownMake('Chevy'), true)
  assert.equal(isKnownMake('Beechcraft'), false)
})
