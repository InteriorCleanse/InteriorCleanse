/**
 * VIZ — the app's chart kit, holographic and dependency-free.
 *
 * SVG builders return strings (glowing strokes, gradient areas, heatmaps,
 * histograms). The 3D pieces draw on canvas with a small perspective engine:
 * a force-laid knowledge graph and a bar field. Both honour
 * prefers-reduced-motion (no auto-rotation), pause off-screen and when the
 * tab is hidden, and can be turned by dragging.
 *
 * Nothing here fetches or invents data: every builder draws exactly what it
 * is given, and callers label the source (PAPER, BACKTEST, SIMULATED …).
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
let uid = 0
const nid = (p) => `${p}${++uid}`
const REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
export const PALETTE = ['#D8B56E', '#7CC8C4', '#60C892', '#E8A15A', '#C8A8E0', '#E6747C', '#9FB7E0', '#E9CB8C']

function defs(id, colors = []) {
  return `<defs>
    <filter id="${id}-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <linearGradient id="${id}-grid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(216,181,110,.10)"/><stop offset="1" stop-color="rgba(216,181,110,0)"/></linearGradient>
    ${colors.map((c, i) => `<linearGradient id="${id}-a${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".32"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`).join('')}
  </defs>`
}

const nice = (lo, hi, n = 5) => {
  const span = hi - lo || Math.abs(hi) || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step)
  return out
}
const fmtN = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3)).replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m))

function frame({ W, H, pad, xs, ys, X, Y, xLabel, yLabel, id, xFmt = fmtN, yFmt = fmtN }) {
  let g = `<rect x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="url(#${id}-grid)" rx="6"/>`
  for (const v of ys) g += `<line class="vz-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="vz-ax" x="${pad.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${yFmt(v)}</text>`
  for (const v of xs) g += `<text class="vz-ax" x="${X(v).toFixed(1)}" y="${H - pad.b + 16}" text-anchor="middle">${esc(typeof v === 'string' ? v : xFmt(v))}</text>`
  if (xLabel) g += `<text class="vz-lab" x="${(pad.l + W - pad.r) / 2}" y="${H - 4}" text-anchor="middle">${esc(xLabel)}</text>`
  if (yLabel) g += `<text class="vz-lab" transform="translate(12 ${(pad.t + H - pad.b) / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`
  return g
}

/**
 * Line chart. series: [{ name, color, points: [[x, y|null], …] }]. x may be a
 * number or a category index with `categories`. Optional `refs`: horizontal
 * reference lines [{ y, label, color, dash }].
 */
