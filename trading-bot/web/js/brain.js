/**
 * THE BRAIN — every model Mr. Cash runs, drawn as one thinking brain in 3D.
 *
 * What is real and what is dressing:
 *
 *   REAL — one neuron per strategy inside the brain, coloured by its
 *   vote on this candle (mint BUY, coral SELL, iris HOLD) and sized by its
 *   confidence; a strategy the current regime switches off is drawn hollow and
 *   sends nothing. One input node per desk agent around the outside, coloured
 *   by what it can see (aqua reading, amber estimating, iris standing by, grey
 *   dashed when it cannot see). The core in the middle is the fused decision:
 *   its colour is the fused direction, the arc round it is the agreement score
 *   and the tick is where the panel acts.
 *
 *   MOTION — a pulse is a reading or a vote travelling to the core. Only a
 *   model that is actually reporting sends one; a blind agent and a switched-off
 *   strategy send none. Pulse speed follows the strategy's confidence or the
 *   agent's state. When a strategy's pulse leaves, the cortex round that neuron
 *   flashes. The rhythm itself is not a measurement of anything — it shows who
 *   is talking, not how often the market ticks.
 *
 *   DRESSING — the cortex itself (two hemispheres of points with their folds),
 *   the cerebellum and stem, the slow turn, the breathing and the wave of light
 *   that crosses the brain from the core. They carry no data.
 *
 * Interaction: drag to turn the brain (it keeps a little momentum), point at a
 * neuron or an agent to read it, click one to jump to its row in the list.
 * Under reduced motion it stands still and turns only while you drag it.
 *
 * This file only draws. It fetches nothing, owns no timer and holds no
 * thresholds: desk.js hands it the payload's own numbers and runs the frame
 * loop (and stops it off screen and under reduced motion). Every "random"
 * position comes from a seeded generator, so the same payload always draws the
 * same brain.
 */
