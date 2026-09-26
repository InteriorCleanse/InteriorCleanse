/**
 * VIZ — the chart kit draws exactly what it is given: no data, no chart; the
 * 3D layout is deterministic; nothing fetches.
 *
 * SYNTHETIC / TEST FIXTURE: every series below is made up.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — a browser ES module without type declarations; the functions are plain JS.
import { lineChart, histogram, heatmap, priceStack, layout3d } from '../../web/js/viz.js'

const ROOT = join(import.meta.dirname, '..', '..')

test('builders return SVG for data and nothing for no data', () => {
  assert.equal(lineChart({ series: [{ name: 'x', color: '#fff', points: [[0, null]] }] }), '')
  assert.equal(histogram({ bins: [] }), '')
  const svg = lineChart({ categories: ['a', 'b', 'c'], series: [{ name: 'S', color: '#D8B56E', points: [[0, 1], [1, null], [2, 3]] }], title: 'T' })
  assert.match(svg, /<svg viewBox="0 0 720 280"/)
  assert.match(svg, />a<\/text>/)
  assert.equal((svg.match(/<circle/g) || []).length, 2, 'a gap is a gap, not an invented point')
  assert.match(histogram({ bins: [{ x0: 0, x1: 1, n: 3 }], marks: [{ x: 0.5, label: 'luck', color: '#E8A15A' }] }), /luck/)
  assert.match(heatmap({ rows: ['r'], cols: ['c1', 'c2'], values: [[0.2, null]] }), /—/)
  assert.match(priceStack({ venues: [{ name: 'A', yes: 0.55, no: 0.43 }] }), /\$0\.98/)
})

test('labels are escaped', () => {
  assert.doesNotMatch(lineChart({ series: [{ name: '<script>', color: '#fff', points: [[0, 1], [1, 2]] }], title: '<img onerror=x>' }), /<script>|<img onerror/)
})

test('the 3D layout is deterministic and bounded', () => {
  const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}` }))
  const edges = nodes.slice(1).map((n, i) => ({ from: `n${i}`, to: n.id }))
  const a = layout3d(nodes, edges), b = layout3d(nodes, edges)
  assert.deepEqual(a, b)
  for (const p of a) assert.ok(Math.hypot(...p) <= 1.16)
})

test('the chart kit has no network calls', () => {
  assert.doesNotMatch(readFileSync(join(ROOT, 'web', 'js', 'viz.js'), 'utf8'), /\bfetch\(|XMLHttpRequest|WebSocket/)
})