export function lineChart({ series, categories = null, xLabel = '', yLabel = '', refs = [], height = 280, area = true, yFmt, zeroLine = false, title = '' }) {
  const id = nid('vz'), W = 720, H = height, pad = { l: 58, r: 18, t: 18, b: 40 }
  const pts = series.flatMap((s) => s.points.filter((p) => p[1] !== null && Number.isFinite(p[1])))
  if (!pts.length) return ''
  const xsAll = categories ? categories.map((_, i) => i) : pts.map((p) => p[0])
  const x0 = Math.min(...xsAll), x1 = Math.max(...xsAll)
  let y0 = Math.min(...pts.map((p) => p[1]), ...refs.map((r) => r.y)), y1 = Math.max(...pts.map((p) => p[1]), ...refs.map((r) => r.y))
  if (zeroLine) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0) }
  const padY = (y1 - y0 || Math.abs(y1) || 1) * 0.12; y0 -= padY; y1 += padY
  const X = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r)
  const Y = (v) => pad.t + ((y1 - v) / (y1 - y0 || 1)) * (H - pad.t - pad.b)
  const xs = categories ? categories.map((c, i) => i) : nice(x0, x1, 6)
  let g = frame({ W, H, pad, xs, ys: nice(y0, y1, 5), X, Y, xLabel, yLabel, id, yFmt, xFmt: categories ? (i) => categories[i] : fmtN })
  if (zeroLine && y0 < 0 && y1 > 0) g += `<line class="vz-zero" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`
  for (const r of refs) g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(r.y).toFixed(1)}" y2="${Y(r.y).toFixed(1)}" stroke="${r.color || 'var(--brand)'}" stroke-width="1.3" stroke-dasharray="${r.dash || '5 4'}"/><text class="vz-tag" x="${W - pad.r - 4}" y="${(Y(r.y) - 5).toFixed(1)}" text-anchor="end" fill="${r.color || 'var(--brand)'}">${esc(r.label)}</text>`
  series.forEach((s, si) => {
    const segs = []; let cur = []
    for (const p of s.points) { if (p[1] === null || !Number.isFinite(p[1])) { if (cur.length) segs.push(cur); cur = [] } else cur.push(p) }
    if (cur.length) segs.push(cur)
    for (const seg of segs) {
      const d = seg.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')
      if (area && seg.length > 1) g += `<path d="${d} L${X(seg[seg.length - 1][0]).toFixed(1)} ${H - pad.b} L${X(seg[0][0]).toFixed(1)} ${H - pad.b} Z" fill="url(#${id}-a${si})"/>`
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" filter="url(#${id}-glow)"/>`
      for (const p of seg) g += `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.2" fill="#0B0A08" stroke="${s.color}" stroke-width="1.6"><title>${esc(s.name)}: ${fmtN(p[1])}</title></circle>`
    }
  })
  const legend = series.length > 1 ? `<div class="vz-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''
  return `<figure class="vz vz-3d">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || yLabel)}">${defs(id, series.map((s) => s.color))}${g}</svg>${legend}</figure>`
}

/** Histogram. bins: [{ x0, x1, n }]; marks: vertical lines [{ x, label, color, dash }]. */
export function histogram({ bins, marks = [], xLabel = '', yLabel = '', height = 280, color = '#7CC8C4', title = '' }) {
  if (!bins.length) return ''
  const id = nid('vz'), W = 720, H = height, pad = { l: 52, r: 18, t: 22, b: 40 }
  const x0 = Math.min(bins[0].x0, ...marks.map((m) => m.x)), x1 = Math.max(bins[bins.length - 1].x1, ...marks.map((m) => m.x))
  const yMax = Math.max(...bins.map((b) => b.n)) * 1.12 || 1
  const X = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r), Y = (v) => pad.t + ((yMax - v) / yMax) * (H - pad.t - pad.b)
  let g = frame({ W, H, pad, xs: nice(x0, x1, 6), ys: nice(0, yMax, 5), X, Y, xLabel, yLabel, id })
  for (const b of bins) { const w = Math.max(1, X(b.x1) - X(b.x0) - 1.5); g += `<rect x="${(X(b.x0) + 0.75).toFixed(1)}" y="${Y(b.n).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - pad.b - Y(b.n)).toFixed(1)}" rx="1.5" fill="url(#${id}-a0)" stroke="${color}" stroke-opacity=".9" stroke-width="1"/>` }
  marks.forEach((m, i) => { const right = X(m.x) > W * 0.62; g += `<line x1="${X(m.x).toFixed(1)}" x2="${X(m.x).toFixed(1)}" y1="${pad.t}" y2="${H - pad.b}" stroke="${m.color}" stroke-width="1.8" stroke-dasharray="${m.dash || '5 4'}" filter="url(#${id}-glow)"/><text class="vz-tag" x="${(X(m.x) + (right ? -6 : 6)).toFixed(1)}" y="${pad.t + 12 + i * 14}" text-anchor="${right ? 'end' : 'start'}" fill="${m.color}">${esc(m.label)}</text>` })
  return `<figure class="vz vz-3d">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${defs(id, [color])}${g}</svg></figure>`
}

