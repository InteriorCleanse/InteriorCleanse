import { describe, expect, it } from 'vitest'
import { foldToTop, SERIES_DARK, SERIES_LIGHT, SERIES_SLOTS, seriesVar } from '@/lib/charts/palette'

describe('seriesVar', () => {
  it('returns a usable CSS colour, not a bare RGB triplet', () => {
    // Regression: returning `var(--series-1)` yields "42 120 214", which is not
    // a paint value — SVG silently renders nothing and every chart came out grey.
    expect(seriesVar(0)).toBe('rgb(var(--series-1))')
    expect(seriesVar(0)).toMatch(/^rgb\(/)
  })

  it('supports an alpha channel for area fills', () => {
    expect(seriesVar(1, 0.18)).toBe('rgb(var(--series-2) / 0.18)')
  })

  it('assigns slots in fixed order and wraps rather than inventing a hue', () => {
    expect(seriesVar(0)).toBe('rgb(var(--series-1))')
    expect(seriesVar(3)).toBe('rgb(var(--series-4))')
    expect(seriesVar(SERIES_SLOTS)).toBe(seriesVar(0))
  })
})

describe('palette definition', () => {
  it('keeps light and dark in step, one hue per slot', () => {
    expect(SERIES_LIGHT).toHaveLength(SERIES_SLOTS)
    expect(SERIES_DARK).toHaveLength(SERIES_SLOTS)
  })

  it('holds the validated hex values', () => {
    // These passed scripts/validate_palette.js on the adjacent pairlist in both
    // modes. Changing one means re-running the validator, not eyeballing it.
    expect(SERIES_LIGHT).toEqual(['#2a78d6', '#eb6834', '#1baf7a', '#eda100'])
    expect(SERIES_DARK).toEqual(['#3987e5', '#d95926', '#199e70', '#c98500'])
  })
})

describe('foldToTop', () => {
  it('caps series at the slot count and buckets the tail', () => {
    const items = [
      { id: 'a', v: 100 }, { id: 'b', v: 80 }, { id: 'c', v: 60 },
      { id: 'd', v: 40 }, { id: 'e', v: 20 }, { id: 'f', v: 10 },
    ]
    const { top, otherValue, otherCount } = foldToTop(items, (i) => i.v)
    expect(top.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(otherValue).toBe(30)
    expect(otherCount).toBe(2)
  })

  it('conserves the total across top and other', () => {
    const items = [{ v: 5 }, { v: 3 }, { v: 2 }, { v: 1 }, { v: 9 }]
    const { top, otherValue } = foldToTop(items, (i) => i.v)
    expect(top.reduce((s, i) => s + i.v, 0) + otherValue).toBe(20)
  })

  it('leaves a short list untouched', () => {
    const { top, otherCount } = foldToTop([{ v: 1 }, { v: 2 }], (i) => i.v)
    expect(top).toHaveLength(2)
    expect(otherCount).toBe(0)
  })
})
