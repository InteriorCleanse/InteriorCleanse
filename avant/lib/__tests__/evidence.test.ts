import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildManifest, coverage, current, sha256Hex, verifyManifest, type EvidenceMeta } from '../evidence.ts'

const photo = (over: Partial<EvidenceMeta>): EvidenceMeta => ({
  id: 'p',
  tripId: 't1',
  phase: 'check-in',
  angle: 'front',
  capturedAt: '2026-10-01T10:00:00.000Z',
  sha256: 'a'.repeat(64),
  bytes: 1000,
  width: 1600,
  height: 1200,
  type: 'image/jpeg',
  ...over,
})

describe('sha256Hex', () => {
  it('matches the known digest of "abc"', async () => {
    assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('coverage and current', () => {
  it('reports missing angles per phase', () => {
    const c = coverage([photo({ angle: 'front' }), photo({ angle: 'rear' }), photo({ phase: 'check-out', angle: 'left' })], 'check-in')
    assert.deepEqual(c.done, ['front', 'rear'])
    assert.equal(c.complete, false)
    assert.ok(c.missing.includes('dash'))
  })
  it('keeps only the newest retake of each angle', () => {
    const older = photo({ id: 'a', capturedAt: '2026-10-01T10:00:00.000Z' })
    const newer = photo({ id: 'b', capturedAt: '2026-10-01T10:05:00.000Z' })
    assert.deepEqual(current([newer, older]).map((p) => p.id), ['b'])
  })
})

describe('manifest', () => {
  it('is order-independent and verifies', async () => {
    const a = photo({ angle: 'front', sha256: '1'.repeat(64) })
    const b = photo({ angle: 'rear', sha256: '2'.repeat(64) })
    const m1 = await buildManifest('t1', [a, b], 'x')
    const m2 = await buildManifest('t1', [b, a], 'y')
    assert.equal(m1.digest, m2.digest)
    assert.equal(await verifyManifest(m1), true)
  })
  it('detects any edit, and ignores other trips', async () => {
    const m = await buildManifest('t1', [photo({}), photo({ tripId: 't2', angle: 'rear' })])
    assert.equal(m.photos.length, 1)
    const edited = { ...m, photos: [{ ...m.photos[0], capturedAt: '2026-09-30T10:00:00.000Z' }] }
    assert.equal(await verifyManifest(edited), false)
  })
})
