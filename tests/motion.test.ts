import { describe, expect, it } from 'vitest'
import { clamp, normalisePointer, parallaxOffset, prefersReducedMotion, tiltFor } from '@/lib/motion'

/**
 * The motion arithmetic. Decoration that can walk off the page or jitter is
 * a bug like any other, and these are the numbers that would cause it.
 */

describe('clamp', () => {
  it('bounds a value and treats garbage as the minimum', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
    expect(clamp(NaN, 0, 3)).toBe(0)
    expect(clamp(Infinity, -1, 1)).toBe(-1)
  })
})

describe('normalisePointer', () => {
  const viewport = { width: 1000, height: 500 }

  it('maps the centre to zero and the corners to ±1', () => {
    expect(normalisePointer({ x: 500, y: 250 }, viewport)).toEqual({ x: 0, y: 0 })
    expect(normalisePointer({ x: 0, y: 0 }, viewport)).toEqual({ x: -1, y: -1 })
    expect(normalisePointer({ x: 1000, y: 500 }, viewport)).toEqual({ x: 1, y: 1 })
  })

  it('never leans past the edge, and not at all without a viewport', () => {
    expect(normalisePointer({ x: 5000, y: -900 }, viewport)).toEqual({ x: 1, y: -1 })
    expect(normalisePointer({ x: 10, y: 10 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 })
  })
})

describe('parallaxOffset', () => {
  it('moves a layer against the scroll in proportion to its depth', () => {
    expect(parallaxOffset({ depth: 0.5 }, 200)).toEqual({ x: 0, y: -100 })
    expect(parallaxOffset({ depth: 0 }, 200)).toEqual({ x: 0, y: 0 })
    expect(parallaxOffset({ depth: -0.25 }, 200)).toEqual({ x: 0, y: 50 })
  })

  it('caps the scroll contribution so a long page cannot push a layer away', () => {
    expect(parallaxOffset({ depth: 1, maxScroll: 300 }, 10_000)).toEqual({ x: 0, y: -300 })
  })

  it('adds the pointer lean on both axes', () => {
    expect(parallaxOffset({ depth: 0, lean: 20 }, 0, { x: 1, y: -0.5 })).toEqual({ x: 20, y: -10 })
  })

  it('clamps an absurd depth or lean instead of flinging the layer', () => {
    const { y } = parallaxOffset({ depth: 50, lean: 9_999 }, 100, { x: 1, y: 1 })
    expect(Math.abs(y)).toBeLessThanOrEqual(2 * 100 + 200)
    expect(parallaxOffset({ depth: NaN }, NaN)).toEqual({ x: 0, y: 0 })
  })
})

describe('tiltFor', () => {
  const rect = { left: 100, top: 100, width: 200, height: 100 }

  it('is flat at the centre and tips toward the pointer at the edges', () => {
    expect(tiltFor({ x: 200, y: 150 }, rect)).toEqual({ rotateX: 0, rotateY: 0 })
    // Pointer at the right edge: the card turns so its right side comes forward.
    expect(tiltFor({ x: 300, y: 150 }, rect).rotateY).toBe(6)
    // Pointer at the top edge: the top dips toward the pointer.
    expect(tiltFor({ x: 200, y: 100 }, rect).rotateX).toBe(6)
  })

  it('never exceeds the maximum and resets without a pointer', () => {
    expect(tiltFor({ x: 9_999, y: -9_999 }, rect, 4)).toEqual({ rotateX: 4, rotateY: 4 })
    expect(tiltFor(null, rect)).toEqual({ rotateX: 0, rotateY: 0 })
    expect(tiltFor({ x: 1, y: 1 }, { ...rect, width: 0 })).toEqual({ rotateX: 0, rotateY: 0 })
  })
})

describe('prefersReducedMotion', () => {
  it('is false on the server rather than throwing', () => {
    expect(prefersReducedMotion()).toBe(false)
  })
})