/** Heatmap. rows/cols labels, values[r][c] (null = not measured), diverging around 0 unless `sequential`. */
export function heatmap({ rows, cols, values, fmt = fmtN, title = '', sequential = false, notes = null }) {
  const flat = values.flat().filter((v) => v !== null && Number.isFinite(v))
  const m = Math.max(1e-9, ...flat.map((v) => Math.abs(v)))
  const col = (v) => {
    if (v === null || !Number.isFinite(v)) return 'rgba(255,246,228,.04)'
    const t = Math.min(1, Math.abs(v) / m)
    if (sequential) return `rgba(216,181,110,${(0.12 + 0.75 * t).toFixed(2)})`
    return v >= 0 ? `rgba(96,200,146,${(0.12 + 0.7 * t).toFixed(2)})` : `rgba(230,116,124,${(0.12 + 0.7 * t).toFixed(2)})`
  }
  return `<figure class="vz vz-3d vz-heat">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}<div class="vz-hm" style="grid-template-columns:minmax(90px,auto) repeat(${cols.length}, minmax(64px,1fr))">
    <span></span>${cols.map((c) => `<b class="vz-hc">${esc(c)}</b>`).join('')}
    ${rows.map((r, ri) => `<b class="vz-hr">${esc(r)}</b>${cols.map((_, ci) => { const v = values[ri][ci]; return `<span class="vz-cell" style="background:${col(v)}" title="${esc(r)} × ${esc(cols[ci])}${notes && notes[ri] && notes[ri][ci] ? ': ' + esc(notes[ri][ci]) : ''}">${v === null || !Number.isFinite(v) ? '<i>—</i>' : esc(fmt(v))}${notes && notes[ri] && notes[ri][ci] ? `<small>${esc(notes[ri][ci])}</small>` : ''}</span>` }).join('')}`).join('')}
  </div></figure>`
}

/** Stacked price bars against a $1.00 line (prediction markets): venues [{ name, yes, no }]. */
export function priceStack({ venues, title = '' }) {
  const id = nid('vz'), W = 720, H = 230, pad = { l: 56, r: 18, t: 18, b: 34 }
  const top = Math.max(1.1, ...venues.map((v) => v.yes + v.no + 0.05))
  const Y = (v) => pad.t + ((top - v) / top) * (H - pad.t - pad.b)
  const bw = Math.min(120, (W - pad.l - pad.r) / (venues.length * 2))
  let g = frame({ W, H, pad, xs: [], ys: nice(0, top, 5), X: () => 0, Y, id, yFmt: (v) => `$${v.toFixed(2)}` })
  g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(1).toFixed(1)}" y2="${Y(1).toFixed(1)}" stroke="var(--brand)" stroke-width="1.6" stroke-dasharray="6 4" filter="url(#${id}-glow)"/><text class="vz-tag" x="${pad.l + 6}" y="${(Y(1) - 6).toFixed(1)}" fill="var(--brand)">$1.00 pays out</text>`
  venues.forEach((v, i) => {
    const cx = pad.l + ((i + 0.5) / venues.length) * (W - pad.l - pad.r), x = cx - bw / 2
    g += `<rect x="${x.toFixed(1)}" y="${Y(v.yes).toFixed(1)}" width="${bw}" height="${(Y(0) - Y(v.yes)).toFixed(1)}" rx="3" fill="rgba(96,200,146,.55)" stroke="#60C892"/><rect x="${x.toFixed(1)}" y="${Y(v.yes + v.no).toFixed(1)}" width="${bw}" height="${(Y(v.yes) - Y(v.yes + v.no)).toFixed(1)}" rx="3" fill="rgba(230,116,124,.5)" stroke="#E6747C"/>`
    g += `<text class="vz-tag" x="${cx.toFixed(1)}" y="${(Y(v.yes + v.no) - 7).toFixed(1)}" text-anchor="middle" fill="${v.yes + v.no < 1 ? '#60C892' : 'var(--text)'}">$${(v.yes + v.no).toFixed(2)}</text><text class="vz-ax" x="${cx.toFixed(1)}" y="${H - pad.b + 18}" text-anchor="middle">${esc(v.name)}</text>`
  })
  return `<figure class="vz vz-3d">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${defs(id, [])}${g}</svg><div class="vz-legend"><span><i style="background:#60C892"></i>YES ask</span><span><i style="background:#E6747C"></i>NO ask</span></div></figure>`
}

