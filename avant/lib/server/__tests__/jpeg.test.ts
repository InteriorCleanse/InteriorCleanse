import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jpegSize } from '../jpeg.ts'

/** A minimal JPEG header: SOI, an APP0 segment, then a SOF0 frame header. */
function fakeJpeg(width: number, height: number, sof = 0xc0): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, sof, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xd9,
  ])
}

describe('jpegSize', () => {
  it('reads baseline and progressive frame sizes', () => {
    assert.deepEqual(jpegSize(fakeJpeg(1600, 1200)), { width: 1600, height: 1200 })
    assert.deepEqual(jpegSize(fakeJpeg(800, 600, 0xc2)), { width: 800, height: 600 })
  })
  it('rejects anything that is not a JPEG', () => {
    assert.equal(jpegSize(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
    assert.equal(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), null, 'PNG')
    assert.equal(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null, 'no frame')
    assert.equal(jpegSize(fakeJpeg(1600, 1200).slice(0, 24)), null, 'truncated')
  })
})
