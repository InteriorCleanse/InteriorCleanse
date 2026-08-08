/**
 * Generates the site's Lottie icons as plain Lottie JSON.
 *
 * These are authored here rather than downloaded so the repo owns them
 * outright: no CDN dependency, no third-party licence to track, and the brass
 * palette stays in sync with globals.css. Run `npm run build:lottie` after
 * changing a colour or shape.
 */
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'public', 'animations')
const FPS = 30
const SIZE = 120

/** #RRGGBB -> Lottie's normalised [r,g,b,a]. */
const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
  1,
]

const BRASS = '#A9895A'
const BRASS_LIGHT = '#C4A96E'
const SAGE = '#7FA872'
const BLUE = '#4A9EFF'
const LILAC = '#C4A8E8'

/** Builds an animated property from [frame, value] pairs. */
const anim = (stops) => ({
  a: 1,
  k: stops.map(([t, s], i) => {
    const key = { t, s: Array.isArray(s) ? s : [s] }
    if (i < stops.length - 1) {
      key.i = { x: [0.4], y: [1] }
      key.o = { x: [0.6], y: [0] }
    }
    return key
  }),
})

const still = (k) => ({ a: 0, k })

const fill = (hex, opacity = 100) => ({
  ty: 'fl',
  c: still(rgb(hex)),
  o: still(opacity),
  r: 1,
  bm: 0,
  nm: 'fill',
})

const stroke = (hex, width, opacity = 100) => ({
  ty: 'st',
  c: still(rgb(hex)),
  o: still(opacity),
  w: still(width),
  lc: 2,
  lj: 2,
  bm: 0,
  nm: 'stroke',
})

/** Group transform — every shape group needs one. */
const groupTransform = (overrides = {}) => ({
  ty: 'tr',
  p: still([0, 0]),
  a: still([0, 0]),
  s: still([100, 100]),
  r: still(0),
  o: still(100),
  sk: still(0),
  sa: still(0),
  nm: 'transform',
  ...overrides,
})

const ellipse = (w, h, p = [0, 0]) => ({
  ty: 'el',
  p: still(p),
  s: still([w, h]),
  d: 1,
  nm: 'ellipse',
})

const rect = (w, h, r = 0, p = [0, 0]) => ({
  ty: 'rc',
  p: still(p),
  s: still([w, h]),
  r: still(r),
  d: 1,
  nm: 'rect',
})

const star = (points, outer, inner) => ({
  ty: 'sr',
  sy: 1,
  pt: still(points),
  p: still([0, 0]),
  r: still(0),
  or: still(outer),
  ir: still(inner),
  os: still(0),
  is: still(0),
  d: 1,
  nm: 'star',
})

/** A closed/open path from absolute points, converted to shape-local coords. */
const shapePath = (points, closed = true) => ({
  ty: 'sh',
  d: 1,
  ks: still({
    c: closed,
    v: points,
    i: points.map(() => [0, 0]),
    o: points.map(() => [0, 0]),
  }),
  nm: 'path',
})

const group = (items, name = 'group') => ({
  ty: 'gr',
  it: [...items, groupTransform()],
  nm: name,
  bm: 0,
  hd: false,
})

const layer = (shapes, ks, { ind = 1, name = 'layer', op = 60 } = {}) => ({
  ddd: 0,
  ind,
  ty: 4,
  nm: name,
  sr: 1,
  ks: {
    o: ks.o || still(100),
    r: ks.r || still(0),
    p: ks.p || still([SIZE / 2, SIZE / 2, 0]),
    a: ks.a || still([0, 0, 0]),
    s: ks.s || still([100, 100, 100]),
  },
  ao: 0,
  shapes,
  ip: 0,
  op,
  st: 0,
  bm: 0,
})

const doc = (name, layers, duration = 60) => ({
  v: '5.7.4',
  fr: FPS,
  ip: 0,
  op: duration,
  w: SIZE,
  h: SIZE,
  nm: name,
  ddd: 0,
  assets: [],
  layers,
})

/* ── Icons ───────────────────────────────────────────────────────── */

/** MIND — an open book whose covers breathe. */
const book = () =>
  doc('book', [
    layer(
      [
        group([
          shapePath([
            [-30, -16],
            [-3, -22],
            [-3, 18],
            [-30, 24],
          ]),
          stroke(SAGE, 3),
        ], 'left-page'),
        group([
          shapePath([
            [30, -16],
            [3, -22],
            [3, 18],
            [30, 24],
          ]),
          stroke(SAGE, 3),
        ], 'right-page'),
        group([
          shapePath([[0, -22], [0, 18]], false),
          stroke(BRASS_LIGHT, 3),
        ], 'spine'),
      ],
      {
        s: anim([
          [0, [100, 100, 100]],
          [30, [106, 94, 100]],
          [60, [100, 100, 100]],
        ]),
      },
      { name: 'book' }
    ),
  ])