/* ------------------------------------------------------------------ 3D */

const HOLO = new Map()
const running = new Map()

/** A canvas for a 3D knowledge graph. data: { nodes: [{ id, label, group }], edges: [{ from, to }] }. */
export function holoGraph(data, { height = 460, caption = '' } = {}) {
  const id = nid('holo'); HOLO.set(id, { kind: 'graph', data })
  return `<figure class="vz vz-holo">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}<canvas class="holo" data-holo="${id}" style="height:${height}px" role="img" aria-label="${esc(caption || 'three-dimensional graph')}"></canvas><div class="holo-tip" data-holo-tip="${id}"></div><div class="holo-hint">drag to turn · point at a node to read it</div></figure>`
}

/** A canvas for a 3D bar field. data: { rows, cols, values[r][c] (null = not measured) }. */
export function holoBars(data, { height = 380, caption = '' } = {}) {
  const id = nid('holo'); HOLO.set(id, { kind: 'bars', data })
  return `<figure class="vz vz-holo">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}<canvas class="holo" data-holo="${id}" style="height:${height}px" role="img" aria-label="${esc(caption || 'three-dimensional bar field')}"></canvas><div class="holo-tip" data-holo-tip="${id}"></div><div class="holo-hint">drag to turn</div></figure>`
}

/** Deterministic 3D force layout (Fruchterman–Reingold) for a small graph. */
export function layout3d(nodes, edges, iterations = 220, seed = 7) {
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31 - 0.5 }
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  const P = nodes.map(() => [rnd() * 2, rnd() * 2, rnd() * 2])
  const E = edges.map((e) => [idx.get(e.from), idx.get(e.to)]).filter(([a, b]) => a !== undefined && b !== undefined)
  const k = 1.6 / Math.cbrt(Math.max(1, nodes.length))
  for (let it = 0; it < iterations; it++) {
    const t = 0.12 * (1 - it / iterations) + 0.005
    const D = P.map(() => [0, 0, 0])
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], dz = P[i][2] - P[j][2]
      const d2 = dx * dx + dy * dy + dz * dz + 1e-4, f = (k * k) / d2
      D[i][0] += dx * f; D[i][1] += dy * f; D[i][2] += dz * f; D[j][0] -= dx * f; D[j][1] -= dy * f; D[j][2] -= dz * f
    }
    for (const [a, b] of E) {
      const dx = P[a][0] - P[b][0], dy = P[a][1] - P[b][1], dz = P[a][2] - P[b][2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4, f = d / k
      D[a][0] -= dx * f; D[a][1] -= dy * f; D[a][2] -= dz * f; D[b][0] += dx * f; D[b][1] += dy * f; D[b][2] += dz * f
    }
    for (let i = 0; i < P.length; i++) {
      const [dx, dy, dz] = D[i], d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-9, m = Math.min(d, t) / d
      P[i][0] += dx * m - P[i][0] * 0.01; P[i][1] += dy * m - P[i][1] * 0.01; P[i][2] += dz * m - P[i][2] * 0.01
    }
  }
  // Centre on the centroid and scale by the 90th-percentile radius, so one outlier cannot shrink the whole graph.
  const c = [0, 1, 2].map((a) => P.reduce((sum, p) => sum + p[a], 0) / (P.length || 1))
  const Q = P.map((p) => p.map((v, a) => v - c[a]))
  const radii = Q.map((p) => Math.hypot(...p)).sort((x, y) => x - y)
  const r = Math.max(1e-6, radii[Math.floor(radii.length * 0.9)] || radii[radii.length - 1] || 1)
  return Q.map((p) => { const m = Math.hypot(...p) / r; const k2 = m > 1.15 ? 1.15 / m : 1; return p.map((v) => (v / r) * k2) })
}

