/**
 * Chart geometry.
 *
 * Pure functions producing SVG coordinates. Kept separate from the components
 * so the maths that decides whether a bar is the right height is testable
 * without rendering anything.
 *
 * One rule enforced here rather than left to the caller: value axes include
 * zero. A truncated axis exaggerates change, and a profit dashboard that
 * exaggerates change is a dashboard that gets someone to spend money on a
 * trend that is not there.
 */

export type Extent = { min: number; max: number }

/**
 * Axis bounds for a set of values.
 *
 * `includeZero` defaults to true. Pass false only where the baseline is
 * genuinely not zero and the chart says so — an indexed series, for instance.
 */
export function extentOf(values: readonly number[], includeZero = true): Extent {
  if (values.length === 0) return { min: 0, max: 1 }

  let min = Math.min(...values)
  let max = Math.max(...values)

  if (includeZero) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }

  // A flat series still needs a range, or every point lands on one pixel row.
  if (min === max) {
    if (min === 0) return { min: 0, max: 1 }
    const pad = Math.abs(min) * 0.1
    return { min: min - pad, max: max + pad }
  }

  return { min, max }
}

/**
 * Bounds and ticks derived from a single shared step.
 *
 * Computing the step twice — once to round the bounds, once to walk the ticks —
 * lets the two disagree, and the ticks drift off the axis. The visible symptom
 * is a range spanning zero that has no zero gridline, which is precisely the
 * reference line a profit chart cannot do without. One step, used for both.
 */
export type NiceScale = Extent & { step: number; ticks: number[] }

function niceStepFor(span: number, targetTicks: number): number {
  const rawStep = span / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalised = rawStep / magnitude
  const factor =
    normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10
  return factor * magnitude
}

export function niceScale(extent: Extent, targetTicks = 5): NiceScale {
  const span = extent.max - extent.min
  if (span === 0 || !Number.isFinite(span)) {
    return { ...extent, step: 1, ticks: [extent.min] }
  }

  const step = niceStepFor(span, targetTicks)
  // Bounds snap outward to multiples of the step, so every tick — including
  // zero, a multiple of every step — lands exactly on the axis.
  const min = Math.floor(extent.min / step) * step
  const max = Math.ceil(extent.max / step) * step

  const ticks: number[] = []
  const epsilon = step * 1e-9
  for (let v = min; v <= max + epsilon; v += step) {
    ticks.push(Math.abs(v) < epsilon ? 0 : v)
  }

  return { min, max, step, ticks }
}

/** Rounds an extent out to human tick values (1, 2, 2.5, 5 × 10ⁿ). */
export function niceExtent(extent: Extent, targetTicks = 5): Extent {
  const { min, max } = niceScale(extent, targetTicks)
  return { min, max }
}

export function ticksFor(extent: Extent, targetTicks = 5): number[] {
  return niceScale(extent, targetTicks).ticks
}

export type Plot = {
  width: number
  height: number
  padding: { top: number; right: number; bottom: number; left: number }
}

export const DEFAULT_PLOT: Plot = {
  width: 720,
  height: 260,
  padding: { top: 12, right: 16, bottom: 28, left: 56 },
}

export function innerSize(plot: Plot) {
  return {
    width: Math.max(1, plot.width - plot.padding.left - plot.padding.right),
    height: Math.max(1, plot.height - plot.padding.top - plot.padding.bottom),
  }
}

/** Maps a value to a y coordinate. Larger values sit higher on screen. */
export function yScale(extent: Extent, plot: Plot) {
  const { height } = innerSize(plot)
  const span = extent.max - extent.min || 1
  return (value: number) =>
    plot.padding.top + height - ((value - extent.min) / span) * height
}

/** Maps an index to the centre of its band — used by bars and categorical points. */
export function bandScale(count: number, plot: Plot) {
  const { width } = innerSize(plot)
  const band = width / Math.max(1, count)
  return {
    band,
    center: (index: number) => plot.padding.left + band * index + band / 2,
    start: (index: number) => plot.padding.left + band * index,
  }
}

/** Maps an index to a position across the full width — used by lines and areas. */
export function pointScale(count: number, plot: Plot) {
  const { width } = innerSize(plot)
  if (count <= 1) return () => plot.padding.left + width / 2
  return (index: number) => plot.padding.left + (width * index) / (count - 1)
}

export function linePath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')
}

/** Closes a line down to the zero baseline so the fill cannot float. */
export function areaPath(
  points: readonly { x: number; y: number }[],
  baselineY: number,
): string {
  if (points.length === 0) return ''
  const first = points[0]!
  const last = points[points.length - 1]!
  return `${linePath(points)} L${last.x.toFixed(2)} ${baselineY.toFixed(2)} L${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`
}

/**
 * Stacks series into cumulative bands per index.
 *
 * Returns absolute [start, end] pairs rather than heights, so a renderer cannot
 * accidentally stack from the wrong baseline.
 */
export function stackSeries(series: readonly (readonly number[])[]): {
  bands: { start: number; end: number }[][]
  totals: number[]
} {
  const length = Math.max(0, ...series.map((s) => s.length))
  const bands: { start: number; end: number }[][] = series.map(() => [])
  const totals: number[] = []

  for (let i = 0; i < length; i += 1) {
    let cursor = 0
    for (let s = 0; s < series.length; s += 1) {
      const value = series[s]?.[i] ?? 0
      bands[s]!.push({ start: cursor, end: cursor + value })
      cursor += value
    }
    totals.push(cursor)
  }

  return { bands, totals }
}

/** Arc path for a donut segment, from `startFraction` to `endFraction` of a turn. */
export function donutArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startFraction: number,
  endFraction: number,
): string {
  // A full circle cannot be drawn as one arc — the start and end points
  // coincide and the renderer draws nothing. Split it in half.
  const sweep = endFraction - startFraction
  if (sweep >= 1) {
    return [
      donutArc(cx, cy, outerR, innerR, 0, 0.5),
      donutArc(cx, cy, outerR, innerR, 0.5, 1),
    ].join(' ')
  }

  const angle = (f: number) => (f * 2 - 0.5) * Math.PI
  const a0 = angle(startFraction)
  const a1 = angle(endFraction)
  const largeArc = sweep > 0.5 ? 1 : 0

  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`

  return [
    `M${p(outerR, a0)}`,
    `A${outerR} ${outerR} 0 ${largeArc} 1 ${p(outerR, a1)}`,
    `L${p(innerR, a1)}`,
    `A${innerR} ${innerR} 0 ${largeArc} 0 ${p(innerR, a0)}`,
    'Z',
  ].join(' ')
}