/** HOME — a sparkle that scales and turns. */
const sparkle = () =>
  doc('sparkle', [
    layer(
      [group([star(4, 34, 9), fill(BLUE)], 'spark')],
      {
        r: anim([
          [0, 0],
          [60, 90],
        ]),
        s: anim([
          [0, [88, 88, 100]],
          [30, [110, 110, 100]],
          [60, [88, 88, 100]],
        ]),
      },
      { name: 'sparkle' }
    ),
    layer(
      [group([star(4, 15, 4), fill(BRASS_LIGHT)], 'spark-sm')],
      {
        p: still([88, 34, 0]),
        o: anim([
          [0, 30],
          [20, 100],
          [45, 30],
          [60, 30],
        ]),
        r: anim([
          [0, 0],
          [60, -90],
        ]),
      },
      { ind: 2, name: 'sparkle-small' }
    ),
  ])

/** BODY — a candle flame that flickers. */
const flame = () =>
  doc('flame', [
    layer(
      [group([ellipse(30, 30, [0, 6]), fill('#FF8C42', 55)], 'glow')],
      {
        s: anim([
          [0, [100, 100, 100]],
          [15, [126, 126, 100]],
          [40, [96, 96, 100]],
          [60, [100, 100, 100]],
        ]),
      },
      { name: 'glow' }
    ),
    layer(
      [
        group([
          shapePath([
            [0, -30],
            [13, -6],
            [9, 14],
            [0, 20],
            [-9, 14],
            [-13, -6],
          ]),
          fill('#FFA630'),
        ], 'flame'),
      ],
      {
        p: still([SIZE / 2, SIZE / 2 + 4, 0]),
        s: anim([
          [0, [100, 100, 100]],
          [12, [92, 110, 100]],
          [28, [106, 94, 100]],
          [44, [95, 105, 100]],
          [60, [100, 100, 100]],
        ]),
      },
      { ind: 2, name: 'flame' }
    ),
    layer(
      [group([ellipse(11, 17, [0, 6]), fill('#FFE9B0')], 'core')],
      {
        p: still([SIZE / 2, SIZE / 2 + 4, 0]),
        o: anim([
          [0, 90],
          [20, 100],
          [40, 82],
          [60, 90],
        ]),
      },
      { ind: 3, name: 'core' }
    ),
  ])

/** SPIRIT — a star with a slow halo. */
const starGlow = () =>
  doc('star', [
    layer(
      [group([ellipse(78, 78), fill(LILAC, 18)], 'halo')],
      {
        s: anim([
          [0, [78, 78, 100]],
          [45, [112, 112, 100]],
          [90, [78, 78, 100]],
        ]),
        o: anim([
          [0, 70],
          [45, 25],
          [90, 70],
        ]),
      },
      { name: 'halo', op: 90 }
    ),
    layer(
      [group([star(5, 34, 14), fill(LILAC)], 'star')],
      {
        r: anim([
          [0, 0],
          [90, 36],
        ]),
        s: anim([
          [0, [96, 96, 100]],
          [45, [108, 108, 100]],
          [90, [96, 96, 100]],
        ]),
      },
      { ind: 2, name: 'star', op: 90 }
    ),
  ], 90)

/** EMAIL — an envelope with a lifting flap. */
const envelope = () =>
  doc('envelope', [
    layer(
      [
        group([rect(66, 44, 3), stroke(BRASS, 3)], 'body'),
        group([
          shapePath([
            [-33, -22],
            [0, 4],
            [33, -22],
          ], false),
          stroke(BRASS_LIGHT, 3),
        ], 'flap'),
      ],
      {
        s: anim([
          [0, [100, 100, 100]],
          [30, [105, 105, 100]],
          [60, [100, 100, 100]],
        ]),
      },
      { name: 'envelope' }
    ),
    layer(
      [group([ellipse(8, 8), fill(BRASS_LIGHT)], 'dot')],
      {
        p: anim([
          [0, [SIZE / 2, SIZE / 2 + 2, 0]],
          [30, [SIZE / 2, SIZE / 2 - 26, 0]],
          [60, [SIZE / 2, SIZE / 2 + 2, 0]],
        ]),
        o: anim([
          [0, 0],
          [14, 100],
          [46, 100],
          [60, 0],
        ]),
      },
      { ind: 2, name: 'send' }
    ),
  ])

/** TRUST — a diamond that draws itself in. */
const diamond = () =>
  doc('diamond', [
    layer(
      [
        group([
          shapePath([
            [0, -26],
            [22, 0],
            [0, 26],
            [-22, 0],
          ]),
          stroke(BRASS, 3),
        ], 'diamond'),
      ],
      {
        r: anim([
          [0, 0],
          [90, 360],
        ]),
        s: anim([
          [0, [92, 92, 100]],
          [45, [104, 104, 100]],
          [90, [92, 92, 100]],
        ]),
      },
      { name: 'diamond', op: 90 }
    ),
  ], 90)

const icons = {
  book: book(),
  sparkle: sparkle(),
  flame: flame(),
  star: starGlow(),
  envelope: envelope(),
  diamond: diamond(),
}

fs.mkdirSync(OUT, { recursive: true })
for (const [name, data] of Object.entries(icons)) {
  const file = path.join(OUT, `${name}.json`)
  fs.writeFileSync(file, JSON.stringify(data))
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
}