(() => {
  const C = { iris: '139,147,255', aqua: '92,225,230', mint: '74,222,154', coral: '255,107,122', amber: '255,192,97', grey: '112,121,156', text: '238,241,251', dim: '154,163,194' }
  const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
  const AGENT_STATE = {
    LIVE: { col: C.aqua, label: 'reading', speed: 0.42, n: 2, alpha: 1 },
    PARTIAL: { col: C.amber, label: 'estimating', speed: 0.3, n: 1, alpha: 0.9 },
    WAITING: { col: C.iris, label: 'standing by', speed: 0.17, n: 1, alpha: 0.6 },
    BLIND: { col: C.grey, label: "can't see", speed: 0, n: 0, alpha: 0.5 },
  }
  const CAM = 4.2 // camera distance, in brain half-lengths: enough perspective to read as solid
  const PITCH_REST = 0.26
  const AUTO_YAW = 0.14 // radians a second: one slow turn in about 45 s
  const LEVELS = 14
  const LIGHT = (() => { const v = [-0.45, 0.65, 0.62], l = Math.hypot(...v); return v.map((c) => c / l) })()

  function seeded(seed) {
    let s = seed >>> 0
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  }
  const frac = (x) => x - Math.floor(x)
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
  const shortName = (n) => String(n).replace(/\s*\(.*\)\s*$/, '')
  const q3 = (a, b, c, s) => {
    const u = (1 - s) * (1 - s), v = 2 * (1 - s) * s, w = s * s
    return { x: u * a.x + v * b.x + w * c.x, y: u * a.y + v * b.y + w * c.y, z: u * a.z + v * b.z + w * c.z }
  }

  /* ---------- the model: built once, in brain space (x across, y up, z front) ---------- */

  // One hemisphere's surface in the direction of the unit vector (nx, ny, nz).
  // The medial wall is flattened against the midline, the underside is flatter
  // than the crown, the back tapers, and the temporal lobe bulges low at the side.
  function hemiMap(side, nx, ny, nz) {
    const medial = nx * side < 0
    const back = Math.max(0, -nz)
    const ax = 0.44 * (medial ? 0.3 : 1) * (1 - 0.18 * back), by = 0.62 * (ny < 0 ? 0.74 : 1) * (1 - 0.12 * back), cz = 0.94
    let x = side * 0.25 + ax * nx
    let y = by * ny - 0.05 * back
    const z = cz * nz
    const temporal = Math.exp(-Math.pow((nz - 0.15) / 0.38, 2)) * Math.max(0, -ny) * (medial ? 0 : 1)
    y -= 0.1 * temporal; x += side * 0.05 * temporal
    // The surface normal, for the light.
    let n = [nx / ax, ny / by, nz / cz]
    const nl = Math.hypot(...n); n = n.map((c) => c / nl)
    return { x, y, z, medial, n }
  }

  // A fold: a meandering walk over the unit sphere, mapped onto a hemisphere.
  function foldWalk(rnd, side, steps, stepLen) {
    let p = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]
    let l = Math.hypot(...p); p = p.map((c) => c / l)
    // Keep most folds on the outer face, where they can be seen.
    if (p[0] * side < -0.2) p[0] = -p[0]
    let hd = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]
    const turn = (rnd() - 0.5) * 0.35, ph = rnd() * 6
    const out = []
    for (let k = 0; k <= steps; k++) {
      // Heading stays tangent to the sphere.
      const dot = hd[0] * p[0] + hd[1] * p[1] + hd[2] * p[2]
      hd = [hd[0] - dot * p[0], hd[1] - dot * p[1], hd[2] - dot * p[2]]
      l = Math.hypot(...hd) || 1; hd = hd.map((c) => c / l)
      out.push(hemiMap(side, p[0], p[1], p[2]))
      // Turn about the normal: the meander that makes a gyrus.
      const a = turn + 0.95 * Math.sin(k * 0.85 + ph) + 0.35 * Math.sin(k * 2.1 + ph * 1.7)
      const b = [p[1] * hd[2] - p[2] * hd[1], p[2] * hd[0] - p[0] * hd[2], p[0] * hd[1] - p[1] * hd[0]]
      hd = [hd[0] * Math.cos(a) + b[0] * Math.sin(a), hd[1] * Math.cos(a) + b[1] * Math.sin(a), hd[2] * Math.cos(a) + b[2] * Math.sin(a)]
      p = [p[0] + hd[0] * stepLen, p[1] + hd[1] * stepLen, p[2] + hd[2] * stepLen]
      l = Math.hypot(...p); p = p.map((c) => c / l)
    }
    return out
  }

  function buildModel() {
    const rnd = seeded(20260924)
    const pts = [], segs = []
    const line = (list, base, kind) => {
      list.forEach((q, k) => {
        pts.push({ x: q.x, y: q.y, z: q.z, n: q.n || null, base: q.medial ? base * 0.5 : base, kind })
        if (k) segs.push(pts.length - 2, pts.length - 1)
      })
    }
    for (const side of [-1, 1]) {
      // The gyri: the winding ridges that make it read as a brain.
      for (let i = 0; i < 120; i++) line(foldWalk(rnd, side, 22 + Math.floor(rnd() * 22), 0.05), 0.4 + rnd() * 0.32, 0)
      // A fine dust over the surface, and a faint glow inside so it is not hollow.
      for (let i = 0; i < 520; i++) {
        let v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]
        const l = Math.hypot(...v); v = v.map((c) => c / l)
        const q = hemiMap(side, v[0], v[1], v[2])
        pts.push({ x: q.x, y: q.y, z: q.z, n: q.n, base: 0.16 + rnd() * 0.2, kind: 4 })
      }
      for (let i = 0; i < 140; i++) {
        let x, y, z
        do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1 } while (x * x + y * y + z * z > 1)
        pts.push({ x: side * 0.25 + x * 0.3, y: y * 0.42, z: z * 0.7, n: null, base: 0.05 + rnd() * 0.05, kind: 1 })
      }
    }
    // Cerebellum, low at the back: its folia are fine parallel stripes.
    for (let j = 0; j < 8; j++) {
      const t = j / 7, yy = -0.36 - t * 0.22, sc = Math.sqrt(Math.max(0.08, 1 - Math.pow((t - 0.4) / 0.62, 2)))
      const ring = []
      for (let k = 0; k <= 28; k++) {
        const a = Math.PI * (0.1 + 0.8 * (k / 28))
        const nx = -Math.cos(a), nz = -Math.sin(a)
        ring.push({ x: nx * 0.38 * sc, y: yy, z: -0.5 + nz * 0.22 * sc, n: [nx, -0.2, nz] })
      }
      line(ring, 0.3, 2)
    }
    // Brain stem, down and slightly back from the middle.
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2, col = []
      for (let k = 0; k <= 6; k++) { const t = k / 6; col.push({ x: Math.cos(a) * 0.07, y: -0.34 - t * 0.36, z: -0.26 - t * 0.1 + Math.sin(a) * 0.07, n: [Math.cos(a), 0, Math.sin(a)] }) }
      line(col, 0.18, 3)
    }
    const core = { x: 0, y: 0.02, z: 0.02 }
    for (const p of pts) p.dc = Math.hypot(p.x - core.x, p.y - core.y, p.z - core.z)
    return { pts, segs: Int32Array.from(segs), core }
  }

  // Strategy neurons: seeded places deep in the volume, alternating
  // hemispheres, the same place every time for a given order of ids.
  function neuronPositions(model, votes) {
    const rnd = seeded(7331)
    return votes.map((v, i) => {
      const side = i % 2 ? 1 : -1
      let x, y, z
      do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1 } while (x * x + y * y + z * z > 1 || x * x + y * y + z * z < 0.3)
      const p = { x: side * (0.1 + Math.abs(x) * 0.36), y: 0.05 + y * 0.4, z: z * 0.7 }
      // The cortex points each neuron lights when it fires, and how strongly.
      const near = []
      model.pts.forEach((q, k) => {
        if (q.kind !== 0 && q.kind !== 4) return
        const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2
        if (dd < 0.12) near.push(k, Math.exp(-dd / 0.03))
      })
      const mid = { x: (p.x + model.core.x) / 2, y: (p.y + model.core.y) / 2 + 0.16, z: (p.z + model.core.z) / 2 }
      return { v, p, mid, near, phase: frac(i * 0.618034) }
    })
  }

  /* ---------- the camera: shared across redraws so a refresh never jumps ---------- */
  const cam = { yaw: 1.05, pitch: PITCH_REST, vyaw: 0, dragging: false, lastT: -1 }
  let hover = null
  let hits = []

  function project(p, g, breath) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
    const x1 = p.x * cy + p.z * sy
    const z1 = -p.x * sy + p.z * cy
    const y1 = p.y * cp - z1 * sp
    const z2 = p.y * sp + z1 * cp
    const d = CAM / (CAM - z2)
    return { x: g.cx + x1 * g.S * d * breath, y: g.cy - y1 * g.S * d * breath, z: z2, d }
  }

  /* ---------- screen layout: brain centre, scale, and the agents round it ---------- */
  function layout(w, h, agents) {
    const wide = w / h >= 1.7
    const g = { w, h, wide }
    if (wide) {
      g.S = Math.max(60, Math.min(h * 0.4, (w / 2 - 190) / 1.1))
      g.cx = w / 2; g.cy = h * 0.47
    } else {
      g.S = Math.max(60, Math.min(w * 0.4, (h - 150) / 1.7))
      g.cx = w / 2; g.cy = h / 2 + 4
    }
    const half = Math.ceil(agents.length / 2)
    g.inputs = agents.map((a, i) => {
      const first = i < half, k = first ? i : i - half, m = first ? half : agents.length - half
      const t = m === 1 ? 0.5 : k / (m - 1)
      if (wide) {
        const side = first ? -1 : 1
        return { a, side, wide, x: g.cx + side * (g.S * 1.1 + 50), y: g.cy + g.S * (-0.62 + 1.24 * t) }
      }
      return { a, side: first ? -1 : 1, wide, x: w * (0.17 + 0.66 * t), y: first ? 40 : h - 44 }
    })
    return g
  }

  let cache = { key: '', g: null, neurons: null }
  let model = null

  function fit(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = cv.clientWidth, h = cv.clientHeight
    if (!w || !h) return null
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { ctx, w, h, dpr }
  }

  const voteCol = (v) => (v.weight === 0 ? C.grey : v.action === 'BUY' ? C.mint : v.action === 'SELL' ? C.coral : C.iris)

  /* ---------- one frame ---------- */
  function draw(cv, st, tMs, reduced) {
    const f = fit(cv); if (!f) return
    const { ctx, w, h } = f
    if (!model) model = buildModel()
    const key = `${w}x${h}|${st.agents.map((a) => a.id).join(',')}|${st.votes.map((v) => v.id).join(',')}`
    if (cache.key !== key) cache = { key, g: layout(w, h, st.agents), neurons: neuronPositions(model, st.votes) }
    const g = cache.g
    // Votes change between refreshes while the ids stay put: take the fresh ones.
    cache.neurons.forEach((n, i) => { n.v = st.votes[i] })
    const sec = tMs / 1000
    const dt = cam.lastT < 0 || tMs < cam.lastT ? 0 : Math.min(0.05, (tMs - cam.lastT) / 1000)
    cam.lastT = tMs

    // The turn: a slow drift, plus whatever momentum a drag left behind.
    if (!reduced && !cam.dragging) {
      cam.yaw += (AUTO_YAW + cam.vyaw) * dt
      cam.vyaw *= Math.pow(0.06, dt)
      cam.pitch += (PITCH_REST - cam.pitch) * (1 - Math.pow(0.4, dt))
    }
    const breath = reduced ? 1 : 1 + 0.018 * Math.sin(sec * 1.1)
    const focus = st.focus || hover
    const dirCol = st.core.direction === 'long' ? C.mint : st.core.direction === 'short' ? C.coral : C.iris
    const core = project(model.core, g, breath)

    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    // Ambient light round the brain, in the decision's colour.
    const bloom = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, g.S * 1.5)
    bloom.addColorStop(0, `rgba(${dirCol},0.16)`); bloom.addColorStop(0.45, `rgba(${C.iris},0.06)`); bloom.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = bloom; ctx.fillRect(0, 0, w, h)

    // Which neurons are firing now: the lead pulse left less than 0.9 s ago.
    const firing = []
    for (const n of cache.neurons) {
      const v = n.v; if (!v || v.weight === 0 || reduced) continue
      const voting = v.action === 'BUY' || v.action === 'SELL'
      const conf = clamp(Number(v.confidence) || 0, 0, 100) / 100
      const speed = voting ? 0.28 + 0.55 * conf : 0.12
      const count = voting ? 1 + Math.round(conf * 2) : 1
      const since = (frac(sec * speed * count + n.phase) / (speed * count))
      if (since < 0.9) firing.push({ n, amt: Math.exp(-since / 0.3) * (voting ? 1 : 0.45), col: voteCol(v) })
    }
    const lit = new Float32Array(model.pts.length)
    const litCol = new Uint8Array(model.pts.length)
    firing.forEach((fz, j) => {
      const near = fz.n.near
      for (let k = 0; k < near.length; k += 2) {
        const add = fz.amt * near[k + 1]
        if (add > lit[near[k]]) { lit[near[k]] = add; litCol[near[k]] = j + 1 }
      }
    })

    // The cortex. Every vertex is lit once, then the folds are stroked and the
    // dust is dotted in buckets of colour and brightness, so a frame is a few
    // dozen fills rather than thousands.
    const waveR = reduced ? -1 : frac(sec / 5.2) * 1.35
    const waveA = reduced ? 0 : 0.55 * (1 - frac(sec / 5.2))
    const P = model.pts, np = P.length
    const SX = new Float32Array(np), SY = new Float32Array(np), LUM = new Float32Array(np), DD = new Float32Array(np)
    const COL = new Array(np)
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
    for (let i = 0; i < np; i++) {
      const p = P[i]
      const x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy
      const y1 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp
      const d = CAM / (CAM - z2)
      SX[i] = g.cx + x1 * g.S * d * breath; SY[i] = g.cy - y1 * g.S * d * breath; DD[i] = d
      const depth = clamp(0.35 + 0.65 * (z2 + 1) / 2, 0.2, 1)
      // Light: a key light from the upper left, a glow along the silhouette, and
      // the far side dimmed so the near side reads as a surface.
      let shade = 0.55
      if (p.n) {
        const nx1 = p.n[0] * cy + p.n[2] * sy, nz1 = -p.n[0] * sy + p.n[2] * cy
        const ny2 = p.n[1] * cp - nz1 * sp, nz2 = p.n[1] * sp + nz1 * cp
        const lam = Math.max(0, nx1 * LIGHT[0] + ny2 * LIGHT[1] + nz2 * LIGHT[2])
        const rim = Math.pow(1 - Math.abs(nz2), 3)
        shade = (nz2 > 0 ? 0.35 + 0.9 * lam : 0.2) + 0.7 * rim
      }
      const wave = waveR < 0 ? 0 : waveA * Math.exp(-Math.pow((p.dc - waveR) / 0.07, 2))
      const fire = lit[i]
      LUM[i] = clamp((p.base * shade + wave * 0.6) * depth + fire * 0.85, 0, 1)
      COL[i] = fire > 0.12 ? firing[litCol[i] - 1].col : wave > p.base * 0.5 ? C.aqua : C.iris
    }
    const lines = new Map(), dots = new Map()
    const bucket = (m, col, lum) => {
      const lvl = Math.min(LEVELS - 1, Math.round(lum * (LEVELS - 1)))
      if (lvl <= 0) return null
      const k = `${col}|${lvl}`
      let path = m.get(k)
      if (!path) { path = new Path2D(); m.set(k, path) }
      return path
    }
    const S = model.segs
    for (let k = 0; k < S.length; k += 2) {
      const a = S[k], b = S[k + 1]
      const path = bucket(lines, LUM[a] >= LUM[b] ? COL[a] : COL[b], (LUM[a] + LUM[b]) / 2)
      if (path) { path.moveTo(SX[a], SY[a]); path.lineTo(SX[b], SY[b]) }
    }
    for (let i = 0; i < np; i++) {
      const kind = P[i].kind
      if (kind !== 1 && kind !== 4) continue
      const path = bucket(dots, COL[i], LUM[i])
      if (!path) continue
      const s = (kind === 1 ? 1.2 : 1.1 + LUM[i] * 1.2 + lit[i] * 1.6) * DD[i]
      path.rect(SX[i] - s / 2, SY[i] - s / 2, s, s)
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const [k, path] of lines) {
      const [col, lvl] = k.split('|'), a = Number(lvl) / (LEVELS - 1)
      // A soft wide pass under a crisp one: the folds glow rather than sit flat.
      if (a > 0.4) { ctx.strokeStyle = `rgba(${col},${(a * 0.22).toFixed(3)})`; ctx.lineWidth = 4.2; ctx.stroke(path) }
      ctx.strokeStyle = `rgba(${col},${a.toFixed(3)})`; ctx.lineWidth = 1.25; ctx.stroke(path)
    }
    for (const [k, path] of dots) {
      const [col, lvl] = k.split('|')
      ctx.fillStyle = `rgba(${col},${(Number(lvl) / (LEVELS - 1)).toFixed(3)})`
      ctx.fill(path)
    }
    ctx.lineCap = 'butt'

    hits = []
    let arrive = 0

    // Synapses and pulses: strategies to the core, curved through the volume.
    const proj = cache.neurons.map((n) => ({ n, s: project(n.p, g, breath) }))
    for (const { n } of proj) {
      const v = n.v; if (!v) continue
      const off = v.weight === 0, voting = v.action === 'BUY' || v.action === 'SELL'
      const col = voteCol(v)
      ctx.beginPath()
      for (let k = 0; k <= 14; k++) {
        const q = project(q3(n.p, n.mid, model.core, k / 14), g, breath)
        k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)
      }
      ctx.strokeStyle = `rgba(${col},${off ? 0.06 : voting ? 0.3 : 0.12})`; ctx.lineWidth = voting ? 1.3 : 0.8; ctx.stroke()
      if (off) continue
      const conf = clamp(Number(v.confidence) || 0, 0, 100) / 100
      const speed = voting ? 0.28 + 0.55 * conf : 0.12
      const count = voting ? 1 + Math.round(conf * 2) : 1
      for (let k = 0; k < count; k++) {
        const s = reduced ? (k + 1) / (count + 1) : frac(sec * speed + k / count + n.phase / count)
        arrive += s > 0.9 ? (s - 0.9) * (voting ? 6 : 2) : 0
        comet(ctx, (ss) => project(q3(n.p, n.mid, model.core, ss), g, breath), s, col, voting ? 1 : 0.55, voting ? 3 : 2)
      }
    }

    // Synapses and pulses: desk agents to the core, from outside the brain.
    for (const n of g.inputs) {
      const S = AGENT_STATE[n.a.status] || AGENT_STATE.WAITING
      const via = n.wide ? { x: g.cx + n.side * g.S * 0.75, y: n.y * 0.55 + core.y * 0.45 } : { x: n.x * 0.6 + core.x * 0.4, y: g.cy + n.side * g.S * 0.7 }
      const at = (s) => { const u = (1 - s) * (1 - s), v = 2 * (1 - s) * s, ww = s * s; return { x: u * n.x + v * via.x + ww * core.x, y: u * n.y + v * via.y + ww * core.y, d: 1 } }
      ctx.save()
      if (n.a.status === 'BLIND') ctx.setLineDash([3, 5])
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.quadraticCurveTo(via.x, via.y, core.x, core.y)
      ctx.strokeStyle = `rgba(${S.col},${(0.24 * S.alpha).toFixed(3)})`; ctx.lineWidth = 1.1; ctx.stroke()
      ctx.restore()
      for (let k = 0; k < S.n; k++) {
        const s = reduced ? (k + 1) / (S.n + 1) : frac(sec * S.speed + k / S.n + frac(n.y * 0.011 + n.x * 0.007))
        arrive += s > 0.9 ? (s - 0.9) * 3 * S.alpha : 0
        comet(ctx, at, s, S.col, S.alpha, 2.8)
      }
    }

    // Neurons, far to near so the near ones sit on top.
    proj.sort((a, b) => a.s.z - b.s.z)
    for (const { n, s: q } of proj) {
      const v = n.v; if (!v) continue
      const off = v.weight === 0, voting = v.action === 'BUY' || v.action === 'SELL'
      const col = voteCol(v)
      const conf = clamp(Number(v.confidence) || 0, 0, 100) / 100
      const on = focus === v.id
      const fz = firing.find((x) => x.n === n)
      const r = (voting ? 3.8 + conf * 4 : 3) * q.d * (on ? 1.5 : 1) * (fz ? 1 + 0.25 * fz.amt : 1)
      const depthA = clamp(0.45 + 0.55 * (q.z + 1) / 2, 0.35, 1)
      ctx.globalCompositeOperation = 'lighter'
      if (!off) {
        const halo = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 4.5)
        halo.addColorStop(0, `rgba(${col},${((voting ? 0.5 : 0.24) * depthA).toFixed(3)})`); halo.addColorStop(1, `rgba(${col},0)`)
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(q.x, q.y, r * 4.5, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2)
      if (off) { ctx.strokeStyle = `rgba(${col},${(0.7 * depthA).toFixed(3)})`; ctx.lineWidth = 1.2; ctx.stroke() }
      else { ctx.fillStyle = `rgba(${col},${((voting ? 1 : 0.8) * depthA).toFixed(3)})`; ctx.fill() }
      if (on) { ctx.beginPath(); ctx.arc(q.x, q.y, r + 4, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${C.text},0.8)`; ctx.lineWidth = 1.2; ctx.stroke() }
      if ((voting && q.z > -0.35) || on) label(ctx, `${shortName(v.name)}${voting ? ` · ${v.action.toLowerCase()} ${Math.round(conf * 100)}` : off ? ' · off' : ' · hold'}`, q.x, q.y - r - 8, 'center', col, true)
      hits.push({ id: v.id, x: q.x, y: q.y, r: Math.max(8, r + 4), z: q.z, lines: [shortName(v.name), off ? 'switched off in this regime' : voting ? `${v.action.toLowerCase()} · confidence ${Math.round(conf * 100)}` : 'hold · no vote this candle', `regime weight ${Number(v.weight).toFixed(2)}`], col })
    }

    // The core: glow that brightens as pulses land, the agreement arc, the act-at tick.
    ctx.globalCompositeOperation = 'lighter'
    const glow = 0.35 + Math.min(0.45, arrive * 0.12)
    const cg = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, 66)
    cg.addColorStop(0, `rgba(${dirCol},${glow.toFixed(3)})`); cg.addColorStop(0.4, `rgba(${dirCol},${(glow * 0.35).toFixed(3)})`); cg.addColorStop(1, `rgba(${dirCol},0)`)
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(core.x, core.y, 66, 0, Math.PI * 2); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    const R = 32
    ctx.beginPath(); ctx.arc(core.x, core.y, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,11,22,0.86)'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 4; ctx.stroke()
    if (typeof st.core.score === 'number') {
      const a0 = -Math.PI / 2, f01 = clamp(st.core.score / 100, 0, 1)
      ctx.beginPath(); ctx.arc(core.x, core.y, R, a0, a0 + f01 * Math.PI * 2)
      ctx.strokeStyle = `rgb(${dirCol})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt'
    }
    // The number itself: how much of the panel agrees, out of 100.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = typeof st.core.score === 'number' ? `rgb(${C.text})` : `rgba(${C.dim},0.8)`
    ctx.font = `700 21px ${FONT}`; ctx.fillText(typeof st.core.score === 'number' ? String(st.core.score) : '—', core.x, core.y - 4)
    ctx.fillStyle = `rgba(${C.dim},0.95)`; ctx.font = `500 10px ${FONT}`; ctx.fillText('agree', core.x, core.y + 12)
    if (typeof st.core.enterScore === 'number') {
      const a = -Math.PI / 2 + clamp(st.core.enterScore / 100, 0, 1) * Math.PI * 2
      ctx.beginPath(); ctx.moveTo(core.x + Math.cos(a) * (R - 7), core.y + Math.sin(a) * (R - 7)); ctx.lineTo(core.x + Math.cos(a) * (R + 7), core.y + Math.sin(a) * (R + 7))
      ctx.strokeStyle = `rgba(${C.text},0.9)`; ctx.lineWidth = 2; ctx.stroke()
    }

    // Agent nodes and their names.
    for (const n of g.inputs) {
      const S = AGENT_STATE[n.a.status] || AGENT_STATE.WAITING
      const on = focus === n.a.id
      const r = on ? 11 : 8.5
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(12,16,32,0.95)'; ctx.fill()
      ctx.save(); if (n.a.status === 'BLIND') ctx.setLineDash([2.5, 3])
      ctx.strokeStyle = `rgba(${S.col},${S.alpha})`; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore()
      if (n.a.status !== 'BLIND') { ctx.beginPath(); ctx.arc(n.x, n.y, 3.2, 0, Math.PI * 2); ctx.fillStyle = `rgb(${S.col})`; ctx.fill() }
      if (n.wide) {
        const align = n.side < 0 ? 'right' : 'left', tx = n.x + (n.side < 0 ? -16 : 16)
        text(ctx, n.a.title, tx, n.y - 2, align, `rgb(${C.text})`, `600 13px ${FONT}`)
        text(ctx, S.label, tx, n.y + 14, align, `rgba(${S.col},${Math.max(0.75, S.alpha)})`, `500 11.5px ${FONT}`)
      } else {
        const above = n.side < 0
        text(ctx, n.a.title, n.x, above ? n.y - 26 : n.y + 24, 'center', `rgb(${C.text})`, `600 12px ${FONT}`)
        text(ctx, S.label, n.x, above ? n.y - 13 : n.y + 37, 'center', `rgba(${S.col},${Math.max(0.75, S.alpha)})`, `500 11px ${FONT}`)
      }
      hits.push({ id: n.a.id, x: n.x, y: n.y, r: 16, z: 2, lines: [n.a.title, S.label], col: S.col })
    }

    // The card for whatever the pointer is on.
    const hv = hover && hits.find((x) => x.id === hover)
    if (hv) card(ctx, hv, w, h)
  }

  function comet(ctx, at, s, col, alpha, size) {
    // A bright head and a short fading tail along the synapse.
    for (let i = 5; i >= 1; i--) {
      const ss = s - i * 0.022
      if (ss < 0) continue
      const p = at(ss)
      const a = alpha * (1 - i / 6) * (ss < 0.08 ? ss / 0.08 : 1)
      ctx.beginPath(); ctx.arc(p.x, p.y, size * (p.d || 1) * (1 - i / 9), 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${col},${(0.8 * a).toFixed(3)})`; ctx.fill()
    }
    const p = at(s)
    const rr = size * (p.d || 1) * 3.2
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr)
    gr.addColorStop(0, `rgba(255,255,255,${(0.7 * alpha).toFixed(3)})`); gr.addColorStop(0.35, `rgba(${col},${(0.55 * alpha).toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill()
  }

  function card(ctx, hv, w, h) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.font = `600 12.5px ${FONT}`
    const pad = 10, lh = 17
    const width = Math.max(...hv.lines.map((l, i) => { ctx.font = `${i ? 500 : 600} ${i ? 11.5 : 12.5}px ${FONT}`; return ctx.measureText(l).width })) + pad * 2
    const height = hv.lines.length * lh + pad * 2 - 4
    let x = hv.x + 16, y = hv.y - height - 10
    if (x + width > w - 6) x = hv.x - width - 16
    if (y < 6) y = hv.y + 16
    x = clamp(x, 6, w - width - 6); y = clamp(y, 6, h - height - 6)
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y, width, height, 9); else ctx.rect(x, y, width, height)
    ctx.fillStyle = 'rgba(15,20,38,0.96)'; ctx.fill()
    ctx.strokeStyle = `rgba(${hv.col},0.55)`; ctx.lineWidth = 1; ctx.stroke()
    hv.lines.forEach((l, i) => {
      ctx.font = `${i ? 500 : 600} ${i ? 11.5 : 12.5}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillStyle = i ? `rgba(${C.dim},1)` : `rgb(${C.text})`
      ctx.fillText(l, x + pad, y + pad + 6 + i * lh)
    })
  }

  function text(ctx, s, x, y, align, fill, font) {
    const prev = ctx.globalCompositeOperation
    ctx.globalCompositeOperation = 'source-over'
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(8,11,22,0.75)'; ctx.fillText(s, x + 0.5, y + 1)
    ctx.fillStyle = fill; ctx.fillText(s, x, y)
    ctx.globalCompositeOperation = prev
  }
  function label(ctx, s, x, y, align, col, strong) {
    text(ctx, s, x, y, align, strong ? `rgb(${col})` : `rgba(${C.dim},0.9)`, `${strong ? 600 : 500} 11.5px ${FONT}`)
  }

  /* ---------- touch: drag to turn, point to read, click to jump ---------- */
  function pick(x, y) {
    let best = null
    for (const t of hits) {
      const dd = Math.hypot(t.x - x, t.y - y)
      if (dd <= t.r && (!best || t.z > best.z)) best = t
    }
    return best ? best.id : null
  }

  function attach(cv, opts = {}) {
    if (!cv || cv.dataset.brainAttached) return
    cv.dataset.brainAttached = '1'
    const redraw = () => opts.redraw && opts.redraw()
    const setHover = (id) => {
      if (id === hover) return
      hover = id
      cv.style.cursor = id ? 'pointer' : 'grab'
      if (opts.onHover) opts.onHover(id)
      redraw()
    }
    let down = null
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    cv.style.cursor = 'grab'
    cv.addEventListener('pointerdown', (e) => {
      const p = pos(e)
      down = { x: p.x, y: p.y, lastX: p.x, lastY: p.y, t: e.timeStamp, moved: false, id: pick(p.x, p.y) }
      cam.dragging = true; cam.vyaw = 0
      try { cv.setPointerCapture(e.pointerId) } catch { /* capture is a nicety */ }
    })
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e)
      if (!down) { setHover(pick(p.x, p.y)); return }
      const dx = p.x - down.lastX, dy = p.y - down.lastY
      const dts = Math.max(0.008, (e.timeStamp - down.t) / 1000)
      if (Math.abs(p.x - down.x) + Math.abs(p.y - down.y) > 5) { down.moved = true; cv.style.cursor = 'grabbing' }
      if (!down.moved) return
      cam.yaw += dx * 0.009
      cam.pitch = clamp(cam.pitch + dy * 0.006, -0.5, 0.95)
      cam.vyaw = cam.vyaw * 0.5 + ((dx * 0.009) / dts) * 0.5
      down.lastX = p.x; down.lastY = p.y; down.t = e.timeStamp
      redraw()
    })
    const end = (e, cancelled) => {
      if (!down) return
      const d = down; down = null
      cam.dragging = false
      // Let go mid-swipe and it keeps turning a little; a plain click leaves the drift alone.
      cam.vyaw = d.moved && !cancelled ? clamp(cam.vyaw - AUTO_YAW, -4, 4) : 0
      cv.style.cursor = hover ? 'pointer' : 'grab'
      if (!cancelled && !d.moved && d.id && opts.onPick) opts.onPick(d.id)
      redraw()
    }
    cv.addEventListener('pointerup', (e) => end(e, false))
    cv.addEventListener('pointercancel', (e) => end(e, true))
    cv.addEventListener('pointerleave', () => { if (!down) setHover(null) })
  }

  window.MrBrain = { draw, attach }
})()