function cssVar(name, fallback) { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback } catch { return fallback } }
const hexRgb = (h) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [216, 181, 110] }

function engine(canvas, draw) {
  const ctx = canvas.getContext('2d')
  const st = { yaw: 0.6, pitch: 0.42, drag: null, w: 0, h: 0, dpr: 1, mouse: null, visible: true, raf: 0, t0: performance.now() }
  const fit = () => { st.dpr = Math.min(2, window.devicePixelRatio || 1); st.w = canvas.clientWidth; st.h = canvas.clientHeight; canvas.width = Math.round(st.w * st.dpr); canvas.height = Math.round(st.h * st.dpr); ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0) }
  const project = (x, y, z) => {
    const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch)
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp
    const f = 3.2 / (3.2 + z2), R = Math.min(st.w * 0.5, st.h * 0.52)
    return { x: st.w / 2 + x1 * f * R, y: st.h / 2 + y1 * f * R, z: z2, f }
  }
  const loop = (t) => {
    st.raf = 0
    if (!st.visible || document.visibilityState !== 'visible' || !canvas.isConnected) return
    if (!st.drag && !REDUCE) st.yaw += 0.0022
    ctx.clearRect(0, 0, st.w, st.h)
    draw(ctx, st, project, (t - st.t0) / 1000)
    if (!REDUCE || st.drag) st.raf = requestAnimationFrame(loop)
  }
  const kick = () => { if (!st.raf) st.raf = requestAnimationFrame(loop) }
  canvas.addEventListener('pointerdown', (e) => { st.drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch }; canvas.setPointerCapture?.(e.pointerId); kick() })
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(); st.mouse = { x: e.clientX - r.left, y: e.clientY - r.top }
    if (st.drag) { st.yaw = st.drag.yaw + (e.clientX - st.drag.x) * 0.008; st.pitch = Math.max(-1.2, Math.min(1.2, st.drag.pitch + (e.clientY - st.drag.y) * 0.006)) }
    kick()
  })
  canvas.addEventListener('pointerup', () => { st.drag = null; kick() })
  canvas.addEventListener('pointerleave', () => { st.mouse = null; kick() })
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { st.visible = es[0]?.isIntersecting ?? true; if (st.visible) kick() }) : null
  io?.observe(canvas)
  const onVis = () => kick()
  document.addEventListener('visibilitychange', onVis)
  const onResize = () => { fit(); kick() }
  window.addEventListener('resize', onResize)
  fit(); kick()
  return () => { io?.disconnect(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', onResize); if (st.raf) cancelAnimationFrame(st.raf) }
}

function drawGraph(canvas, data, tip) {
  const P = layout3d(data.nodes, data.edges)
  const idx = new Map(data.nodes.map((n, i) => [n.id, i]))
  const E = data.edges.map((e) => [idx.get(e.from), idx.get(e.to)]).filter(([a, b]) => a !== undefined && b !== undefined)
  const deg = data.nodes.map(() => 0); for (const [a, b] of E) { deg[a]++; deg[b]++ }
  const groups = [...new Set(data.nodes.map((n) => n.group))]
  const colorOf = (g) => hexRgb(PALETTE[groups.indexOf(g) % PALETTE.length])
  const topLabels = new Set([...deg.keys()].sort((a, b) => deg[b] - deg[a]).slice(0, 6))
  const font = cssVar('--font-sans', 'sans-serif')
  return engine(canvas, (ctx, st, project, t) => {
    const S = P.map((p) => project(p[0], p[1], p[2]))
    let hover = -1
    if (st.mouse) { let best = 16; S.forEach((s, i) => { const d = Math.hypot(s.x - st.mouse.x, s.y - st.mouse.y); if (d < best) { best = d; hover = i } }) }
    const near = new Set(hover >= 0 ? E.filter(([a, b]) => a === hover || b === hover).flatMap(([a, b]) => [a, b]) : [])
    // Edges: depth-faded threads; the hovered node's edges glow gold.
    for (const [a, b] of E) {
      const on = hover >= 0 && (a === hover || b === hover)
      const depth = Math.max(0.08, Math.min(1, (S[a].f + S[b].f) / 2 - 0.55))
      ctx.strokeStyle = on ? 'rgba(233,203,140,.9)' : `rgba(216,181,110,${(0.10 + 0.25 * depth).toFixed(3)})`
      ctx.lineWidth = on ? 1.6 : 0.8
      ctx.beginPath(); ctx.moveTo(S[a].x, S[a].y); ctx.lineTo(S[b].x, S[b].y); ctx.stroke()
    }
    // Signals travelling along a few edges, so the graph reads as alive.
    if (!REDUCE) for (let k = 0; k < Math.min(14, E.length); k++) {
      const [a, b] = E[(k * 7) % E.length], u = (t * 0.25 + k * 0.13) % 1
      const x = S[a].x + (S[b].x - S[a].x) * u, y = S[a].y + (S[b].y - S[a].y) * u
      ctx.fillStyle = 'rgba(241,220,166,.85)'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 6.283); ctx.fill()
    }
    // Nodes, far to near, as glowing spheres.
    const order = [...S.keys()].sort((i, j) => S[i].z - S[j].z)
    const placed = []
    for (const i of order) {
      const s = S[i], [r, g, b] = colorOf(data.nodes[i].group), rad = (2.6 + Math.sqrt(deg[i]) * 1.4) * s.f
      const dim = hover >= 0 && i !== hover && !near.has(i) ? 0.35 : 1
      const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad * 3.2)
      grd.addColorStop(0, `rgba(${r},${g},${b},${0.55 * dim})`); grd.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(s.x, s.y, rad * 3.2, 0, 6.283); ctx.fill()
      ctx.fillStyle = `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, b + 40)},${dim})`; ctx.beginPath(); ctx.arc(s.x, s.y, rad, 0, 6.283); ctx.fill()
      if (i === hover || (hover < 0 && topLabels.has(i) && s.f > 0.9 && !placed.some((q) => Math.abs(q.x - s.x) < 150 && Math.abs(q.y - s.y) < 16))) {
        placed.push({ x: s.x, y: s.y })
        ctx.font = `${i === hover ? 600 : 500} ${i === hover ? 13 : 11}px ${font}`
        ctx.fillStyle = i === hover ? '#F4EEE3' : 'rgba(244,238,227,.7)'
        ctx.fillText(data.nodes[i].label, s.x + rad + 6, s.y + 4)
      }
    }
    if (tip) tip.textContent = hover >= 0 ? `${data.nodes[hover].label} · ${data.nodes[hover].group} · ${deg[hover]} link${deg[hover] === 1 ? '' : 's'}` : ''
  })
}

function drawBars(canvas, data, tip) {
  const R = data.rows.length, C = data.cols.length
  const flat = data.values.flat().filter((v) => v !== null && Number.isFinite(v))
  const m = Math.max(1e-9, ...flat.map((v) => Math.abs(v)))
  const font = cssVar('--font-sans', 'sans-serif')
  const cell = 1.6 / Math.max(R, C), w = cell * 0.62
  const bars = []
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const v = data.values[r][c], x = (c - (C - 1) / 2) * cell, z = (r - (R - 1) / 2) * cell
    bars.push({ r, c, v, x, z, h: v === null || !Number.isFinite(v) ? 0 : (v / m) * 0.7 })
  }
  return engine(canvas, (ctx, st, project) => {
    // Floor grid.
    ctx.strokeStyle = 'rgba(216,181,110,.14)'; ctx.lineWidth = 1
    for (let i = 0; i <= Math.max(R, C); i++) {
      const u = -0.8 + (i * 1.6) / Math.max(R, C)
      const a = project(u, 0, -0.8), b = project(u, 0, 0.8), c2 = project(-0.8, 0, u), d = project(0.8, 0, u)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c2.x, c2.y); ctx.lineTo(d.x, d.y); ctx.stroke()
    }
    const depth = (b) => project(b.x, b.h / 2, b.z).z
    let hover = null
    for (const b of [...bars].sort((p, q) => depth(q) - depth(p))) {
      const up = b.h >= 0, col = b.v === null || !Number.isFinite(b.v) ? [150, 140, 125] : up ? [96, 200, 146] : [230, 116, 124]
      const y0 = 0, y1 = -b.h // canvas y grows down; the projection's y is "down" too, so height goes negative
      const corners = (y) => [[b.x - w / 2, y, b.z - w / 2], [b.x + w / 2, y, b.z - w / 2], [b.x + w / 2, y, b.z + w / 2], [b.x - w / 2, y, b.z + w / 2]].map((p) => project(p[0], p[1], p[2]))
      const bot = corners(y0), top = corners(y1)
      const faces = [[bot[0], bot[1], top[1], top[0]], [bot[1], bot[2], top[2], top[1]], [bot[2], bot[3], top[3], top[2]], [bot[3], bot[0], top[0], top[3]]]
        .map((f) => ({ f, z: f.reduce((s, p) => s + p.z, 0) / 4 })).sort((p, q) => q.z - p.z)
      const empty = b.v === null || !Number.isFinite(b.v)
      for (const { f } of faces) {
        ctx.beginPath(); f.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath()
        ctx.fillStyle = empty ? 'rgba(255,246,228,.03)' : `rgba(${col[0]},${col[1]},${col[2]},.28)`; ctx.fill()
        ctx.strokeStyle = empty ? 'rgba(255,246,228,.12)' : `rgba(${col[0]},${col[1]},${col[2]},.75)`; ctx.stroke()
      }
      ctx.beginPath(); top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath()
      ctx.fillStyle = empty ? 'rgba(255,246,228,.05)' : `rgba(${Math.min(255, col[0] + 50)},${Math.min(255, col[1] + 50)},${Math.min(255, col[2] + 50)},.85)`; ctx.fill()
      const c = project(b.x, y1, b.z)
      if (st.mouse && Math.hypot(c.x - st.mouse.x, c.y - st.mouse.y) < 14) hover = b
    }
    ctx.font = `500 11px ${font}`; ctx.fillStyle = 'rgba(244,238,227,.75)'
    data.cols.forEach((name, c) => { const p = project((c - (C - 1) / 2) * cell, 0, 0.8 + cell * 0.35); ctx.fillText(name, p.x - 20, p.y + 12) })
    data.rows.forEach((name, r) => { const p = project(0.8 + cell * 0.25, 0, (r - (R - 1) / 2) * cell); ctx.fillText(name, p.x + 4, p.y + 4) })
    if (tip) tip.textContent = hover ? `${data.rows[hover.r]} × ${data.cols[hover.c]}: ${hover.v === null ? 'not measured' : fmtN(hover.v)}` : ''
  })
}

/** Start every 3D canvas inside `root` that is not running yet; stop the ones that left the page. */
export function mountHolo(root = document) {
  for (const [id, stop] of running) if (!document.querySelector(`[data-holo="${id}"]`)) { stop(); running.delete(id); HOLO.delete(id) }
  for (const cv of root.querySelectorAll('canvas[data-holo]')) {
    const id = cv.dataset.holo
    if (running.has(id) || !HOLO.has(id) || !cv.getContext) continue
    const { kind, data } = HOLO.get(id), tip = root.querySelector(`[data-holo-tip="${id}"]`)
    try { running.set(id, kind === 'graph' ? drawGraph(cv, data, tip) : drawBars(cv, data, tip)) } catch { /* a canvas that cannot draw stays blank */ }
  }
}
